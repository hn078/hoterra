import { AuditAction, DocumentStatus, Prisma } from '@prisma/client';
import type * as DatabaseModule from '../../../db';
import type { AuthUser } from '../../../middleware/auth';
import { documentReadScope } from '../../documents';
import { reportDocumentScope } from '../domain/reportPolicy';

type ReportDatabase = typeof DatabaseModule.prisma;
type CompareMode = 'previous' | 'year' | 'none';

export class ReportReadError extends Error {
  constructor(public readonly code: 'FORBIDDEN' | 'INVALID_INPUT', public readonly detail?: string) {
    super(code);
    this.name = 'ReportReadError';
  }
}

export interface ReportQueryInput { from?: unknown; to?: unknown; compare?: unknown }

function utcDay(value: unknown, field: string, fallback: Date, endOfDay = false) {
  if (value === undefined || value === '') return fallback;
  const text = String(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new ReportReadError('INVALID_INPUT', `${field} must use YYYY-MM-DD`);
  const result = new Date(`${text}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`);
  if (Number.isNaN(result.getTime()) || result.toISOString().slice(0, 10) !== text) throw new ReportReadError('INVALID_INPUT', `${field} is invalid`);
  return result;
}

function reportPeriod(input: ReportQueryInput, now: Date) {
  const todayEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));
  const defaultFrom = new Date(todayEnd); defaultFrom.setUTCDate(defaultFrom.getUTCDate() - 29); defaultFrom.setUTCHours(0, 0, 0, 0);
  const from = utcDay(input.from, 'From date', defaultFrom);
  const to = utcDay(input.to, 'To date', todayEnd, true);
  if (from > to) throw new ReportReadError('INVALID_INPUT', 'From date cannot be after to date');
  const days = Math.ceil((to.getTime() - from.getTime() + 1) / 86_400_000);
  if (days > 366) throw new ReportReadError('INVALID_INPUT', 'Report period cannot exceed 366 days');
  const compare = String(input.compare || 'previous') as CompareMode;
  if (!['previous', 'year', 'none'].includes(compare)) throw new ReportReadError('INVALID_INPUT', 'Comparison mode is invalid');
  if (compare === 'none') return { from, to, compare, compareFrom: null, compareTo: null };
  if (compare === 'year') {
    const compareFrom = new Date(from); compareFrom.setUTCFullYear(compareFrom.getUTCFullYear() - 1);
    const compareTo = new Date(to); compareTo.setUTCFullYear(compareTo.getUTCFullYear() - 1);
    return { from, to, compare, compareFrom, compareTo };
  }
  const compareTo = new Date(from.getTime() - 1);
  const compareFrom = new Date(compareTo.getTime() - (to.getTime() - from.getTime()));
  return { from, to, compare, compareFrom, compareTo };
}

function percentChange(current: number, previous: number | null) {
  if (previous === null) return null;
  if (previous === 0) return current === 0 ? 0 : 100;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

function bucketKey(date: Date, rangeDays: number) {
  if (rangeDays <= 62) return date.toISOString().slice(0, 10);
  return date.toISOString().slice(0, 7);
}

function buildBuckets(from: Date, to: Date) {
  const days = Math.ceil((to.getTime() - from.getTime() + 1) / 86_400_000);
  const buckets = new Map<string, { created: number; approvalActions: number; storageBytes: number }>();
  const cursor = new Date(from);
  while (cursor <= to) {
    buckets.set(bucketKey(cursor, days), { created: 0, approvalActions: 0, storageBytes: 0 });
    if (days <= 62) cursor.setUTCDate(cursor.getUTCDate() + 1);
    else cursor.setUTCMonth(cursor.getUTCMonth() + 1, 1);
  }
  return { days, buckets };
}

export async function getReport(database: ReportDatabase, actor: AuthUser, input: ReportQueryInput, now = new Date()) {
  if (!actor.capabilities.includes('reports.read')) throw new ReportReadError('FORBIDDEN');
  const period = reportPeriod(input, now);
  const scope = reportDocumentScope(actor) as Prisma.DocumentWhereInput;
  const activityScope = actor.capabilities.includes('documents.read')
    ? documentReadScope(actor) as Prisma.DocumentWhereInput
    : { id: '__forbidden__' };
  const currentRange = { gte: period.from, lte: period.to };
  const comparisonRange = period.compareFrom && period.compareTo ? { gte: period.compareFrom, lte: period.compareTo } : null;
  const scopedCurrent: Prisma.DocumentWhereInput = { AND: [scope, { createdAt: currentRange }] };
  const userWhere: Prisma.UserWhereInput = actor.capabilities.includes('documents.read.all')
    ? { tenantId: actor.tenantId, isActive: true }
    : actor.departmentId ? { tenantId: actor.tenantId, departmentId: actor.departmentId, isActive: true } : { tenantId: actor.tenantId, id: actor.id, isActive: true };
  const pendingStatuses = [DocumentStatus.IN_REVIEW, DocumentStatus.SIGNED_HOD, DocumentStatus.SIGNED_FINANCE, DocumentStatus.SIGNED_GM];

  const [
    totalDocuments, newDocuments, comparisonDocuments, completedApprovals, comparisonApprovals,
    activeUsers, pendingApprovals, archived, published, byDepartment, byCategory,
    periodDocuments, approvalHistory, storageDocuments, storageAttachments, recentActivity,
  ] = await Promise.all([
    database.document.count({ where: scope }),
    database.document.count({ where: scopedCurrent }),
    comparisonRange ? database.document.count({ where: { AND: [scope, { createdAt: comparisonRange }] } }) : 0,
    database.documentHistory.count({ where: { document: { is: scope }, action: 'Approved', createdAt: currentRange } }),
    comparisonRange ? database.documentHistory.count({ where: { document: { is: scope }, action: 'Approved', createdAt: comparisonRange } }) : 0,
    database.user.count({ where: userWhere }),
    database.document.count({ where: { AND: [scope, { status: { in: pendingStatuses } }] } }),
    database.document.count({ where: { AND: [scope, { status: DocumentStatus.ARCHIVED }] } }),
    database.document.count({ where: { AND: [scope, { status: DocumentStatus.PUBLISHED }] } }),
    database.document.groupBy({ by: ['departmentId'], where: scopedCurrent, _count: true }),
    database.document.groupBy({ by: ['category'], where: scopedCurrent, _count: true }),
    database.document.findMany({ where: scopedCurrent, select: { createdAt: true, status: true }, orderBy: { createdAt: 'asc' }, take: 20_000 }),
    database.documentHistory.findMany({ where: { document: { is: scope }, action: { in: ['Approved', 'Rejected', 'Returned for changes'] }, createdAt: currentRange }, select: { action: true, createdAt: true }, orderBy: { createdAt: 'asc' }, take: 20_000 }),
    database.document.findMany({ where: scopedCurrent, select: { createdAt: true, fileSize: true }, orderBy: { createdAt: 'asc' }, take: 20_000 }),
    database.documentAttachment.findMany({ where: { document: { is: scope }, createdAt: currentRange }, select: { createdAt: true, fileSize: true }, orderBy: { createdAt: 'asc' }, take: 20_000 }),
    database.documentHistory.findMany({ where: { document: { is: activityScope }, createdAt: currentRange }, select: { id: true, action: true, userName: true, createdAt: true, document: { select: { id: true, title: true, code: true } } }, orderBy: { createdAt: 'desc' }, take: 12 }),
  ]);
  const departmentIds = byDepartment.map(({ departmentId }) => departmentId);
  const [departments, primaryStorage, attachmentStorage] = await Promise.all([
    database.department.findMany({ where: { id: { in: departmentIds } }, select: { id: true, name: true, color: true } }),
    database.document.aggregate({ where: scope, _sum: { fileSize: true } }),
    database.documentAttachment.aggregate({ where: { document: { is: scope } }, _sum: { fileSize: true } }),
  ]);
  const departmentMap = Object.fromEntries(departments.map((department) => [department.id, department]));
  const { days, buckets } = buildBuckets(period.from, period.to);
  for (const document of periodDocuments) buckets.get(bucketKey(document.createdAt, days))!.created++;
  for (const history of approvalHistory) buckets.get(bucketKey(history.createdAt, days))!.approvalActions++;
  for (const item of [...storageDocuments, ...storageAttachments]) buckets.get(bucketKey(item.createdAt, days))!.storageBytes += item.fileSize ?? 0;
  const approvalCounts = { approved: 0, rejected: 0, returned: 0 };
  for (const history of approvalHistory) {
    if (history.action === 'Approved') approvalCounts.approved++;
    else if (history.action === 'Rejected') approvalCounts.rejected++;
    else approvalCounts.returned++;
  }
  const storageBytes = (primaryStorage._sum.fileSize ?? 0) + (attachmentStorage._sum.fileSize ?? 0);
  return {
    period: { from: period.from.toISOString(), to: period.to.toISOString(), compare: period.compare, compareFrom: period.compareFrom?.toISOString() ?? null, compareTo: period.compareTo?.toISOString() ?? null },
    kpis: { totalDocuments, newDocuments, completedApprovals, activeUsers, storageGb: Math.round(storageBytes / (1024 ** 3) * 100) / 100, pendingApprovals, archived, published },
    comparison: { newDocuments: percentChange(newDocuments, comparisonRange ? comparisonDocuments : null), completedApprovals: percentChange(completedApprovals, comparisonRange ? comparisonApprovals : null) },
    byDepartment: byDepartment.map((entry) => ({ id: entry.departmentId, name: departmentMap[entry.departmentId]?.name ?? 'Unknown', count: entry._count, color: departmentMap[entry.departmentId]?.color ?? '#64748B' })),
    byCategory: byCategory.map((entry) => ({ category: entry.category, count: entry._count })),
    approvalPerformance: approvalCounts,
    trend: [...buckets.entries()].map(([bucket, values]) => ({ bucket, ...values, storageGb: Math.round(values.storageBytes / (1024 ** 3) * 1000) / 1000 })),
    activityTimeline: recentActivity.map((entry) => ({ id: entry.id, action: entry.action, userName: entry.userName, createdAt: entry.createdAt, document: entry.document })),
    warnings: periodDocuments.length === 20_000 || approvalHistory.length === 20_000 || storageDocuments.length === 20_000 || storageAttachments.length === 20_000 ? ['The selected period reached the 20,000-row chart limit; narrow the date range for exact chart detail.'] : [],
  };
}

export async function recordReportExport(database: ReportDatabase, actor: AuthUser, report: Awaited<ReturnType<typeof getReport>>) {
  if (!actor.capabilities.includes('reports.export')) throw new ReportReadError('FORBIDDEN');
  await database.auditLog.create({ data: { userId: actor.id, userName: `${actor.firstName} ${actor.lastName}`, action: AuditAction.DOWNLOAD, entityType: 'Report', details: `Exported document analytics report ${report.period.from.slice(0, 10)} to ${report.period.to.slice(0, 10)}` } });
}
