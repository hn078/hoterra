import { AuditAction, Prisma, Role, WorkforceRequestStatus } from '@prisma/client';
import type * as DatabaseModule from '../../../db';
import type { AuthUser } from '../../../middleware/auth';
import {
  serializeWorkforceRequestAuditState,
  serializeWorkforceVendorCorrectionReviewAuditState,
} from './workforceAuditState';

type WorkforceDatabase = typeof DatabaseModule.prisma;
export type VendorCorrectionDecision = 'approve' | 'return';
export type DecideVendorCorrectionReviewErrorCode =
  | 'NOT_FOUND'
  | 'REVIEW_NOT_FOUND'
  | 'FORBIDDEN'
  | 'INVALID_STATE'
  | 'COMMENT_REQUIRED'
  | 'CONFLICT';

export class DecideVendorCorrectionReviewError extends Error {
  constructor(public readonly code: DecideVendorCorrectionReviewErrorCode) {
    super(code);
    this.name = 'DecideVendorCorrectionReviewError';
  }
}

export function canReviewVendorCorrection(role: Role, status: string) {
  if (status === 'PENDING_FD') return role === Role.FINANCE_DIRECTOR;
  return status === 'PENDING_GM' && role === Role.GENERAL_MANAGER;
}

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100;
}

/** Returns, Finance-approves, or finally applies a vendor-correction package atomically. */
export async function decideVendorCorrectionReview(
  database: WorkforceDatabase,
  actor: AuthUser,
  requestId: string,
  reviewId: string,
  input: { decision?: unknown; comment?: unknown },
) {
  const decision: VendorCorrectionDecision = input.decision === 'return' ? 'return' : 'approve';
  const comment = String(input.comment || '').trim().slice(0, 2000);
  if (decision === 'return' && comment.length < 3) {
    throw new DecideVendorCorrectionReviewError('COMMENT_REQUIRED');
  }

  return database.$transaction(async (transaction) => {
    await transaction.$executeRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${requestId}, 0))`,
    );
    const request = await transaction.workforceRequest.findUnique({
      where: { id: requestId },
      include: {
        vendorCorrectionReviews: {
          where: { id: reviewId },
          include: { corrections: true },
        },
      },
    });
    if (!request) throw new DecideVendorCorrectionReviewError('NOT_FOUND');
    const review = request.vendorCorrectionReviews[0];
    if (!review) throw new DecideVendorCorrectionReviewError('REVIEW_NOT_FOUND');
    if (!canReviewVendorCorrection(actor.role, review.status)) {
      throw new DecideVendorCorrectionReviewError('FORBIDDEN');
    }
    if (
      request.status !== WorkforceRequestStatus.VENDOR_ACCEPTED &&
      request.status !== WorkforceRequestStatus.IN_SERVICE
    ) {
      throw new DecideVendorCorrectionReviewError('INVALID_STATE');
    }

    const actorName = `${actor.firstName} ${actor.lastName}`;
    await transaction.notification.updateMany({
      where: {
        userId: actor.id,
        entityType: 'WorkforceRequest',
        entityId: requestId,
        actionType: 'VENDOR_CORRECTION_REVIEW',
        actionCompletedAt: null,
      },
      data: {
        isRead: true,
        actionCompletedAt: new Date(),
        actionCompletedById: actor.id,
        actionCompletedByName: actorName,
      },
    });
    if (decision === 'return') {
      const update = await transaction.workforceVendorCorrectionReview.updateMany({
        where: { id: reviewId, status: review.status },
        data: {
          status: 'DRAFT',
          returnComment: comment,
          returnedAt: new Date(),
          returnedById: actor.id,
          returnedByName: actorName,
        },
      });
      if (update.count === 0) throw new DecideVendorCorrectionReviewError('CONFLICT');
      const returned = await transaction.workforceVendorCorrectionReview.findUniqueOrThrow({ where: { id: reviewId }, include: { corrections: true } });
      const reviewer = review.status === 'PENDING_FD' ? 'Finance Director' : 'General Manager';
      const details = `${reviewer} returned vendor corrections to Procurement: ${comment}`;
      await transaction.workforceRequestEvent.create({
        data: { requestId, action: 'VENDOR_CORRECTIONS_RETURNED', details, userId: actor.id, userName: actorName },
      });
      await transaction.auditLog.create({
        data: { userId: actor.id, userName: actorName, action: AuditAction.UPDATE, entityType: 'WorkforceVendorCorrectionReview', entityId: reviewId, details: `${request.code}: ${reviewer} returned vendor corrections to Procurement`, outcome: 'SUCCESS', reason: `${reviewer} requested correction-package revision; comment digest retained in structured evidence`, beforeState: serializeWorkforceVendorCorrectionReviewAuditState(review), afterState: serializeWorkforceVendorCorrectionReviewAuditState(returned) },
      });
      const procurementUsers = await transaction.user.findMany({
        where: { isActive: true, department: { code: 'PR' } },
        select: { id: true },
      });
      if (procurementUsers.length) await transaction.notification.createMany({
        data: procurementUsers.map((user) => ({
          userId: user.id,
          title: 'Vendor corrections returned',
          message: `${request.code}: ${comment}`,
          type: 'workforce',
          link: `/workforce/${requestId}`,
          entityType: 'WorkforceRequest',
          entityId: requestId,
          actionType: 'PROCUREMENT_CORRECTION_REVISION',
        })),
      });
      return { outcome: 'returned' as const };
    }

    if (review.status === 'PENDING_FD') {
      const update = await transaction.workforceVendorCorrectionReview.updateMany({
        where: { id: reviewId, status: 'PENDING_FD' },
        data: {
          status: 'PENDING_GM',
          fdApprovedById: actor.id,
          fdApprovedByName: actorName,
          fdApprovedAt: new Date(),
          fdComment: comment || null,
        },
      });
      if (update.count === 0) throw new DecideVendorCorrectionReviewError('CONFLICT');
      const financeApproved = await transaction.workforceVendorCorrectionReview.findUniqueOrThrow({ where: { id: reviewId }, include: { corrections: true } });
      const details = `Finance Director approved ${review.corrections.length} vendor correction(s)${comment ? `: ${comment}` : ''}`;
      await transaction.workforceRequestEvent.create({
        data: { requestId, action: 'VENDOR_CORRECTIONS_FINANCE_DIRECTOR_APPROVED', details, userId: actor.id, userName: actorName },
      });
      await transaction.auditLog.create({
        data: { userId: actor.id, userName: actorName, action: AuditAction.APPROVE, entityType: 'WorkforceVendorCorrectionReview', entityId: reviewId, details: `${request.code}: Finance Director approved ${review.corrections.length} vendor correction(s)`, outcome: 'SUCCESS', reason: 'Finance Director approved the correction package for General Manager review', beforeState: serializeWorkforceVendorCorrectionReviewAuditState(review), afterState: serializeWorkforceVendorCorrectionReviewAuditState(financeApproved) },
      });
      const gmUsers = await transaction.user.findMany({ where: { isActive: true, role: Role.GENERAL_MANAGER }, select: { id: true } });
      if (gmUsers.length) await transaction.notification.createMany({
        data: gmUsers.map((user) => ({
          userId: user.id,
          title: 'Vendor correction review required',
          message: `${request.code}: Finance Director approved vendor corrections; General Manager approval is required.`,
          type: 'workforce',
          link: `/workforce/${requestId}`,
          entityType: 'WorkforceRequest',
          entityId: requestId,
          actionType: 'VENDOR_CORRECTION_REVIEW',
        })),
      });
      return { outcome: 'pending_gm' as const };
    }

    for (const correction of review.corrections) {
      await transaction.workforceRequestItem.update({
        where: { id: correction.itemId },
        data: {
          vendorId: correction.proposedVendorId,
          vendorRateId: correction.proposedRateId,
          unitRate: correction.proposedUnitRate,
          rateCurrency: correction.proposedCurrency,
          estimatedCost: correction.proposedCost,
        },
      });
    }
    const updatedItems = await transaction.workforceRequestItem.findMany({ where: { requestId }, orderBy: { createdAt: 'asc' } });
    const firstItem = updatedItems[0];
    const updatedRequest = await transaction.workforceRequest.update({
      where: { id: requestId },
      data: {
        vendorId: firstItem?.vendorId || null,
        acceptedVendorId: firstItem?.vendorId || null,
        vendorRateId: firstItem?.vendorRateId || null,
        unitRate: firstItem?.unitRate ?? null,
        rateCurrency: firstItem?.rateCurrency || 'AZN',
        estimatedCost: roundCurrency(updatedItems.reduce((sum, item) => sum + (item.estimatedCost || 0), 0)),
        status: WorkforceRequestStatus.VENDORS_FULLY_APPROVED,
      },
      include: { items: true },
    });
    for (const oldVendorId of new Set(review.corrections.map((entry) => entry.originalVendorId).filter(Boolean))) {
      if (!updatedItems.some((item) => item.vendorId === oldVendorId)) {
        await transaction.vendorInvite.updateMany({
          where: { requestId, vendorId: oldVendorId!, status: { in: ['PENDING', 'ACCEPTED'] } },
          data: { status: 'REASSIGNED', respondedAt: new Date() },
        });
      }
    }
    const applied = await transaction.workforceVendorCorrectionReview.updateMany({
      where: { id: reviewId, status: 'PENDING_GM' },
      data: { status: 'APPROVED', gmApprovedById: actor.id, gmApprovedByName: actorName, gmApprovedAt: new Date(), gmComment: comment || null, appliedAt: new Date() },
    });
    if (applied.count === 0) throw new DecideVendorCorrectionReviewError('CONFLICT');
    const approvedReview = await transaction.workforceVendorCorrectionReview.findUniqueOrThrow({ where: { id: reviewId }, include: { corrections: true } });
    const details = `Finance Director and General Manager approved ${review.corrections.length} vendor correction(s). Approved vendors and prices were applied; request is ready for execution.${comment ? ` General Manager comment: ${comment}` : ''}`;
    await transaction.workforceRequestEvent.create({
      data: { requestId, action: 'VENDOR_CORRECTIONS_FULLY_APPROVED', details, userId: actor.id, userName: actorName },
    });
    await transaction.auditLog.create({
      data: { userId: actor.id, userName: actorName, action: AuditAction.APPROVE, entityType: 'WorkforceVendorCorrectionReview', entityId: reviewId, details: `${request.code}: Finance Director and General Manager approved vendor correction review`, outcome: 'SUCCESS', reason: 'General Manager completed the correction review and approved application of the proposed vendors and rates', beforeState: serializeWorkforceVendorCorrectionReviewAuditState(review), afterState: serializeWorkforceVendorCorrectionReviewAuditState(approvedReview) },
    });
    await transaction.auditLog.create({
      data: { userId: actor.id, userName: actorName, action: AuditAction.UPDATE, entityType: 'WorkforceRequest', entityId: requestId, details: `${request.code}: Applied fully approved vendor corrections`, outcome: 'SUCCESS', reason: 'Approved correction package changed assigned request vendors and rates', beforeState: serializeWorkforceRequestAuditState(request), afterState: serializeWorkforceRequestAuditState(updatedRequest) },
    });
    const recipients = await transaction.user.findMany({
      where: { isActive: true, OR: [{ id: request.createdById }, { departmentId: request.departmentId, role: Role.HOD }] },
      select: { id: true },
    });
    const recipientIds = [...new Set(recipients.map((recipient) => recipient.id))];
    if (recipientIds.length) await transaction.notification.createMany({
      data: recipientIds.map((userId) => ({ userId, title: 'Vendors fully approved — ready for execution', message: `${request.code}: Finance Director and General Manager approved the vendor changes. Vendors are fully approved and the request can proceed to execution.`, type: 'workforce', link: `/workforce/${requestId}`, entityType: 'WorkforceRequest', entityId: requestId })),
    });
    return { outcome: 'approved' as const };
  });
}
