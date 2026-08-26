import { AuditAction, Prisma, WorkforceRequestStatus } from '@prisma/client';
import type * as DatabaseModule from '../../../db';
import type { AuthUser } from '../../../middleware/auth';
import { canConfirmProcurementSelection } from './procurementAccess';
import { createVendorInviteToken } from '../domain/vendorInviteToken';
import { serializeWorkforceRequestAuditState } from './workforceAuditState';

type WorkforceDatabase = typeof DatabaseModule.prisma;

export type WorkforceVendorDispatchErrorCode =
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'INVALID_STATE'
  | 'NO_VENDOR'
  | 'INVALID_VENDOR'
  | 'MISSING_VENDOR_EMAIL'
  | 'CONFLICT';

export class WorkforceVendorDispatchError extends Error {
  constructor(
    public readonly code: WorkforceVendorDispatchErrorCode,
    public readonly detail?: string,
  ) {
    super(code);
    this.name = 'WorkforceVendorDispatchError';
  }
}

type DispatchOptions = {
  resend?: boolean;
  confirmSelection?: boolean;
  now?: Date;
  portalBaseUrl: string;
  emailDeliveryEnabled: boolean;
};

function actorName(actor: AuthUser) {
  return `${actor.firstName} ${actor.lastName}`;
}

function validEmail(value: string | null | undefined) {
  return Boolean(value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value));
}

function emailBody(request: any, vendor: any, vendorItems: any[], portalLink: string, expiresAt: Date) {
  return [
    `Hello ${vendor.name},`,
    '',
    `You have a casual staff order from ${request.hotelName}.`,
    `Code: ${request.code}`,
    `Hotel: ${request.hotelName}`,
    `Department: ${request.department.name}`,
    `Period: ${request.workDate.toISOString().slice(0, 10)} — ${request.endDate.toISOString().slice(0, 10)}`,
    'Service lines:',
    ...vendorItems.map((item) =>
      `- ${item.position.name}: ${item.quantity} × ${item.rateUnit}${item.hours ? `, ${item.hours} hour(s)` : ''}`
    ),
    request.comment ? `Comment: ${request.comment}` : '',
    '',
    'Accept or decline here (no login required):',
    portalLink,
    '',
    `Link expires: ${expiresAt.toISOString()}`,
  ].filter(Boolean).join('\n');
}

/** Creates vendor invites and their email outbox records in one locked transaction. */
async function executeVendorDispatch(
  database: WorkforceDatabase,
  actor: AuthUser,
  requestId: string,
  options: DispatchOptions,
) {
  if (!(await canConfirmProcurementSelection(database, actor))) {
    throw new WorkforceVendorDispatchError('FORBIDDEN');
  }
  const now = options.now || new Date();
  const portalBaseUrl = options.portalBaseUrl.replace(/\/$/, '');

  return database.$transaction(async (transaction) => {
    await transaction.$executeRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`workforce-dispatch:${requestId}`}))`
    );
    const request = await transaction.workforceRequest.findUnique({
      where: { id: requestId },
      include: {
        department: true,
        position: true,
        items: { include: { position: true }, orderBy: { createdAt: 'asc' } },
      },
    });
    if (!request) throw new WorkforceVendorDispatchError('NOT_FOUND');
    const expectedStatus = options.confirmSelection
      ? WorkforceRequestStatus.PROCUREMENT_REVIEW
      : WorkforceRequestStatus.SENT_TO_VENDOR;
    if (request.status !== expectedStatus) {
      throw new WorkforceVendorDispatchError('INVALID_STATE');
    }

    const assignedVendorIds = [...new Set(
      request.items.map((item) => item.vendorId).filter((id): id is string => Boolean(id))
    )];
    if (!assignedVendorIds.length && request.vendorId) assignedVendorIds.push(request.vendorId);
    if (!assignedVendorIds.length) throw new WorkforceVendorDispatchError('NO_VENDOR');
    const vendors = await transaction.vendor.findMany({
      where: { id: { in: assignedVendorIds }, isActive: true },
      orderBy: { name: 'asc' },
    });
    if (vendors.length !== assignedVendorIds.length) throw new WorkforceVendorDispatchError('INVALID_VENDOR');
    const missingEmail = vendors.find((vendor) => !validEmail(vendor.contactEmail));
    if (missingEmail) throw new WorkforceVendorDispatchError('MISSING_VENDOR_EMAIL', missingEmail.name);

    if (options.confirmSelection) {
      const update = await transaction.workforceRequest.updateMany({
        where: { id: requestId, status: WorkforceRequestStatus.PROCUREMENT_REVIEW },
        data: { status: WorkforceRequestStatus.SENT_TO_VENDOR },
      });
      if (!update.count) throw new WorkforceVendorDispatchError('CONFLICT');
      const confirmed = await transaction.workforceRequest.findUniqueOrThrow({ where: { id: requestId }, include: { items: true } });

      await transaction.notification.updateMany({
        where: {
          userId: actor.id,
          entityType: 'WorkforceRequest',
          entityId: requestId,
          actionType: 'PROCUREMENT_CONFIRMATION',
          actionCompletedAt: null,
        },
        data: {
          isRead: true,
          actionCompletedAt: now,
          actionCompletedById: actor.id,
          actionCompletedByName: actorName(actor),
        },
      });

      const vendorNames = vendors.map((vendor) => vendor.name);
      const selection = vendorNames.length
        ? vendorNames.join(', ')
        : 'assigned vendor selection';
      await transaction.workforceRequestEvent.create({
        data: {
          requestId,
          action: 'PROCUREMENT_CONFIRMED',
          details: `Confirmed system selection: ${selection}`,
          userId: actor.id,
          userName: actorName(actor),
        },
      });
      await transaction.auditLog.create({
        data: {
          userId: actor.id,
          userName: actorName(actor),
          action: AuditAction.APPROVE,
          entityType: 'WorkforceRequest',
          entityId: requestId,
          details: `Procurement confirmed ${request.code}: ${selection}`,
          outcome: 'SUCCESS',
          reason: 'Procurement confirmed the system-selected approved vendors before dispatch',
          beforeState: serializeWorkforceRequestAuditState(request),
          afterState: serializeWorkforceRequestAuditState(confirmed),
        },
      });
    }

    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const created: Array<{ inviteId: string; vendorId: string }> = [];
    for (const vendor of vendors) {
      const existing = await transaction.vendorInvite.findFirst({
        where: { requestId, vendorId: vendor.id, status: 'PENDING' },
        orderBy: { sentAt: 'desc' },
      });
      if (existing && !options.resend && existing.expiresAt > now) continue;
      if (existing) {
        await transaction.vendorInvite.updateMany({
          where: { requestId, vendorId: vendor.id, status: 'PENDING' },
          data: { status: options.resend ? 'REPLACED' : 'EXPIRED', respondedAt: now },
        });
      }

      const inviteToken = createVendorInviteToken();
      const invite = await transaction.vendorInvite.create({
        data: { token: inviteToken.stored, requestId, vendorId: vendor.id, expiresAt, sentAt: now },
      });
      const vendorItems = request.items.filter((item) => item.vendorId === vendor.id);
      const items = vendorItems.length ? vendorItems : request.items;
      await transaction.emailOutbox.create({
        data: {
          toEmail: vendor.contactEmail!.trim().toLowerCase(),
          subject: `[HOTERRA] Casual staff order ${request.code}${options.resend ? ' — updated link' : ''}`,
          body: emailBody(request, vendor, items, `${portalBaseUrl}/vendor/order/${inviteToken.raw}`, expiresAt),
          entityType: 'VendorInvite',
          entityId: invite.id,
          status: options.emailDeliveryEnabled ? 'QUEUED' : 'DISABLED',
        },
      });
      created.push({ inviteId: invite.id, vendorId: vendor.id });
    }

    const action = options.resend ? 'VENDOR_INVITES_RESENT' : 'SENT_TO_VENDOR';
    const details = created.length
      ? `${options.resend ? 'Rotated and re-sent' : 'Queued'} ${created.length} vendor portal invite(s)`
      : 'Vendor portal invites were already pending; no duplicate email was queued';
    await transaction.workforceRequestEvent.create({
      data: { requestId, action, details, userId: actor.id, userName: actorName(actor) },
    });
    await transaction.auditLog.create({
      data: {
        userId: actor.id,
        userName: actorName(actor),
        action: AuditAction.SUBMIT,
        entityType: 'WorkforceRequest',
        entityId: requestId,
        details: `${request.code}: ${details}`,
        outcome: 'SUCCESS',
        reason: options.resend
          ? 'Procurement rotated pending vendor portal invitations'
          : created.length
            ? 'Vendor portal invitations were queued after Procurement confirmation'
            : 'Existing unexpired invitations were retained without duplicate delivery',
        beforeState: serializeWorkforceRequestAuditState(request),
        afterState: serializeWorkforceRequestAuditState(
          options.confirmSelection
            ? { ...request, status: WorkforceRequestStatus.SENT_TO_VENDOR }
            : request,
        ),
      },
    });
    return { requestId, createdCount: created.length, alreadyPending: created.length === 0 };
  });
}

export function dispatchWorkforceRequestToVendors(
  database: WorkforceDatabase,
  actor: AuthUser,
  requestId: string,
  options: DispatchOptions,
) {
  return executeVendorDispatch(database, actor, requestId, options);
}

/** Atomically confirms Procurement's selection and queues every vendor invite. */
export function confirmAndDispatchWorkforceRequest(
  database: WorkforceDatabase,
  actor: AuthUser,
  requestId: string,
  options: Omit<DispatchOptions, 'resend' | 'confirmSelection'>,
) {
  return executeVendorDispatch(database, actor, requestId, { ...options, confirmSelection: true });
}
