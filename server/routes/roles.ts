import { Router, Request, Response } from 'express';
import { Role } from '@prisma/client';
import { prisma } from '../db';
import { authMiddleware } from '../middleware/auth';
import { PERMISSION_COLUMNS, ROLE_PERMISSIONS } from '../permissions';

const router = Router();

router.get('/', authMiddleware, async (_req: Request, res: Response) => {
  const counts = await prisma.user.groupBy({
    by: ['role'],
    where: { isActive: true },
    _count: true,
  });
  const countMap = Object.fromEntries(counts.map((c) => [c.role, c._count]));

  const roles = (Object.keys(ROLE_PERMISSIONS) as Role[]).map((role) => ({
    id: role,
    name: ROLE_PERMISSIONS[role].name,
    description: ROLE_PERMISSIONS[role].description,
    userCount: countMap[role] ?? 0,
    isSystem: true,
    permissions: ROLE_PERMISSIONS[role].permissions,
  }));

  res.json({ roles, columns: PERMISSION_COLUMNS });
});

export default router;
