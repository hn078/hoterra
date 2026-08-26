import { AuditAction, DocumentCategory, Prisma } from '@prisma/client';
import type * as DatabaseModule from '../../../db';
import type { AuthUser } from '../../../middleware/auth';
import { actionsForSeverity, AUDIT_ENTITY_TYPES, AUDIT_MODULES, AUDIT_SEVERITIES, auditSeverity, type AuditModule, type AuditSeverity } from '../domain/auditCatalog';

type AuditDatabase = typeof DatabaseModule.prisma;

export class AuditReadError extends Error {
  constructor(public readonly code: 'FORBIDDEN' | 'INVALID_INPUT', public readonly detail?: string) {
    super(code);
    this.name = 'AuditReadError';
  }
}

export interface AuditQueryInput {
  search?: unknown; action?: unknown; entityType?: unknown; userId?: unknown;
  departmentId?: unknown; category?: unknown; templateId?: unknown; module?: unknown;
  severity?: unknown; from?: unknown; to?: unknown; page?: unknown; limit?: unknown;
}

const ACTIONS = Object.values(AuditAction);
const ENTITY_TYPES = new Set<string>(AUDIT_ENTITY_TYPES);
const MODULES = new Set<string>(AUDIT_MODULES);
const SEVERITIES = new Set<string>(AUDIT_SEVERITIES);

function optionalText(value: unknown, field: string, maximum: number) {
  if (value === undefined || value === null || value === '' || value === 'ALL') return undefined;
  const result = String(value).trim();
  if (!result || result.length > maximum) throw new AuditReadError('INVALID_INPUT', `${field} is invalid`);
  return result;
}

function positiveInteger(value: unknown, fallback: number, maximum: number) {
  if (value === undefined) return fallback;
  const result = Number(value);
  if (!Number.isInteger(result) || result < 1 || result > maximum) throw new AuditReadError('INVALID_INPUT', 'Pagination is invalid');
  return result;
}

function date(value: unknown, field: string, endOfDay = false) {
  const text = optionalText(value, field, 30);
  if (!text) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new AuditReadError('INVALID_INPUT', `${field} must use YYYY-MM-DD`);
  const result = new Date(`${text}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`);
  if (Number.isNaN(result.getTime()) || result.toISOString().slice(0, 10) !== text) throw new AuditReadError('INVALID_INPUT', `${field} is invalid`);
  return result;
}

function modulePredicate(module: AuditModule): Prisma.AuditLogWhereInput {
  if (module === 'System') return { OR: [{ action: { in: [AuditAction.LOGIN, AuditAction.LOGOUT] } }, { entityType: { in: ['System', 'SystemSettings', 'TenantBranding', 'AuditLog'] } }] };
  if (module === 'Documents') return { entityType: { in: ['Document', 'DocumentAttachment', 'DocumentComment'] } };
  if (module === 'My Approvals') return { action: { in: [AuditAction.APPROVE, AuditAction.REJECT, AuditAction.SUBMIT, AuditAction.SIGN] } };
  if (module === 'Archive') return { action: { in: [AuditAction.ARCHIVE, AuditAction.DELETE] } };
  if (module === 'Templates') return { entityType: 'Template' };
  if (module === 'Organization') return { entityType: { in: ['Department', 'WorkflowRoute'] } };
  if (module === 'Users & Roles') return { entityType: { in: ['User', 'CustomRole'] } };
  if (module === 'Messaging') return { entityType: { in: ['Conversation', 'Message'] } };
  if (module === 'Reports') return { entityType: { in: ['Report', 'WorkforceReport'] } };
  return { OR: [{ entityType: { startsWith: 'Workforce' } }, { entityType: { in: ['Vendor', 'VendorInvite', 'VendorServiceRate', 'VendorInvoice', 'DepartmentCasualBudget'] } }] };
}

async function buildWhere(database: AuditDatabase, actor: AuthUser, input: AuditQueryInput) {
  if (!actor.capabilities.includes('audit.read')) throw new AuditReadError('FORBIDDEN');
  const search = optionalText(input.search, 'Search', 200);
  const actionText = optionalText(input.action, 'Action', 40);
  const entityType = optionalText(input.entityType, 'Entity type', 80);
  const userId = optionalText(input.userId, 'User', 100);
  const departmentId = optionalText(input.departmentId, 'Department', 100);
  const categoryText = optionalText(input.category, 'Category', 40);
  const templateId = optionalText(input.templateId, 'Template', 100);
  const moduleText = optionalText(input.module, 'Module', 50);
  const severityText = optionalText(input.severity, 'Severity', 20);
  const from = date(input.from, 'From date');
  const to = date(input.to, 'To date', true);

  if (actionText && !ACTIONS.includes(actionText as AuditAction)) throw new AuditReadError('INVALID_INPUT', 'Action is invalid');
  if (entityType && !ENTITY_TYPES.has(entityType)) throw new AuditReadError('INVALID_INPUT', 'Entity type is invalid');
  if (moduleText && !MODULES.has(moduleText)) throw new AuditReadError('INVALID_INPUT', 'Module is invalid');
  if (severityText && !SEVERITIES.has(severityText)) throw new AuditReadError('INVALID_INPUT', 'Severity is invalid');
  if (categoryText && !Object.values(DocumentCategory).includes(categoryText as DocumentCategory)) throw new AuditReadError('INVALID_INPUT', 'Category is invalid');
  if (from && to && from > to) throw new AuditReadError('INVALID_INPUT', 'From date cannot be after to date');

  const and: Prisma.AuditLogWhereInput[] = [{ tenantId: actor.tenantId }];
  if (actionText) and.push({ action: actionText as AuditAction });
  if (entityType) and.push({ entityType });
  if (userId) and.push({ userId });
  if (moduleText) and.push(modulePredicate(moduleText as AuditModule));
  if (severityText) and.push({ action: { in: actionsForSeverity(severityText as AuditSeverity, ACTIONS) as AuditAction[] } });
  if (from || to) and.push({ createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } });
  if (search) {
    const matchingActions = ACTIONS.filter((value) => value.includes(search.toUpperCase()));
    and.push({ OR: [
      { userName: { contains: search, mode: 'insensitive' } }, { details: { contains: search, mode: 'insensitive' } },
      { entityType: { contains: search, mode: 'insensitive' } }, { ipAddress: { contains: search } },
      { requestId: { contains: search } },
      ...(matchingActions.length ? [{ action: { in: matchingActions } }] : []),
    ] });
  }
  if (departmentId) {
    const [users, documents, workforceRequests, correctionReviews, evaluations, routes, budgets, workforceTemplates] = await Promise.all([
      database.user.findMany({ where: { departmentId }, select: { id: true }, take: 5000 }),
      database.document.findMany({ where: { departmentId }, select: { id: true }, take: 5000 }),
      database.workforceRequest.findMany({ where: { departmentId }, select: { id: true }, take: 5000 }),
      database.workforceVendorCorrectionReview.findMany({ where: { request: { departmentId } }, select: { id: true }, take: 5000 }),
      database.workforceQualityEvaluation.findMany({ where: { request: { departmentId } }, select: { id: true }, take: 5000 }),
      database.workforceApprovalRoute.findMany({ where: { departmentId }, select: { id: true }, take: 5000 }),
      database.departmentCasualBudget.findMany({ where: { departmentId }, select: { id: true }, take: 5000 }),
      database.workforceRequestTemplate.findMany({ where: { departmentId }, select: { id: true }, take: 5000 }),
    ]);
    const documentIds = documents.map(({ id }) => id);
    const [attachments, comments] = await Promise.all([
      database.documentAttachment.findMany({ where: { documentId: { in: documentIds } }, select: { id: true }, take: 5000 }),
      database.documentComment.findMany({ where: { documentId: { in: documentIds } }, select: { id: true }, take: 5000 }),
    ]);
    and.push({ OR: [
      { userId: { in: users.map(({ id }) => id) } },
      { entityType: 'Document', entityId: { in: documentIds } },
      { entityType: 'DocumentAttachment', entityId: { in: attachments.map(({ id }) => id) } },
      { entityType: 'DocumentComment', entityId: { in: comments.map(({ id }) => id) } },
      { entityType: 'WorkforceRequest', entityId: { in: workforceRequests.map(({ id }) => id) } },
      { entityType: 'WorkforceVendorCorrectionReview', entityId: { in: correctionReviews.map(({ id }) => id) } },
      { entityType: 'WorkforceQualityEvaluation', entityId: { in: evaluations.map(({ id }) => id) } },
      { entityType: 'WorkforceApprovalRoute', entityId: { in: routes.map(({ id }) => id) } },
      { entityType: 'DepartmentCasualBudget', entityId: { in: budgets.map(({ id }) => id) } },
      { entityType: 'WorkforceRequestTemplate', entityId: { in: workforceTemplates.map(({ id }) => id) } },
    ] });
  }
  if (categoryText || templateId) {
    const [documents, templates] = await Promise.all([
      database.document.findMany({ where: {
        ...(categoryText ? { category: categoryText as DocumentCategory } : {}), ...(templateId ? { templateId } : {}),
      }, select: { id: true }, take: 5000 }),
      database.template.findMany({ where: templateId ? { id: templateId } : { category: categoryText as DocumentCategory }, select: { id: true }, take: 5000 }),
    ]);
    const documentIds = documents.map(({ id }) => id);
    const [attachments, comments] = await Promise.all([
      database.documentAttachment.findMany({ where: { documentId: { in: documentIds } }, select: { id: true }, take: 5000 }),
      database.documentComment.findMany({ where: { documentId: { in: documentIds } }, select: { id: true }, take: 5000 }),
    ]);
    and.push({ OR: [
      { entityType: 'Document', entityId: { in: documentIds } },
      { entityType: 'DocumentAttachment', entityId: { in: attachments.map(({ id }) => id) } },
      { entityType: 'DocumentComment', entityId: { in: comments.map(({ id }) => id) } },
      { entityType: 'Template', entityId: { in: templates.map(({ id }) => id) } },
    ] });
  }
  return { where: { AND: and } as Prisma.AuditLogWhereInput, page: positiveInteger(input.page, 1, 1_000_000), limit: positiveInteger(input.limit, 20, 100) };
}

const auditSelect = {
  id: true, userId: true, userName: true, action: true, entityType: true, entityId: true,
  details: true, ipAddress: true, requestId: true, outcome: true, reason: true,
  beforeState: true, afterState: true, createdAt: true,
} as const;
function dto<T extends { action: AuditAction; beforeState?: string | null; afterState?: string | null }>(row: T) {
  const { beforeState, afterState, ...safe } = row;
  return { ...safe, hasStructuredChange: beforeState != null || afterState != null, severity: auditSeverity(row.action) };
}

export async function listAuditEvents(database: AuditDatabase, actor: AuthUser, input: AuditQueryInput) {
  const { where, page, limit } = await buildWhere(database, actor, input);
  const today = new Date(); today.setUTCHours(0, 0, 0, 0);
  const highActions = actionsForSeverity('High', ACTIONS) as AuditAction[];
  const [rows, total, todayCount, highSeverity, activeUsers] = await Promise.all([
    database.auditLog.findMany({ where, select: auditSelect, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
    database.auditLog.count({ where }), database.auditLog.count({ where: { AND: [where, { createdAt: { gte: today } }] } }),
    database.auditLog.count({ where: { AND: [where, { action: { in: highActions } }] } }),
    database.auditLog.groupBy({ by: ['userId'], where: { AND: [where, { userId: { not: null } }] } }),
  ]);
  return { data: rows.map(dto), pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }, summary: { today: todayCount, highSeverity, activeUsers: activeUsers.length } };
}

export async function exportAuditEvents(database: AuditDatabase, actor: AuthUser, input: AuditQueryInput) {
  if (!actor.capabilities.includes('audit.export')) throw new AuditReadError('FORBIDDEN');
  const { where } = await buildWhere(database, actor, input);
  const rows = await database.auditLog.findMany({ where, select: auditSelect, orderBy: { createdAt: 'desc' }, take: 10_000 });
  await database.auditLog.create({ data: { userId: actor.id, userName: `${actor.firstName} ${actor.lastName}`, action: AuditAction.DOWNLOAD, entityType: 'System', details: `Exported ${rows.length} audit event(s)` } });
  return rows.map(dto);
}

type AuditIntegrityRow = {
  total: number;
  broken: number;
  lastSequence: number;
  lastHash: string | null;
};

async function calculateAuditIntegrity(database: AuditDatabase, tenantId: string) {
  const rows = await database.$queryRaw<AuditIntegrityRow[]>(Prisma.sql`
    WITH ordered AS (
      SELECT
        log.*,
        ROW_NUMBER() OVER (ORDER BY log."sequence")::INTEGER AS "expectedSequence",
        COALESCE(LAG(log."entryHash") OVER (ORDER BY log."sequence"), '') AS "expectedPreviousHash"
      FROM "AuditLog" AS log
      WHERE log."tenantId" = ${tenantId}
    ), checked AS (
      SELECT
        *,
        (
          "sequence" = "expectedSequence"
          AND "previousHash" = "expectedPreviousHash"
          AND "entryHash" = hoterra_audit_hash_v3(
            "id", "tenantId", "userId", "userName", "action"::TEXT,
            "entityType", "entityId", "details", "ipAddress", "device", "requestId",
            "outcome", "reason", "beforeState", "afterState",
            "createdAt", "sequence", "previousHash"
          )
        ) AS valid
      FROM ordered
    )
    SELECT
      COUNT(*)::INTEGER AS total,
      COUNT(*) FILTER (WHERE NOT valid)::INTEGER AS broken,
      COALESCE(MAX("sequence"), 0)::INTEGER AS "lastSequence",
      (SELECT "entryHash" FROM checked ORDER BY "sequence" DESC LIMIT 1) AS "lastHash"
    FROM checked
  `);
  const result = rows[0] ?? { total: 0, broken: 0, lastSequence: 0, lastHash: null };
  return {
    status: result.total === 0 ? 'EMPTY' as const : result.broken === 0 ? 'VERIFIED' as const : 'BROKEN' as const,
    total: result.total,
    broken: result.broken,
    lastSequence: result.lastSequence,
    anchor: result.lastHash,
  };
}

/**
 * Records access to the compliance ledger, then verifies the tenant's complete
 * database-generated hash chain without returning event payloads or identities.
 */
export async function verifyAuditIntegrity(database: AuditDatabase, actor: AuthUser) {
  if (!actor.capabilities.includes('audit.read')) throw new AuditReadError('FORBIDDEN');
  await database.auditLog.create({
    data: {
      userId: actor.id,
      userName: `${actor.firstName} ${actor.lastName}`,
      action: AuditAction.VIEW,
      entityType: 'AuditLog',
      entityId: 'integrity',
      details: 'Opened Audit Log and verified the tenant evidence chain',
    },
  });
  return { ...await calculateAuditIntegrity(database, actor.tenantId), verifiedAt: new Date() };
}

const auditEvidenceSelect = {
  id: true,
  tenantId: true,
  userId: true,
  userName: true,
  action: true,
  entityType: true,
  entityId: true,
  details: true,
  ipAddress: true,
  device: true,
  requestId: true,
  outcome: true,
  reason: true,
  beforeState: true,
  afterState: true,
  createdAt: true,
  sequence: true,
  previousHash: true,
  entryHash: true,
} as const;

export async function exportAuditEvidence(database: AuditDatabase, actor: AuthUser, input: AuditQueryInput) {
  if (!actor.capabilities.includes('audit.export')) throw new AuditReadError('FORBIDDEN');
  const { where } = await buildWhere(database, actor, input);
  await database.auditLog.create({
    data: {
      userId: actor.id,
      userName: `${actor.firstName} ${actor.lastName}`,
      action: AuditAction.DOWNLOAD,
      entityType: 'AuditLog',
      entityId: 'evidence-export',
      details: 'Exported a verifiable audit evidence package',
    },
  });
  // Freeze the evidence package at the verified chain head. Audit events may be
  // appended concurrently after verification; the sequence cutoff prevents
  // those later rows from being mixed into this package under an older anchor.
  const integrity = await calculateAuditIntegrity(database, actor.tenantId);
  const rows = await database.auditLog.findMany({
    where: { AND: [where, { sequence: { lte: integrity.lastSequence } }] },
    select: auditEvidenceSelect,
    orderBy: { sequence: 'asc' },
    take: 10_001,
  });
  const filtered = Object.entries(input).some(([key, value]) =>
    !['page', 'limit'].includes(key) && value !== undefined && value !== null && value !== '' && value !== 'ALL'
  );
  const truncated = rows.length > 10_000;
  const events = rows.slice(0, 10_000).map((row) => ({
    ...row,
    createdAt: row.createdAt.toISOString().slice(0, -1),
  }));
  return {
    format: 'HOTERRA_AUDIT_EVIDENCE',
    version: 3,
    generatedAt: new Date(),
    tenantId: actor.tenantId,
    algorithm: 'SHA-256',
    canonicalization: {
      separator: 'U+001F',
      nullValue: '',
      timestamp: 'YYYY-MM-DDTHH:mm:ss.SSS',
      fields: ['id', 'tenantId', 'userId', 'userName', 'action', 'entityType', 'entityId', 'details', 'ipAddress', 'device', 'requestId', 'outcome', 'reason', 'beforeState', 'afterState', 'createdAt', 'sequence', 'previousHash'],
    },
    chain: integrity,
    scope: { filtered, truncated, maximumEvents: 10_000, returnedEvents: events.length },
    events,
  };
}
