import { Router, Request, Response } from 'express';
import { prisma } from '../db';
import { authMiddleware } from '../middleware/auth';
import { requireCapability } from '../modules/access-control';
import {
  createDepartment,
  deactivateDepartment,
  DepartmentLifecycleError,
  DepartmentMutationError,
  getDepartmentLifecycleSummary,
  reactivateDepartment,
  updateDepartment,
} from '../modules/organization';
import { asyncHandler } from '../lib/asyncHandler';
import { routeParam } from '../utils';

const router = Router();

function mutationError(error: DepartmentMutationError, res: Response) {
  if (error.code === 'FORBIDDEN') return res.status(403).json({ error: 'Forbidden' });
  if (error.code === 'NOT_FOUND') return res.status(404).json({ error: 'Department not found' });
  if (error.code === 'DUPLICATE') return res.status(409).json({ error: 'A department with this name or code already exists' });
  return res.status(400).json({ error: error.detail || 'Invalid department data' });
}

function lifecycleError(error: DepartmentLifecycleError, res: Response) {
  if (error.code === 'FORBIDDEN') return res.status(403).json({ error: 'Forbidden', code: error.code });
  if (error.code === 'NOT_FOUND') return res.status(404).json({ error: 'Department not found', code: error.code });
  if (error.code === 'BLOCKED' || error.code === 'TRANSFER_REQUIRED' || error.code === 'ALREADY_ACTIVE' || error.code === 'ALREADY_INACTIVE') {
    return res.status(409).json({ error: error.detail || error.code, code: error.code });
  }
  return res.status(400).json({ error: error.detail || 'Invalid department lifecycle request', code: error.code });
}

router.get('/:id/lifecycle', authMiddleware, requireCapability('departments.manage'), asyncHandler(async (req: Request, res: Response) => {
  try {
    res.json(await getDepartmentLifecycleSummary(prisma, req.user!, routeParam(req.params.id)));
  } catch (error) {
    if (!(error instanceof DepartmentLifecycleError)) throw error;
    return lifecycleError(error, res);
  }
}));

router.post('/:id/deactivate', authMiddleware, requireCapability('departments.manage'), asyncHandler(async (req: Request, res: Response) => {
  try {
    res.json(await deactivateDepartment(prisma, req.user!, routeParam(req.params.id), req.body));
  } catch (error) {
    if (!(error instanceof DepartmentLifecycleError)) throw error;
    return lifecycleError(error, res);
  }
}));

router.post('/:id/reactivate', authMiddleware, requireCapability('departments.manage'), asyncHandler(async (req: Request, res: Response) => {
  try {
    res.json(await reactivateDepartment(prisma, req.user!, routeParam(req.params.id), req.body));
  } catch (error) {
    if (!(error instanceof DepartmentLifecycleError)) throw error;
    return lifecycleError(error, res);
  }
}));

router.post('/', authMiddleware, requireCapability('departments.manage'), asyncHandler(async (req: Request, res: Response) => {
  try {
    res.status(201).json(await createDepartment(prisma, req.user!, req.body));
  } catch (error) {
    if (!(error instanceof DepartmentMutationError)) throw error;
    return mutationError(error, res);
  }
}));

router.patch('/:id', authMiddleware, requireCapability('departments.manage'), asyncHandler(async (req: Request, res: Response) => {
  try {
    res.json(await updateDepartment(prisma, req.user!, routeParam(req.params.id), req.body));
  } catch (error) {
    if (!(error instanceof DepartmentMutationError)) throw error;
    return mutationError(error, res);
  }
}));

export default router;
