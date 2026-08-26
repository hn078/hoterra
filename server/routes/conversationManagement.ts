import { Router, Request, Response } from 'express';
import { prisma } from '../db';
import { asyncHandler } from '../lib/asyncHandler';
import {
  bootstrapUserConversations,
  DirectConversationError,
  startDirectConversation,
} from '../modules/messaging';

const router = Router();

router.post('/bootstrap', asyncHandler(async (req: Request, res: Response) => {
  res.json(await bootstrapUserConversations(prisma, req.user!));
}));

router.post('/direct', asyncHandler(async (req: Request, res: Response) => {
  try {
    res.json(await startDirectConversation(prisma, req.user!, req.body.userId));
  } catch (error) {
    if (!(error instanceof DirectConversationError)) throw error;
    if (error.code === 'USER_NOT_FOUND') return res.status(404).json({ error: 'User not found' });
    if (error.code === 'FORBIDDEN') return res.status(403).json({ error: 'Forbidden' });
    return res.status(400).json({ error: 'Invalid user' });
  }
}));

export default router;
