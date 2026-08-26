import { AuditAction, Prisma, Role, VendorApprovalStatus, WorkforceRateUnit, WorkforceRequestStatus } from '@prisma/client';
import type * as DatabaseModule from '../../../db';
import type { AuthUser } from '../../../middleware/auth';
import { canDecideCurrentWorkforceStep } from './manageWorkforceRequestDecision';
import {
  queueRequestApprovalNotifications,
  type WorkforceNotificationOptions,
} from './workforceNotificationOutbox';
import { serializeWorkforceRequestAuditState } from './workforceAuditState';

type WorkforceDatabase = typeof DatabaseModule.prisma;
interface ApprovalStep { label: string }

export type ApproveWorkforceRequestErrorCode =
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'NO_ITEMS'
  | 'NO_ELIGIBLE_RATE'
  | 'CONFLICT';

export class ApproveWorkforceRequestError extends Error {
  constructor(
    public readonly code: ApproveWorkforceRequestErrorCode,
    public readonly detail?: string,
  ) {
    super(code);
    this.name = 'ApproveWorkforceRequestError';
  }
}

function parseSteps(value: string): ApprovalStep[] {
  try { const parsed = JSON.parse(value) as ApprovalStep[]; return Array.isArray(parsed) ? parsed : []; }
  catch { return []; }
}

function roundCurrency(value: number) { return Math.round(value * 100) / 100; }
function inclusiveDays(start: Date, end: Date) { return Math.max(1, Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1); }
function catalogCost(quantity: number, price: number, unit: WorkforceRateUnit, start: Date, end: Date, hours: number) {
  return roundCurrency(quantity * price * inclusiveDays(start, end) * (unit === WorkforceRateUnit.HOURLY ? hours : 1));
}

/** Advances one request approval step or performs final lowest-offer selection atomically. */
export async function approveWorkforceRequest(
  database: WorkforceDatabase,
  actor: AuthUser,
  requestId: string,
  notificationOptions: WorkforceNotificationOptions,
) {
  return database.$transaction(async (transaction) => {
    await transaction.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${requestId}, 0))`);
    const request = await transaction.workforceRequest.findUnique({
      where: { id: requestId },
      include: {
        items: { include: { position: true }, orderBy: { createdAt: 'asc' } },
        events: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });
    if (!request) throw new ApproveWorkforceRequestError('NOT_FOUND');
    if (!canDecideCurrentWorkforceStep(actor, request)) {
      const last = request.events[0];
      if (last?.userId === actor.id && ['APPROVED', 'GM_CONFIRMED_AUTO_SELECTED'].includes(last.action)) {
        return { outcome: 'already_processed' as const };
      }
      throw new ApproveWorkforceRequestError('FORBIDDEN');
    }

    const approvalSteps = parseSteps(request.approvalSteps);
    const step = approvalSteps[request.currentStepIndex];
    const isLast = request.currentStepIndex >= approvalSteps.length - 1;
    const name = `${actor.firstName} ${actor.lastName}`;

    await transaction.notification.updateMany({
      where: {
        userId: actor.id,
        entityType: 'WorkforceRequest',
        entityId: requestId,
        actionType: 'WORKFORCE_APPROVAL',
        actionCompletedAt: null,
      },
      data: {
        isRead: true,
        actionCompletedAt: new Date(),
        actionCompletedById: actor.id,
        actionCompletedByName: name,
      },
    });

    if (!isLast) {
      const update = await transaction.workforceRequest.updateMany({
        where: { id: requestId, status: request.status, currentStepIndex: request.currentStepIndex },
        data: { status: WorkforceRequestStatus.PENDING, currentStepIndex: request.currentStepIndex + 1, needsExtraApproval: false },
      });
      if (!update.count) throw new ApproveWorkforceRequestError('CONFLICT');
      const advanced = await transaction.workforceRequest.findUniqueOrThrow({ where: { id: requestId }, include: { items: true } });
      await transaction.workforceRequestEvent.create({
        data: { requestId, action: 'APPROVED', details: `${step?.label || 'Approver'} approved step`, userId: actor.id, userName: name },
      });
      await transaction.auditLog.create({
        data: { userId: actor.id, userName: name, action: AuditAction.APPROVE, entityType: 'WorkforceRequest', entityId: requestId, details: `Approved step for ${request.code}`, outcome: 'SUCCESS', reason: `${step?.label || 'Approver'} approved the current approval step`, beforeState: serializeWorkforceRequestAuditState(request), afterState: serializeWorkforceRequestAuditState(advanced) },
      });
      await queueRequestApprovalNotifications(transaction, {
        id: requestId,
        code: request.code,
        departmentId: request.departmentId,
        approvalSteps: request.approvalSteps,
        currentStepIndex: request.currentStepIndex + 1,
      }, notificationOptions);
      return { outcome: 'advanced' as const };
    }

    if (!request.items.length) throw new ApproveWorkforceRequestError('NO_ITEMS');
    const settings = await transaction.workforceSettings.findFirst({ select: { estimatedHoursPerShift: true } });
    const selectedItems: Array<{
      itemId: string;
      vendorId: string;
      vendorName: string;
      rateId: string;
      price: number;
      currency: string;
      cost: number;
    }> = [];
    for (const item of request.items) {
      const rate = await transaction.vendorServiceRate.findFirst({
        where: {
          positionId: item.positionId,
          unit: item.rateUnit,
          isActive: true,
          vendor: { isActive: true, isApproved: true, approvalStatus: VendorApprovalStatus.APPROVED, replacementRequested: false },
        },
        include: { vendor: true },
        orderBy: [{ price: 'asc' }, { vendor: { name: 'asc' } }],
      });
      if (!rate) throw new ApproveWorkforceRequestError('NO_ELIGIBLE_RATE', item.position.name);
      selectedItems.push({
        itemId: item.id,
        vendorId: rate.vendorId,
        vendorName: rate.vendor.name,
        rateId: rate.id,
        price: rate.price,
        currency: rate.currency,
        cost: catalogCost(item.quantity, rate.price, rate.unit, request.workDate, request.endDate, item.hours || settings?.estimatedHoursPerShift || 8),
      });
    }
    for (const selection of selectedItems) {
      await transaction.workforceRequestItem.update({
        where: { id: selection.itemId },
        data: { vendorId: selection.vendorId, vendorRateId: selection.rateId, unitRate: selection.price, rateCurrency: selection.currency, estimatedCost: selection.cost },
      });
    }
    const first = selectedItems[0];
    const vendorNames = [...new Set(selectedItems.map((item) => item.vendorName))];
    const update = await transaction.workforceRequest.updateMany({
      where: { id: requestId, status: request.status, currentStepIndex: request.currentStepIndex },
      data: {
        status: WorkforceRequestStatus.PROCUREMENT_REVIEW,
        vendorId: first.vendorId,
        vendorRateId: first.rateId,
        unitRate: first.price,
        rateCurrency: first.currency,
        estimatedCost: roundCurrency(selectedItems.reduce((sum, item) => sum + item.cost, 0)),
      },
    });
    if (!update.count) throw new ApproveWorkforceRequestError('CONFLICT');
    const procurementReview = await transaction.workforceRequest.findUniqueOrThrow({ where: { id: requestId }, include: { items: true } });
    await transaction.workforceRequestEvent.create({
      data: { requestId, action: 'GM_CONFIRMED_AUTO_SELECTED', details: `${step?.label || 'GM'} confirmed request; system selected the lowest approved offer for ${selectedItems.length} service line(s): ${vendorNames.join(', ')}`, userId: actor.id, userName: name },
    });
    await transaction.auditLog.create({
      data: { userId: actor.id, userName: name, action: AuditAction.APPROVE, entityType: 'WorkforceRequest', entityId: requestId, details: `GM confirmed ${request.code}; auto-selected ${vendorNames.join(', ')}`, outcome: 'SUCCESS', reason: 'Final request approver confirmed the need; system selected lowest eligible approved rates', beforeState: serializeWorkforceRequestAuditState(request), afterState: serializeWorkforceRequestAuditState(procurementReview) },
    });
    await transaction.notification.create({
      data: { userId: request.createdById, title: 'Casual staff request confirmed', message: `${request.code}: GM confirmed the request. Vendor details will be available after Procurement confirms all vendors.`, type: 'workforce', link: `/workforce/${requestId}`, entityType: 'WorkforceRequest', entityId: requestId },
    });
    const procurementUsers = await transaction.user.findMany({
      where: {
        isActive: true,
        department: { code: 'PR' },
        role: { in: [Role.HOD, Role.GENERAL_MANAGER] },
      },
      select: { id: true },
    });
    if (procurementUsers.length) {
      await transaction.notification.createMany({
        data: procurementUsers.map((user) => ({
          userId: user.id,
          title: 'Procurement confirmation required',
          message: `${request.code}: system selected ${selectedItems.length} service line(s) from ${vendorNames.join(', ')}`,
          type: 'workforce',
          link: `/workforce/${requestId}`,
          entityType: 'WorkforceRequest',
          entityId: requestId,
          actionType: 'PROCUREMENT_CONFIRMATION',
        })),
      });
    }
    return { outcome: 'procurement_review' as const, vendorNames };
  });
}
