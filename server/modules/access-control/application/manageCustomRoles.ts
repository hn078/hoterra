import { AuditAction, Prisma, Role } from '@prisma/client';
import type * as DatabaseModule from '../../../db';
import type { AuthUser } from '../../../middleware/auth';
import { PERMISSION_COLUMNS, ROLE_PERMISSIONS } from './permissionMatrixCatalog';
import { capabilitiesFromPermissionMatrix } from './resolveEffectiveCapabilities';
import { serializeAuditState } from '../../audit';

type AccessDatabase = typeof DatabaseModule.prisma;
type PermissionMatrix = Record<string, boolean[]>;

export type CustomRoleErrorCode =
  | 'FORBIDDEN'
  | 'INVALID_INPUT'
  | 'INVALID_PERMISSIONS'
  | 'NOT_FOUND'
  | 'NAME_EXISTS'
  | 'SELF_ROLE'
  | 'ROLE_IN_USE';

export class CustomRoleError extends Error {
  constructor(public readonly code: CustomRoleErrorCode, public readonly detail?: string) {
    super(code);
    this.name = 'CustomRoleError';
  }
}

function roleDto(role: any) {
  return {
    id: role.id,
    name: role.name,
    description: role.description,
    baseRole: role.baseRole,
    permissions: role.permissions,
    isActive: role.isActive,
    createdAt: role.createdAt,
    updatedAt: role.updatedAt,
  };
}

function roleAuditState(role: any) {
  return {
    id: role.id,
    name: role.name,
    description: role.description,
    baseRole: role.baseRole,
    permissions: role.permissions,
    isActive: role.isActive,
  };
}

function normalizedName(value: unknown) {
  const name = String(value ?? '').trim();
  if (name.length < 2 || name.length > 100) throw new CustomRoleError('INVALID_INPUT', 'Role name must be 2–100 characters');
  return name;
}

function normalizedDescription(value: unknown) {
  const description = String(value ?? '').trim();
  if (description.length > 500) throw new CustomRoleError('INVALID_INPUT', 'Description is too long');
  return description;
}

function normalizedBaseRole(value: unknown): Role {
  if (!Object.values(Role).includes(value as Role)) throw new CustomRoleError('INVALID_INPUT', 'Valid base role is required');
  return value as Role;
}

function assertPrivilegedBaseRole(actor: AuthUser, role: Role) {
  if (
    (role === Role.SYSTEM_ADMINISTRATOR || role === Role.GENERAL_MANAGER)
    && !actor.capabilities.includes('roles.assign.privileged')
  ) {
    throw new CustomRoleError('FORBIDDEN', 'Only a System Administrator can manage an executive role');
  }
}

export function normalizePermissions(value: unknown): PermissionMatrix {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new CustomRoleError('INVALID_PERMISSIONS');
  }
  const input = value as Record<string, unknown>;
  const modules = Object.keys(ROLE_PERMISSIONS[Role.EMPLOYEE].permissions);
  if (Object.keys(input).some((module) => !modules.includes(module))) {
    throw new CustomRoleError('INVALID_PERMISSIONS');
  }
  const result: PermissionMatrix = {};
  for (const module of modules) {
    const row = input[module];
    if (
      !Array.isArray(row)
      || row.length !== PERMISSION_COLUMNS.length
      || row.some((permission) => typeof permission !== 'boolean')
    ) {
      throw new CustomRoleError('INVALID_PERMISSIONS');
    }
    const fullAccess = row[0] === true;
    const readAccess = row[2] === true;
    const hasDependentPermission = row.some((enabled, index) => enabled && index !== 0 && index !== 2);
    if (!fullAccess && hasDependentPermission && !readAccess) {
      throw new CustomRoleError('INVALID_PERMISSIONS', `${module}: Read is required for other permissions`);
    }
    result[module] = [...row];
  }
  return result;
}

function assertPermissionCeiling(actor: AuthUser, permissions: PermissionMatrix) {
  if (actor.capabilities.includes('roles.assign.privileged')) return;
  const actorCapabilities = new Set(actor.capabilities);
  const elevated = capabilitiesFromPermissionMatrix(permissions).filter((capability) => !actorCapabilities.has(capability));
  if (elevated.length) {
    throw new CustomRoleError('FORBIDDEN', 'A delegated role manager cannot grant permissions they do not hold');
  }
}

function assertMayMutate(actor: AuthUser, role: { id: string; baseRole: Role }) {
  assertPrivilegedBaseRole(actor, role.baseRole);
  if (actor.customRoleId === role.id && !actor.capabilities.includes('roles.assign.privileged')) {
    throw new CustomRoleError('SELF_ROLE', 'You cannot modify your own assigned role');
  }
}

function uniqueConflict(error: unknown) {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'P2002');
}

export async function createCustomRole(database: AccessDatabase, actor: AuthUser, inputValue: unknown) {
  if (!actor.capabilities.includes('roles.manage')) throw new CustomRoleError('FORBIDDEN');
  const input = inputValue && typeof inputValue === 'object' ? inputValue as Record<string, unknown> : {};
  const name = normalizedName(input.name);
  const description = normalizedDescription(input.description);
  const baseRole = normalizedBaseRole(input.baseRole ?? Role.EMPLOYEE);
  assertPrivilegedBaseRole(actor, baseRole);
  const permissions = normalizePermissions(ROLE_PERMISSIONS[baseRole].permissions);
  assertPermissionCeiling(actor, permissions);

  try {
    const role = await database.$transaction(async (transaction) => {
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`access-control:role-name:${name.toLowerCase()}`}))`;
      if (await transaction.customRole.findFirst({ where: { name: { equals: name, mode: 'insensitive' } }, select: { id: true } })) {
        throw new CustomRoleError('NAME_EXISTS');
      }
      const created = await transaction.customRole.create({
        data: { name, description, baseRole, permissions: permissions as Prisma.InputJsonValue },
      });
      await transaction.auditLog.create({
        data: {
          userId: actor.id,
          userName: `${actor.firstName} ${actor.lastName}`,
          action: AuditAction.CREATE,
          entityType: 'CustomRole',
          entityId: created.id,
          details: `Created custom role ${created.name} with base role ${created.baseRole}`,
          outcome: 'SUCCESS',
          reason: 'Custom access role created',
          afterState: serializeAuditState(roleAuditState(created)),
        },
      });
      return created;
    });
    return roleDto(role);
  } catch (error) {
    if (uniqueConflict(error)) throw new CustomRoleError('NAME_EXISTS');
    throw error;
  }
}

export async function updateCustomRole(database: AccessDatabase, actor: AuthUser, roleId: string, inputValue: unknown) {
  if (!actor.capabilities.includes('roles.manage')) throw new CustomRoleError('FORBIDDEN');
  const input = inputValue && typeof inputValue === 'object' ? inputValue as Record<string, unknown> : {};
  const name = input.name === undefined ? undefined : normalizedName(input.name);
  const description = input.description === undefined ? undefined : normalizedDescription(input.description);
  const permissions = input.permissions === undefined ? undefined : normalizePermissions(input.permissions);
  if (permissions) assertPermissionCeiling(actor, permissions);
  if (input.baseRole !== undefined || input.isActive !== undefined) throw new CustomRoleError('INVALID_INPUT');

  try {
    const role = await database.$transaction(async (transaction) => {
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`access-control:role:${roleId}`}))`;
      if (name) await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`access-control:role-name:${name.toLowerCase()}`}))`;
      const existing = await transaction.customRole.findUnique({ where: { id: roleId } });
      if (!existing?.isActive) throw new CustomRoleError('NOT_FOUND');
      assertMayMutate(actor, existing);
      if (name && await transaction.customRole.findFirst({
        where: { id: { not: roleId }, name: { equals: name, mode: 'insensitive' } },
        select: { id: true },
      })) throw new CustomRoleError('NAME_EXISTS');
      const data: Record<string, unknown> = {};
      if (name !== undefined) data.name = name;
      if (description !== undefined) data.description = description;
      if (permissions !== undefined) data.permissions = permissions as Prisma.InputJsonValue;
      if (!Object.keys(data).length) return existing;
      const updated = await transaction.customRole.update({ where: { id: roleId }, data });
      await transaction.auditLog.create({
        data: {
          userId: actor.id,
          userName: `${actor.firstName} ${actor.lastName}`,
          action: AuditAction.UPDATE,
          entityType: 'CustomRole',
          entityId: updated.id,
          details: `Updated custom role ${updated.name}: ${Object.keys(data).join(', ')}`,
          outcome: 'SUCCESS',
          reason: 'Custom access role definition updated',
          beforeState: serializeAuditState(roleAuditState(existing)),
          afterState: serializeAuditState(roleAuditState(updated)),
        },
      });
      return updated;
    });
    return roleDto(role);
  } catch (error) {
    if (uniqueConflict(error)) throw new CustomRoleError('NAME_EXISTS');
    throw error;
  }
}

export async function deactivateCustomRole(database: AccessDatabase, actor: AuthUser, roleId: string) {
  if (!actor.capabilities.includes('roles.manage')) throw new CustomRoleError('FORBIDDEN');
  return database.$transaction(async (transaction) => {
    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`access-control:role:${roleId}`}))`;
    const existing = await transaction.customRole.findUnique({ where: { id: roleId } });
    if (!existing?.isActive) throw new CustomRoleError('NOT_FOUND');
    assertMayMutate(actor, existing);
    const assignedUsers = await transaction.user.count({ where: { customRoleId: roleId } });
    if (assignedUsers) throw new CustomRoleError('ROLE_IN_USE', `${assignedUsers} user(s) are still assigned to this role`);
    const role = await transaction.customRole.update({ where: { id: roleId }, data: { isActive: false } });
    await transaction.auditLog.create({
      data: {
        userId: actor.id,
        userName: `${actor.firstName} ${actor.lastName}`,
        action: AuditAction.UPDATE,
        entityType: 'CustomRole',
        entityId: role.id,
        details: `Deactivated custom role ${role.name}`,
        outcome: 'SUCCESS',
        reason: 'Custom access role deactivated',
        beforeState: serializeAuditState(roleAuditState(existing)),
        afterState: serializeAuditState(roleAuditState(role)),
      },
    });
    return { ok: true, id: role.id };
  });
}

export async function reactivateCustomRole(database: AccessDatabase, actor: AuthUser, roleId: string) {
  if (!actor.capabilities.includes('roles.manage')) throw new CustomRoleError('FORBIDDEN');
  return database.$transaction(async (transaction) => {
    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`access-control:role:${roleId}`}))`;
    const existing = await transaction.customRole.findUnique({ where: { id: roleId } });
    if (!existing) throw new CustomRoleError('NOT_FOUND');
    assertMayMutate(actor, existing);
    if (existing.isActive) return { ok: true, id: existing.id };

    const assignedUsers = await transaction.user.count({ where: { customRoleId: roleId } });
    if (assignedUsers) {
      throw new CustomRoleError(
        'ROLE_IN_USE',
        `${assignedUsers} user(s) are still assigned to this inactive role; reassign them before activation`,
      );
    }

    const role = await transaction.customRole.update({ where: { id: roleId }, data: { isActive: true } });
    await transaction.auditLog.create({
      data: {
        userId: actor.id,
        userName: `${actor.firstName} ${actor.lastName}`,
        action: AuditAction.UPDATE,
        entityType: 'CustomRole',
        entityId: role.id,
        details: `Reactivated custom role ${role.name}`,
        outcome: 'SUCCESS',
        reason: 'Custom access role reactivated',
        beforeState: serializeAuditState(roleAuditState(existing)),
        afterState: serializeAuditState(roleAuditState(role)),
      },
    });
    return { ok: true, id: role.id };
  });
}
