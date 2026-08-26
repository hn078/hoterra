import { AuditAction, Prisma, WorkforceRequestStatus, WorkforceVendorMode } from '@prisma/client';
import type * as DatabaseModule from '../../../db';
import type { AuthUser } from '../../../middleware/auth';
import { vendorInviteTokenCandidates } from '../domain/vendorInviteToken';

type WorkforceDatabase = typeof DatabaseModule.prisma;
export type VendorInviteResponseAction = 'accept' | 'decline';

export type VendorInviteResponseResult =
  | { ok: true; status: 'ACCEPTED' | 'DECLINED'; alreadyProcessed?: boolean }
  | { error: string; httpStatus: 400 | 404 | 409 };

/** Handles a public vendor response as one tenant-scoped, request-locked transaction. */
export async function respondToVendorInvite(
  database: WorkforceDatabase,
  token: string,
  action: VendorInviteResponseAction,
  reason?: string,
  simulationActor?: AuthUser,
): Promise<VendorInviteResponseResult> {
  const tokenCandidates = vendorInviteTokenCandidates(token);
  if (!tokenCandidates.length) return { error: 'Invite not found', httpStatus: 404 };
  const cleanReason = typeof reason === 'string' ? reason.trim().slice(0, 2000) : '';

  return database.$transaction(async (transaction) => {
    const initial = await transaction.vendorInvite.findFirst({
      where: { token: { in: tokenCandidates } },
      select: { id: true, requestId: true },
    });
    if (!initial) return { error: 'Invite not found', httpStatus: 404 } as const;
    await transaction.$executeRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${initial.requestId}, 0))`,
    );
    const invite = await transaction.vendorInvite.findUnique({
      where: { id: initial.id },
      include: {
        vendor: true,
        request: { include: { items: { select: { vendorId: true } } } },
      },
    });
    if (!invite) return { error: 'Invite not found', httpStatus: 404 } as const;

    const requestedStatus = action === 'accept' ? 'ACCEPTED' : 'DECLINED';
    if (invite.status === requestedStatus) {
      return { ok: true, status: requestedStatus, alreadyProcessed: true } as const;
    }
    if (invite.status !== 'PENDING') {
      return { error: `Invite already ${invite.status.toLowerCase()}`, httpStatus: 409 } as const;
    }
    if (invite.expiresAt.getTime() < Date.now()) {
      await transaction.vendorInvite.updateMany({
        where: { id: invite.id, status: 'PENDING' },
        data: { status: 'EXPIRED', respondedAt: new Date() },
      });
      return { error: 'Invite expired', httpStatus: 400 } as const;
    }
    if (invite.request.status !== WorkforceRequestStatus.SENT_TO_VENDOR) {
      return { error: 'Order is no longer available', httpStatus: 409 } as const;
    }

    const updated = await transaction.vendorInvite.updateMany({
      where: { id: invite.id, status: 'PENDING' },
      data: { status: requestedStatus, respondedAt: new Date() },
    });
    if (!updated.count) return { error: 'Invite response changed; reload and try again', httpStatus: 409 } as const;

    if (action === 'accept') {
      const selectedVendorIds = [...new Set(invite.request.items.map((item) => item.vendorId).filter(Boolean))];
      if (selectedVendorIds.length <= 1 && invite.request.vendorMode === WorkforceVendorMode.BROADCAST) {
        await transaction.vendorInvite.updateMany({
          where: { requestId: invite.requestId, id: { not: invite.id }, status: 'PENDING' },
          data: { status: 'LOST', respondedAt: new Date() },
        });
      }
    }

    const pending = await transaction.vendorInvite.count({ where: { requestId: invite.requestId, status: 'PENDING' } });
    if (pending === 0) {
      const declined = await transaction.vendorInvite.count({ where: { requestId: invite.requestId, status: 'DECLINED' } });
      const acceptedStatus = invite.request.workDate.getTime() <= Date.now()
        ? WorkforceRequestStatus.IN_SERVICE
        : WorkforceRequestStatus.VENDOR_ACCEPTED;
      await transaction.workforceRequest.updateMany({
        where: { id: invite.requestId, status: WorkforceRequestStatus.SENT_TO_VENDOR },
        data: {
          status: declined ? WorkforceRequestStatus.VENDOR_DECLINED : acceptedStatus,
          ...(action === 'accept' ? { acceptedVendorId: invite.vendorId } : {}),
        },
      });
    }

    const responseLabel = action === 'accept'
      ? `${invite.vendor.name} accepted via vendor portal`
      : `${invite.vendor.name} declined${cleanReason ? `: ${cleanReason}` : ''}`;
    await transaction.workforceRequestEvent.create({
      data: { requestId: invite.requestId, action: action === 'accept' ? 'VENDOR_ACCEPTED' : 'VENDOR_DECLINED', details: responseLabel },
    });
    await transaction.auditLog.create({
      data: { action: action === 'accept' ? AuditAction.APPROVE : AuditAction.REJECT, userName: invite.vendor.name, entityType: 'VendorInvite', entityId: invite.id, details: `${invite.request.code}: ${responseLabel}` },
    });
    if (simulationActor) {
      await transaction.auditLog.create({
        data: {
          userId: simulationActor.id,
          userName: `${simulationActor.firstName} ${simulationActor.lastName}`,
          action: AuditAction.UPDATE,
          entityType: 'WorkforceRequest',
          entityId: invite.requestId,
          details: `System Administrator simulated vendor ${action} for ${invite.request.code}`,
        },
      });
    }
    await transaction.notification.create({
      data: {
        userId: invite.request.createdById,
        title: 'Vendor response received',
        message: `${invite.request.code}: ${invite.vendor.name} ${action === 'accept' ? 'accepted' : 'declined'} the order${cleanReason ? `: ${cleanReason}` : ''}.`,
        type: 'workforce',
        link: `/workforce/${invite.requestId}`,
      },
    });
    return { ok: true, status: requestedStatus } as const;
  });
}
