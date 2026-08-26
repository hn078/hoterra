import { AuditAction, Role, WorkforceRequestStatus } from '@prisma/client';
import type * as DatabaseModule from '../../../db';
import type { AuthUser } from '../../../middleware/auth';

type WorkforceDatabase = typeof DatabaseModule.prisma;
interface ApprovalStep { role: Role; label: string; approverUserId?: string; approverDepartmentId?: string }

export type WorkforceRequestDecisionErrorCode =
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'INVALID_STATE'
  | 'COMMENT_REQUIRED'
  | 'END_DATE_PASSED'
  | 'CONFLICT';

export class WorkforceRequestDecisionError extends Error {
  constructor(public readonly code: WorkforceRequestDecisionErrorCode) {
    super(code);
    this.name = 'WorkforceRequestDecisionError';
  }
}

function steps(value: string): ApprovalStep[] {
  try {
    const parsed = JSON.parse(value) as ApprovalStep[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function canDecideCurrentWorkforceStep(
  actor: AuthUser,
  request: { status: WorkforceRequestStatus; departmentId: string; currentStepIndex: number; approvalSteps: string },
) {
  if (!actor.capabilities.includes('workforce.read')) return false;
  if (
    request.status !== WorkforceRequestStatus.PENDING &&
    request.status !== WorkforceRequestStatus.AWAITING_EXTRA_APPROVAL
  ) return false;
  const step = steps(request.approvalSteps)[request.currentStepIndex];
  if (!step || step.role !== actor.role) return false;
  if (step.approverUserId && step.approverUserId !== actor.id) return false;
  if (step.approverDepartmentId && step.approverDepartmentId !== actor.departmentId) return false;
  return step.role !== Role.HOD || !actor.departmentId || actor.departmentId === (step.approverDepartmentId || request.departmentId);
}

function actorName(actor: AuthUser) {
  return `${actor.firstName} ${actor.lastName}`;
}

export async function returnWorkforceRequestForRevision(
  database: WorkforceDatabase,
  actor: AuthUser,
  requestId: string,
  input: { comment?: unknown },
) {
  const comment = String(input.comment || '').trim().slice(0, 2000);
  if (!comment) throw new WorkforceRequestDecisionError('COMMENT_REQUIRED');
  return database.$transaction(async (transaction) => {
    const request = await transaction.workforceRequest.findUnique({ where: { id: requestId } });
    if (!request) throw new WorkforceRequestDecisionError('NOT_FOUND');
    if (
      (actor.role !== Role.FINANCE_DIRECTOR && actor.role !== Role.GENERAL_MANAGER) ||
      !canDecideCurrentWorkforceStep(actor, request)
    ) {
      throw new WorkforceRequestDecisionError('FORBIDDEN');
    }
    const update = await transaction.workforceRequest.updateMany({
      where: { id: requestId, status: request.status, currentStepIndex: request.currentStepIndex },
      data: { status: WorkforceRequestStatus.RETURNED_FOR_REVISION, currentStepIndex: 0 },
    });
    if (!update.count) throw new WorkforceRequestDecisionError('CONFLICT');
    const name = actorName(actor);
    await transaction.workforceRequestEvent.create({ data: { requestId, action: 'RETURNED_FOR_REVISION', details: comment, userId: actor.id, userName: name } });
    await transaction.auditLog.create({ data: { userId: actor.id, userName: name, action: AuditAction.UPDATE, entityType: 'WorkforceRequest', entityId: requestId, details: `Returned ${request.code} to HOD for revision: ${comment}` } });
    await transaction.notification.create({ data: { userId: request.createdById, title: 'Casual staff request returned for revision', message: `${request.code} was returned by ${name}: ${comment}`, type: 'workforce', link: `/workforce/${requestId}` } });
    return { requestId };
  });
}

export async function financeReturnWorkforceRequestToHod(
  database: WorkforceDatabase,
  actor: AuthUser,
  requestId: string,
  input: { comment?: unknown },
) {
  const comment = String(input.comment || '').trim().slice(0, 2000);
  if (comment.length < 3) throw new WorkforceRequestDecisionError('COMMENT_REQUIRED');
  return database.$transaction(async (transaction) => {
    const request = await transaction.workforceRequest.findUnique({ where: { id: requestId } });
    if (!request) throw new WorkforceRequestDecisionError('NOT_FOUND');
    if (actor.role !== Role.FINANCE_DIRECTOR) {
      throw new WorkforceRequestDecisionError('FORBIDDEN');
    }
    if (request.status !== WorkforceRequestStatus.VENDORS_FULLY_APPROVED) throw new WorkforceRequestDecisionError('INVALID_STATE');
    const endOfDay = new Date(request.endDate); endOfDay.setHours(23, 59, 59, 999);
    if (endOfDay.getTime() < Date.now()) throw new WorkforceRequestDecisionError('END_DATE_PASSED');
    const update = await transaction.workforceRequest.updateMany({
      where: { id: requestId, status: WorkforceRequestStatus.VENDORS_FULLY_APPROVED },
      data: { status: WorkforceRequestStatus.RETURNED_FOR_REVISION, currentStepIndex: 0 },
    });
    if (!update.count) throw new WorkforceRequestDecisionError('CONFLICT');
    const name = actorName(actor);
    const details = `Finance Director returned the fully approved request to HOD for revision: ${comment}`;
    await transaction.workforceRequestEvent.create({ data: { requestId, action: 'FINANCE_DIRECTOR_RETURNED_TO_HOD', details, userId: actor.id, userName: name } });
    await transaction.auditLog.create({ data: { userId: actor.id, userName: name, action: AuditAction.UPDATE, entityType: 'WorkforceRequest', entityId: requestId, details: `Finance Director returned ${request.code} to HOD for revision: ${comment}` } });
    await transaction.notification.create({ data: { userId: request.createdById, title: 'Request returned by Finance Director', message: `${request.code} was returned to HOD for revision: ${comment}`, type: 'workforce', link: `/workforce/${requestId}` } });
    return { requestId };
  });
}

export async function rejectWorkforceRequest(
  database: WorkforceDatabase,
  actor: AuthUser,
  requestId: string,
  input: { reason?: unknown },
) {
  const reason = String(input.reason || '').trim().slice(0, 2000);
  return database.$transaction(async (transaction) => {
    const request = await transaction.workforceRequest.findUnique({ where: { id: requestId } });
    if (!request) throw new WorkforceRequestDecisionError('NOT_FOUND');
    if (!canDecideCurrentWorkforceStep(actor, request)) throw new WorkforceRequestDecisionError('FORBIDDEN');
    const update = await transaction.workforceRequest.updateMany({
      where: { id: requestId, status: request.status, currentStepIndex: request.currentStepIndex },
      data: { status: WorkforceRequestStatus.REJECTED },
    });
    if (!update.count) throw new WorkforceRequestDecisionError('CONFLICT');
    const name = actorName(actor);
    await transaction.workforceRequestEvent.create({ data: { requestId, action: 'REJECTED', details: reason || 'Request rejected', userId: actor.id, userName: name } });
    await transaction.auditLog.create({ data: { userId: actor.id, userName: name, action: AuditAction.REJECT, entityType: 'WorkforceRequest', entityId: requestId, details: `Rejected ${request.code}${reason ? `: ${reason}` : ''}` } });
    await transaction.notification.create({ data: { userId: request.createdById, title: 'Casual staff request rejected', message: `${request.code} was rejected${reason ? `: ${reason}` : ''}`, type: 'workforce', link: `/workforce/${requestId}` } });
    return { requestId };
  });
}
