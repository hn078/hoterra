import { Router, Request, Response } from 'express';
import { prisma } from '../db';
import { asyncHandler } from '../lib/asyncHandler';
import { authMiddleware } from '../middleware/auth';
import { requireCapability } from '../modules/access-control';
import {
  activateWorkflow,
  archiveWorkflow,
  createWorkflow,
  setDefaultWorkflow,
  updateWorkflow,
  WorkflowMutationError,
} from '../modules/workflow';
import { routeParam } from '../utils';

const router = Router();

function mutationError(error: WorkflowMutationError, res: Response) {
  if (error.code === 'FORBIDDEN') return res.status(403).json({ error: 'Forbidden' });
  if (error.code === 'NOT_FOUND') return res.status(404).json({ error: 'Workflow not found' });
  if (error.code === 'DUPLICATE') return res.status(409).json({ error: 'A workflow with this name already exists' });
  if (error.code === 'INVALID_STATE' || error.code === 'DEFAULT_REQUIRED') {
    return res.status(409).json({ error: error.detail || 'Workflow state does not allow this action' });
  }
  return res.status(400).json({ error: error.detail || 'Invalid workflow data' });
}

async function respond(res: Response, action: () => Promise<unknown>, created = false) {
  try {
    const result = await action();
    return res.status(created ? 201 : 200).json(result);
  } catch (error) {
    if (!(error instanceof WorkflowMutationError)) throw error;
    return mutationError(error, res);
  }
}

router.post('/', authMiddleware, requireCapability('workflows.manage'), asyncHandler(async (req: Request, res: Response) => {
  return respond(res, () => createWorkflow(prisma, req.user!, req.body), true);
}));

router.put('/:id', authMiddleware, requireCapability('workflows.manage'), asyncHandler(async (req: Request, res: Response) => {
  return respond(res, () => updateWorkflow(prisma, req.user!, routeParam(req.params.id), req.body));
}));

router.patch('/:id/activate', authMiddleware, requireCapability('workflows.manage'), asyncHandler(async (req: Request, res: Response) => {
  return respond(res, () => activateWorkflow(prisma, req.user!, routeParam(req.params.id)));
}));

router.patch('/:id/default', authMiddleware, requireCapability('workflows.manage'), asyncHandler(async (req: Request, res: Response) => {
  return respond(res, () => setDefaultWorkflow(prisma, req.user!, routeParam(req.params.id), req.body?.isDefault !== false));
}));

router.delete('/:id', authMiddleware, requireCapability('workflows.manage'), asyncHandler(async (req: Request, res: Response) => {
  return respond(res, () => archiveWorkflow(prisma, req.user!, routeParam(req.params.id)));
}));

export default router;
