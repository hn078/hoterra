import { Router, Request, Response } from 'express';
import { Role } from '@prisma/client';
import { prisma } from '../db';
import { authMiddleware } from '../middleware/auth';
import { requireRoles } from '../middleware/auth';
import { PERMISSION_COLUMNS, ROLE_PERMISSIONS } from '../permissions';
import { routeParam } from '../utils';

const router = Router();

const adminOnly = requireRoles(Role.SYSTEM_ADMINISTRATOR, Role.GENERAL_MANAGER);

function normalizePermissions(value: unknown): Record<string, boolean[]> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const result: Record<string, boolean[]> = {};
  for (const module of Object.keys(ROLE_PERMISSIONS[Role.EMPLOYEE].permissions)) {
    const row = (value as Record<string, unknown>)[module];
    if (!Array.isArray(row) || row.length !== PERMISSION_COLUMNS.length) return null;
    result[module] = row.map(Boolean);
  }
  return result;
}

router.get('/', authMiddleware, async (_req: Request, res: Response) => {
  const counts = await prisma.user.groupBy({
    by: ['role'],
    where: { isActive: true },
    _count: true,
  });
  const countMap = Object.fromEntries(counts.map((c) => [c.role, c._count]));

  const systemRoles = (Object.keys(ROLE_PERMISSIONS) as Role[]).map((role) => ({
    id: role,
    name: ROLE_PERMISSIONS[role].name,
    description: ROLE_PERMISSIONS[role].description,
    userCount: countMap[role] ?? 0,
    isSystem: true,
    permissions: ROLE_PERMISSIONS[role].permissions,
  }));

  const customRoles = await prisma.customRole.findMany({
    where: { isActive: true },
    include: { _count: { select: { users: true } } },
    orderBy: { name: 'asc' },
  });
  const roles = [
    ...systemRoles,
    ...customRoles.map((role) => ({
      id: role.id,
      name: role.name,
      description: role.description,
      baseRole: role.baseRole,
      userCount: role._count.users,
      isSystem: false,
      permissions: role.permissions,
    })),
  ];

  res.json({ roles, columns: PERMISSION_COLUMNS });
});

router.post('/', authMiddleware, adminOnly, async (req: Request, res: Response) => {
  const { name, description = '', baseRole = Role.EMPLOYEE } = req.body;
  if (!name?.trim() || !Object.values(Role).includes(baseRole)) {
    return res.status(400).json({ error: 'Valid name and base role are required' });
  }
  if (baseRole === Role.SYSTEM_ADMINISTRATOR && req.user!.role !== Role.SYSTEM_ADMINISTRATOR) {
    return res.status(403).json({ error: 'Only a System Administrator can create an administrator role' });
  }
  const source = ROLE_PERMISSIONS[baseRole as Role].permissions;
  const role = await prisma.customRole.create({
    data: { name: name.trim(), description: String(description).trim(), baseRole, permissions: source },
  });
  res.status(201).json(role);
});

router.patch('/:id', authMiddleware, adminOnly, async (req: Request, res: Response) => {
  const permissions = req.body.permissions === undefined ? undefined : normalizePermissions(req.body.permissions);
  if (req.body.permissions !== undefined && !permissions) {
    return res.status(400).json({ error: 'Invalid permissions matrix' });
  }
  const role = await prisma.customRole.update({
    where: { id: routeParam(req.params.id) },
    data: {
      ...(req.body.name?.trim() ? { name: req.body.name.trim() } : {}),
      ...(req.body.description !== undefined ? { description: String(req.body.description).trim() } : {}),
      ...(permissions ? { permissions } : {}),
    },
  });
  res.json(role);
});

export default router;
