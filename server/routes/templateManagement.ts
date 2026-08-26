import { Router, Request, Response } from 'express';
import { prisma } from '../db';
import { asyncHandler } from '../lib/asyncHandler';
import { authMiddleware } from '../middleware/auth';
import { requireCapability } from '../modules/access-control';
import { archiveTemplate, createTemplate, restoreTemplate, TemplateMutationError, updateTemplate } from '../modules/templates';
import { routeParam } from '../utils';

const router = Router();

function mutationError(error: TemplateMutationError, res: Response) {
  if (error.code === 'FORBIDDEN') return res.status(403).json({ error: 'Forbidden' });
  if (error.code === 'NOT_FOUND') return res.status(404).json({ error: 'Template not found' });
  if (error.code === 'DUPLICATE') return res.status(409).json({ error: 'A template with this name already exists in the selected department' });
  if (error.code === 'INVALID_REFERENCE') return res.status(400).json({ error: error.detail || 'Invalid template reference' });
  return res.status(400).json({ error: error.detail || 'Invalid template data' });
}

async function respond(res: Response, action: () => Promise<unknown>, created = false) {
  try {
    return res.status(created ? 201 : 200).json(await action());
  } catch (error) {
    if (!(error instanceof TemplateMutationError)) throw error;
    return mutationError(error, res);
  }
}

router.post('/', authMiddleware, requireCapability('templates.manage'), asyncHandler(async (req: Request, res: Response) => {
  return respond(res, () => createTemplate(prisma, req.user!, req.body), true);
}));

router.patch('/:id', authMiddleware, requireCapability('templates.manage'), asyncHandler(async (req: Request, res: Response) => {
  return respond(res, () => updateTemplate(prisma, req.user!, routeParam(req.params.id), req.body));
}));

router.post('/:id/restore', authMiddleware, requireCapability('templates.manage'), asyncHandler(async (req: Request, res: Response) => {
  return respond(res, () => restoreTemplate(prisma, req.user!, routeParam(req.params.id)));
}));

router.delete('/:id', authMiddleware, requireCapability('templates.manage'), asyncHandler(async (req: Request, res: Response) => {
  return respond(res, () => archiveTemplate(prisma, req.user!, routeParam(req.params.id)));
}));

export default router;
