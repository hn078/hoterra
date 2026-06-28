import { Router, Request, Response } from 'express';
import { prisma } from '../db';
import { authMiddleware, requireRoles } from '../middleware/auth';
import { Role } from '@prisma/client';

const router = Router();

router.get('/', authMiddleware, async (_req: Request, res: Response) => {
  const templates = await prisma.template.findMany({
    orderBy: { name: 'asc' },
  });
  res.json(templates);
});

router.get('/:id', authMiddleware, async (req: Request, res: Response) => {
  const template = await prisma.template.findUnique({
    where: { id: String(req.params.id) },
  });
  if (!template) return res.status(404).json({ error: 'Template not found' });
  res.json(template);
});

router.post(
  '/',
  authMiddleware,
  requireRoles(Role.SYSTEM_ADMINISTRATOR, Role.GENERAL_MANAGER),
  async (req: Request, res: Response) => {
    const { name, description, category, content } = req.body;
    const template = await prisma.template.create({
      data: { name, description, category, content },
    });
    res.status(201).json(template);
  }
);

export default router;
