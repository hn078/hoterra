import { Router } from 'express';
import { prisma } from '../db';
import { asyncHandler } from '../lib/asyncHandler';
import { authMiddleware } from '../middleware/auth';
import { requireCapability } from '../modules/access-control';
import { getDashboardStats } from '../modules/reporting';

const router = Router();

router.get('/stats', authMiddleware, requireCapability('dashboard.view'), asyncHandler(async (req, res) => {
  res.json(await getDashboardStats(prisma, req.user!));
}));

export default router;
