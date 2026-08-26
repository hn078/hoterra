import { Router, Request, Response } from 'express';
import { prisma } from '../db';
import { authMiddleware } from '../middleware/auth';
import { requireCapability } from '../modules/access-control';
import { readSettings, readSettingsStats } from '../modules/settings';
import { asyncHandler } from '../lib/asyncHandler';
const router = Router();

router.get('/stats', authMiddleware, requireCapability('settings.read'), asyncHandler(async (req: Request, res: Response) => {
  res.json(await readSettingsStats(prisma, req.user!));
}));

router.get('/', authMiddleware, requireCapability('settings.read'), asyncHandler(async (req: Request, res: Response) => {
  res.json(await readSettings(prisma, req.tenant!, req.user!));
}));

export default router;
