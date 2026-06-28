import { Router, Request, Response } from 'express';
import { prisma } from '../db';
import { authMiddleware, requireRoles } from '../middleware/auth';
import { Role } from '@prisma/client';
import { routeParam } from '../utils';

const router = Router();

router.get('/', authMiddleware, async (_req: Request, res: Response) => {
  const workflows = await prisma.workflowRoute.findMany({
    orderBy: { createdAt: 'desc' },
  });
  res.json(
    workflows.map((w) => ({
      ...w,
      steps: JSON.parse(w.steps),
    }))
  );
});

router.post(
  '/',
  authMiddleware,
  requireRoles(Role.SYSTEM_ADMINISTRATOR, Role.GENERAL_MANAGER),
  async (req: Request, res: Response) => {
    const { name, description, steps } = req.body;
    const workflow = await prisma.workflowRoute.create({
      data: {
        name: name || 'New Workflow',
        description,
        steps: JSON.stringify(steps || ['HOD', 'FINANCE', 'GM']),
        isDefault: false,
      },
    });
    res.status(201).json({ ...workflow, steps: JSON.parse(workflow.steps) });
  }
);

router.get('/:id', authMiddleware, async (req: Request, res: Response) => {
  const workflow = await prisma.workflowRoute.findUnique({
    where: { id: routeParam(req.params.id) },
  });
  if (!workflow) return res.status(404).json({ error: 'Workflow not found' });
  res.json({ ...workflow, steps: JSON.parse(workflow.steps) });
});

router.put(
  '/:id',
  authMiddleware,
  requireRoles(Role.SYSTEM_ADMINISTRATOR, Role.GENERAL_MANAGER),
  async (req: Request, res: Response) => {
    const { name, description, steps } = req.body;
    const workflow = await prisma.workflowRoute.update({
      where: { id: routeParam(req.params.id) },
      data: {
        ...(name && { name }),
        ...(description !== undefined && { description }),
        ...(steps && { steps: JSON.stringify(steps) }),
      },
    });
    res.json({ ...workflow, steps: JSON.parse(workflow.steps) });
  }
);

router.delete(
  '/:id',
  authMiddleware,
  requireRoles(Role.SYSTEM_ADMINISTRATOR, Role.GENERAL_MANAGER),
  async (req: Request, res: Response) => {
    await prisma.workflowRoute.delete({ where: { id: routeParam(req.params.id) } });
    res.json({ ok: true });
  }
);

export default router;
