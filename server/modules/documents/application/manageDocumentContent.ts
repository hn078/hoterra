import {
  AuditAction,
  DocumentCategory,
  DocumentPriority,
  DocumentStatus,
  Prisma,
  WorkflowStatus,
} from '@prisma/client';
import type * as DatabaseModule from '../../../db';
import type { AuthUser } from '../../../middleware/auth';
import {
  DEFAULT_SIGNATURE_PLACEMENTS,
  parseSignaturePlacements,
  serializeSignaturePlacements,
} from '../domain/signaturePolicy';
import { isUsableTemplate } from '../../templates';
import {
  canAssignDocumentOwner,
  canCreateDocumentForDepartment,
  canUpdateDocument,
} from '../domain/documentPolicy';
import { canSubmitForReview } from '../domain/documentStateMachine';
import { queueDocumentApprovalNotification } from './queueDocumentApprovalNotification';
import { serializeDocumentAuditState } from './documentAuditState';

type DocumentDatabase = typeof DatabaseModule.prisma;
const EDITABLE_DOCUMENT_STATUSES = new Set<DocumentStatus>([
  DocumentStatus.DRAFT,
  DocumentStatus.NEEDS_REVIEW,
]);
export type DocumentContentErrorCode =
  | 'INVALID_INPUT'
  | 'INVALID_DEPARTMENT'
  | 'INVALID_REFERENCE'
  | 'INVALID_DATE'
  | 'INVALID_VERSION'
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'LOCKED'
  | 'INVALID_TRANSITION'
  | 'CONFLICT';

export class DocumentContentError extends Error {
  constructor(public readonly code: DocumentContentErrorCode) {
    super(code);
    this.name = 'DocumentContentError';
  }
}

export interface CreateDocumentInput {
  title?: unknown;
  code?: unknown;
  category?: unknown;
  departmentId?: unknown;
  description?: unknown;
  content?: unknown;
  version?: unknown;
  nextReviewDate?: unknown;
  effectiveDate?: unknown;
  ownerId?: unknown;
  language?: unknown;
  tags?: unknown;
  templateId?: unknown;
  workflowId?: unknown;
  priority?: unknown;
  allowDownload?: unknown;
  allowComments?: unknown;
  status?: unknown;
}

export interface UpdateDocumentInput {
  title?: unknown;
  description?: unknown;
  category?: unknown;
  status?: unknown;
  tags?: unknown;
  nextReviewDate?: unknown;
  effectiveDate?: unknown;
  version?: unknown;
}

function actorName(actor: AuthUser) {
  return `${actor.firstName} ${actor.lastName}`;
}

function optionalDate(value: unknown): Date | null {
  if (value === undefined || value === null || value === '') return null;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) throw new DocumentContentError('INVALID_DATE');
  return date;
}

function normalizeTags(value: unknown) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new DocumentContentError('INVALID_INPUT');
  return [...new Set(value.map(String).map((tag) => tag.trim()).filter(Boolean))]
    .slice(0, 50)
    .map((tag) => tag.slice(0, 100));
}

function requiredText(value: unknown, maxLength: number) {
  const text = String(value ?? '').trim();
  if (!text) throw new DocumentContentError('INVALID_INPUT');
  return text.slice(0, maxLength);
}

function validVersion(value: unknown) {
  const version = String(value || '1.0').trim();
  if (!/^\d+(?:\.\d+){0,2}$/.test(version)) throw new DocumentContentError('INVALID_VERSION');
  return version;
}

export async function createDocument(
  database: DocumentDatabase,
  actor: AuthUser,
  input: CreateDocumentInput,
) {
  const title = requiredText(input.title, 300);
  const departmentId = requiredText(input.departmentId, 100);
  const category = String(input.category || '') as DocumentCategory;
  if (!Object.values(DocumentCategory).includes(category)) throw new DocumentContentError('INVALID_INPUT');
  const priority = String(input.priority || DocumentPriority.MEDIUM) as DocumentPriority;
  if (!Object.values(DocumentPriority).includes(priority)) throw new DocumentContentError('INVALID_INPUT');
  const version = validVersion(input.version);
  const tags = normalizeTags(input.tags) ?? [];
  const nextReviewDate = optionalDate(input.nextReviewDate);
  const effectiveDate = optionalDate(input.effectiveDate);

  return database.$transaction(async (transaction) => {
    const department = await transaction.department.findFirst({ where: { id: departmentId, isActive: true } });
    if (!department) throw new DocumentContentError('INVALID_DEPARTMENT');
    if (!canCreateDocumentForDepartment(actor, department.tenantId, department.id)) {
      throw new DocumentContentError('FORBIDDEN');
    }

    const ownerId = String(input.ownerId || actor.id);
    const owner = await transaction.user.findUnique({ where: { id: ownerId } });
    if (!owner || !owner.isActive || !canAssignDocumentOwner(actor, owner)) {
      throw new DocumentContentError('FORBIDDEN');
    }

    const templateId = input.templateId ? String(input.templateId) : null;
    if (templateId && !actor.capabilities.includes('templates.read')) {
      throw new DocumentContentError('FORBIDDEN');
    }
    const template = templateId
      ? await transaction.template.findUnique({
          where: { id: templateId },
          select: {
            departmentId: true,
            status: true,
            isActive: true,
            content: true,
            signaturePlacement: true,
            pageCount: true,
          },
        })
      : null;
    if (templateId && (
      !template
      || !isUsableTemplate(template)
      || (template.departmentId && template.departmentId !== departmentId)
    )) {
      throw new DocumentContentError('INVALID_REFERENCE');
    }

    const workflowId = input.workflowId ? String(input.workflowId) : null;
    if (workflowId && !actor.capabilities.includes('workflows.read')) {
      throw new DocumentContentError('FORBIDDEN');
    }
    const workflow = workflowId
      ? await transaction.workflowRoute.findUnique({ where: { id: workflowId }, select: { status: true } })
      : null;
    if (workflowId && (!workflow || workflow.status !== WorkflowStatus.ACTIVE)) {
      throw new DocumentContentError('INVALID_REFERENCE');
    }

    let code = input.code ? requiredText(input.code, 100) : '';
    const lockKey = code
      ? `${actor.tenantId}:${code}:document-code`
      : `${actor.tenantId}:${departmentId}:${category}:document-code`;
    await transaction.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`);
    if (!code) {
      const count = await transaction.document.count({ where: { departmentId } });
      code = `${department.code}-${category.slice(0, 3)}-${String(count + 1).padStart(3, '0')}`;
    }
    if (await transaction.document.findFirst({ where: { code } })) {
      throw new DocumentContentError('CONFLICT');
    }

    const placements = template
      ? parseSignaturePlacements(template.signaturePlacement)
      : DEFAULT_SIGNATURE_PLACEMENTS;
    const document = await transaction.document.create({
      data: {
        title,
        code,
        category,
        departmentId,
        description: input.description === undefined ? null : String(input.description).trim().slice(0, 5000),
        content: input.content ? String(input.content) : (template?.content || null),
        version,
        nextReviewDate,
        effectiveDate,
        ownerId,
        authorId: actor.id,
        language: String(input.language || 'English').trim().slice(0, 100),
        tags: JSON.stringify(tags),
        templateId,
        workflowId,
        signaturePlacement: serializeSignaturePlacements(placements.length ? placements : DEFAULT_SIGNATURE_PLACEMENTS),
        pageCount: template?.pageCount || 1,
        priority,
        allowDownload: input.allowDownload !== false,
        allowComments: input.allowComments !== false,
        status: input.status === 'IN_REVIEW' ? DocumentStatus.IN_REVIEW : DocumentStatus.DRAFT,
      },
      include: {
        department: true,
        author: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    await transaction.documentHistory.create({
      data: { documentId: document.id, action: 'Created', userId: actor.id, userName: actorName(actor) },
    });
    await transaction.auditLog.create({
      data: {
        userId: actor.id,
        userName: actorName(actor),
        action: AuditAction.CREATE,
        entityType: 'Document',
        entityId: document.id,
        details: `Created "${document.title}" (${document.code})`,
        outcome: 'SUCCESS',
        reason: document.status === DocumentStatus.IN_REVIEW
          ? 'Document created and submitted for review'
          : 'Document draft created',
        afterState: serializeDocumentAuditState(document),
      },
    });
    if (document.status === DocumentStatus.IN_REVIEW) {
      await queueDocumentApprovalNotification(transaction, document);
    }
    return { document, tags };
  });
}

export async function updateDocument(
  database: DocumentDatabase,
  actor: AuthUser,
  documentId: string,
  input: UpdateDocumentInput,
) {
  return database.$transaction(async (transaction) => {
    const current = await transaction.document.findUnique({ where: { id: documentId } });
    if (!current) throw new DocumentContentError('NOT_FOUND');
    if (!canUpdateDocument(actor, current)) throw new DocumentContentError('FORBIDDEN');
    if (current.isLocked) throw new DocumentContentError('LOCKED');
    if (!EDITABLE_DOCUMENT_STATUSES.has(current.status)) {
      throw new DocumentContentError('LOCKED');
    }
    if (input.version !== undefined && String(input.version) !== current.version) {
      throw new DocumentContentError('INVALID_VERSION');
    }
    if (input.status !== undefined && !canSubmitForReview(current.status, String(input.status))) {
      throw new DocumentContentError('INVALID_TRANSITION');
    }

    const tags = normalizeTags(input.tags);
    const category = input.category === undefined ? undefined : String(input.category) as DocumentCategory;
    if (category !== undefined && !Object.values(DocumentCategory).includes(category)) {
      throw new DocumentContentError('INVALID_INPUT');
    }
    const data: Prisma.DocumentUpdateManyMutationInput = {
      ...(input.title !== undefined ? { title: requiredText(input.title, 300) } : {}),
      ...(input.description !== undefined ? { description: String(input.description).trim().slice(0, 5000) } : {}),
      ...(category !== undefined ? { category } : {}),
      ...(input.status !== undefined ? { status: DocumentStatus.IN_REVIEW } : {}),
      ...(tags !== undefined ? { tags: JSON.stringify(tags) } : {}),
      ...(input.nextReviewDate !== undefined ? { nextReviewDate: optionalDate(input.nextReviewDate) } : {}),
      ...(input.effectiveDate !== undefined ? { effectiveDate: optionalDate(input.effectiveDate) } : {}),
    };
    const result = await transaction.document.updateMany({
      where: { id: documentId, updatedAt: current.updatedAt, isLocked: false },
      data,
    });
    if (result.count === 0) throw new DocumentContentError('CONFLICT');

    await transaction.documentHistory.create({
      data: { documentId, action: 'Updated', userId: actor.id, userName: actorName(actor) },
    });
    const updated = await transaction.document.findUnique({
      where: { id: documentId },
      include: { department: true, author: true },
    });
    if (!updated) throw new DocumentContentError('NOT_FOUND');
    const changedFields = Object.keys(data).sort();
    await transaction.auditLog.create({
      data: {
        userId: actor.id,
        userName: actorName(actor),
        action: AuditAction.UPDATE,
        entityType: 'Document',
        entityId: documentId,
        details: `Updated "${current.title}"`,
        outcome: 'SUCCESS',
        reason: input.status !== undefined
          ? `Document updated and submitted for review; fields: ${changedFields.join(', ')}`
          : `Document fields updated: ${changedFields.join(', ')}`,
        beforeState: serializeDocumentAuditState(current),
        afterState: serializeDocumentAuditState(updated),
      },
    });
    if (input.status !== undefined && updated.status === DocumentStatus.IN_REVIEW) {
      await queueDocumentApprovalNotification(transaction, updated);
    }
    return updated;
  });
}
