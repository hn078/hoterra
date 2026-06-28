import { Router, Request, Response } from 'express';
import { prisma } from '../db';
import { authMiddleware, requireRoles } from '../middleware/auth';
import { Role } from '@prisma/client';

const router = Router();

router.get('/', authMiddleware, async (_req: Request, res: Response) => {
  const templates = await prisma.template.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' },
  });
  res.json(templates);
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
