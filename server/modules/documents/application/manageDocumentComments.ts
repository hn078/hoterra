import { AuditAction, Prisma } from '@prisma/client';
import type * as DatabaseModule from '../../../db';
import type { AuthUser } from '../../../middleware/auth';
import {
  canCommentOnDocument,
  canDownloadDocument,
  canModerateDocumentComment,
  canReadDocument,
} from '../domain/documentPolicy';

type DocumentDatabase = typeof DatabaseModule.prisma;
export type DocumentCommentErrorCode = 'INVALID_INPUT' | 'NOT_FOUND' | 'FORBIDDEN';

export class DocumentCommentError extends Error {
  constructor(public readonly code: DocumentCommentErrorCode) {
    super(code);
    this.name = 'DocumentCommentError';
  }
}

const attachedDocumentSelect = {
  select: {
    id: true,
    tenantId: true,
    title: true,
    code: true,
    status: true,
    departmentId: true,
    authorId: true,
    ownerId: true,
  },
} as const;

const commentInclude = {
  user: { select: { id: true, firstName: true, lastName: true } },
  attachedDocument: attachedDocumentSelect,
} satisfies Prisma.DocumentCommentInclude;

type CommentWithRelations = Pick<
  Prisma.DocumentCommentGetPayload<object>,
  | 'id'
  | 'documentId'
  | 'userId'
  | 'text'
  | 'status'
  | 'createdAt'
  | 'attachmentFileName'
  | 'attachmentFilePath'
  | 'attachmentFileSize'
  | 'attachmentFileType'
> & {
  user: { id: string; firstName: string; lastName: string };
  attachedDocument: {
    id: string;
    tenantId: string;
    title: string;
    code: string;
    status: import('@prisma/client').DocumentStatus;
    departmentId: string;
    authorId: string;
    ownerId: string | null;
  } | null;
};

function actorName(actor: AuthUser) {
  return `${actor.firstName} ${actor.lastName}`;
}

export function toDocumentCommentDto(comment: CommentWithRelations, actor: AuthUser) {
  return {
    id: comment.id,
    documentId: comment.documentId,
    userId: comment.userId,
    user: comment.user,
    text: comment.text,
    status: comment.status,
    createdAt: comment.createdAt,
    attachedDocument:
      comment.attachedDocument && canReadDocument(actor, comment.attachedDocument)
        ? {
            id: comment.attachedDocument.id,
            title: comment.attachedDocument.title,
            code: comment.attachedDocument.code,
            status: comment.attachedDocument.status,
          }
        : null,
    fileAttachment:
      comment.attachmentFileName && comment.attachmentFilePath
        ? {
            fileName: comment.attachmentFileName,
            fileSize: comment.attachmentFileSize ?? 0,
            fileType: comment.attachmentFileType ?? null,
            downloadUrl: `/documents/${comment.documentId}/comments/${comment.id}/attachment`,
          }
        : null,
  };
}

export async function listDocumentComments(
  database: DocumentDatabase,
  actor: AuthUser,
  documentId: string,
) {
  const document = await database.document.findUnique({ where: { id: documentId } });
  if (!document || !canReadDocument(actor, document)) throw new DocumentCommentError('NOT_FOUND');
  const comments = await database.documentComment.findMany({
    where: { documentId },
    include: commentInclude,
    orderBy: { createdAt: 'desc' },
  });
  return comments.map((comment) => toDocumentCommentDto(comment, actor));
}

export async function addDocumentComment(
  database: DocumentDatabase,
  actor: AuthUser,
  documentId: string,
  input: {
    text?: string;
    attachedDocumentId?: string;
    file?: { fileName: string; filePath: string; fileSize: number; fileType: string };
  },
) {
  const text = input.text?.trim().slice(0, 5000) ?? '';
  if ((!text && !input.attachedDocumentId && !input.file) || (input.attachedDocumentId && input.file)) {
    throw new DocumentCommentError('INVALID_INPUT');
  }

  return database.$transaction(async (transaction) => {
    const document = await transaction.document.findUnique({ where: { id: documentId } });
    if (!document || !canCommentOnDocument(actor, document)) throw new DocumentCommentError('NOT_FOUND');
    if (input.attachedDocumentId) {
      const attached = await transaction.document.findUnique({ where: { id: input.attachedDocumentId } });
      if (!attached || !canReadDocument(actor, attached)) throw new DocumentCommentError('FORBIDDEN');
    }

    const comment = await transaction.documentComment.create({
      data: {
        documentId,
        userId: actor.id,
        text,
        ...(input.attachedDocumentId ? { attachedDocumentId: input.attachedDocumentId } : {}),
        ...(input.file ? {
          attachmentFileName: input.file.fileName,
          attachmentFilePath: input.file.filePath,
          attachmentFileSize: input.file.fileSize,
          attachmentFileType: input.file.fileType,
        } : {}),
      },
      include: commentInclude,
    });
    await transaction.auditLog.create({
      data: {
        userId: actor.id,
        userName: actorName(actor),
        action: AuditAction.CREATE,
        entityType: 'DocumentComment',
        entityId: comment.id,
        details: `Commented on "${document.title}"`,
      },
    });
    return toDocumentCommentDto(comment, actor);
  });
}

export async function moderateDocumentComment(
  database: DocumentDatabase,
  actor: AuthUser,
  documentId: string,
  commentId: string,
  status: string,
) {
  if (!['open', 'resolved'].includes(status)) throw new DocumentCommentError('INVALID_INPUT');
  return database.$transaction(async (transaction) => {
    const [document, current] = await Promise.all([
      transaction.document.findUnique({ where: { id: documentId } }),
      transaction.documentComment.findUnique({ where: { id: commentId } }),
    ]);
    if (!document || !current || current.documentId !== documentId) throw new DocumentCommentError('NOT_FOUND');
    if (!canModerateDocumentComment(actor, document, current)) throw new DocumentCommentError('FORBIDDEN');

    const comment = await transaction.documentComment.update({
      where: { id: commentId },
      data: { status },
      include: commentInclude,
    });
    await transaction.auditLog.create({
      data: {
        userId: actor.id,
        userName: actorName(actor),
        action: AuditAction.UPDATE,
        entityType: 'DocumentComment',
        entityId: commentId,
        details: `Marked comment as ${status} on "${document.title}"`,
      },
    });
    return toDocumentCommentDto(comment, actor);
  });
}

export async function getDocumentCommentAttachment(
  database: DocumentDatabase,
  actor: AuthUser,
  documentId: string,
  commentId: string,
) {
  const [document, comment] = await Promise.all([
    database.document.findUnique({ where: { id: documentId } }),
    database.documentComment.findUnique({ where: { id: commentId } }),
  ]);
  if (
    !document || !comment || comment.documentId !== documentId ||
    !comment.attachmentFilePath || !comment.attachmentFileName ||
    !canDownloadDocument(actor, document)
  ) {
    throw new DocumentCommentError('NOT_FOUND');
  }
  return { filePath: comment.attachmentFilePath, fileName: comment.attachmentFileName };
}
