import { AuditAction, DocumentStatus } from '@prisma/client';
import type * as DatabaseModule from '../../../db';
import type { AuthUser } from '../../../middleware/auth';
import { auditStateDigest, serializeAuditState } from '../../audit';
import { canUpdateDocument } from '../domain/documentPolicy';
import { serializeDocumentAuditState } from './documentAuditState';

type DocumentDatabase = typeof DatabaseModule.prisma;
const FILE_EDITABLE_STATUSES = new Set<DocumentStatus>([
  DocumentStatus.DRAFT,
  DocumentStatus.NEEDS_REVIEW,
]);
export interface StoredDocumentFile {
  fileName: string;
  filePath: string;
  fileSize: number;
  fileType: string;
}

export interface DocumentFileStorage {
  save(): StoredDocumentFile | Promise<StoredDocumentFile>;
  remove(filePath: string): void | Promise<void>;
}

export type DocumentUploadErrorCode = 'INVALID_INPUT' | 'NOT_FOUND' | 'FORBIDDEN' | 'LOCKED' | 'CONFLICT';

export class DocumentUploadError extends Error {
  constructor(public readonly code: DocumentUploadErrorCode) {
    super(code);
    this.name = 'DocumentUploadError';
  }
}

/** Coordinates tenant storage with an atomic document/attachment database update. */
export async function uploadDocumentFile(
  database: DocumentDatabase,
  actor: AuthUser,
  documentId: string,
  input: { isAttachment?: boolean },
  storage: DocumentFileStorage,
) {
  let saved: StoredDocumentFile | undefined;
  let previousFilePath: string | null = null;
  try {
    const result = await database.$transaction(async (transaction) => {
      const current = await transaction.document.findUnique({ where: { id: documentId } });
      if (!current) throw new DocumentUploadError('NOT_FOUND');
      if (!canUpdateDocument(actor, current)) throw new DocumentUploadError('FORBIDDEN');
      if (current.isLocked) throw new DocumentUploadError('LOCKED');
      if (!FILE_EDITABLE_STATUSES.has(current.status)) {
        throw new DocumentUploadError('LOCKED');
      }

      saved = await storage.save();
      if (!saved.fileName || !saved.filePath) throw new DocumentUploadError('INVALID_INPUT');
      const actorName = `${actor.firstName} ${actor.lastName}`;

      if (input.isAttachment) {
        const attachment = await transaction.documentAttachment.create({
          data: {
            documentId,
            fileName: saved.fileName,
            filePath: saved.filePath,
            fileSize: saved.fileSize,
            fileType: saved.fileType,
          },
        });
        await transaction.documentHistory.create({
          data: { documentId, action: `Attachment uploaded: ${saved.fileName}`, userId: actor.id, userName: actorName },
        });
        await transaction.auditLog.create({
          data: {
            userId: actor.id,
            userName: actorName,
            action: AuditAction.CREATE,
            entityType: 'DocumentAttachment',
            entityId: attachment.id,
            details: `Uploaded attachment "${saved.fileName}" to "${current.title}"`,
            outcome: 'SUCCESS',
            reason: 'Authorized document attachment upload',
            afterState: serializeAuditState({
              id: attachment.id,
              documentId,
              fileNameDigest: auditStateDigest(attachment.fileName),
              fileSize: attachment.fileSize,
              fileType: attachment.fileType,
            }),
          },
        });
        return { kind: 'attachment' as const, attachment };
      }

      previousFilePath = current.filePath;
      const update = await transaction.document.updateMany({
        where: { id: documentId, updatedAt: current.updatedAt, isLocked: false },
        data: {
          fileName: saved.fileName,
          filePath: saved.filePath,
          fileType: saved.fileType,
          fileSize: saved.fileSize,
        },
      });
      if (update.count === 0) throw new DocumentUploadError('CONFLICT');
      await transaction.documentHistory.create({
        data: { documentId, action: `Primary file uploaded: ${saved.fileName}`, userId: actor.id, userName: actorName },
      });
      const document = await transaction.document.findUnique({ where: { id: documentId } });
      if (!document) throw new DocumentUploadError('NOT_FOUND');
      await transaction.auditLog.create({
        data: {
          userId: actor.id,
          userName: actorName,
          action: AuditAction.UPDATE,
          entityType: 'Document',
          entityId: documentId,
          details: `Replaced primary file for "${current.title}" with "${saved.fileName}"`,
          outcome: 'SUCCESS',
          reason: previousFilePath ? 'Primary document file replaced' : 'Primary document file uploaded',
          beforeState: serializeDocumentAuditState(current),
          afterState: serializeDocumentAuditState(document),
        },
      });
      return { kind: 'document' as const, document };
    });

    if (result.kind === 'document' && previousFilePath && previousFilePath !== saved?.filePath) {
      try { await storage.remove(previousFilePath); } catch { /* DB points to the new file; old-file cleanup is best effort */ }
    }
    return result;
  } catch (error) {
    if (saved?.filePath) {
      try { await storage.remove(saved.filePath); } catch { /* preserve original failure */ }
    }
    throw error;
  }
}
