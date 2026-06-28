import { Router, Request, Response } from 'express';
import { AuditAction, Prisma } from '@prisma/client';
import { prisma } from '../db';
import { authMiddleware } from '../middleware/auth';

const router = Router();

router.get('/', authMiddleware, async (req: Request, res: Response) => {
  const { search, action, entityType, page = '1', limit = '20' } = req.query;
  const pageNum = Math.max(1, parseInt(String(page), 10));
  const limitNum = Math.min(100, Math.max(1, parseInt(String(limit), 10)));

  const where: Prisma.AuditLogWhereInput = {};

  if (action && action !== 'ALL') where.action = String(action) as AuditAction;
  if (entityType && entityType !== 'ALL') where.entityType = String(entityType);

  if (search) {
    const q = String(search);
    where.OR = [{ userName: { contains: q } }, { details: { contains: q } }];
  }

  const [data, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (pageNum - 1) * limitNum,
      take: limitNum,
    }),
    prisma.auditLog.count({ where }),
  ]);

  res.json({
    data,
    pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) },
  });
});

router.get('/export', authMiddleware, async (_req: Request, res: Response) => {
  const logs = await prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 5000 });
  const header = 'Date,User,Action,Entity,Details\n';
  const rows = logs
    .map((l) =>
      [
        l.createdAt.toISOString(),
        l.userName ?? '',
        l.action,
        l.entityType ?? '',
        `"${(l.details ?? '').replace(/"/g, '""')}"`,
      ].join(',')
    )
    .join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=audit-log.csv');
  res.send(header + rows);
});

export default router;
