export type ApprovalDocumentStatus =
  | 'IN_REVIEW'
  | 'SIGNED_HOD'
  | 'SIGNED_FINANCE'
  | 'SIGNED_GM'
  | 'PUBLISHED';

/**
 * One approval transition per human role. SIGNED_GM is accepted as a legacy
 * pre-publication state, but newly processed documents publish after the GM
 * approves SIGNED_FINANCE.
 */
export function nextApprovalStatus(status: string): ApprovalDocumentStatus | null {
  const flow: Record<string, ApprovalDocumentStatus> = {
    IN_REVIEW: 'SIGNED_HOD',
    SIGNED_HOD: 'SIGNED_FINANCE',
    SIGNED_FINANCE: 'PUBLISHED',
    SIGNED_GM: 'PUBLISHED',
  };
  return flow[status] ?? null;
}

export function canSubmitForReview(currentStatus: string, requestedStatus: string): boolean {
  return (
    requestedStatus === 'IN_REVIEW' &&
    (currentStatus === 'DRAFT' || currentStatus === 'NEEDS_REVIEW')
  );
}
