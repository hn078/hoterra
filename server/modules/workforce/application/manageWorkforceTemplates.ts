import { AuditAction, Prisma, Role, VendorApprovalStatus, WorkforceShift, WorkforceVendorMode } from '@prisma/client';
import type * as DatabaseModule from '../../../db';
import type { AuthUser } from '../../../middleware/auth';
import { serializeWorkforceTemplateAuditState } from './workforceAuditState';

type WorkforceDatabase = typeof DatabaseModule.prisma;

export type WorkforceTemplateErrorCode =
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'INVALID_INPUT'
  | 'INVALID_REFERENCE'
  | 'RECURRING_FORBIDDEN';

export class WorkforceTemplateError extends Error {
  constructor(public readonly code: WorkforceTemplateErrorCode) {
    super(code);
    this.name = 'WorkforceTemplateError';
  }
}

function actorName(actor: AuthUser) {
  return `${actor.firstName} ${actor.lastName}`;
}

function isHotelWide(actor: AuthUser) {
  return actor.role === Role.GENERAL_MANAGER;
}

function assertTemplateCapability(actor: AuthUser) {
  if (!actor.capabilities.includes('workforce.templates.manage')) throw new WorkforceTemplateError('FORBIDDEN');
}

function text(value: unknown, maximum: number, required = false) {
  if (value == null || value === '') {
    if (required) throw new WorkforceTemplateError('INVALID_INPUT');
    return null;
  }
  const result = String(value).trim();
  if ((required && !result) || result.length > maximum) throw new WorkforceTemplateError('INVALID_INPUT');
  return result || null;
}

function boolean(value: unknown) {
  if (typeof value !== 'boolean') throw new WorkforceTemplateError('INVALID_INPUT');
  return value;
}

function quantity(value: unknown) {
  const result = Number(value);
  if (!Number.isInteger(result) || result < 1 || result > 10_000) throw new WorkforceTemplateError('INVALID_INPUT');
  return result;
}

function dayOfWeek(value: unknown) {
  if (value == null || value === '') return null;
  const result = Number(value);
  if (!Number.isInteger(result) || result < 0 || result > 6) throw new WorkforceTemplateError('INVALID_INPUT');
  return result;
}

function assertDepartmentScope(actor: AuthUser, departmentId: string | null) {
  if (isHotelWide(actor)) return;
  if (!actor.departmentId || departmentId !== actor.departmentId) throw new WorkforceTemplateError('FORBIDDEN');
}

async function validateReferences(
  transaction: any,
  departmentId: string | null,
  positionId: string | null,
  vendorId: string | null,
) {
  const [department, position, vendor] = await Promise.all([
    departmentId ? transaction.department.findFirst({ where: { id: departmentId, isActive: true }, select: { id: true } }) : Promise.resolve(null),
    positionId ? transaction.workforcePosition.findUnique({ where: { id: positionId }, select: { id: true, departmentId: true, isActive: true } }) : Promise.resolve(null),
    vendorId ? transaction.vendor.findUnique({ where: { id: vendorId }, select: { id: true, isActive: true, approvalStatus: true } }) : Promise.resolve(null),
  ]);
  if ((departmentId && !department) || (positionId && (!position?.isActive || (departmentId && position.departmentId !== departmentId))) ||
    (vendorId && (!vendor?.isActive || vendor.approvalStatus !== VendorApprovalStatus.APPROVED))) {
    throw new WorkforceTemplateError('INVALID_REFERENCE');
  }
}

export async function createWorkforceTemplate(
  database: WorkforceDatabase,
  actor: AuthUser,
  input: Record<string, unknown>,
) {
  assertTemplateCapability(actor);
  const name = text(input.name, 160, true)!;
  const departmentId = text(input.departmentId, 100);
  const positionId = text(input.positionId, 100);
  const vendorId = text(input.vendorId, 100);
  const recurring = input.isRecurring === undefined ? false : boolean(input.isRecurring);
  if (recurring && !actor.capabilities.includes('workforce.settings.manage')) throw new WorkforceTemplateError('RECURRING_FORBIDDEN');
  assertDepartmentScope(actor, departmentId);
  const shift = Object.values(WorkforceShift).includes(input.shift as WorkforceShift) ? input.shift as WorkforceShift : WorkforceShift.MORNING;
  const vendorMode = Object.values(WorkforceVendorMode).includes(input.vendorMode as WorkforceVendorMode) ? input.vendorMode as WorkforceVendorMode : WorkforceVendorMode.DIRECT;
  const count = input.quantity === undefined ? 1 : quantity(input.quantity);
  const weekday = dayOfWeek(input.dayOfWeek);
  const comment = text(input.comment, 2000);
  const hotelName = text(input.hotelName, 100);
  return database.$transaction(async (transaction) => {
    await transaction.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`workforce-template:${actor.tenantId}:${name.toLocaleLowerCase('en-US')}:${departmentId || '*'}`}, 0))`);
    await validateReferences(transaction, departmentId, positionId, vendorId);
    const duplicate = await transaction.workforceRequestTemplate.findFirst({
      where: { departmentId, name: { equals: name, mode: 'insensitive' }, isActive: true }, select: { id: true },
    });
    if (duplicate) throw new WorkforceTemplateError('INVALID_INPUT');
    const template = await transaction.workforceRequestTemplate.create({
      data: { name, departmentId, positionId, shift, quantity: count, comment, dayOfWeek: weekday, vendorMode, vendorId, isRecurring: recurring, hotelName },
      include: { department: true, position: true },
    });
    await transaction.auditLog.create({
      data: { userId: actor.id, userName: actorName(actor), action: AuditAction.CREATE, entityType: 'WorkforceRequestTemplate', entityId: template.id, details: `Created workforce template ${name}${recurring ? ' (recurring)' : ''}`, outcome: 'SUCCESS', reason: 'Authorized actor created a reusable workforce request template', afterState: serializeWorkforceTemplateAuditState(template) },
    });
    return template;
  });
}

export async function updateWorkforceTemplate(
  database: WorkforceDatabase,
  actor: AuthUser,
  templateId: string,
  input: Record<string, unknown>,
) {
  assertTemplateCapability(actor);
  return database.$transaction(async (transaction) => {
    await transaction.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${templateId}, 0))`);
    const existing = await transaction.workforceRequestTemplate.findUnique({ where: { id: templateId } });
    if (!existing) throw new WorkforceTemplateError('NOT_FOUND');
    assertDepartmentScope(actor, existing.departmentId);
    const data: {
      name?: string; departmentId?: string | null; positionId?: string | null; shift?: WorkforceShift;
      quantity?: number; comment?: string | null; dayOfWeek?: number | null; vendorMode?: WorkforceVendorMode;
      vendorId?: string | null; isActive?: boolean; isRecurring?: boolean; hotelName?: string | null;
    } = {};
    if (input.name !== undefined) data.name = text(input.name, 160, true)!;
    if (input.departmentId !== undefined) data.departmentId = text(input.departmentId, 100);
    if (input.positionId !== undefined) data.positionId = text(input.positionId, 100);
    if (input.vendorId !== undefined) data.vendorId = text(input.vendorId, 100);
    if (input.shift !== undefined) {
      if (!Object.values(WorkforceShift).includes(input.shift as WorkforceShift)) throw new WorkforceTemplateError('INVALID_INPUT');
      data.shift = input.shift as WorkforceShift;
    }
    if (input.vendorMode !== undefined) {
      if (!Object.values(WorkforceVendorMode).includes(input.vendorMode as WorkforceVendorMode)) throw new WorkforceTemplateError('INVALID_INPUT');
      data.vendorMode = input.vendorMode as WorkforceVendorMode;
    }
    if (input.quantity !== undefined) data.quantity = quantity(input.quantity);
    if (input.dayOfWeek !== undefined) data.dayOfWeek = dayOfWeek(input.dayOfWeek);
    if (input.comment !== undefined) data.comment = text(input.comment, 2000);
    if (input.hotelName !== undefined) data.hotelName = text(input.hotelName, 100);
    if (input.isActive !== undefined) data.isActive = boolean(input.isActive);
    if (input.isRecurring !== undefined) {
      data.isRecurring = boolean(input.isRecurring);
      if (data.isRecurring && !actor.capabilities.includes('workforce.settings.manage')) throw new WorkforceTemplateError('RECURRING_FORBIDDEN');
    }
    if (!Object.keys(data).length) throw new WorkforceTemplateError('INVALID_INPUT');
    const nextDepartmentId = data.departmentId === undefined ? existing.departmentId : data.departmentId;
    assertDepartmentScope(actor, nextDepartmentId);
    await validateReferences(
      transaction,
      nextDepartmentId,
      data.positionId === undefined ? existing.positionId : data.positionId,
      data.vendorId === undefined ? existing.vendorId : data.vendorId,
    );
    if (data.name) {
      const duplicate = await transaction.workforceRequestTemplate.findFirst({
        where: { id: { not: templateId }, departmentId: nextDepartmentId, name: { equals: data.name, mode: 'insensitive' }, isActive: true }, select: { id: true },
      });
      if (duplicate) throw new WorkforceTemplateError('INVALID_INPUT');
    }
    const template = await transaction.workforceRequestTemplate.update({ where: { id: templateId }, data, include: { department: true, position: true } });
    await transaction.auditLog.create({
      data: { userId: actor.id, userName: actorName(actor), action: AuditAction.UPDATE, entityType: 'WorkforceRequestTemplate', entityId: templateId, details: `Updated workforce template ${existing.name}: ${Object.keys(data).join(', ')}`, outcome: 'SUCCESS', reason: 'Authorized actor changed reusable workforce planning parameters', beforeState: serializeWorkforceTemplateAuditState(existing), afterState: serializeWorkforceTemplateAuditState(template) },
    });
    return template;
  });
}

export async function disableWorkforceTemplate(database: WorkforceDatabase, actor: AuthUser, templateId: string) {
  assertTemplateCapability(actor);
  return database.$transaction(async (transaction) => {
    await transaction.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${templateId}, 0))`);
    const template = await transaction.workforceRequestTemplate.findUnique({ where: { id: templateId } });
    if (!template) throw new WorkforceTemplateError('NOT_FOUND');
    assertDepartmentScope(actor, template.departmentId);
    if (!template.isActive) return { ok: true, alreadyProcessed: true };
    const disabled = await transaction.workforceRequestTemplate.update({ where: { id: templateId }, data: { isActive: false, isRecurring: false } });
    await transaction.auditLog.create({
      data: { userId: actor.id, userName: actorName(actor), action: AuditAction.UPDATE, entityType: 'WorkforceRequestTemplate', entityId: templateId, details: `Disabled workforce template ${template.name}`, outcome: 'SUCCESS', reason: 'Template and its recurring generation were deactivated', beforeState: serializeWorkforceTemplateAuditState(template), afterState: serializeWorkforceTemplateAuditState(disabled) },
    });
    return { ok: true };
  });
}
