import { AuditAction, DocumentIndexSourceType, DocumentIndexStatus, DocumentStatus } from '@prisma/client';
import type * as DatabaseModule from '../../../db';
import type { AuthUser } from '../../../middleware/auth';

type DocumentDatabase = typeof DatabaseModule.prisma;

export class DocumentIndexManagementError extends Error {
  constructor(public readonly code: 'FORBIDDEN') {
    super(code);
    this.name = 'DocumentIndexManagementError';
  }
}

function requireIndexManagement(actor: AuthUser) {
  if (!actor.capabilities.includes('settings.manage.security')) {
    throw new DocumentIndexManagementError('FORBIDDEN');
  }
}

export async function readDocumentIndexHealth(database: DocumentDatabase, actor: AuthUser) {
  requireIndexManagement(actor);
  const [groups, primaryFiles, attachments, missingPrimary, missingAttachments, latest] = await Promise.all([
    database.documentSearchIndex.groupBy({
      by: ['status', 'sourceType'],
      _count: { _all: true },
    }),
    database.document.count({ where: { filePath: { not: null }, status: { not: DocumentStatus.DISPOSED } } }),
    database.documentAttachment.count({ where: { document: { status: { not: DocumentStatus.DISPOSED } } } }),
    database.document.count({
      where: {
        filePath: { not: null },
        status: { not: DocumentStatus.DISPOSED },
        searchIndexes: { none: { sourceType: DocumentIndexSourceType.PRIMARY } },
      },
    }),
    database.documentAttachment.count({
      where: { document: { status: { not: DocumentStatus.DISPOSED } }, searchIndex: { is: null } },
    }),
    database.documentSearchIndex.aggregate({ _max: { indexedAt: true, updatedAt: true } }),
  ]);
  const count = (status: DocumentIndexStatus) => groups
    .filter((group) => group.status === status)
    .reduce((sum, group) => sum + group._count._all, 0);
  const sourceCount = (sourceType: DocumentIndexSourceType) => groups
    .filter((group) => group.sourceType === sourceType)
    .reduce((sum, group) => sum + group._count._all, 0);
  return {
    totalFiles: primaryFiles + attachments,
    indexedRows: groups.reduce((sum, group) => sum + group._count._all, 0),
    missing: missingPrimary + missingAttachments,
    ready: count(DocumentIndexStatus.READY),
    pending: count(DocumentIndexStatus.PENDING),
    failed: count(DocumentIndexStatus.FAILED),
    ocrRequired: count(DocumentIndexStatus.OCR_REQUIRED),
    unsupported: count(DocumentIndexStatus.UNSUPPORTED),
    empty: count(DocumentIndexStatus.EMPTY),
    primary: sourceCount(DocumentIndexSourceType.PRIMARY),
    attachments: sourceCount(DocumentIndexSourceType.ATTACHMENT),
    lastIndexedAt: latest._max.indexedAt,
    lastChangedAt: latest._max.updatedAt,
  };
}

export async function queueDocumentSearchReindex(database: DocumentDatabase, actor: AuthUser) {
  requireIndexManagement(actor);
  const result = await database.documentSearchIndex.updateMany({
    where: {
      status: { in: [
        DocumentIndexStatus.READY,
        DocumentIndexStatus.EMPTY,
        DocumentIndexStatus.FAILED,
        DocumentIndexStatus.PENDING,
      ] },
    },
    data: {
      status: DocumentIndexStatus.PENDING,
      extractedText: null,
      errorCode: null,
      indexedAt: null,
    },
  });
  return result.count;
}

export async function retryFailedDocumentIndexes(database: DocumentDatabase, actor: AuthUser) {
  requireIndexManagement(actor);
  const actorName = `${actor.firstName} ${actor.lastName}`;
  return database.$transaction(async (transaction) => {
    const result = await transaction.documentSearchIndex.updateMany({
      where: { status: DocumentIndexStatus.FAILED },
      data: { status: DocumentIndexStatus.PENDING, extractedText: null, errorCode: null, indexedAt: null },
    });
    await transaction.auditLog.create({
      data: {
        userId: actor.id,
        userName: actorName,
        action: AuditAction.UPDATE,
        entityType: 'DocumentSearchIndex',
        entityId: 'failed-retry',
        details: `Queued ${result.count} failed document file index(es) for retry`,
      },
    });
    return result.count;
  });
}

export async function runManagedDocumentIndexBatch(
  database: DocumentDatabase,
  actor: AuthUser,
  run: () => Promise<number>,
) {
  requireIndexManagement(actor);
  const processed = await run();
  await database.auditLog.create({
    data: {
      userId: actor.id,
      userName: `${actor.firstName} ${actor.lastName}`,
      action: AuditAction.UPDATE,
      entityType: 'DocumentSearchIndex',
      entityId: 'manual-batch',
      details: `Ran a manual document search-index batch; processed ${processed} file(s)`,
    },
  });
  return processed;
}
