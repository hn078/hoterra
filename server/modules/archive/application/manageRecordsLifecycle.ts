import {
  AuditAction,
  DispositionStatus,
  DocumentCategory,
  DocumentStatus,
  Prisma,
} from '@prisma/client';
import type * as DatabaseModule from '../../../db';
import type { AuthUser } from '../../../middleware/auth';
import { resolveEffectiveCapabilities } from '../../access-control';
import { canArchiveDocument, canReadDocument } from '../../documents';

type RecordsDatabase = typeof DatabaseModule.prisma;

export type RecordsLifecycleErrorCode =
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'INVALID_INPUT'
  | 'INVALID_STATE'
  | 'RETENTION_ACTIVE'
  | 'LEGAL_HOLD'
  | 'SELF_REVIEW'
  | 'CONFLICT';

export class RecordsLifecycleError extends Error {
  constructor(public readonly code: RecordsLifecycleErrorCode, public readonly detail?: string) {
    super(code);
    this.name = 'RecordsLifecycleError';
  }
}

export interface RecordsFileStorage {
  remove(filePath: string, subdir: 'documents' | 'comments'): void | Promise<void>;
}

function actorName(actor: AuthUser) {
  return `${actor.firstName} ${actor.lastName}`;
}

function requiredText(value: unknown, label: string, maximum = 2000) {
  const text = String(value ?? '').trim();
  if (!text || text.length > maximum) throw new RecordsLifecycleError('INVALID_INPUT', `${label} is required and must be at most ${maximum} characters`);
  return text;
}

function parseDate(value: unknown) {
  const date = new Date(String(value ?? ''));
  if (!value || Number.isNaN(date.getTime())) throw new RecordsLifecycleError('INVALID_INPUT', 'A valid retention date is required');
  return date;
}

function requireCapability(actor: AuthUser, capability: string) {
  if (!actor.capabilities.includes(capability as never)) throw new RecordsLifecycleError('FORBIDDEN');
}

export async function listRetentionPolicies(database: RecordsDatabase, actor: AuthUser) {
  requireCapability(actor, 'documents.archive');
  return database.retentionPolicy.findMany({ orderBy: [{ isActive: 'desc' }, { isDefault: 'desc' }, { name: 'asc' }] });
}

export async function saveRetentionPolicy(database: RecordsDatabase, actor: AuthUser, value: unknown, policyId?: string) {
  requireCapability(actor, 'records.manage');
  const input = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const name = requiredText(input.name, 'Policy name', 120);
  const description = String(input.description ?? '').trim().slice(0, 1000) || null;
  const retentionDays = Number(input.retentionDays);
  if (!Number.isInteger(retentionDays) || retentionDays < 1 || retentionDays > 36_500) {
    throw new RecordsLifecycleError('INVALID_INPUT', 'Retention days must be between 1 and 36,500');
  }
  const category = input.category == null || input.category === '' ? null : String(input.category) as DocumentCategory;
  if (category && !Object.values(DocumentCategory).includes(category)) throw new RecordsLifecycleError('INVALID_INPUT', 'Document category is invalid');
  const isDefault = Boolean(input.isDefault);
  const isActive = input.isActive === undefined ? true : Boolean(input.isActive);

  return database.$transaction(async (transaction) => {
    if (policyId) {
      const existing = await transaction.retentionPolicy.findUnique({ where: { id: policyId } });
      if (!existing) throw new RecordsLifecycleError('NOT_FOUND');
    }
    if (isDefault) {
      await transaction.retentionPolicy.updateMany({
        where: { isDefault: true, category },
        data: { isDefault: false },
      });
    }
    const policy = policyId
      ? await transaction.retentionPolicy.update({ where: { id: policyId }, data: { name, description, retentionDays, category, isDefault, isActive } })
      : await transaction.retentionPolicy.create({ data: { name, description, retentionDays, category, isDefault, isActive } });
    await transaction.auditLog.create({ data: {
      userId: actor.id, userName: actorName(actor), action: policyId ? AuditAction.UPDATE : AuditAction.CREATE,
      entityType: 'RetentionPolicy', entityId: policy.id,
      details: `${policyId ? 'Updated' : 'Created'} retention policy "${policy.name}" (${policy.retentionDays} days)`,
    } });
    return policy;
  });
}

export async function updateDocumentRetention(database: RecordsDatabase, actor: AuthUser, documentId: string, value: unknown) {
  requireCapability(actor, 'records.manage');
  const input = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const retentionUntil = parseDate(input.retentionUntil);
  const policyId = input.policyId ? String(input.policyId) : null;
  return database.$transaction(async (transaction) => {
    const current = await transaction.document.findUnique({ where: { id: documentId } });
    if (!current) throw new RecordsLifecycleError('NOT_FOUND');
    if (!canReadDocument(actor, current)) throw new RecordsLifecycleError('FORBIDDEN');
    if (current.status !== DocumentStatus.ARCHIVED) throw new RecordsLifecycleError('INVALID_STATE');
    if (policyId && !await transaction.retentionPolicy.findFirst({ where: { id: policyId, isActive: true } })) throw new RecordsLifecycleError('INVALID_INPUT', 'Retention policy is not active');
    await transaction.documentDispositionRequest.updateMany({
      where: { documentId, status: DispositionStatus.PENDING },
      data: { status: DispositionStatus.CANCELLED, reviewedById: actor.id, reviewedByName: actorName(actor), reviewComment: 'Cancelled because retention was changed', reviewedAt: new Date() },
    });
    const updated = await transaction.document.update({ where: { id: documentId }, data: { retentionPolicyId: policyId, retentionUntil } });
    await transaction.documentHistory.create({ data: { documentId, action: 'Retention updated', details: retentionUntil.toISOString(), userId: actor.id, userName: actorName(actor) } });
    await transaction.auditLog.create({ data: { userId: actor.id, userName: actorName(actor), action: AuditAction.UPDATE, entityType: 'Document', entityId: documentId, details: `Updated retention date for "${current.title}" to ${retentionUntil.toISOString()}` } });
    return updated;
  });
}

export async function setLegalHold(database: RecordsDatabase, actor: AuthUser, documentId: string, value: unknown) {
  requireCapability(actor, 'records.manage');
  const input = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const active = Boolean(input.active);
  const reason = active ? requiredText(input.reason, 'Legal hold reason') : String(input.reason ?? '').trim().slice(0, 2000) || 'Legal hold released';
  return database.$transaction(async (transaction) => {
    const current = await transaction.document.findUnique({ where: { id: documentId } });
    if (!current) throw new RecordsLifecycleError('NOT_FOUND');
    if (!canReadDocument(actor, current)) throw new RecordsLifecycleError('FORBIDDEN');
    if (current.status !== DocumentStatus.ARCHIVED) throw new RecordsLifecycleError('INVALID_STATE');
    if (!active && !current.legalHoldAt) throw new RecordsLifecycleError('INVALID_STATE', 'Document is not on legal hold');
    const now = new Date();
    if (active) await transaction.documentDispositionRequest.updateMany({
      where: { documentId, status: DispositionStatus.PENDING },
      data: { status: DispositionStatus.CANCELLED, reviewedById: actor.id, reviewedByName: actorName(actor), reviewComment: `Cancelled by legal hold: ${reason}`, reviewedAt: now },
    });
    const updated = await transaction.document.update({ where: { id: documentId }, data: active ? {
      legalHoldAt: now, legalHoldById: actor.id, legalHoldByName: actorName(actor), legalHoldReason: reason,
    } : { legalHoldAt: null, legalHoldById: null, legalHoldByName: null, legalHoldReason: null } });
    await transaction.documentHistory.create({ data: { documentId, action: active ? 'Legal hold applied' : 'Legal hold released', details: reason, userId: actor.id, userName: actorName(actor) } });
    await transaction.auditLog.create({ data: { userId: actor.id, userName: actorName(actor), action: AuditAction.UPDATE, entityType: 'Document', entityId: documentId, details: `${active ? 'Applied' : 'Released'} legal hold for "${current.title}": ${reason}` } });
    return updated;
  });
}

export async function requestDisposition(database: RecordsDatabase, actor: AuthUser, documentId: string, value: unknown) {
  requireCapability(actor, 'records.disposition.request');
  const input = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const reason = requiredText(input.reason, 'Disposition reason');
  return database.$transaction(async (transaction) => {
    const current = await transaction.document.findUnique({ where: { id: documentId } });
    if (!current) throw new RecordsLifecycleError('NOT_FOUND');
    if (!canArchiveDocument(actor, current)) throw new RecordsLifecycleError('FORBIDDEN');
    if (current.status !== DocumentStatus.ARCHIVED) throw new RecordsLifecycleError('INVALID_STATE');
    if (current.legalHoldAt) throw new RecordsLifecycleError('LEGAL_HOLD');
    if (!current.retentionUntil || current.retentionUntil.getTime() > Date.now()) throw new RecordsLifecycleError('RETENTION_ACTIVE');
    if (await transaction.documentDispositionRequest.findFirst({ where: { documentId, status: DispositionStatus.PENDING } })) throw new RecordsLifecycleError('CONFLICT');
    const request = await transaction.documentDispositionRequest.create({ data: {
      documentId, reason, requestedById: actor.id, requestedByName: actorName(actor),
      documentCode: current.code, documentTitle: current.title, retentionUntil: current.retentionUntil,
    } });
    const candidates = await transaction.user.findMany({ where: { isActive: true, id: { not: actor.id } }, include: { customRole: { select: { permissions: true, isActive: true } } } });
    const reviewers = candidates.filter((user) => resolveEffectiveCapabilities(user.role, user.customRole).includes('records.disposition.approve'));
    if (reviewers.length) await transaction.notification.createMany({ data: reviewers.map((user) => ({
      userId: user.id, type: 'records_disposition_review', title: 'Disposition review required',
      message: `${current.code} — ${current.title} is awaiting records disposition review.`,
      link: '/archive', entityType: 'DocumentDispositionRequest', entityId: request.id,
      actionType: 'RECORDS_DISPOSITION_REVIEW', dedupeKey: `records-disposition:${request.id}:${user.id}`,
    })) });
    await transaction.documentHistory.create({ data: { documentId, action: 'Disposition requested', details: reason, userId: actor.id, userName: actorName(actor) } });
    await transaction.auditLog.create({ data: { userId: actor.id, userName: actorName(actor), action: AuditAction.SUBMIT, entityType: 'DocumentDispositionRequest', entityId: request.id, details: `Requested disposition of "${current.title}": ${reason}` } });
    return request;
  });
}

export async function reviewDisposition(
  database: RecordsDatabase,
  actor: AuthUser,
  requestId: string,
  value: unknown,
  storage: RecordsFileStorage,
) {
  requireCapability(actor, 'records.disposition.approve');
  const input = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const decision = String(input.decision ?? '').toUpperCase();
  if (!['APPROVE', 'REJECT'].includes(decision)) throw new RecordsLifecycleError('INVALID_INPUT', 'Decision must be APPROVE or REJECT');
  const comment = decision === 'REJECT' ? requiredText(input.comment, 'Rejection comment') : String(input.comment ?? '').trim().slice(0, 2000) || null;
  const files = await database.$transaction(async (transaction) => {
    await transaction.$queryRaw(Prisma.sql`SELECT "id" FROM "DocumentDispositionRequest" WHERE "id" = ${requestId} AND "tenantId" = ${actor.tenantId} FOR UPDATE`);
    const request = await transaction.documentDispositionRequest.findUnique({ where: { id: requestId }, include: { document: { include: { attachments: true, versions: true, comments: true } } } });
    if (!request) throw new RecordsLifecycleError('NOT_FOUND');
    if (request.status !== DispositionStatus.PENDING) throw new RecordsLifecycleError('INVALID_STATE');
    if (request.requestedById === actor.id) throw new RecordsLifecycleError('SELF_REVIEW');
    if (!canReadDocument(actor, request.document)) throw new RecordsLifecycleError('FORBIDDEN');
    const now = new Date();
    if (decision === 'REJECT') {
      await transaction.documentDispositionRequest.update({ where: { id: requestId }, data: { status: DispositionStatus.REJECTED, reviewedById: actor.id, reviewedByName: actorName(actor), reviewComment: comment, reviewedAt: now } });
      await transaction.notification.create({ data: { userId: request.requestedById, type: 'records_disposition_rejected', title: 'Disposition request rejected', message: `${request.documentCode} disposition was rejected${comment ? `: ${comment}` : '.'}`, link: '/archive', entityType: 'DocumentDispositionRequest', entityId: request.id, dedupeKey: `records-disposition-rejected:${request.id}` } });
      await transaction.auditLog.create({ data: { userId: actor.id, userName: actorName(actor), action: AuditAction.REJECT, entityType: 'DocumentDispositionRequest', entityId: request.id, details: `Rejected disposition of "${request.documentTitle}"${comment ? `: ${comment}` : ''}` } });
      return [] as Array<{ path: string; subdir: 'documents' | 'comments' }>;
    }
    if (request.document.status !== DocumentStatus.ARCHIVED) throw new RecordsLifecycleError('INVALID_STATE');
    if (request.document.legalHoldAt) throw new RecordsLifecycleError('LEGAL_HOLD');
    if (!request.document.retentionUntil || request.document.retentionUntil.getTime() > now.getTime()) throw new RecordsLifecycleError('RETENTION_ACTIVE');
    const paths: Array<{ path: string; subdir: 'documents' | 'comments' }> = [];
    if (request.document.filePath) paths.push({ path: request.document.filePath, subdir: 'documents' });
    for (const attachment of request.document.attachments) paths.push({ path: attachment.filePath, subdir: 'documents' });
    for (const version of request.document.versions) if (version.filePath) paths.push({ path: version.filePath, subdir: 'documents' });
    for (const documentComment of request.document.comments) if (documentComment.attachmentFilePath) paths.push({ path: documentComment.attachmentFilePath, subdir: 'comments' });
    await transaction.documentAttachment.deleteMany({ where: { documentId: request.documentId } });
    await transaction.documentVersion.updateMany({ where: { documentId: request.documentId }, data: { filePath: null } });
    await transaction.documentComment.updateMany({ where: { documentId: request.documentId }, data: { attachmentFilePath: null, attachmentFileName: null, attachmentFileSize: null, attachmentFileType: null } });
    await transaction.documentSearchIndex.deleteMany({ where: { documentId: request.documentId } });
    await transaction.document.update({ where: { id: request.documentId }, data: {
      status: DocumentStatus.DISPOSED, content: null, filePath: null, fileName: null, fileType: null, fileSize: null,
      allowDownload: false, allowComments: false, isLocked: true,
      disposedAt: now, disposedById: actor.id, disposedByName: actorName(actor), dispositionReason: request.reason,
    } });
    await transaction.documentDispositionRequest.update({ where: { id: requestId }, data: { status: DispositionStatus.EXECUTED, reviewedById: actor.id, reviewedByName: actorName(actor), reviewComment: comment, reviewedAt: now, executedAt: now } });
    await transaction.documentHistory.create({ data: { documentId: request.documentId, action: 'Disposed and content purged', details: request.reason, userId: actor.id, userName: actorName(actor) } });
    await transaction.notification.create({ data: { userId: request.requestedById, type: 'records_disposition_executed', title: 'Disposition completed', message: `${request.documentCode} content was purged after independent approval.`, link: '/archive', entityType: 'DocumentDispositionRequest', entityId: request.id, dedupeKey: `records-disposition-executed:${request.id}` } });
    await transaction.auditLog.create({ data: { userId: actor.id, userName: actorName(actor), action: AuditAction.DELETE, entityType: 'DocumentDispositionRequest', entityId: request.id, details: `Approved and executed disposition of "${request.documentTitle}" (${request.documentCode}); metadata and audit evidence retained` } });
    return paths;
  });
  const failures: string[] = [];
  for (const file of files) {
    try { await storage.remove(file.path, file.subdir); } catch { failures.push(file.path); }
  }
  return { ok: true, purgedFiles: files.length - failures.length, storageFailures: failures.length };
}
