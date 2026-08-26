import { type DocumentStatus, type Role } from '@prisma/client';
import type * as DatabaseModule from '../../../db';
import { resolveEffectiveCapabilities } from '../../access-control';
import { expectedSignerRole } from '../domain/signaturePolicy';

type DocumentDatabase = typeof DatabaseModule.prisma;
type ApprovalNotificationTransaction = Pick<DocumentDatabase, 'user' | 'notification'>;

type ApprovalNotificationDocument = {
  id: string;
  title: string;
  code: string;
  departmentId: string;
  status: DocumentStatus;
  approvalCycle: number;
};

/**
 * Queue the next document signer's in-app work item inside the caller's
 * transaction. System role alone is insufficient: an active custom role may
 * reduce approval access, so recipients are checked against effective
 * capabilities before any notification is written.
 */
export async function queueDocumentApprovalNotification(
  transaction: ApprovalNotificationTransaction,
  document: ApprovalNotificationDocument,
) {
  const signerRole = expectedSignerRole(document.status);
  if (!signerRole) return 0;

  const candidates = await transaction.user.findMany({
    where: {
      isActive: true,
      role: signerRole as Role,
      ...(signerRole === 'HOD' ? { departmentId: document.departmentId } : {}),
    },
    select: {
      id: true,
      role: true,
      customRole: { select: { permissions: true, isActive: true } },
    },
  });
  const recipients = candidates.filter((candidate) => {
    const capabilities = resolveEffectiveCapabilities(candidate.role, candidate.customRole);
    return capabilities.includes('documents.approve') && capabilities.includes('approvals.read');
  });
  if (recipients.length === 0) return 0;

  const result = await transaction.notification.createMany({
    skipDuplicates: true,
    data: recipients.map((recipient) => ({
      userId: recipient.id,
      title: 'Document approval required',
      message: `"${document.title}" (${document.code}) is waiting for your approval.`,
      type: 'document',
      link: `/approvals/${document.id}/review`,
      entityType: 'Document',
      entityId: document.id,
      actionType: 'DOCUMENT_APPROVAL',
      dedupeKey: `${recipient.id}:document:${document.id}:approval:${document.approvalCycle}:${document.status}`,
    })),
  });
  return result.count;
}
