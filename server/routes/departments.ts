import { Router, Request, Response } from 'express';
import { prisma } from '../db';
import { authMiddleware } from '../middleware/auth';
import { routeParam } from '../utils';

const router = Router();

router.get('/', authMiddleware, async (_req: Request, res: Response) => {
  const departments = await prisma.department.findMany({
    orderBy: { name: 'asc' },
    include: {
      _count: { select: { documents: true, users: true } },
    },
  });
  res.json(departments);
});

router.get('/:id', authMiddleware, async (req: Request, res: Response) => {
  const department = await prisma.department.findUnique({
    where: { id: routeParam(req.params.id) },
    include: {
      users: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          role: true,
          email: true,
        },
      },
      documents: {
        take: 10,
        orderBy: { updatedAt: 'desc' },
      },
    },
  });

  if (!department) {
    return res.status(404).json({ error: 'Department not found' });
  }

  res.json(department);
});

export default router;
