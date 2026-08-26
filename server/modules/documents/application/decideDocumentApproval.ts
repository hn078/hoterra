import { AuditAction, DocumentStatus, type Role } from '@prisma/client';
import type * as DatabaseModule from '../../../db';
import type { AuthUser } from '../../../middleware/auth';
import {
  expectedSignerRole,
  parseSignaturePlacements,
  PENDING_APPROVAL_STATUSES,
} from '../domain/signaturePolicy';
import { canActOnDocumentWorkflow } from '../domain/documentPolicy';
import { nextApprovalStatus } from '../domain/documentStateMachine';
import { queueDocumentApprovalNotification } from './queueDocumentApprovalNotification';
import { serializeDocumentAuditState } from './documentAuditState';

type DocumentDatabase = typeof DatabaseModule.prisma;
export type DocumentApprovalAction = 'approve' | 'reject' | 'request_changes';
export type DocumentApprovalErrorCode =
  | 'NOT_FOUND'
  | 'INVALID_ACTION'
  | 'INVALID_STATE'
  | 'FORBIDDEN'
  | 'SIGNATURE_REQUIRED'
  | 'CONFLICT';

export class DocumentApprovalError extends Error {
  constructor(
    public readonly code: DocumentApprovalErrorCode,
    public readonly expectedRole: Role | null = null,
  ) {
    super(code);
    this.name = 'DocumentApprovalError';
  }
}

function decision(action: DocumentApprovalAction, status: DocumentStatus) {
  if (action === 'reject') {
    return { status: DocumentStatus.REJECTED, historyAction: 'Rejected' };
  }
  if (action === 'request_changes') {
    return { status: DocumentStatus.NEEDS_REVIEW, historyAction: 'Returned for changes' };
  }
  const nextStatus = nextApprovalStatus(status);
  if (!nextStatus) throw new DocumentApprovalError('INVALID_STATE');
  return { status: nextStatus as DocumentStatus, historyAction: 'Approved' };
}

/** Atomic document workflow decision, evidence check, audit, history, and notification. */
export async function decideDocumentApproval(
  database: DocumentDatabase,
  actor: AuthUser,
  documentId: string,
  input: { action: DocumentApprovalAction; comment?: string },
) {
  if (!['approve', 'reject', 'request_changes'].includes(input.action)) {
    throw new DocumentApprovalError('INVALID_ACTION');
  }
  const comment = input.comment?.trim().slice(0, 2000) || undefined;

  return database.$transaction(async (transaction) => {
    const current = await transaction.document.findUnique({
      where: { id: documentId },
      include: { signatures: true },
    });
    if (!current) throw new DocumentApprovalError('NOT_FOUND');
    if (!PENDING_APPROVAL_STATUSES.includes(current.status)) {
      throw new DocumentApprovalError('INVALID_STATE');
    }

    const currentExpectedRole = expectedSignerRole(current.status);
    if (!canActOnDocumentWorkflow(actor, current, currentExpectedRole, 'documents.approve')) {
      throw new DocumentApprovalError('FORBIDDEN', currentExpectedRole);
    }

    const next = decision(input.action, current.status);
    if (input.action === 'approve') {
      const placements = parseSignaturePlacements(current.signaturePlacement);
      const placement = placements.find((item) => item.role === currentExpectedRole);
      const hasCurrentSignature = current.signatures.some((signature) =>
        signature.documentVersion === current.version &&
        signature.approvalCycle === current.approvalCycle &&
        (placement ? signature.placementId === placement.id : signature.userId === actor.id)
      );
      if (!hasCurrentSignature) throw new DocumentApprovalError('SIGNATURE_REQUIRED');
    }

    const update = await transaction.document.updateMany({
      where: { id: documentId, status: current.status },
      data: {
        status: next.status,
        ...(input.action === 'request_changes' ? { approvalCycle: { increment: 1 } } : {}),
        ...(next.status === DocumentStatus.PUBLISHED ? { isLocked: true } : {}),
      },
    });
    if (update.count === 0) throw new DocumentApprovalError('CONFLICT');

    await transaction.notification.updateMany({
      where: {
        userId: actor.id,
        entityType: 'Document',
        entityId: documentId,
        actionType: 'DOCUMENT_APPROVAL',
        actionCompletedAt: null,
      },
      data: {
        isRead: true,
        actionCompletedAt: new Date(),
        actionCompletedById: actor.id,
        actionCompletedByName: `${actor.firstName} ${actor.lastName}`,
      },
    });

    const actorName = `${actor.firstName} ${actor.lastName}`;
    await transaction.documentHistory.create({
      data: {
        documentId,
        action: next.historyAction,
        details: comment,
        userId: actor.id,
        userName: actorName,
      },
    });
    if (current.authorId !== actor.id) {
      await transaction.notification.create({
        data: {
          userId: current.authorId,
          title: `Document ${next.historyAction.toLowerCase()}`,
          message: `"${current.title}" was ${next.historyAction.toLowerCase()} by ${actorName}`,
          type: 'document',
          link: `/documents/${documentId}`,
          entityType: 'Document',
          entityId: documentId,
          actionType: input.action === 'request_changes' ? 'DOCUMENT_REVISION' : null,
        },
      });
    }

    const updated = await transaction.document.findUnique({
      where: { id: documentId },
      include: {
        department: true,
        author: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    if (!updated) throw new DocumentApprovalError('NOT_FOUND');
    await transaction.auditLog.create({
      data: {
        userId: actor.id,
        userName: actorName,
        action: input.action === 'approve' ? AuditAction.APPROVE : AuditAction.REJECT,
        entityType: 'Document',
        entityId: documentId,
        details: `${next.historyAction}: ${current.title}${comment ? ` — ${comment}` : ''}`,
        outcome: 'SUCCESS',
        reason: comment || `Authorized document decision: ${input.action}`,
        beforeState: serializeDocumentAuditState(current),
        afterState: serializeDocumentAuditState(updated),
      },
    });
    if (input.action === 'approve') {
      await queueDocumentApprovalNotification(transaction, updated);
    }
    return updated;
  });
}
