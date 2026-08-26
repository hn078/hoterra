import { DocumentStatus, Prisma } from '@prisma/client';
import type * as DatabaseModule from '../../../db';
import type { AuthUser } from '../../../middleware/auth';
import { documentApprovalActionScope, documentDashboardScope } from '../../documents';
import { listPendingWorkforceTasks } from '../../workforce';

type DashboardDatabase = typeof DatabaseModule.prisma;

type DashboardWorkItem = {
  type: 'DOCUMENT' | 'WORKFORCE';
  id: string;
  title: string;
  subtitle: string;
  status: string;
  dueDate: Date | null;
  isOverdue: boolean;
  action: string;
  link: string;
};

function prioritizeDashboardWork(
  items: DashboardWorkItem[],
  limit = 8,
): DashboardWorkItem[] {
  const dueTime = (item: DashboardWorkItem) => item.dueDate?.getTime() ?? Number.POSITIVE_INFINITY;
  const compare = (left: DashboardWorkItem, right: DashboardWorkItem) => {
    if (left.isOverdue !== right.isOverdue) return left.isOverdue ? -1 : 1;
    const leftNeedsRevision = left.status === DocumentStatus.NEEDS_REVIEW;
    const rightNeedsRevision = right.status === DocumentStatus.NEEDS_REVIEW;
    if (leftNeedsRevision !== rightNeedsRevision) return leftNeedsRevision ? -1 : 1;
    const byDueDate = dueTime(left) - dueTime(right);
    if (byDueDate !== 0) return byDueDate;
    return left.title.localeCompare(right.title);
  };
  const sorted = [...items].sort(compare);

  const selected = sorted.slice(0, Math.max(0, limit));
  if (selected.length === 0 || limit < 2) return selected;

  // Keep My Work cross-module: an urgent queue from one module must not make
  // the actor's pending action in the other module completely invisible.
  for (const type of ['DOCUMENT', 'WORKFORCE'] as const) {
    if (selected.some((item) => item.type === type)) continue;
    const firstOfType = sorted.find((item) => item.type === type);
    if (firstOfType) selected[selected.length - 1] = firstOfType;
  }

  return selected.sort(compare);
}

/** Tenant- and actor-scoped dashboard read model. */
export async function getDashboardStats(
  database: DashboardDatabase,
  actor: AuthUser,
  now = new Date(),
) {
  const documentScope = documentDashboardScope(actor) as Prisma.DocumentWhereInput;
  const approvalActionScope = documentApprovalActionScope(actor) as Prisma.DocumentWhereInput;
  const reviewWindowEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const trendStart = new Date(now.getFullYear(), now.getMonth() - 5, 1);

  const [
    pendingApproval,
    overdue,
    dueForReview,
    published,
    archived,
    byStatus,
    byDepartment,
    recentActivity,
    upcomingReviews,
    trendDocuments,
    departments,
    pendingDocuments,
    returnedDocuments,
    pendingWorkforce,
  ] = await Promise.all([
    database.document.count({ where: approvalActionScope }),
    database.document.count({
      where: {
        ...documentScope,
        nextReviewDate: { lt: now },
        status: DocumentStatus.PUBLISHED,
      },
    }),
    database.document.count({
      where: {
        ...documentScope,
        nextReviewDate: { gte: now, lte: reviewWindowEnd },
        status: DocumentStatus.PUBLISHED,
      },
    }),
    database.document.count({ where: { ...documentScope, status: DocumentStatus.PUBLISHED } }),
    database.document.count({ where: { ...documentScope, status: DocumentStatus.ARCHIVED } }),
    database.document.groupBy({ by: ['status'], where: documentScope, _count: true }),
    database.document.groupBy({ by: ['departmentId'], where: documentScope, _count: true }),
    database.documentHistory.findMany({
      where: { document: { is: documentScope } },
      take: 10,
      orderBy: { createdAt: 'desc' },
      include: { document: { select: { id: true, title: true, code: true } } },
    }),
    database.document.findMany({
      where: {
        ...documentScope,
        nextReviewDate: { gte: now },
        status: DocumentStatus.PUBLISHED,
      },
      orderBy: { nextReviewDate: 'asc' },
      take: 5,
      select: {
        id: true,
        title: true,
        category: true,
        nextReviewDate: true,
        department: { select: { name: true } },
      },
    }),
    database.document.findMany({
      where: { ...documentScope, createdAt: { gte: trendStart } },
      select: { createdAt: true, status: true },
    }),
    database.department.findMany({ select: { id: true, name: true, color: true } }),
    database.document.findMany({
      where: approvalActionScope,
      select: {
        id: true,
        title: true,
        code: true,
        status: true,
        nextReviewDate: true,
      },
      orderBy: { updatedAt: 'desc' },
      take: 8,
    }),
    database.document.findMany({
      where: {
        AND: [
          documentScope,
          {
            status: DocumentStatus.NEEDS_REVIEW,
            OR: [{ authorId: actor.id }, { ownerId: actor.id }],
          },
        ],
      },
      select: {
        id: true,
        title: true,
        code: true,
        status: true,
        nextReviewDate: true,
      },
      orderBy: { updatedAt: 'desc' },
      take: 8,
    }),
    listPendingWorkforceTasks(database, actor, 8),
  ]);

  const departmentMap = Object.fromEntries(departments.map((department) => [department.id, department]));
  const trendMap = new Map<string, { created: number; published: number }>();
  for (let offset = 5; offset >= 0; offset--) {
    const month = new Date(now);
    month.setMonth(month.getMonth() - offset);
    trendMap.set(month.toLocaleString('en', { month: 'short' }), { created: 0, published: 0 });
  }
  for (const document of trendDocuments) {
    const key = document.createdAt.toLocaleString('en', { month: 'short' });
    const trend = trendMap.get(key);
    if (!trend) continue;
    trend.created++;
    if (document.status === DocumentStatus.PUBLISHED) trend.published++;
  }

  return {
    cards: { pendingApproval, overdue, dueForReview, published, archived },
    byStatus: byStatus.map((entry) => ({ status: entry.status, count: entry._count })),
    byDepartment: byDepartment.map((entry) => ({
      department: departmentMap[entry.departmentId]?.name ?? 'Unknown',
      departmentId: entry.departmentId,
      count: entry._count,
      color: departmentMap[entry.departmentId]?.color,
    })),
    recentActivity: recentActivity.map((activity) => ({
      id: activity.id,
      action: activity.action,
      userName: activity.userName,
      createdAt: activity.createdAt,
      document: activity.document
        ? {
            id: activity.document.id,
            title: activity.document.title,
            code: activity.document.code,
          }
        : undefined,
    })),
    upcomingReviews: upcomingReviews.map((document) => ({
      id: document.id,
      title: document.title,
      department: document.department.name,
      category: document.category,
      nextReviewDate: document.nextReviewDate,
    })),
    trend: Array.from(trendMap.entries()).map(([month, values]) => ({ month, ...values })),
    myWork: prioritizeDashboardWork([
      ...pendingDocuments.map((document) => ({
        type: 'DOCUMENT' as const,
        id: document.id,
        title: document.title,
        subtitle: document.code,
        status: document.status,
        dueDate: document.nextReviewDate,
        isOverdue: Boolean(document.nextReviewDate && document.nextReviewDate < now),
        action: 'Review and approve',
        link: `/approvals/${document.id}/review`,
      })),
      ...returnedDocuments.map((document) => ({
        type: 'DOCUMENT' as const,
        id: document.id,
        title: document.title,
        subtitle: document.code,
        status: document.status,
        dueDate: document.nextReviewDate,
        isOverdue: Boolean(document.nextReviewDate && document.nextReviewDate < now),
        action: 'Revise and resubmit',
        link: `/documents/${document.id}`,
      })),
      ...pendingWorkforce.map((request) => ({
        type: 'WORKFORCE' as const,
        id: request.id,
        title: request.code,
        subtitle: `${request.department} · ${request.services.join(', ')}`,
        status: request.status,
        dueDate: request.workDate,
        isOverdue: request.workDate < now,
        action: request.action,
        link: request.link,
      })),
    ]),
  };
}
