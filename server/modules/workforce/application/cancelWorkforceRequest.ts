import { AuditAction, Prisma, Role, WorkforceRequestStatus } from '@prisma/client';
import type * as DatabaseModule from '../../../db';
import type { AuthUser } from '../../../middleware/auth';

type WorkforceDatabase = typeof DatabaseModule.prisma;
const CREATOR_CANCELLABLE = new Set<WorkforceRequestStatus>([
  WorkforceRequestStatus.PENDING,
  WorkforceRequestStatus.AWAITING_EXTRA_APPROVAL,
  WorkforceRequestStatus.RETURNED_FOR_REVISION,
  WorkforceRequestStatus.APPROVED,
  WorkforceRequestStatus.PROCUREMENT_REVIEW,
  WorkforceRequestStatus.PROCUREMENT_CONFIRMED,
]);
const TERMINAL = new Set<WorkforceRequestStatus>([
  WorkforceRequestStatus.COMPLETED,
  WorkforceRequestStatus.CANCELLED,
  WorkforceRequestStatus.REJECTED,
]);

export type CancelWorkforceRequestErrorCode =
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'INVALID_STATE'
  | 'END_DATE_PASSED'
  | 'COMMENT_REQUIRED'
  | 'INVOICE_EXISTS'
  | 'CONFLICT';

export class CancelWorkforceRequestError extends Error {
  constructor(public readonly code: CancelWorkforceRequestErrorCode) {
    super(code);
    this.name = 'CancelWorkforceRequestError';
  }
}

export async function cancelWorkforceRequest(
  database: WorkforceDatabase,
  actor: AuthUser,
  requestId: string,
  input: { reason?: unknown },
) {
  if (!actor.capabilities.includes('workforce.read')) throw new CancelWorkforceRequestError('FORBIDDEN');
  const reason = String(input.reason || '').trim().slice(0, 2000);
  return database.$transaction(async (transaction) => {
    await transaction.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${requestId}, 0))`);
    const request = await transaction.workforceRequest.findUnique({
      where: { id: requestId },
      include: { invoices: { select: { id: true } } },
    });
    if (!request) throw new CancelWorkforceRequestError('NOT_FOUND');
    if (TERMINAL.has(request.status)) throw new CancelWorkforceRequestError('INVALID_STATE');
    if (request.invoices.length) throw new CancelWorkforceRequestError('INVOICE_EXISTS');

    const isCreatorBeforeDispatch = request.createdById === actor.id && CREATOR_CANCELLABLE.has(request.status);
    const isFinance = actor.role === Role.FINANCE_DIRECTOR && request.status === WorkforceRequestStatus.VENDORS_FULLY_APPROVED;
    if (!isCreatorBeforeDispatch && !isFinance) throw new CancelWorkforceRequestError('FORBIDDEN');
    if (isFinance) {
      const endOfDay = new Date(request.endDate); endOfDay.setHours(23, 59, 59, 999);
      if (endOfDay.getTime() < Date.now()) throw new CancelWorkforceRequestError('END_DATE_PASSED');
    }
    if (!isCreatorBeforeDispatch && reason.length < 3) throw new CancelWorkforceRequestError('COMMENT_REQUIRED');

    const update = await transaction.workforceRequest.updateMany({
      where: { id: requestId, status: request.status },
      data: { status: WorkforceRequestStatus.CANCELLED },
    });
    if (!update.count) throw new CancelWorkforceRequestError('CONFLICT');
    await transaction.vendorInvite.updateMany({
      where: { requestId, status: 'PENDING' },
      data: { status: 'CANCELLED', respondedAt: new Date() },
    });
    const actorName = `${actor.firstName} ${actor.lastName}`;
    const details = reason || 'Cancelled';
    await transaction.workforceRequestEvent.create({
      data: { requestId, action: 'CANCELLED', details, userId: actor.id, userName: actorName },
    });
    await transaction.auditLog.create({
      data: { userId: actor.id, userName: actorName, action: AuditAction.UPDATE, entityType: 'WorkforceRequest', entityId: requestId, details: `Cancelled ${request.code}${reason ? `: ${reason}` : ''}` },
    });
    if (actor.id !== request.createdById) {
      await transaction.notification.create({
        data: { userId: request.createdById, title: 'Casual workforce request cancelled', message: `${request.code} was cancelled by ${actorName}${reason ? `: ${reason}` : ''}`, type: 'workforce', link: `/workforce/${requestId}` },
      });
    }
    return { requestId };
  });
}
