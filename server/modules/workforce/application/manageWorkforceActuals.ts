import { AuditAction, Prisma, Role, WorkforceRequestStatus } from '@prisma/client';
import type * as DatabaseModule from '../../../db';
import type { AuthUser } from '../../../middleware/auth';
import { canConfirmProcurementSelection } from './procurementAccess';
import { serializeWorkforceRequestAuditState } from './workforceAuditState';

type WorkforceDatabase = typeof DatabaseModule.prisma;
const ACTUALS_STATUSES: WorkforceRequestStatus[] = [
  WorkforceRequestStatus.VENDOR_ACCEPTED,
  WorkforceRequestStatus.VENDORS_FULLY_APPROVED,
  WorkforceRequestStatus.IN_SERVICE,
  WorkforceRequestStatus.AWAITING_EVALUATION,
];

export type WorkforceActualsErrorCode =
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'INVALID_STATE'
  | 'INVALID_ACTUALS'
  | 'ACTUALS_REQUIRED'
  | 'ACTUALS_LOCKED'
  | 'HOD_CONFIRMATION_REQUIRED'
  | 'CONFLICT';

export class WorkforceActualsError extends Error {
  constructor(public readonly code: WorkforceActualsErrorCode) {
    super(code);
    this.name = 'WorkforceActualsError';
  }
}

function actorName(actor: AuthUser) { return `${actor.firstName} ${actor.lastName}`; }
function roundCurrency(value: number) { return Math.round(value * 100) / 100; }

export async function submitWorkforceActuals(
  database: WorkforceDatabase,
  actor: AuthUser,
  requestId: string,
  input: { actualQuantity?: unknown; actualHours?: unknown; actualCost?: unknown },
) {
  if (!actor.capabilities.includes('workforce.read')) throw new WorkforceActualsError('FORBIDDEN');
  const actualQuantity = Number(input.actualQuantity);
  const actualHours = Number(input.actualHours);
  const actualCost = Number(input.actualCost);
  if (!Number.isInteger(actualQuantity) || actualQuantity < 0 || !Number.isFinite(actualHours) || actualHours < 0 || !Number.isFinite(actualCost) || actualCost < 0) {
    throw new WorkforceActualsError('INVALID_ACTUALS');
  }
  const hasProcurementAccess = await canConfirmProcurementSelection(database, actor);
  return database.$transaction(async (transaction) => {
    await transaction.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${requestId}, 0))`);
    const request = await transaction.workforceRequest.findUnique({ where: { id: requestId } });
    if (!request) throw new WorkforceActualsError('NOT_FOUND');
    if (!ACTUALS_STATUSES.includes(request.status)) throw new WorkforceActualsError('INVALID_STATE');
    if (request.hodConfirmedAt || request.financeConfirmedAt) throw new WorkforceActualsError('ACTUALS_LOCKED');
    const isDepartmentHod = actor.role === Role.HOD && actor.departmentId === request.departmentId;
    if (!isDepartmentHod && !hasProcurementAccess) throw new WorkforceActualsError('FORBIDDEN');

    const cost = roundCurrency(actualCost);
    const updated = await transaction.workforceRequest.update({
      where: { id: requestId },
      data: { actualQuantity, actualHours, actualCost: cost },
      include: { items: true },
    });
    const name = actorName(actor);
    const details = `Actuals: ${actualQuantity} staff, ${actualHours}h, ${cost.toFixed(2)} AZN`;
    await transaction.workforceRequestEvent.create({ data: { requestId, action: 'COMPLETION_SUBMITTED', details, userId: actor.id, userName: name } });
    await transaction.auditLog.create({ data: { userId: actor.id, userName: name, action: AuditAction.UPDATE, entityType: 'WorkforceRequest', entityId: requestId, details: `${request.code}: ${details}`, outcome: 'SUCCESS', reason: 'Authorized department or Procurement actor recorded delivered workforce actuals', beforeState: serializeWorkforceRequestAuditState(request), afterState: serializeWorkforceRequestAuditState(updated) } });
    return { requestId };
  });
}

export async function confirmWorkforceActualsByHod(
  database: WorkforceDatabase,
  actor: AuthUser,
  requestId: string,
) {
  if (!actor.capabilities.includes('workforce.read')) throw new WorkforceActualsError('FORBIDDEN');
  return database.$transaction(async (transaction) => {
    await transaction.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${requestId}, 0))`);
    const request = await transaction.workforceRequest.findUnique({ where: { id: requestId } });
    if (!request) throw new WorkforceActualsError('NOT_FOUND');
    if (!ACTUALS_STATUSES.includes(request.status)) throw new WorkforceActualsError('INVALID_STATE');
    if (request.actualQuantity == null) throw new WorkforceActualsError('ACTUALS_REQUIRED');
    const allowed = actor.role === Role.HOD && actor.departmentId === request.departmentId;
    if (!allowed) throw new WorkforceActualsError('FORBIDDEN');
    if (request.hodConfirmedAt) return { requestId, alreadyProcessed: true };
    const updated = await transaction.workforceRequest.updateMany({
      where: { id: requestId, hodConfirmedAt: null },
      data: { hodConfirmedAt: new Date(), hodConfirmedById: actor.id },
    });
    if (!updated.count) throw new WorkforceActualsError('CONFLICT');
    const confirmed = await transaction.workforceRequest.findUniqueOrThrow({ where: { id: requestId }, include: { items: true } });
    const name = actorName(actor);
    await transaction.workforceRequestEvent.create({ data: { requestId, action: 'HOD_CONFIRMED', details: 'HOD confirmed service delivery', userId: actor.id, userName: name } });
    await transaction.auditLog.create({ data: { userId: actor.id, userName: name, action: AuditAction.APPROVE, entityType: 'WorkforceRequest', entityId: requestId, details: `HOD confirmed actuals for ${request.code}`, outcome: 'SUCCESS', reason: 'Owning department Head of Department confirmed delivered service actuals', beforeState: serializeWorkforceRequestAuditState(request), afterState: serializeWorkforceRequestAuditState(confirmed) } });
    return { requestId };
  });
}

export async function confirmWorkforceActualsByFinance(
  database: WorkforceDatabase,
  actor: AuthUser,
  requestId: string,
) {
  if (!actor.capabilities.includes('workforce.read')) throw new WorkforceActualsError('FORBIDDEN');
  return database.$transaction(async (transaction) => {
    await transaction.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${requestId}, 0))`);
    const request = await transaction.workforceRequest.findUnique({ where: { id: requestId } });
    if (!request) throw new WorkforceActualsError('NOT_FOUND');
    if (actor.role !== Role.FINANCE_DIRECTOR) throw new WorkforceActualsError('FORBIDDEN');
    if (!request.hodConfirmedAt) throw new WorkforceActualsError('HOD_CONFIRMATION_REQUIRED');
    if (request.actualQuantity == null) throw new WorkforceActualsError('ACTUALS_REQUIRED');
    if (request.financeConfirmedAt && request.status === WorkforceRequestStatus.COMPLETED) return { requestId, alreadyProcessed: true };
    if (!ACTUALS_STATUSES.includes(request.status)) throw new WorkforceActualsError('INVALID_STATE');
    const updated = await transaction.workforceRequest.updateMany({
      where: { id: requestId, status: request.status, financeConfirmedAt: null },
      data: { financeConfirmedAt: new Date(), financeConfirmedById: actor.id, status: WorkforceRequestStatus.COMPLETED },
    });
    if (!updated.count) throw new WorkforceActualsError('CONFLICT');
    const completed = await transaction.workforceRequest.findUniqueOrThrow({ where: { id: requestId }, include: { items: true } });
    const name = actorName(actor);
    await transaction.workforceRequestEvent.create({ data: { requestId, action: 'FINANCE_CONFIRMED', details: 'Finance confirmed — request completed', userId: actor.id, userName: name } });
    await transaction.auditLog.create({ data: { userId: actor.id, userName: name, action: AuditAction.APPROVE, entityType: 'WorkforceRequest', entityId: requestId, details: `Completed ${request.code} (Finance confirmed)`, outcome: 'SUCCESS', reason: 'Finance Director confirmed HOD-approved actuals and completed the request', beforeState: serializeWorkforceRequestAuditState(request), afterState: serializeWorkforceRequestAuditState(completed) } });
    await transaction.notification.create({ data: { userId: request.createdById, title: 'Casual workforce request completed', message: `${request.code}: Finance Director confirmed the actuals and completed the request.`, type: 'workforce', link: `/workforce/${requestId}` } });
    return { requestId };
  });
}
