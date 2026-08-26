import { Router, Request, Response } from 'express';
import { prisma } from '../db';
import { authMiddleware } from '../middleware/auth';
import { requireCapability } from '../modules/access-control';
import {
  countUnreadNotifications,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  openNotification,
  readNotificationPreferences,
  updateNotificationPreferences,
} from '../modules/notifications';

const router = Router();

router.get('/preferences', authMiddleware, requireCapability('notifications.read'), async (req: Request, res: Response) => {
  res.json(await readNotificationPreferences(prisma, req.user!));
});

router.put('/preferences', authMiddleware, requireCapability('notifications.read'), async (req: Request, res: Response) => {
  try {
    res.json(await updateNotificationPreferences(prisma, req.user!, req.body));
  } catch (error) {
    if (error instanceof TypeError) return res.status(400).json({ error: error.message });
    throw error;
  }
});

router.get('/', authMiddleware, requireCapability('notifications.read'), async (req: Request, res: Response) => {
  res.json(await listNotifications(prisma, req.user!));
});

router.get('/unread-count', authMiddleware, requireCapability('notifications.read'), async (req: Request, res: Response) => {
  const count = await countUnreadNotifications(prisma, req.user!.id);
  res.json({ count });
});

router.patch('/:id/read', authMiddleware, requireCapability('notifications.read'), async (req: Request, res: Response) => {
  const found = await markNotificationRead(prisma, req.user!.id, String(req.params.id));
  if (!found) return res.status(404).json({ error: 'Notification not found' });
  res.json({ ok: true });
});

router.post('/:id/open', authMiddleware, requireCapability('notifications.read'), async (req: Request, res: Response) => {
  const result = await openNotification(prisma, req.user!, String(req.params.id));
  if (!result) return res.status(404).json({ error: 'Notification not found' });
  res.json(result);
});

router.post('/mark-all-read', authMiddleware, requireCapability('notifications.read'), async (req: Request, res: Response) => {
  await markAllNotificationsRead(prisma, req.user!.id);
  res.json({ ok: true });
});

export default router;
