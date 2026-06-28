import { Router, Request, Response } from 'express';
import { prisma } from '../db';
import { authMiddleware } from '../middleware/auth';

const router = Router();

function monthKey(d: Date) {
  return d.toLocaleString('en', { month: 'short' });
}

router.get('/', authMiddleware, async (_req: Request, res: Response) => {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sixMonthsAgo = new Date(now);
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const [
    totalDocs,
    published,
    pending,
    users,
    archived,
    newDocs,
    completedApprovals,
    allDocs,
    byDepartment,
    recentLogs,
  ] = await Promise.all([
    prisma.document.count(),
    prisma.document.count({ where: { status: 'PUBLISHED' } }),
    prisma.document.count({
      where: {
        status: { in: ['IN_REVIEW', 'SIGNED_HOD', 'SIGNED_FINANCE', 'SIGNED_GM'] },
      },
    }),
    prisma.user.count({ where: { isActive: true } }),
    prisma.document.count({ where: { status: 'ARCHIVED' } }),
    prisma.document.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
    prisma.auditLog.count({
      where: { action: { in: ['APPROVE', 'PUBLISH'] }, createdAt: { gte: thirtyDaysAgo } },
    }),
    prisma.document.findMany({
      where: { createdAt: { gte: sixMonthsAgo } },
      select: { createdAt: true, status: true, category: true, fileSize: true },
    }),
    prisma.document.groupBy({ by: ['departmentId'], _count: true }),
    prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 8 }),
  ]);

  const departments = await prisma.department.findMany();
  const deptMap = Object.fromEntries(departments.map((d) => [d.id, d]));

  const trendMap = new Map<string, { created: number; published: number }>();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now);
    d.setMonth(d.getMonth() - i);
    trendMap.set(monthKey(d), { created: 0, published: 0 });
  }
  for (const doc of allDocs) {
    const key = monthKey(doc.createdAt);
    if (trendMap.has(key)) {
      trendMap.get(key)!.created++;
      if (doc.status === 'PUBLISHED') trendMap.get(key)!.published++;
    }
  }

  const typeCounts: Record<string, number> = {};
  for (const doc of allDocs) {
    typeCounts[doc.category] = (typeCounts[doc.category] || 0) + 1;
  }

  const totalBytes = await prisma.document.aggregate({ _sum: { fileSize: true } });
  const attachmentBytes = await prisma.documentAttachment.aggregate({ _sum: { fileSize: true } });
  const storageBytes = (totalBytes._sum.fileSize ?? 0) + (attachmentBytes._sum.fileSize ?? 0);
  const storageGb = Math.round((storageBytes / (1024 * 1024 * 1024)) * 100) / 100 || 0.01;

  res.json({
    kpis: {
      totalDocuments: totalDocs,
      newDocuments: newDocs,
      completedApprovals,
      activeUsers: users,
      storageGb,
      pendingApprovals: pending,
      archived,
      published,
    },
    byDepartment: byDepartment.map((d) => ({
      name: deptMap[d.departmentId]?.name ?? 'Unknown',
      count: d._count,
      color: deptMap[d.departmentId]?.color,
    })),
    trend: Array.from(trendMap.entries()).map(([month, v]) => ({ month, ...v })),
    byCategory: Object.entries(typeCounts).map(([category, count]) => ({ category, count })),
    activityTimeline: recentLogs.map((l) => ({
      id: l.id,
      userName: l.userName,
      action: l.action,
      details: l.details,
      createdAt: l.createdAt,
    })),
  });
});

export default router;
