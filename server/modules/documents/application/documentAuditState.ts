import { auditStateDigest, serializeAuditState } from '../../audit';

function tags(value: unknown) {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return Array.isArray(parsed) ? parsed.map(String).sort() : [];
  } catch {
    return [];
  }
}

/**
 * Explicit document evidence projection. Full document bodies, descriptions,
 * file names and storage paths are deliberately replaced by bounded metadata
 * and digests so AuditLog does not become a second content repository.
 */
export function documentAuditState(document: any) {
  return {
    id: document.id,
    title: document.title,
    code: document.code,
    version: document.version,
    status: document.status,
    category: document.category,
    priority: document.priority,
    language: document.language,
    tags: tags(document.tags),
    departmentId: document.departmentId,
    authorId: document.authorId,
    ownerId: document.ownerId,
    templateId: document.templateId,
    workflowId: document.workflowId,
    nextReviewDate: document.nextReviewDate,
    effectiveDate: document.effectiveDate,
    allowDownload: document.allowDownload,
    allowComments: document.allowComments,
    isLocked: document.isLocked,
    approvalCycle: document.approvalCycle,
    pageCount: document.pageCount,
    descriptionPresent: Boolean(document.description),
    descriptionLength: typeof document.description === 'string' ? document.description.length : 0,
    descriptionDigest: auditStateDigest(document.description),
    contentPresent: Boolean(document.content),
    contentLength: typeof document.content === 'string' ? document.content.length : 0,
    contentDigest: auditStateDigest(document.content),
    signaturePlacementDigest: auditStateDigest(String(document.signaturePlacement || '[]')),
    primaryFilePresent: Boolean(document.filePath),
    primaryFileNameDigest: auditStateDigest(document.fileName),
    primaryFileType: document.fileType,
    primaryFileSize: document.fileSize,
    archiveReason: document.archiveReason,
    archivedAt: document.archivedAt,
    archivedBy: document.archivedBy,
    retentionPolicyId: document.retentionPolicyId,
    retentionUntil: document.retentionUntil,
  };
}

export function serializeDocumentAuditState(document: any) {
  return serializeAuditState(documentAuditState(document));
}
