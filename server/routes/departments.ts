import { Router, Request, Response } from 'express';
import { Role } from '@prisma/client';
import { prisma } from '../db';
import { authMiddleware } from '../middleware/auth';
import { routeParam } from '../utils';

const router = Router();

router.get('/', authMiddleware, async (_req: Request, res: Response) => {
  const departments = await prisma.department.findMany({
    orderBy: { name: 'asc' },
    include: {
      _count: { select: { documents: true, users: true } },
      users: {
        where: { role: Role.HOD },
        select: { id: true, firstName: true, lastName: true, email: true, role: true },
        take: 1,
      },
    },
  });

  const enriched = await Promise.all(
    departments.map(async (d) => {
      const published = await prisma.document.count({
        where: { departmentId: d.id, status: 'PUBLISHED' },
      });
      const total = d._count.documents;
      return {
        ...d,
        head: d.users[0] ?? null,
        sopStats: { active: published, total: Math.max(total, published) },
      };
    })
  );

  res.json(enriched);
});

router.post('/', authMiddleware, async (req: Request, res: Response) => {
  const role = req.user!.role;
  if (role !== Role.SYSTEM_ADMINISTRATOR && role !== Role.GENERAL_MANAGER) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const { name, code, color, location, description } = req.body;
  if (!name || !code) {
    return res.status(400).json({ error: 'Name and code required' });
  }

  const department = await prisma.department.create({
    data: {
      name,
      code: String(code).toUpperCase(),
      color: color || '#294660',
      location: location || 'Main Hotel',
      description,
    },
    include: { _count: { select: { documents: true, users: true } } },
  });

  res.status(201).json({ ...department, head: null, sopStats: { active: 0, total: 0 } });
});

router.patch('/:id', authMiddleware, async (req: Request, res: Response) => {
  const role = req.user!.role;
  if (role !== Role.SYSTEM_ADMINISTRATOR && role !== Role.GENERAL_MANAGER) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const { name, color, location, description } = req.body;
  const department = await prisma.department.update({
    where: { id: routeParam(req.params.id) },
    data: {
      ...(name && { name }),
      ...(color && { color }),
      ...(location && { location }),
      ...(description !== undefined && { description }),
    },
    include: { _count: { select: { documents: true, users: true } } },
  });
  res.json(department);
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
        take: 20,
        orderBy: { updatedAt: 'desc' },
        include: {
          department: true,
          author: { select: { firstName: true, lastName: true } },
        },
      },
    },
  });

  if (!department) {
    return res.status(404).json({ error: 'Department not found' });
  }

  const [workflowCount, templateCount, reviewCount, head] = await Promise.all([
    prisma.workflowRoute.count(),
    prisma.template.count({ where: { departmentId: department.id } }),
    prisma.document.count({
      where: {
        departmentId: department.id,
        status: { in: ['IN_REVIEW', 'SIGNED_HOD', 'SIGNED_FINANCE', 'SIGNED_GM'] },
      },
    }),
    prisma.user.findFirst({
      where: { departmentId: department.id, role: Role.HOD },
      select: { id: true, firstName: true, lastName: true, email: true, role: true },
    }),
  ]);

  res.json({
    ...department,
    head,
    stats: { workflows: workflowCount, templates: templateCount, underReview: reviewCount },
    workflowList: await prisma.workflowRoute.findMany({ orderBy: { name: 'asc' } }),
    templateList: await prisma.template.findMany({
      where: { OR: [{ departmentId: department.id }, { departmentId: null }] },
      include: { department: true },
    }),
  });
});

export default router;
