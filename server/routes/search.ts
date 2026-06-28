import { Router, Request, Response } from 'express';
import { prisma } from '../db';
import { authMiddleware } from '../middleware/auth';

const router = Router();

router.get('/', authMiddleware, async (req: Request, res: Response) => {
  const q = String(req.query.q || '').trim();
  const type = String(req.query.type || 'all');
  const departmentId = req.query.departmentId ? String(req.query.departmentId) : undefined;
  const category = req.query.category ? String(req.query.category) : undefined;
  const status = req.query.status ? String(req.query.status) : undefined;
  const fileType = req.query.fileType ? String(req.query.fileType) : undefined;

  if (!q) {
    return res.json({ documents: [], users: [], departments: [], templates: [], workflows: [], total: 0 });
  }

  const docWhere = {
    AND: [
      {
        OR: [
          { title: { contains: q } },
          { code: { contains: q } },
          { description: { contains: q } },
        ],
      },
      ...(departmentId ? [{ departmentId }] : []),
      ...(category ? [{ category: category as never }] : []),
      ...(status ? [{ status: status as never }] : []),
      ...(fileType ? [{ fileType: { contains: fileType } }] : []),
    ],
  };

  const [documents, users, departments, templates, workflows] = await Promise.all([
    type === 'all' || type === 'documents'
      ? prisma.document.findMany({
          where: docWhere,
          include: { department: true, author: { select: { firstName: true, lastName: true } } },
          take: 20,
        })
      : [],
    type === 'all' || type === 'users'
      ? prisma.user.findMany({
          where: {
            OR: [
              { firstName: { contains: q } },
              { lastName: { contains: q } },
              { email: { contains: q } },
            ],
          },
          include: { department: true },
          take: 10,
        })
      : [],
    type === 'all' || type === 'departments'
      ? prisma.department.findMany({
          where: {
            OR: [{ name: { contains: q } }, { code: { contains: q } }],
          },
          include: { _count: { select: { users: true, documents: true } } },
          take: 10,
        })
      : [],
    type === 'all' || type === 'templates'
      ? prisma.template.findMany({
          where: {
            OR: [{ name: { contains: q } }, { description: { contains: q } }],
          },
          include: { department: true },
          take: 10,
        })
      : [],
    type === 'all' || type === 'workflows'
      ? prisma.workflowRoute.findMany({
          where: {
            OR: [{ name: { contains: q } }, { description: { contains: q } }],
          },
          take: 10,
        })
      : [],
  ]);

  res.json({
    documents: documents.map((d) => ({
      ...d,
      tags: JSON.parse(d.tags),
    })),
    users,
    departments,
    templates,
    workflows: workflows.map((w) => ({ ...w, steps: JSON.parse(w.steps) })),
    total: documents.length + users.length + departments.length + templates.length + workflows.length,
  });
});

export default router;
