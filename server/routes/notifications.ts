import { Router, Request, Response } from 'express';
import { prisma } from '../db';
import { authMiddleware } from '../middleware/auth';

const router = Router();

router.get('/', authMiddleware, async (req: Request, res: Response) => {
  const notifications = await prisma.notification.findMany({
    where: { userId: req.user!.id },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  res.json(notifications);
});

router.get('/unread-count', authMiddleware, async (req: Request, res: Response) => {
  const count = await prisma.notification.count({
    where: { userId: req.user!.id, isRead: false },
  });
  res.json({ count });
});

router.patch('/:id/read', authMiddleware, async (req: Request, res: Response) => {
  await prisma.notification.updateMany({
    where: { id: String(req.params.id), userId: req.user!.id },
    data: { isRead: true },
  });
  res.json({ ok: true });
});

router.post('/mark-all-read', authMiddleware, async (req: Request, res: Response) => {
  await prisma.notification.updateMany({
    where: { userId: req.user!.id, isRead: false },
    data: { isRead: true },
  });
  res.json({ ok: true });
});

export default router;
