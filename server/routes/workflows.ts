import { Router, Request, Response } from 'express';
import { prisma } from '../db';
import { authMiddleware } from '../middleware/auth';
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

router.get('/:id', authMiddleware, async (req: Request, res: Response) => {
  const workflow = await prisma.workflowRoute.findUnique({
    where: { id: routeParam(req.params.id) },
  });
  if (!workflow) return res.status(404).json({ error: 'Workflow not found' });
  res.json({ ...workflow, steps: JSON.parse(workflow.steps) });
});

export default router;
