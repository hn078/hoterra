import type * as DatabaseModule from '../../../db';
import type { AuthUser } from '../../../middleware/auth';
import { canDownloadDocument, canReadDocument } from '../domain/documentPolicy';

type DocumentDatabase = typeof DatabaseModule.prisma;

export class DocumentFileError extends Error {
  constructor() {
    super('NOT_FOUND');
    this.name = 'DocumentFileError';
  }
}

const documentPolicySelect = {
  tenantId: true,
  departmentId: true,
  authorId: true,
  ownerId: true,
  status: true,
  allowDownload: true,
} as const;

export async function getPrimaryDocumentFile(
  database: DocumentDatabase,
  actor: AuthUser,
  documentId: string,
) {
  const document = await database.document.findFirst({
    where: { id: documentId, tenantId: actor.tenantId },
    select: { ...documentPolicySelect, filePath: true, fileName: true },
  });
  if (!document?.filePath || !canDownloadDocument(actor, document)) throw new DocumentFileError();
  return { filePath: document.filePath, fileName: document.fileName, inline: false };
}

export async function getDocumentAttachmentFile(
  database: DocumentDatabase,
  actor: AuthUser,
  documentId: string,
  attachmentId: string,
) {
  const document = await database.document.findFirst({
    where: { id: documentId, tenantId: actor.tenantId },
    select: {
      ...documentPolicySelect,
      attachments: {
        where: { id: attachmentId },
        select: { id: true, filePath: true, fileName: true },
        take: 1,
      },
    },
  });
  const attachment = document?.attachments[0];
  if (!document || !attachment || !canDownloadDocument(actor, document)) throw new DocumentFileError();
  return { filePath: attachment.filePath, fileName: attachment.fileName, inline: false };
}

export async function getDocumentSignatureEvidenceFile(
  database: DocumentDatabase,
  actor: AuthUser,
  signatureId: string,
) {
  const signature = await database.signature.findFirst({
    where: { id: signatureId, document: { tenantId: actor.tenantId } },
    select: {
      imagePath: true,
      document: { select: documentPolicySelect },
    },
  });
  if (!signature?.imagePath || !canReadDocument(actor, signature.document)) throw new DocumentFileError();
  return { filePath: signature.imagePath, fileName: null, inline: true };
}
