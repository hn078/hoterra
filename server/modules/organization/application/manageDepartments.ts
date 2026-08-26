import { AuditAction } from '@prisma/client';
import type * as DatabaseModule from '../../../db';
import type { AuthUser } from '../../../middleware/auth';
import { serializeAuditState } from '../../audit';

type OrganizationDatabase = typeof DatabaseModule.prisma;

export type DepartmentMutationErrorCode = 'FORBIDDEN' | 'INVALID_INPUT' | 'NOT_FOUND' | 'DUPLICATE';

export class DepartmentMutationError extends Error {
  constructor(public readonly code: DepartmentMutationErrorCode, public readonly detail?: string) {
    super(code);
    this.name = 'DepartmentMutationError';
  }
}

function text(value: unknown, field: string, min: number, max: number) {
  const normalized = String(value ?? '').trim();
  if (normalized.length < min || normalized.length > max) {
    throw new DepartmentMutationError('INVALID_INPUT', `${field} must be ${min}–${max} characters`);
  }
  return normalized;
}

function optionalDescription(value: unknown) {
  if (value === undefined) return undefined;
  const normalized = String(value ?? '').trim();
  if (normalized.length > 1000) throw new DepartmentMutationError('INVALID_INPUT', 'Description is too long');
  return normalized || null;
}

function color(value: unknown) {
  const normalized = String(value ?? '#294660').trim();
  if (!/^#[0-9a-f]{6}$/i.test(normalized)) throw new DepartmentMutationError('INVALID_INPUT', 'Color must be a six-digit hex value');
  return normalized.toUpperCase();
}

function code(value: unknown) {
  const normalized = String(value ?? '').trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9_-]{1,11}$/.test(normalized)) {
    throw new DepartmentMutationError('INVALID_INPUT', 'Code must be 2–12 letters, numbers, underscores, or hyphens');
  }
  return normalized;
}

function dto(department: any) {
  return {
    id: department.id,
    name: department.name,
    code: department.code,
    color: department.color,
    location: department.location,
    description: department.description,
    isActive: department.isActive,
    deactivatedAt: department.deactivatedAt,
  };
}

function departmentAuditState(department: any) {
  return {
    id: department.id,
    name: department.name,
    code: department.code,
    color: department.color,
    location: department.location,
    description: department.description,
    isActive: department.isActive,
    deactivatedAt: department.deactivatedAt,
  };
}

function uniqueConflict(error: unknown) {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'P2002');
}

export async function createDepartment(database: OrganizationDatabase, actor: AuthUser, inputValue: unknown) {
  if (!actor.capabilities.includes('departments.manage')) throw new DepartmentMutationError('FORBIDDEN');
  const input = inputValue && typeof inputValue === 'object' ? inputValue as Record<string, unknown> : {};
  const name = text(input.name, 'Name', 2, 100);
  const departmentCode = code(input.code);
  const location = text(input.location ?? 'Main Hotel', 'Location', 2, 100);
  const departmentColor = color(input.color);
  const description = optionalDescription(input.description);

  try {
    const department = await database.$transaction(async (transaction) => {
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`organization:department:${name.toLowerCase()}:${departmentCode}`}))`;
      if (await transaction.department.findFirst({
        where: { OR: [{ name: { equals: name, mode: 'insensitive' } }, { code: departmentCode }] },
        select: { id: true },
      })) throw new DepartmentMutationError('DUPLICATE');
      const created = await transaction.department.create({
        data: { name, code: departmentCode, color: departmentColor, location, description },
      });
      await transaction.auditLog.create({
        data: {
          userId: actor.id,
          userName: `${actor.firstName} ${actor.lastName}`,
          action: AuditAction.CREATE,
          entityType: 'Department',
          entityId: created.id,
          details: `Created department ${created.name} (${created.code})`,
          outcome: 'SUCCESS',
          reason: 'Department created by an authorized organization manager',
          afterState: serializeAuditState(departmentAuditState(created)),
        },
      });
      return created;
    });
    return { ...dto(department), _count: { documents: 0, users: 0 }, head: null, sopStats: { active: 0, total: 0 } };
  } catch (error) {
    if (uniqueConflict(error)) throw new DepartmentMutationError('DUPLICATE');
    throw error;
  }
}

export async function updateDepartment(
  database: OrganizationDatabase,
  actor: AuthUser,
  departmentId: string,
  inputValue: unknown,
) {
  if (!actor.capabilities.includes('departments.manage')) throw new DepartmentMutationError('FORBIDDEN');
  const input = inputValue && typeof inputValue === 'object' ? inputValue as Record<string, unknown> : {};
  if (input.code !== undefined) throw new DepartmentMutationError('INVALID_INPUT', 'Department code is immutable');
  const data: Record<string, unknown> = {};
  if (input.name !== undefined) data.name = text(input.name, 'Name', 2, 100);
  if (input.location !== undefined) data.location = text(input.location, 'Location', 2, 100);
  if (input.color !== undefined) data.color = color(input.color);
  if (input.description !== undefined) data.description = optionalDescription(input.description);
  if (!Object.keys(data).length) throw new DepartmentMutationError('INVALID_INPUT', 'No supported changes supplied');

  try {
    const department = await database.$transaction(async (transaction) => {
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`organization:department:${departmentId}`}))`;
      const existing = await transaction.department.findUnique({ where: { id: departmentId } });
      if (!existing) throw new DepartmentMutationError('NOT_FOUND');
      if (data.name && await transaction.department.findFirst({
        where: { id: { not: departmentId }, name: { equals: String(data.name), mode: 'insensitive' } },
        select: { id: true },
      })) throw new DepartmentMutationError('DUPLICATE');
      const updated = await transaction.department.update({ where: { id: departmentId }, data });
      await transaction.auditLog.create({
        data: {
          userId: actor.id,
          userName: `${actor.firstName} ${actor.lastName}`,
          action: AuditAction.UPDATE,
          entityType: 'Department',
          entityId: updated.id,
          details: `Updated department ${updated.name}: ${Object.keys(data).join(', ')}`,
          outcome: 'SUCCESS',
          reason: `Organization manager changed: ${Object.keys(data).join(', ')}`,
          beforeState: serializeAuditState(departmentAuditState(existing)),
          afterState: serializeAuditState(departmentAuditState(updated)),
        },
      });
      return updated;
    });
    return dto(department);
  } catch (error) {
    if (uniqueConflict(error)) throw new DepartmentMutationError('DUPLICATE');
    throw error;
  }
}
