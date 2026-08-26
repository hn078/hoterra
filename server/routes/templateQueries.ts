import { Router, Request, Response } from 'express';
import { prisma } from '../db';
import { asyncHandler } from '../lib/asyncHandler';
import { authMiddleware } from '../middleware/auth';
import { requireCapability } from '../modules/access-control';
import { listTemplates, readTemplate, TemplateReadError } from '../modules/templates';
import { routeParam } from '../utils';

const router = Router();

router.get('/', authMiddleware, requireCapability('templates.read'), asyncHandler(async (req: Request, res: Response) => {
  res.json(await listTemplates(prisma, req.user!));
}));

router.get('/:id', authMiddleware, requireCapability('templates.read'), asyncHandler(async (req: Request, res: Response) => {
  try {
    res.json(await readTemplate(prisma, req.user!, routeParam(req.params.id)));
  } catch (error) {
    if (!(error instanceof TemplateReadError)) throw error;
    return error.code === 'FORBIDDEN'
      ? res.status(403).json({ error: 'Forbidden' })
      : res.status(404).json({ error: 'Template not found' });
  }
}));

export default router;
