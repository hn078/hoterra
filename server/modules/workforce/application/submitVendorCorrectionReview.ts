import { AuditAction, Prisma, Role, WorkforceRequestStatus } from '@prisma/client';
import type * as DatabaseModule from '../../../db';
import type { AuthUser } from '../../../middleware/auth';
import { canManageProcurementWorkforce } from './procurementAccess';
import { serializeWorkforceVendorCorrectionReviewAuditState } from './workforceAuditState';

type WorkforceDatabase = typeof DatabaseModule.prisma;

export type SubmitVendorCorrectionReviewErrorCode =
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'INVALID_STATE'
  | 'EMPTY_DRAFT'
  | 'CONFLICT';

export class SubmitVendorCorrectionReviewError extends Error {
  constructor(public readonly code: SubmitVendorCorrectionReviewErrorCode) {
    super(code);
    this.name = 'SubmitVendorCorrectionReviewError';
  }
}

/** Submits Procurement's correction package to Finance with audit and notification. */
export async function submitVendorCorrectionReview(
  database: WorkforceDatabase,
  actor: AuthUser,
  requestId: string,
) {
  if (!(await canManageProcurementWorkforce(database, actor))) {
    throw new SubmitVendorCorrectionReviewError('FORBIDDEN');
  }

  return database.$transaction(async (transaction) => {
    await transaction.$executeRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${requestId}, 0))`,
    );
    const request = await transaction.workforceRequest.findUnique({
      where: { id: requestId },
      include: {
        vendorCorrectionReviews: {
          include: { corrections: { select: { id: true } } },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!request) throw new SubmitVendorCorrectionReviewError('NOT_FOUND');
    if (
      request.status !== WorkforceRequestStatus.VENDOR_ACCEPTED &&
      request.status !== WorkforceRequestStatus.IN_SERVICE
    ) {
      throw new SubmitVendorCorrectionReviewError('INVALID_STATE');
    }
    const review = request.vendorCorrectionReviews.find((entry) => entry.status === 'DRAFT');
    if (!review || review.corrections.length === 0) {
      throw new SubmitVendorCorrectionReviewError('EMPTY_DRAFT');
    }

    const actorName = `${actor.firstName} ${actor.lastName}`;
    const update = await transaction.workforceVendorCorrectionReview.updateMany({
      where: { id: review.id, status: 'DRAFT' },
      data: {
        status: 'PENDING_FD',
        submittedById: actor.id,
        submittedByName: actorName,
        submittedAt: new Date(),
        returnComment: null,
        returnedAt: null,
        returnedById: null,
        returnedByName: null,
      },
    });
    if (update.count === 0) throw new SubmitVendorCorrectionReviewError('CONFLICT');
    const submitted = await transaction.workforceVendorCorrectionReview.findUniqueOrThrow({
      where: { id: review.id },
      include: { corrections: true },
    });

    await transaction.notification.updateMany({
      where: {
        userId: actor.id,
        entityType: 'WorkforceRequest',
        entityId: requestId,
        actionType: 'PROCUREMENT_CORRECTION_REVISION',
        actionCompletedAt: null,
      },
      data: {
        isRead: true,
        actionCompletedAt: new Date(),
        actionCompletedById: actor.id,
        actionCompletedByName: actorName,
      },
    });

    const details = `${review.corrections.length} vendor correction(s) submitted by Procurement for Finance Director and General Manager approval`;
    await transaction.workforceRequestEvent.create({
      data: {
        requestId,
        action: 'VENDOR_CORRECTIONS_SENT_FOR_REVIEW',
        details,
        userId: actor.id,
        userName: actorName,
      },
    });
    await transaction.auditLog.create({
      data: {
        userId: actor.id,
        userName: actorName,
        action: AuditAction.UPDATE,
        entityType: 'WorkforceVendorCorrectionReview',
        entityId: review.id,
        details: `${request.code}: ${details}`,
        outcome: 'SUCCESS',
        reason: 'Procurement submitted its documented vendor correction package for Finance Director review',
        beforeState: serializeWorkforceVendorCorrectionReviewAuditState(review),
        afterState: serializeWorkforceVendorCorrectionReviewAuditState(submitted),
      },
    });

    const financeUsers = await transaction.user.findMany({
      where: { isActive: true, role: Role.FINANCE_DIRECTOR },
      select: { id: true },
    });
    if (financeUsers.length) {
      await transaction.notification.createMany({
        data: financeUsers.map((user) => ({
          userId: user.id,
          title: 'Vendor correction review required',
          message: `${request.code}: Procurement submitted ${review.corrections.length} vendor change(s) for Finance Director approval.`,
          type: 'workforce',
          link: `/workforce/${requestId}`,
          entityType: 'WorkforceRequest',
          entityId: requestId,
          actionType: 'VENDOR_CORRECTION_REVIEW',
        })),
      });
    }

    return { reviewId: review.id, status: 'PENDING_FD' as const };
  });
}
