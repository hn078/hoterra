import { Router, Request, Response } from 'express';
import { prisma } from '../db';
import { authMiddleware } from '../middleware/auth';
import { routeParam } from '../utils';
import { requireCapability } from '../modules/access-control';
import { getUserProfile, listUserDirectory, UserReadError } from '../modules/identity';

const router = Router();

router.get('/', authMiddleware, requireCapability('users.directory.read'), async (req: Request, res: Response) => {
  res.json(await listUserDirectory(prisma, req.user!));
});

router.get('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    res.json(await getUserProfile(prisma, req.user!, routeParam(req.params.id)));
  } catch (error) {
    if (!(error instanceof UserReadError)) throw error;
    if (error.code === 'NOT_FOUND') return res.status(404).json({ error: 'User not found' });
    return res.status(403).json({ error: 'Forbidden' });
  }
});

export default router;
