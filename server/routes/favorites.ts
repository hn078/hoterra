import { Router, Request, Response } from 'express';
import { prisma } from '../db';
import { authMiddleware } from '../middleware/auth';
import { routeParam } from '../utils';

const router = Router();

router.get('/', authMiddleware, async (req: Request, res: Response) => {
  const favorites = await prisma.userFavorite.findMany({
    where: { userId: req.user!.id },
    include: {
      document: {
        include: { department: true, author: { select: { firstName: true, lastName: true } } },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
  res.json(favorites.map((f) => f.documentId));
});

router.get('/documents', authMiddleware, async (req: Request, res: Response) => {
  const favorites = await prisma.userFavorite.findMany({
    where: { userId: req.user!.id },
    include: {
      document: {
        include: { department: true, author: { select: { firstName: true, lastName: true } } },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
  res.json(
    favorites.map((f) => ({
      ...f.document,
      tags: JSON.parse(f.document.tags),
    }))
  );
});

router.post('/:documentId', authMiddleware, async (req: Request, res: Response) => {
  const documentId = routeParam(req.params.documentId);
  await prisma.userFavorite.upsert({
    where: { userId_documentId: { userId: req.user!.id, documentId } },
    update: {},
    create: { userId: req.user!.id, documentId },
  });
  res.status(201).json({ ok: true });
});

router.delete('/:documentId', authMiddleware, async (req: Request, res: Response) => {
  const documentId = routeParam(req.params.documentId);
  await prisma.userFavorite.deleteMany({
    where: { userId: req.user!.id, documentId },
  });
  res.json({ ok: true });
});

router.get('/check/:documentId', authMiddleware, async (req: Request, res: Response) => {
  const documentId = routeParam(req.params.documentId);
  const fav = await prisma.userFavorite.findUnique({
    where: { userId_documentId: { userId: req.user!.id, documentId } },
  });
  res.json({ isFavorite: !!fav });
});

export default router;
