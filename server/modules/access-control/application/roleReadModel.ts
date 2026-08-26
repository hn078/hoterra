import { Role } from '@prisma/client';
import type * as DatabaseModule from '../../../db';
import type { AuthUser } from '../../../middleware/auth';
import { PERMISSION_COLUMNS, ROLE_PERMISSIONS } from './permissionMatrixCatalog';

type AccessDatabase = typeof DatabaseModule.prisma;

export class RoleReadError extends Error {
  constructor(public readonly code: 'FORBIDDEN') {
    super(code);
    this.name = 'RoleReadError';
  }
}

export async function listRoles(database: AccessDatabase, actor: AuthUser) {
  if (!actor.capabilities.includes('roles.read')) throw new RoleReadError('FORBIDDEN');
  const canManage = actor.capabilities.includes('roles.manage');
  const [counts, customRoles] = await Promise.all([
    database.user.groupBy({
      by: ['role'],
      where: { isActive: true, customRoleId: null },
      _count: true,
    }),
    database.customRole.findMany({
      where: canManage ? {} : { isActive: true },
      include: { _count: { select: { users: true } } },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    }),
  ]);
  const countMap = Object.fromEntries(counts.map((count) => [count.role, count._count]));
  const systemRoles = (Object.keys(ROLE_PERMISSIONS) as Role[]).map((role) => ({
    id: role,
    name: ROLE_PERMISSIONS[role].name,
    description: ROLE_PERMISSIONS[role].description,
    userCount: countMap[role] ?? 0,
    isSystem: true,
    isActive: true,
    permissions: ROLE_PERMISSIONS[role].permissions,
  }));
  return {
    columns: PERMISSION_COLUMNS,
    roles: [
      ...systemRoles,
      ...customRoles.map((role) => ({
        id: role.id,
        name: role.name,
        description: role.description,
        baseRole: role.baseRole,
        userCount: role._count.users,
        isSystem: false,
        isActive: role.isActive,
        permissions: role.permissions,
      })),
    ],
  };
}
