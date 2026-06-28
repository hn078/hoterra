import { Router, Request, Response } from 'express';
import { prisma } from '../db';
import { authMiddleware } from '../middleware/auth';
import { routeParam } from '../utils';

const router = Router();

router.get('/', authMiddleware, async (_req: Request, res: Response) => {
  const users = await prisma.user.findMany({
    where: { isActive: true },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      department: true,
      createdAt: true,
      _count: { select: { documents: true, signatures: true } },
    },
    orderBy: { lastName: 'asc' },
  });
  res.json(users);
});

router.get('/:id', authMiddleware, async (req: Request, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: routeParam(req.params.id) },
    include: {
      department: true,
      _count: { select: { documents: true, signatures: true, auditLogs: true } },
    },
  });
  if (!user) return res.status(404).json({ error: 'User not found' });

  const recentActivity = await prisma.auditLog.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });

  const recentDocs = await prisma.document.findMany({
    where: { authorId: user.id },
    orderBy: { updatedAt: 'desc' },
    take: 5,
    include: { department: true },
  });

  res.json({
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    department: user.department,
    createdAt: user.createdAt,
    counts: user._count,
    recentActivity,
    recentDocs,
  });
});

export default router;
