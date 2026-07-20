import { Router, Request, Response } from 'express';
import { prisma } from '../db';
import { authMiddleware } from '../middleware/auth';
import { asyncHandler } from '../lib/asyncHandler';
import { buildAuditLogWhere, getAuditLogSummary } from '../lib/audit';

const router = Router();

function parseQuery(req: Request) {
  const {
    search,
    action,
    entityType,
    userId,
    departmentId,
    category,
    templateId,
    module,
    severity,
    from,
    to,
    page = '1',
    limit = '20',
  } = req.query;

  return {
    filters: {
      search: search ? String(search) : undefined,
      action: action ? String(action) : undefined,
      entityType: entityType ? String(entityType) : undefined,
      userId: userId ? String(userId) : undefined,
      departmentId: departmentId ? String(departmentId) : undefined,
      category: category ? String(category) : undefined,
      templateId: templateId ? String(templateId) : undefined,
      module: module ? String(module) : undefined,
      severity: severity ? String(severity) : undefined,
      from: from ? String(from) : undefined,
      to: to ? String(to) : undefined,
    },
    pageNum: Math.max(1, parseInt(String(page), 10)),
    limitNum: Math.min(100, Math.max(1, parseInt(String(limit), 10))),
  };
}

router.get(
  '/',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const { filters, pageNum, limitNum } = parseQuery(req);
    const where = await buildAuditLogWhere(filters);

    const [data, total, summary] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
      }),
      prisma.auditLog.count({ where }),
      getAuditLogSummary(where),
    ]);

    res.json({
      data,
      pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) },
      summary,
    });
  })
);

router.get(
  '/export',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const { filters } = parseQuery(req);
    const where = await buildAuditLogWhere(filters);
    const logs = await prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, take: 5000 });
    const header = 'Date,User,Action,Entity,Details,IP Address\n';
    const rows = logs
      .map((l) =>
        [
          l.createdAt.toISOString(),
          l.userName ?? '',
          l.action,
          l.entityType ?? '',
          `"${(l.details ?? '').replace(/"/g, '""')}"`,
          l.ipAddress ?? '',
        ].join(',')
      )
      .join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=audit-log.csv');
    res.send(header + rows);
  })
);

export default router;
