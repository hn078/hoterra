import { AuditAction, Prisma, VendorApprovalStatus, WorkforceRateUnit, WorkforceRequestStatus } from '@prisma/client';
import type * as DatabaseModule from '../../../db';
import type { AuthUser } from '../../../middleware/auth';
import { canManageProcurementWorkforce } from './procurementAccess';
import { serializeWorkforceVendorCorrectionReviewAuditState } from './workforceAuditState';

type WorkforceDatabase = typeof DatabaseModule.prisma;

export type DraftVendorCorrectionErrorCode =
  | 'NOT_FOUND'
  | 'ITEM_NOT_FOUND'
  | 'FORBIDDEN'
  | 'INVALID_STATE'
  | 'ACTUALS_RECORDED'
  | 'INVALID_COMMENT'
  | 'RATE_REQUIRED'
  | 'INVALID_RATE'
  | 'SAME_VENDOR'
  | 'INVOICE_EXISTS'
  | 'REVIEW_PENDING';

export class DraftVendorCorrectionError extends Error {
  constructor(public readonly code: DraftVendorCorrectionErrorCode) {
    super(code);
    this.name = 'DraftVendorCorrectionError';
  }
}

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100;
}

function inclusiveDays(start: Date, end: Date) {
  return Math.max(1, Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1);
}

function correctionCost(
  quantity: number,
  price: number,
  unit: WorkforceRateUnit,
  start: Date,
  end: Date,
  hoursPerDay: number,
) {
  return roundCurrency(
    quantity * price * inclusiveDays(start, end) *
    (unit === WorkforceRateUnit.HOURLY ? hoursPerDay : 1),
  );
}

/** Creates or replaces one line in Procurement's vendor-correction draft. */
export async function draftVendorCorrection(
  database: WorkforceDatabase,
  actor: AuthUser,
  requestId: string,
  itemId: string,
  input: { vendorRateId?: unknown; comment?: unknown },
) {
  if (!(await canManageProcurementWorkforce(database, actor))) {
    throw new DraftVendorCorrectionError('FORBIDDEN');
  }
  const comment = String(input.comment || '').trim().slice(0, 2000);
  const vendorRateId = String(input.vendorRateId || '').trim();
  if (comment.length < 5) throw new DraftVendorCorrectionError('INVALID_COMMENT');
  if (!vendorRateId) throw new DraftVendorCorrectionError('RATE_REQUIRED');

  return database.$transaction(async (transaction) => {
    await transaction.$executeRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${requestId}, 0))`,
    );

    const request = await transaction.workforceRequest.findUnique({
      where: { id: requestId },
      include: {
        items: {
          include: {
            position: true,
            vendor: true,
            vendorRate: { include: { vendor: true } },
          },
        },
        invoices: { select: { vendorId: true } },
        vendorCorrectionReviews: { select: { id: true, status: true } },
      },
    });
    if (!request) throw new DraftVendorCorrectionError('NOT_FOUND');
    if (
      request.status !== WorkforceRequestStatus.VENDOR_ACCEPTED &&
      request.status !== WorkforceRequestStatus.IN_SERVICE
    ) {
      throw new DraftVendorCorrectionError('INVALID_STATE');
    }
    if (request.actualQuantity != null || request.hodConfirmedAt || request.financeConfirmedAt) {
      throw new DraftVendorCorrectionError('ACTUALS_RECORDED');
    }
    if (request.vendorCorrectionReviews.some((review) =>
      ['PENDING_FD', 'PENDING_GM'].includes(review.status)
    )) {
      throw new DraftVendorCorrectionError('REVIEW_PENDING');
    }

    const item = request.items.find((entry) => entry.id === itemId);
    if (!item) throw new DraftVendorCorrectionError('ITEM_NOT_FOUND');

    const rate = await transaction.vendorServiceRate.findFirst({
      where: {
        id: vendorRateId,
        positionId: item.positionId,
        unit: item.rateUnit,
        isActive: true,
        vendor: {
          isActive: true,
          isApproved: true,
          approvalStatus: VendorApprovalStatus.APPROVED,
          replacementRequested: false,
        },
      },
      include: { vendor: true },
    });
    if (!rate) throw new DraftVendorCorrectionError('INVALID_RATE');
    if (rate.vendorId === item.vendorId) throw new DraftVendorCorrectionError('SAME_VENDOR');
    if (item.vendorId && request.invoices.some((invoice) => invoice.vendorId === item.vendorId)) {
      throw new DraftVendorCorrectionError('INVOICE_EXISTS');
    }

    const settings = await transaction.workforceSettings.findFirst({
      select: { estimatedHoursPerShift: true },
    });
    const newCost = correctionCost(
      item.quantity,
      rate.price,
      rate.unit,
      request.workDate,
      request.endDate,
      item.hours || settings?.estimatedHoursPerShift || 8,
    );
    const oldVendorName = item.vendor?.name || item.vendorRate?.vendor.name || 'Unassigned vendor';
    const draft = request.vendorCorrectionReviews.find((review) => review.status === 'DRAFT')
      ?? await transaction.workforceVendorCorrectionReview.create({
        data: { requestId, status: 'DRAFT' },
        select: { id: true, status: true },
      });

    const beforeReview = await transaction.workforceVendorCorrectionReview.findUnique({
      where: { id: draft.id },
      include: { corrections: true },
    });
    await transaction.workforceVendorCorrection.upsert({
      where: { reviewId_itemId: { reviewId: draft.id, itemId } },
      create: {
        reviewId: draft.id,
        itemId,
        originalVendorId: item.vendorId,
        originalVendorName: oldVendorName,
        originalRateId: item.vendorRateId,
        originalUnitRate: item.unitRate,
        originalCost: item.estimatedCost || 0,
        proposedVendorId: rate.vendorId,
        proposedVendorName: rate.vendor.name,
        proposedRateId: rate.id,
        proposedUnitRate: rate.price,
        proposedCurrency: rate.currency,
        proposedCost: newCost,
        comment,
      },
      update: {
        proposedVendorId: rate.vendorId,
        proposedVendorName: rate.vendor.name,
        proposedRateId: rate.id,
        proposedUnitRate: rate.price,
        proposedCurrency: rate.currency,
        proposedCost: newCost,
        comment,
      },
    });
    const afterReview = await transaction.workforceVendorCorrectionReview.findUniqueOrThrow({
      where: { id: draft.id },
      include: { corrections: true },
    });

    const actorName = `${actor.firstName} ${actor.lastName}`;
    const details = `${item.position.name} (${item.rateUnit}) proposed from ${oldVendorName} to ${rate.vendor.name}. Proposed cost: ${newCost.toFixed(2)} ${rate.currency}. Procurement comment: ${comment}`;
    await transaction.workforceRequestEvent.create({
      data: {
        requestId,
        action: 'VENDOR_CORRECTION_DRAFTED',
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
        entityId: draft.id,
        details: `${request.code}: Procurement drafted a vendor correction for ${item.position.name} (${item.rateUnit})`,
        outcome: 'SUCCESS',
        reason: 'Procurement documented an unavailable or unsuitable assigned vendor and proposed an approved alternative',
        beforeState: serializeWorkforceVendorCorrectionReviewAuditState(beforeReview),
        afterState: serializeWorkforceVendorCorrectionReviewAuditState(afterReview),
      },
    });

    return { reviewId: draft.id, proposedCost: newCost };
  });
}
