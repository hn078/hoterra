import { AuditAction, DispositionStatus, DocumentStatus, type Prisma } from '@prisma/client';
import type * as DatabaseModule from '../../../db';
import type { AuthUser } from '../../../middleware/auth';
import {
  canArchiveDocument,
  canRestoreDocument,
  canUpdateDocument,
} from '../domain/documentPolicy';
import { serializeDocumentAuditState } from './documentAuditState';

type DocumentDatabase = typeof DatabaseModule.prisma;
const VERSIONABLE_DOCUMENT_STATUSES = new Set<DocumentStatus>([
  DocumentStatus.DRAFT,
  DocumentStatus.NEEDS_REVIEW,
  DocumentStatus.REJECTED,
  DocumentStatus.PUBLISHED,
]);
export type DocumentLifecycleErrorCode =
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'INVALID_STATE'
  | 'INVALID_VERSION'
  | 'INVALID_INPUT'
  | 'CONFLICT';

export class DocumentLifecycleError extends Error {
  constructor(public readonly code: DocumentLifecycleErrorCode) {
    super(code);
    this.name = 'DocumentLifecycleError';
  }
}

function actorName(actor: AuthUser) {
  return `${actor.firstName} ${actor.lastName}`;
}

function compareVersions(left: string, right: string) {
  const leftParts = left.split('.').map(Number);
  const rightParts = right.split('.').map(Number);
  const length = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < length; index++) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

function nextMinorVersion(version: string) {
  const parts = version.split('.').map(Number);
  if (parts.some(Number.isNaN)) throw new DocumentLifecycleError('INVALID_VERSION');
  if (parts.length === 1) return `${parts[0]}.1`;
  parts[parts.length - 1] += 1;
  return parts.join('.');
}

async function retentionForArchive(transaction: any, category: string, archivedAt: Date) {
  const policies = await transaction.retentionPolicy.findMany({
    where: { isActive: true, isDefault: true, OR: [{ category }, { category: null }] },
    orderBy: { category: 'desc' },
  });
  const policy = policies.find((candidate: { category: string | null }) => candidate.category === category) ?? policies.find((candidate: { category: string | null }) => candidate.category === null);
  return policy ? {
    retentionPolicyId: policy.id,
    retentionUntil: new Date(archivedAt.getTime() + policy.retentionDays * 86_400_000),
  } : { retentionPolicyId: null, retentionUntil: null };
}

export async function archiveDocument(
  database: DocumentDatabase,
  actor: AuthUser,
  documentId: string,
  reason?: string,
) {
  return database.$transaction(async (transaction) => {
    const current = await transaction.document.findUnique({ where: { id: documentId } });
    if (!current) throw new DocumentLifecycleError('NOT_FOUND');
    if (!canArchiveDocument(actor, current)) throw new DocumentLifecycleError('FORBIDDEN');
    if (current.status === DocumentStatus.ARCHIVED) throw new DocumentLifecycleError('INVALID_STATE');

    const archiveReason = reason?.trim().slice(0, 1000) || 'Archived by user';
    const archivedAt = new Date();
    const retention = await retentionForArchive(transaction, current.category, archivedAt);
    const result = await transaction.document.updateMany({
      where: { id: documentId, status: current.status },
      data: {
        status: DocumentStatus.ARCHIVED,
        archiveReason,
        archivedAt,
        archivedBy: actorName(actor),
        ...retention,
      },
    });
    if (result.count === 0) throw new DocumentLifecycleError('CONFLICT');

    await transaction.documentHistory.create({
      data: {
        documentId,
        action: 'Archived',
        details: archiveReason,
        userId: actor.id,
        userName: actorName(actor),
      },
    });
    const updated = await transaction.document.findUnique({ where: { id: documentId } });
    if (!updated) throw new DocumentLifecycleError('NOT_FOUND');
    await transaction.auditLog.create({
      data: {
        userId: actor.id,
        userName: actorName(actor),
        action: AuditAction.ARCHIVE,
        entityType: 'Document',
        entityId: documentId,
        details: `Archived "${current.title}": ${archiveReason}`,
        outcome: 'SUCCESS',
        reason: archiveReason,
        beforeState: serializeDocumentAuditState(current),
        afterState: serializeDocumentAuditState(updated),
      },
    });
    return updated;
  });
}

export async function archiveDocuments(
  database: DocumentDatabase,
  actor: AuthUser,
  documentIds: string[],
  reason?: string,
) {
  const uniqueIds = [...new Set(documentIds.filter(Boolean))];
  if (uniqueIds.length === 0 || uniqueIds.length !== documentIds.length || uniqueIds.length > 100) {
    throw new DocumentLifecycleError('INVALID_INPUT');
  }

  return database.$transaction(async (transaction) => {
    const documents = await transaction.document.findMany({ where: { id: { in: uniqueIds } } });
    if (documents.length !== uniqueIds.length) throw new DocumentLifecycleError('NOT_FOUND');
    if (documents.some((document) => !canArchiveDocument(actor, document))) {
      throw new DocumentLifecycleError('FORBIDDEN');
    }
    if (documents.some((document) => document.status === DocumentStatus.ARCHIVED)) {
      throw new DocumentLifecycleError('INVALID_STATE');
    }

    const archiveReason = reason?.trim().slice(0, 1000) || 'Bulk archived';
    const archivedBy = actorName(actor);
    const archivedAt = new Date();
    let updatedCount = 0;
    const auditRows: Prisma.AuditLogCreateManyInput[] = [];
    for (const document of documents) {
      const retention = await retentionForArchive(transaction, document.category, archivedAt);
      const result = await transaction.document.updateMany({
        where: { id: document.id, status: document.status },
        data: { status: DocumentStatus.ARCHIVED, archiveReason, archivedAt, archivedBy, ...retention },
      });
      updatedCount += result.count;
      auditRows.push({
        userId: actor.id,
        userName: archivedBy,
        action: AuditAction.ARCHIVE,
        entityType: 'Document',
        entityId: document.id,
        details: `Archived "${document.title}": ${archiveReason}`,
        outcome: 'SUCCESS',
        reason: archiveReason,
        beforeState: serializeDocumentAuditState(document),
        afterState: serializeDocumentAuditState({
          ...document,
          status: DocumentStatus.ARCHIVED,
          archiveReason,
          archivedAt,
          archivedBy,
          ...retention,
        }),
      });
    }
    if (updatedCount !== uniqueIds.length) throw new DocumentLifecycleError('CONFLICT');

    await transaction.documentHistory.createMany({
      data: documents.map((document) => ({
        documentId: document.id,
        action: 'Archived',
        details: archiveReason,
        userId: actor.id,
        userName: archivedBy,
      })),
    });
    await transaction.auditLog.createMany({
      data: auditRows,
    });
    return updatedCount;
  });
}

export async function restoreDocument(
  database: DocumentDatabase,
  actor: AuthUser,
  documentId: string,
) {
  return database.$transaction(async (transaction) => {
    const current = await transaction.document.findUnique({ where: { id: documentId } });
    if (!current) throw new DocumentLifecycleError('NOT_FOUND');
    if (!canRestoreDocument(actor, current)) throw new DocumentLifecycleError('FORBIDDEN');
    if (current.status !== DocumentStatus.ARCHIVED) throw new DocumentLifecycleError('INVALID_STATE');

    await transaction.documentDispositionRequest.updateMany({
      where: { documentId, status: DispositionStatus.PENDING },
      data: {
        status: DispositionStatus.CANCELLED,
        reviewedById: actor.id,
        reviewedByName: actorName(actor),
        reviewComment: 'Cancelled because the record was restored',
        reviewedAt: new Date(),
      },
    });

    const result = await transaction.document.updateMany({
      where: { id: documentId, status: DocumentStatus.ARCHIVED },
      data: {
        status: DocumentStatus.DRAFT,
        isLocked: false,
        approvalCycle: { increment: 1 },
        archiveReason: null,
        archivedAt: null,
        archivedBy: null,
        retentionPolicyId: null,
        retentionUntil: null,
      },
    });
    if (result.count === 0) throw new DocumentLifecycleError('CONFLICT');

    await transaction.documentHistory.create({
      data: {
        documentId,
        action: 'Restored from archive',
        userId: actor.id,
        userName: actorName(actor),
      },
    });
    const updated = await transaction.document.findUnique({
      where: { id: documentId },
      include: { department: true, author: true },
    });
    if (!updated) throw new DocumentLifecycleError('NOT_FOUND');
    await transaction.auditLog.create({
      data: {
        userId: actor.id,
        userName: actorName(actor),
        action: AuditAction.UPDATE,
        entityType: 'Document',
        entityId: documentId,
        details: `Restored "${current.title}" from archive`,
        outcome: 'SUCCESS',
        reason: 'Archived record restored as a draft; pending disposition cancelled',
        beforeState: serializeDocumentAuditState(current),
        afterState: serializeDocumentAuditState(updated),
      },
    });
    return updated;
  });
}

export async function createDocumentVersion(
  database: DocumentDatabase,
  actor: AuthUser,
  documentId: string,
  input: { version?: string; changeNote?: string },
) {
  return database.$transaction(async (transaction) => {
    const current = await transaction.document.findUnique({ where: { id: documentId } });
    if (!current) throw new DocumentLifecycleError('NOT_FOUND');
    if (!canUpdateDocument(actor, current)) throw new DocumentLifecycleError('FORBIDDEN');
    if (!VERSIONABLE_DOCUMENT_STATUSES.has(current.status)) {
      throw new DocumentLifecycleError('INVALID_STATE');
    }

    const newVersion = input.version?.trim() || nextMinorVersion(current.version);
    if (!/^\d+(?:\.\d+){0,2}$/.test(newVersion) || compareVersions(newVersion, current.version) <= 0) {
      throw new DocumentLifecycleError('INVALID_VERSION');
    }

    await transaction.documentVersion.create({
      data: {
        documentId,
        version: current.version,
        filePath: current.filePath,
        changeNote: input.changeNote?.trim().slice(0, 2000),
        createdBy: actor.id,
      },
    });
    const result = await transaction.document.updateMany({
      where: { id: documentId, version: current.version },
      data: {
        version: newVersion,
        status: DocumentStatus.DRAFT,
        isLocked: false,
        approvalCycle: { increment: 1 },
      },
    });
    if (result.count === 0) throw new DocumentLifecycleError('CONFLICT');

    await transaction.documentHistory.create({
      data: {
        documentId,
        action: `New version ${newVersion}`,
        details: input.changeNote?.trim().slice(0, 2000),
        userId: actor.id,
        userName: actorName(actor),
      },
    });
    const updated = await transaction.document.findUnique({
      where: { id: documentId },
      include: { department: true, author: true },
    });
    if (!updated) throw new DocumentLifecycleError('NOT_FOUND');
    await transaction.auditLog.create({
      data: {
        userId: actor.id,
        userName: actorName(actor),
        action: AuditAction.UPDATE,
        entityType: 'Document',
        entityId: documentId,
        details: `Created version ${newVersion} of "${current.title}"`,
        outcome: 'SUCCESS',
        reason: input.changeNote?.trim().slice(0, 2000) || 'New document version created',
        beforeState: serializeDocumentAuditState(current),
        afterState: serializeDocumentAuditState(updated),
      },
    });
    return updated;
  });
}
