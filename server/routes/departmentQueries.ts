import { Router, Request, Response } from 'express';
import { prisma } from '../db';
import { authMiddleware } from '../middleware/auth';
import { requireCapability } from '../modules/access-control';
import { DepartmentReadError, listDepartments, readDepartment } from '../modules/organization';
import { asyncHandler } from '../lib/asyncHandler';
import { routeParam } from '../utils';

const router = Router();

function readError(error: DepartmentReadError, res: Response) {
  return error.code === 'FORBIDDEN'
    ? res.status(403).json({ error: 'Forbidden' })
    : res.status(404).json({ error: 'Department not found' });
}

router.get('/', authMiddleware, requireCapability('departments.read'), asyncHandler(async (req: Request, res: Response) => {
  res.json(await listDepartments(prisma, req.user!, { includeInactive: req.query.includeInactive === 'true' }));
}));

router.get('/:id', authMiddleware, requireCapability('departments.read'), asyncHandler(async (req: Request, res: Response) => {
  try {
    res.json(await readDepartment(prisma, req.user!, routeParam(req.params.id)));
  } catch (error) {
    if (!(error instanceof DepartmentReadError)) throw error;
    return readError(error, res);
  }
}));

export default router;
