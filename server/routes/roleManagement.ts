import { Router, Request, Response } from 'express';
import { prisma } from '../db';
import { authMiddleware } from '../middleware/auth';
import {
  createCustomRole,
  CustomRoleError,
  deactivateCustomRole,
  reactivateCustomRole,
  requireCapability,
  updateCustomRole,
} from '../modules/access-control';
import { asyncHandler } from '../lib/asyncHandler';
import { routeParam } from '../utils';

const router = Router();

function customRoleError(error: CustomRoleError, res: Response) {
  if (error.code === 'FORBIDDEN') return res.status(403).json({ error: error.detail || 'Forbidden' });
  if (error.code === 'SELF_ROLE') return res.status(403).json({ error: error.detail });
  if (error.code === 'NOT_FOUND') return res.status(404).json({ error: 'Role not found' });
  if (error.code === 'NAME_EXISTS') return res.status(409).json({ error: 'A role with this name already exists' });
  if (error.code === 'ROLE_IN_USE') return res.status(409).json({ error: error.detail });
  if (error.code === 'INVALID_PERMISSIONS') return res.status(400).json({ error: 'Invalid permissions matrix' });
  return res.status(400).json({ error: error.detail || 'Invalid role data' });
}

router.post('/', authMiddleware, requireCapability('roles.manage'), asyncHandler(async (req: Request, res: Response) => {
  try {
    res.status(201).json(await createCustomRole(prisma, req.user!, req.body));
  } catch (error) {
    if (!(error instanceof CustomRoleError)) throw error;
    return customRoleError(error, res);
  }
}));

router.patch('/:id', authMiddleware, requireCapability('roles.manage'), asyncHandler(async (req: Request, res: Response) => {
  try {
    res.json(await updateCustomRole(prisma, req.user!, routeParam(req.params.id), req.body));
  } catch (error) {
    if (!(error instanceof CustomRoleError)) throw error;
    return customRoleError(error, res);
  }
}));

router.post('/:id/activate', authMiddleware, requireCapability('roles.manage'), asyncHandler(async (req: Request, res: Response) => {
  try {
    res.json(await reactivateCustomRole(prisma, req.user!, routeParam(req.params.id)));
  } catch (error) {
    if (!(error instanceof CustomRoleError)) throw error;
    return customRoleError(error, res);
  }
}));

router.delete('/:id', authMiddleware, requireCapability('roles.manage'), asyncHandler(async (req: Request, res: Response) => {
  try {
    res.json(await deactivateCustomRole(prisma, req.user!, routeParam(req.params.id)));
  } catch (error) {
    if (!(error instanceof CustomRoleError)) throw error;
    return customRoleError(error, res);
  }
}));

export default router;
