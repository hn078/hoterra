import { Router, Request, Response } from 'express';
import { prisma } from '../db';
import { asyncHandler } from '../lib/asyncHandler';
import { getConversationsUnreadCount, listConversations, listMessageContacts } from '../modules/messaging';

const router = Router();

router.get('/', asyncHandler(async (req: Request, res: Response) => {
  res.json(await listConversations(prisma, req.user!));
}));

router.get('/unread-count', asyncHandler(async (req: Request, res: Response) => {
  res.json(await getConversationsUnreadCount(prisma, req.user!));
}));

router.get('/contacts', asyncHandler(async (req: Request, res: Response) => {
  res.json(await listMessageContacts(prisma, req.user!));
}));

export default router;
