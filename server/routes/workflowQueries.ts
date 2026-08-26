import { Router, Request, Response } from 'express';
import { prisma } from '../db';
import { asyncHandler } from '../lib/asyncHandler';
import { authMiddleware } from '../middleware/auth';
import { requireCapability } from '../modules/access-control';
import { listWorkflows, readWorkflow, WorkflowReadError } from '../modules/workflow';
import { routeParam } from '../utils';

const router = Router();

router.get('/', authMiddleware, requireCapability('workflows.read'), asyncHandler(async (req: Request, res: Response) => {
  res.json(await listWorkflows(prisma, req.user!));
}));

router.get('/:id', authMiddleware, requireCapability('workflows.read'), asyncHandler(async (req: Request, res: Response) => {
  try {
    res.json(await readWorkflow(prisma, req.user!, routeParam(req.params.id)));
  } catch (error) {
    if (!(error instanceof WorkflowReadError)) throw error;
    return error.code === 'FORBIDDEN'
      ? res.status(403).json({ error: 'Forbidden' })
      : res.status(404).json({ error: 'Workflow not found' });
  }
}));

export default router;
