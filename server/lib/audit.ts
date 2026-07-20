import { AuditAction, DocumentCategory, Prisma } from '@prisma/client';
import { prisma } from '../db';

export type AuditModule =
  | 'System'
  | 'Documents'
  | 'My Approvals'
  | 'Archive'
  | 'Users & Roles';

export type AuditSeverity = 'Low' | 'Medium' | 'High';

const ACTION_META: Record<
  AuditAction,
  { label: string; module: AuditModule; severity: AuditSeverity }
> = {
  LOGIN: { label: 'Login Authentication', module: 'System', severity: 'Low' },
  LOGOUT: { label: 'Logout', module: 'System', severity: 'Low' },
  VIEW: { label: 'Viewed Document', module: 'Documents', severity: 'Low' },
  DOWNLOAD: { label: 'Downloaded Document', module: 'Documents', severity: 'Low' },
  PRINT: { label: 'Printed Document', module: 'Documents', severity: 'Low' },
  CREATE: { label: 'Created Document', module: 'Documents', severity: 'Medium' },
  UPDATE: { label: 'Updated Document', module: 'Documents', severity: 'Medium' },
  DELETE: { label: 'Deleted Document', module: 'Documents', severity: 'High' },
  SIGN: { label: 'Signed Document', module: 'Documents', severity: 'Medium' },
  PUBLISH: { label: 'Published Document', module: 'Documents', severity: 'Medium' },
  UNPUBLISH: { label: 'Unpublished Document', module: 'Documents', severity: 'Medium' },
  ARCHIVE: { label: 'Archived Document', module: 'Archive', severity: 'Low' },
  APPROVE: { label: 'Approved Document', module: 'My Approvals', severity: 'Medium' },
  REJECT: { label: 'Rejected Document', module: 'My Approvals', severity: 'High' },
  SUBMIT: { label: 'Submitted for Review', module: 'My Approvals', severity: 'Medium' },
};

export const AUDIT_MODULES: AuditModule[] = [
  'System',
  'Documents',
  'My Approvals',
  'Archive',
  'Users & Roles',
];

export const AUDIT_SEVERITIES: AuditSeverity[] = ['Low', 'Medium', 'High'];

export const AUDIT_ENTITY_TYPES = [
  'Document',
  'Template',
  'User',
  'Department',
  'Workflow',
  'WorkforceRequest',
  'System',
] as const;

export function actionsForModule(module: string): AuditAction[] {
  return (Object.entries(ACTION_META) as [AuditAction, (typeof ACTION_META)[AuditAction]][])
    .filter(([, meta]) => meta.module === module)
    .map(([action]) => action);
}

export function actionsForSeverity(severity: string): AuditAction[] {
  return (Object.entries(ACTION_META) as [AuditAction, (typeof ACTION_META)[AuditAction]][])
    .filter(([, meta]) => meta.severity === severity)
    .map(([action]) => action);
}

export function highSeverityActions(): AuditAction[] {
  return actionsForSeverity('High');
}

function resolveActionFilter(
  action?: string,
  module?: string,
  severity?: string
): AuditAction[] | undefined {
  let actions: AuditAction[] | undefined;

  if (module && module !== 'ALL') {
    actions = actionsForModule(module);
    if (actions.length === 0) return [];
  }

  if (severity && severity !== 'ALL') {
    const severityActions = actionsForSeverity(severity);
    actions = actions ? actions.filter((a) => severityActions.includes(a)) : severityActions;
  }

  if (action && action !== 'ALL') {
    const single = action as AuditAction;
    actions = actions ? (actions.includes(single) ? [single] : []) : [single];
  }

  return actions;
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(dateStr: string): Date {
  const d = new Date(dateStr);
  d.setHours(23, 59, 59, 999);
  return d;
}

export interface AuditLogQuery {
  search?: string;
  action?: string;
  entityType?: string;
  userId?: string;
  departmentId?: string;
  category?: string;
  templateId?: string;
  module?: string;
  severity?: string;
  from?: string;
  to?: string;
}

export async function buildAuditLogWhere(query: AuditLogQuery): Promise<Prisma.AuditLogWhereInput> {
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
  } = query;

  const and: Prisma.AuditLogWhereInput[] = [];

  const actionFilter = resolveActionFilter(action, module, severity);
  if (actionFilter !== undefined) {
    if (actionFilter.length === 0) {
      return { id: '__none__' };
    }
    and.push({ action: { in: actionFilter } });
  }

  if (entityType && entityType !== 'ALL') {
    and.push({ entityType: String(entityType) });
  }

  if (userId) {
    and.push({ userId: String(userId) });
  }

  if (from || to) {
    const createdAt: Prisma.DateTimeFilter = {};
    if (from) createdAt.gte = new Date(String(from));
    if (to) createdAt.lte = endOfDay(String(to));
    and.push({ createdAt });
  }

  if (search) {
    const q = String(search);
    and.push({
      OR: [
        { userName: { contains: q } },
        { details: { contains: q } },
        { entityType: { contains: q } },
        { ipAddress: { contains: q } },
        { action: { in: Object.values(AuditAction).filter((a) => a.includes(q.toUpperCase())) } },
      ],
    });
  }

  if (departmentId) {
    const [deptUsers, deptDocs] = await Promise.all([
      prisma.user.findMany({ where: { departmentId: String(departmentId) }, select: { id: true } }),
      prisma.document.findMany({ where: { departmentId: String(departmentId) }, select: { id: true } }),
    ]);
    const userIds = deptUsers.map((u) => u.id);
    const docIds = deptDocs.map((d) => d.id);
    if (userIds.length === 0 && docIds.length === 0) {
      return { id: '__none__' };
    }
    and.push({
      OR: [
        ...(userIds.length ? [{ userId: { in: userIds } }] : []),
        ...(docIds.length ? [{ entityType: 'Document', entityId: { in: docIds } }] : []),
      ],
    });
  }

  if (category && category !== 'ALL') {
    const docs = await prisma.document.findMany({
      where: { category: category as DocumentCategory },
      select: { id: true },
    });
    const docIds = docs.map((d) => d.id);
    if (docIds.length === 0) {
      return { id: '__none__' };
    }
    and.push({ entityType: 'Document', entityId: { in: docIds } });
  }

  if (templateId) {
    const docs = await prisma.document.findMany({
      where: { templateId: String(templateId) },
      select: { id: true },
    });
    const docIds = docs.map((d) => d.id);
    if (docIds.length === 0) {
      return { id: '__none__' };
    }
    and.push({ entityType: 'Document', entityId: { in: docIds } });
  }

  if (and.length === 0) return {};
  if (and.length === 1) return and[0];
  return { AND: and };
}

export async function getAuditLogSummary(where: Prisma.AuditLogWhereInput) {
  const todayStart = startOfToday();
  const [today, highSeverity, userGroups] = await Promise.all([
    prisma.auditLog.count({ where: { AND: [where, { createdAt: { gte: todayStart } }] } }),
    prisma.auditLog.count({
      where: { AND: [where, { action: { in: highSeverityActions() } }] },
    }),
    prisma.auditLog.groupBy({
      by: ['userId'],
      where: { AND: [where, { userId: { not: null } }] },
    }),
  ]);

  return { today, highSeverity, activeUsers: userGroups.length };
}
