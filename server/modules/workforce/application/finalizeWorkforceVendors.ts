import { AuditAction, Role, WorkforceRequestStatus } from '@prisma/client';
import type * as DatabaseModule from '../../../db';
import type { AuthUser } from '../../../middleware/auth';
import { canManageProcurementWorkforce } from './procurementAccess';
import { serializeWorkforceRequestAuditState } from './workforceAuditState';

type WorkforceDatabase = typeof DatabaseModule.prisma;

export type FinalizeWorkforceVendorsErrorCode =
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'INVALID_STATE'
  | 'ACTUALS_RECORDED'
  | 'ACTIVE_REVIEW'
  | 'CONFLICT';

export class FinalizeWorkforceVendorsError extends Error {
  constructor(public readonly code: FinalizeWorkforceVendorsErrorCode) {
    super(code);
    this.name = 'FinalizeWorkforceVendorsError';
  }
}

/** Marks unchanged accepted vendors ready and notifies the owning department atomically. */
export async function finalizeWorkforceVendors(
  database: WorkforceDatabase,
  actor: AuthUser,
  requestId: string,
) {
  if (!(await canManageProcurementWorkforce(database, actor))) {
    throw new FinalizeWorkforceVendorsError('FORBIDDEN');
  }

  return database.$transaction(async (transaction) => {
    const request = await transaction.workforceRequest.findUnique({
      where: { id: requestId },
      include: { vendorCorrectionReviews: { select: { status: true } } },
    });
    if (!request) throw new FinalizeWorkforceVendorsError('NOT_FOUND');
    if (
      request.status !== WorkforceRequestStatus.VENDOR_ACCEPTED &&
      request.status !== WorkforceRequestStatus.IN_SERVICE
    ) {
      throw new FinalizeWorkforceVendorsError('INVALID_STATE');
    }
    if (request.actualQuantity != null || request.hodConfirmedAt || request.financeConfirmedAt) {
      throw new FinalizeWorkforceVendorsError('ACTUALS_RECORDED');
    }
    if (request.vendorCorrectionReviews.some((review) =>
      ['DRAFT', 'PENDING_FD', 'PENDING_GM'].includes(review.status)
    )) {
      throw new FinalizeWorkforceVendorsError('ACTIVE_REVIEW');
    }

    const update = await transaction.workforceRequest.updateMany({
      where: {
        id: requestId,
        status: request.status,
        actualQuantity: null,
        hodConfirmedAt: null,
        financeConfirmedAt: null,
      },
      data: { status: WorkforceRequestStatus.VENDORS_FULLY_APPROVED },
    });
    if (update.count === 0) throw new FinalizeWorkforceVendorsError('CONFLICT');
    const finalized = await transaction.workforceRequest.findUniqueOrThrow({ where: { id: requestId }, include: { items: true } });

    const actorName = `${actor.firstName} ${actor.lastName}`;
    await transaction.workforceRequestEvent.create({
      data: {
        requestId,
        action: 'VENDORS_FULLY_APPROVED',
        details: 'Procurement confirmed that all accepted vendors are fully approved. Request is ready for execution.',
        userId: actor.id,
        userName: actorName,
      },
    });
    await transaction.auditLog.create({
      data: {
        userId: actor.id,
        userName: actorName,
        action: AuditAction.APPROVE,
        entityType: 'WorkforceRequest',
        entityId: requestId,
        details: `${request.code}: Vendors fully approved and ready for execution`,
        outcome: 'SUCCESS',
        reason: 'Procurement confirmed that no vendor correction review is required',
        beforeState: serializeWorkforceRequestAuditState(request),
        afterState: serializeWorkforceRequestAuditState(finalized),
      },
    });

    const recipients = await transaction.user.findMany({
      where: {
        isActive: true,
        OR: [
          { id: request.createdById },
          { departmentId: request.departmentId, role: Role.HOD },
        ],
      },
      select: { id: true },
    });
    const recipientIds = [...new Set(recipients.map((recipient) => recipient.id))];
    if (recipientIds.length) {
      await transaction.notification.createMany({
        data: recipientIds.map((userId) => ({
          userId,
          title: 'Vendors fully approved — ready for execution',
          message: `${request.code}: Procurement confirmed all vendors. Vendor names are now available and the request can proceed to execution.`,
          type: 'workforce',
          link: `/workforce/${requestId}`,
        })),
      });
    }

    return { requestId, status: WorkforceRequestStatus.VENDORS_FULLY_APPROVED };
  });
}
