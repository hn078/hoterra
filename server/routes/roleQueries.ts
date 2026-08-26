import { Router, Request, Response } from 'express';
import { prisma } from '../db';
import { authMiddleware } from '../middleware/auth';
import { listRoles, requireCapability } from '../modules/access-control';
import { asyncHandler } from '../lib/asyncHandler';
const router = Router();

router.get('/', authMiddleware, requireCapability('roles.read'), asyncHandler(async (req: Request, res: Response) => {
  res.json(await listRoles(prisma, req.user!));
}));

export default router;
