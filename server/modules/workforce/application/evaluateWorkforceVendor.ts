import { AuditAction, Prisma, Role, WorkforceEvaluationPhase, WorkforceRequestStatus } from '@prisma/client';
import type * as DatabaseModule from '../../../db';
import type { AuthUser } from '../../../middleware/auth';
import { canConfirmProcurementSelection } from './procurementAccess';

type WorkforceDatabase = typeof DatabaseModule.prisma;
const EVALUATION_STATUSES: WorkforceRequestStatus[] = [
  WorkforceRequestStatus.VENDOR_ACCEPTED,
  WorkforceRequestStatus.VENDORS_FULLY_APPROVED,
  WorkforceRequestStatus.IN_SERVICE,
  WorkforceRequestStatus.AWAITING_EVALUATION,
];

export type WorkforceEvaluationErrorCode =
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'INVALID_STATE'
  | 'INVALID_SCORE'
  | 'VENDOR_REQUIRED'
  | 'INVALID_VENDOR'
  | 'FINAL_TOO_EARLY'
  | 'REASON_REQUIRED';

export class WorkforceEvaluationError extends Error {
  constructor(public readonly code: WorkforceEvaluationErrorCode) {
    super(code);
    this.name = 'WorkforceEvaluationError';
  }
}

function assignedVendorIds(request: { vendorId: string | null; acceptedVendorId: string | null; items: Array<{ vendorId: string | null }> }) {
  const ids = request.items.map((item) => item.vendorId).filter((id): id is string => Boolean(id));
  if (!ids.length && request.acceptedVendorId) ids.push(request.acceptedVendorId);
  if (!ids.length && request.vendorId) ids.push(request.vendorId);
  return [...new Set(ids)];
}

function selectAssignedVendor(inputVendorId: unknown, ids: string[]) {
  const requested = String(inputVendorId || '').trim();
  if (ids.length > 1 && !requested) throw new WorkforceEvaluationError('VENDOR_REQUIRED');
  const selected = requested || ids[0];
  if (!selected || !ids.includes(selected)) throw new WorkforceEvaluationError('INVALID_VENDOR');
  return selected;
}

export async function evaluateWorkforceVendor(
  database: WorkforceDatabase,
  actor: AuthUser,
  requestId: string,
  input: { vendorId?: unknown; phase?: unknown; overallScore?: unknown; notes?: unknown; replacementRecommended?: unknown },
) {
  if (!actor.capabilities.includes('workforce.read')) throw new WorkforceEvaluationError('FORBIDDEN');
  const score = Number(input.overallScore);
  if (!Number.isInteger(score) || score < 1 || score > 5) throw new WorkforceEvaluationError('INVALID_SCORE');
  const phase = input.phase === 'FINAL' ? WorkforceEvaluationPhase.FINAL : WorkforceEvaluationPhase.ONGOING;
  const notes = String(input.notes || '').trim().slice(0, 2000) || null;
  const replacementRecommended = Boolean(input.replacementRecommended);

  return database.$transaction(async (transaction) => {
    await transaction.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${requestId}, 0))`);
    const request = await transaction.workforceRequest.findUnique({
      where: { id: requestId },
      include: { items: { select: { vendorId: true } } },
    });
    if (!request) throw new WorkforceEvaluationError('NOT_FOUND');
    const isDepartmentHod = actor.role === Role.HOD && actor.departmentId === request.departmentId;
    if (!isDepartmentHod) throw new WorkforceEvaluationError('FORBIDDEN');
    if (!EVALUATION_STATUSES.includes(request.status)) throw new WorkforceEvaluationError('INVALID_STATE');
    if (phase === WorkforceEvaluationPhase.FINAL && request.endDate.getTime() > Date.now()) {
      throw new WorkforceEvaluationError('FINAL_TOO_EARLY');
    }
    const vendorId = selectAssignedVendor(input.vendorId, assignedVendorIds(request));
    const vendor = await transaction.vendor.findUnique({ where: { id: vendorId }, select: { id: true, name: true, lowRatingAlertedAt: true } });
    if (!vendor) throw new WorkforceEvaluationError('INVALID_VENDOR');

    if (phase === WorkforceEvaluationPhase.FINAL) {
      const existing = await transaction.workforceQualityEvaluation.findFirst({
        where: { requestId, vendorId, phase, createdById: actor.id },
        include: { vendor: true },
      });
      if (existing) return existing;
    }
    const actorName = `${actor.firstName} ${actor.lastName}`;
    const evaluation = await transaction.workforceQualityEvaluation.create({
      data: { requestId, vendorId, phase, overallScore: score, notes, replacementRecommended, createdById: actor.id, createdByName: actorName, createdByRole: actor.role },
      include: { vendor: true },
    });
    if (phase === WorkforceEvaluationPhase.FINAL) {
      const requiredVendorIds = assignedVendorIds(request);
      const completedEvaluations = await transaction.workforceQualityEvaluation.findMany({
        where: {
          requestId,
          phase: WorkforceEvaluationPhase.FINAL,
          vendorId: { in: requiredVendorIds },
        },
        select: { vendorId: true },
        distinct: ['vendorId'],
      });
      const completedVendorIds = new Set(completedEvaluations.map((entry) => entry.vendorId));
      if (requiredVendorIds.every((id) => completedVendorIds.has(id))) {
        await transaction.notification.updateMany({
          where: {
            userId: actor.id,
            entityType: 'WorkforceRequest',
            entityId: requestId,
            actionType: 'WORKFORCE_FINAL_EVALUATION',
            actionCompletedAt: null,
          },
          data: {
            isRead: true,
            actionCompletedAt: new Date(),
            actionCompletedById: actor.id,
            actionCompletedByName: actorName,
          },
        });
      }
    }
    if (replacementRecommended) {
      await transaction.vendor.update({ where: { id: vendorId }, data: { replacementRequested: true } });
    }

    if (isDepartmentHod && score <= 3) {
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const lowCount = await transaction.workforceQualityEvaluation.count({
        where: { vendorId, overallScore: { lte: 3 }, createdByRole: Role.HOD, createdAt: { gte: since } },
      });
      if (lowCount >= 5 && (!vendor.lowRatingAlertedAt || vendor.lowRatingAlertedAt < since)) {
        await transaction.vendor.update({ where: { id: vendorId }, data: { replacementRequested: true, lowRatingAlertedAt: new Date() } });
        const recipients = await transaction.user.findMany({
          where: {
            isActive: true,
            OR: [
              { role: Role.FINANCE_DIRECTOR },
              { role: Role.GENERAL_MANAGER },
              { department: { code: 'PR' }, OR: [{ role: Role.HOD }, { customRole: { name: { contains: 'Procurement', mode: 'insensitive' } } }] },
            ],
          },
          select: { id: true },
        });
        if (recipients.length) await transaction.notification.createMany({
          data: [...new Set(recipients.map((recipient) => recipient.id))].map((userId) => ({ userId, title: 'Alternative vendor required', message: `${vendor.name} received ${lowCount} HOD ratings of 3 or below in the last 30 days. An alternative vendor is required.`, type: 'workforce', link: `/workforce/${requestId}` })),
        });
      }
    }

    const nextStatus = phase === WorkforceEvaluationPhase.ONGOING
      ? WorkforceRequestStatus.IN_SERVICE
      : request.financeConfirmedAt
        ? WorkforceRequestStatus.COMPLETED
        : WorkforceRequestStatus.AWAITING_EVALUATION;
    await transaction.workforceRequest.update({ where: { id: requestId }, data: { status: nextStatus } });
    const details = `${vendor.name}: overall score ${score}/5${replacementRecommended ? '; replacement requested' : ''}`;
    await transaction.workforceRequestEvent.create({ data: { requestId, action: phase === WorkforceEvaluationPhase.FINAL ? 'FINAL_EVALUATION' : 'QUALITY_EVALUATION', details, userId: actor.id, userName: actorName } });
    await transaction.auditLog.create({ data: { userId: actor.id, userName: actorName, action: AuditAction.CREATE, entityType: 'WorkforceQualityEvaluation', entityId: evaluation.id, details: `${request.code}: ${details}` } });
    return evaluation;
  });
}

export async function requestWorkforceVendorReplacement(
  database: WorkforceDatabase,
  actor: AuthUser,
  requestId: string,
  input: { vendorId?: unknown; reason?: unknown },
) {
  if (!actor.capabilities.includes('workforce.read')) throw new WorkforceEvaluationError('FORBIDDEN');
  const reason = String(input.reason || '').trim().slice(0, 2000);
  if (reason.length < 3) throw new WorkforceEvaluationError('REASON_REQUIRED');
  const procurementAccess = await canConfirmProcurementSelection(database, actor);
  return database.$transaction(async (transaction) => {
    const request = await transaction.workforceRequest.findUnique({ where: { id: requestId }, include: { items: { select: { vendorId: true } } } });
    if (!request) throw new WorkforceEvaluationError('NOT_FOUND');
    const isDepartmentHod = actor.role === Role.HOD && actor.departmentId === request.departmentId;
    if (!isDepartmentHod && !procurementAccess) throw new WorkforceEvaluationError('FORBIDDEN');
    const vendorId = selectAssignedVendor(input.vendorId, assignedVendorIds(request));
    await transaction.vendor.update({ where: { id: vendorId }, data: { replacementRequested: true } });
    const actorName = `${actor.firstName} ${actor.lastName}`;
    await transaction.workforceRequestEvent.create({ data: { requestId, action: 'VENDOR_REPLACEMENT_REQUESTED', details: reason, userId: actor.id, userName: actorName } });
    await transaction.auditLog.create({ data: { userId: actor.id, userName: actorName, action: AuditAction.UPDATE, entityType: 'Vendor', entityId: vendorId, details: `${request.code}: vendor replacement requested — ${reason}` } });
    return { ok: true as const };
  });
}
