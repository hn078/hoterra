/**
 * Document authorization is deliberately kept independent from Express and
 * Prisma. HTTP adapters pass the authenticated actor and the minimum document
 * projection needed for a decision.
 */

export type DocumentPolicyRole =
  | 'EMPLOYEE'
  | 'SUPERVISOR'
  | 'HOD'
  | 'FINANCE_DIRECTOR'
  | 'GENERAL_MANAGER'
  | 'SYSTEM_ADMINISTRATOR';

export interface DocumentActor {
  id: string;
  tenantId: string;
  role: DocumentPolicyRole;
  departmentId?: string | null;
  capabilities: readonly string[];
}

export interface DocumentResource {
  tenantId: string;
  departmentId: string;
  authorId: string;
  ownerId?: string | null;
  status: string;
  isLocked?: boolean;
  allowDownload?: boolean;
  allowComments?: boolean;
}

export interface DocumentCommentResource {
  userId: string;
}

function hasCapability(actor: DocumentActor, capability: string): boolean {
  return actor.capabilities.includes(capability);
}

function isSameTenant(actor: DocumentActor, document: DocumentResource): boolean {
  return Boolean(actor.tenantId) && actor.tenantId === document.tenantId;
}

function isHotelWideReader(actor: DocumentActor): boolean {
  return hasCapability(actor, 'documents.read.all');
}

function isDocumentPrincipal(actor: DocumentActor, document: DocumentResource): boolean {
  return document.authorId === actor.id || document.ownerId === actor.id;
}

function isDepartmentMember(actor: DocumentActor, document: DocumentResource): boolean {
  return Boolean(actor.departmentId) && actor.departmentId === document.departmentId;
}

/** Published hotel policies are part of the tenant-wide read audience. */
export function canReadDocument(actor: DocumentActor, document: DocumentResource): boolean {
  if (!isSameTenant(actor, document) || !hasCapability(actor, 'documents.read')) return false;
  return (
    isHotelWideReader(actor) ||
    isDocumentPrincipal(actor, document) ||
    isDepartmentMember(actor, document) ||
    document.status === 'PUBLISHED'
  );
}

export function canCreateDocumentForDepartment(
  actor: DocumentActor,
  tenantId: string,
  departmentId: string,
): boolean {
  if (actor.tenantId !== tenantId || !hasCapability(actor, 'documents.create')) return false;
  if (actor.role === 'SYSTEM_ADMINISTRATOR' || actor.role === 'GENERAL_MANAGER') return true;
  return Boolean(actor.departmentId) && actor.departmentId === departmentId;
}

export function canAssignDocumentOwner(
  actor: DocumentActor,
  owner: { tenantId: string; id: string; departmentId?: string | null },
): boolean {
  if (actor.tenantId !== owner.tenantId) return false;
  if (actor.role === 'SYSTEM_ADMINISTRATOR' || actor.role === 'GENERAL_MANAGER') return true;
  return owner.id === actor.id || (
    Boolean(actor.departmentId) && actor.departmentId === owner.departmentId
  );
}

/**
 * Editing scope is narrower than read scope: published visibility never grants
 * mutation rights. OwnerId is the current explicit document assignment.
 */
export function canUpdateDocument(actor: DocumentActor, document: DocumentResource): boolean {
  if (!isSameTenant(actor, document) || !hasCapability(actor, 'documents.update')) return false;
  if (actor.role === 'SYSTEM_ADMINISTRATOR' || actor.role === 'GENERAL_MANAGER') return true;
  if (isDocumentPrincipal(actor, document)) return true;
  return (
    (actor.role === 'HOD' || actor.role === 'SUPERVISOR') &&
    isDepartmentMember(actor, document)
  );
}

export function canArchiveDocument(actor: DocumentActor, document: DocumentResource): boolean {
  if (!isSameTenant(actor, document) || !hasCapability(actor, 'documents.archive')) return false;
  if (actor.role === 'SYSTEM_ADMINISTRATOR' || actor.role === 'GENERAL_MANAGER') return true;
  return actor.role === 'HOD' && isDepartmentMember(actor, document);
}

export function canRestoreDocument(actor: DocumentActor, document: DocumentResource): boolean {
  if (!isSameTenant(actor, document) || !hasCapability(actor, 'documents.restore')) return false;
  if (actor.role === 'SYSTEM_ADMINISTRATOR' || actor.role === 'GENERAL_MANAGER') return true;
  return actor.role === 'HOD' && isDepartmentMember(actor, document);
}

export function canDeleteDocument(actor: DocumentActor, document: DocumentResource): boolean {
  if (!isSameTenant(actor, document) || !hasCapability(actor, 'documents.delete')) return false;
  return actor.role === 'SYSTEM_ADMINISTRATOR' || actor.role === 'GENERAL_MANAGER';
}

export function canExportDocument(actor: DocumentActor, document: DocumentResource): boolean {
  return hasCapability(actor, 'documents.export') && canReadDocument(actor, document);
}

export function canDownloadDocument(actor: DocumentActor, document: DocumentResource): boolean {
  return document.allowDownload !== false && canReadDocument(actor, document);
}

export function canCommentOnDocument(actor: DocumentActor, document: DocumentResource): boolean {
  return document.allowComments !== false && canReadDocument(actor, document);
}

export function canFavoriteDocument(actor: DocumentActor, document: DocumentResource): boolean {
  return canReadDocument(actor, document);
}

export function canModerateDocumentComment(
  actor: DocumentActor,
  document: DocumentResource,
  comment: DocumentCommentResource,
): boolean {
  if (!canCommentOnDocument(actor, document)) return false;
  return comment.userId === actor.id || canUpdateDocument(actor, document);
}

/**
 * Workflow role participation is additionally object-scoped. Hotel-wide
 * Finance/GM steps can act across departments; an HOD step is restricted to
 * that HOD's department. System administrators remain an audited emergency
 * override.
 */
export function canActOnDocumentWorkflow(
  actor: DocumentActor,
  document: DocumentResource,
  expectedRole: DocumentPolicyRole | null,
  capability: 'documents.approve' | 'documents.sign',
): boolean {
  if (!isSameTenant(actor, document) || !hasCapability(actor, capability) || !expectedRole) {
    return false;
  }
  if (actor.role === 'SYSTEM_ADMINISTRATOR') return true;
  if (actor.role !== expectedRole) return false;
  return expectedRole !== 'HOD' || isDepartmentMember(actor, document);
}

/** Prisma-compatible predicate used by list/export adapters. */
export function documentReadScope(actor: DocumentActor): Record<string, unknown> {
  if (!hasCapability(actor, 'documents.read')) return { id: '__forbidden__' };
  if (isHotelWideReader(actor)) return { tenantId: actor.tenantId };

  const scope: Record<string, unknown>[] = [
    { authorId: actor.id },
    { ownerId: actor.id },
    { status: 'PUBLISHED' },
  ];
  if (actor.departmentId) scope.push({ departmentId: actor.departmentId });
  return { tenantId: actor.tenantId, OR: scope };
}

/**
 * Dashboard responsibility is intentionally narrower than the general read
 * audience. Tenant-wide published visibility must not turn another
 * department's activity, review dates, or counts into an employee's work feed.
 */
export function documentDashboardScope(actor: DocumentActor): Record<string, unknown> {
  if (!hasCapability(actor, 'documents.read')) return { id: '__forbidden__' };
  if (isHotelWideReader(actor)) return { tenantId: actor.tenantId };

  const related: Record<string, unknown>[] = [
    { authorId: actor.id },
    { ownerId: actor.id },
  ];
  if (actor.departmentId) related.push({ departmentId: actor.departmentId });
  return { tenantId: actor.tenantId, OR: related };
}

/** Prisma-compatible predicate for workflow items awaiting this actor now. */
export function documentApprovalActionScope(actor: DocumentActor): Record<string, unknown> {
  if (!hasCapability(actor, 'documents.approve') || !hasCapability(actor, 'approvals.read')) {
    return { id: '__forbidden__' };
  }

  if (actor.role === 'SYSTEM_ADMINISTRATOR') {
    return {
      tenantId: actor.tenantId,
      status: { in: ['IN_REVIEW', 'SIGNED_HOD', 'SIGNED_FINANCE', 'SIGNED_GM'] },
    };
  }
  if (actor.role === 'HOD' && actor.departmentId) {
    return { tenantId: actor.tenantId, departmentId: actor.departmentId, status: 'IN_REVIEW' };
  }
  if (actor.role === 'FINANCE_DIRECTOR') {
    return { tenantId: actor.tenantId, status: 'SIGNED_HOD' };
  }
  if (actor.role === 'GENERAL_MANAGER') {
    return { tenantId: actor.tenantId, status: { in: ['SIGNED_FINANCE', 'SIGNED_GM'] } };
  }
  return { id: '__forbidden__' };
}
