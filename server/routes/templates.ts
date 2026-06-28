import { Router, Request, Response } from 'express';
import { prisma } from '../db';
import { authMiddleware, requireRoles } from '../middleware/auth';
import { Role } from '@prisma/client';

const router = Router();

router.get('/', authMiddleware, async (_req: Request, res: Response) => {
  const templates = await prisma.template.findMany({
    orderBy: { updatedAt: 'desc' },
    include: {
      department: true,
      _count: { select: { documents: true } },
    },
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

router.patch(
  '/:id',
  authMiddleware,
  requireRoles(Role.SYSTEM_ADMINISTRATOR, Role.GENERAL_MANAGER),
  async (req: Request, res: Response) => {
    const { name, description, category, content, isActive, version, status, departmentId, signaturePlacement, pageCount } = req.body;
    const template = await prisma.template.update({
      where: { id: String(req.params.id) },
      data: {
        ...(name && { name }),
        ...(description !== undefined && { description }),
        ...(category && { category }),
        ...(content !== undefined && { content }),
        ...(isActive !== undefined && { isActive }),
        ...(version && { version }),
        ...(status && { status }),
        ...(departmentId !== undefined && { departmentId: departmentId || null }),
        ...(signaturePlacement !== undefined && { signaturePlacement: typeof signaturePlacement === 'string' ? signaturePlacement : JSON.stringify(signaturePlacement) }),
        ...(pageCount !== undefined && { pageCount: Math.max(1, parseInt(String(pageCount), 10) || 1) }),
      },
    });
    res.json(template);
  }
);

router.post(
  '/',
  authMiddleware,
  requireRoles(Role.SYSTEM_ADMINISTRATOR, Role.GENERAL_MANAGER),
  async (req: Request, res: Response) => {
    const { name, description, category, content, version, status, departmentId, signaturePlacement, pageCount } = req.body;
    const template = await prisma.template.create({
      data: {
        name,
        description,
        category,
        content,
        version: version || '1.0',
        status: status || 'Active',
        departmentId: departmentId || null,
        signaturePlacement: signaturePlacement
          ? typeof signaturePlacement === 'string'
            ? signaturePlacement
            : JSON.stringify(signaturePlacement)
          : undefined,
        pageCount: pageCount ? Math.max(1, parseInt(String(pageCount), 10) || 1) : undefined,
      },
    });
    res.status(201).json(template);
  }
);

router.delete(
  '/:id',
  authMiddleware,
  requireRoles(Role.SYSTEM_ADMINISTRATOR, Role.GENERAL_MANAGER),
  async (req: Request, res: Response) => {
    await prisma.template.delete({ where: { id: String(req.params.id) } });
    res.json({ ok: true });
  }
);

export default router;
