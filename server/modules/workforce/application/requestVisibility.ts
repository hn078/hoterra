import { Role, WorkforceRequestStatus } from '@prisma/client';
import type { AuthUser } from '../../../middleware/auth';

export interface WorkforceRequestVisibilityRecord {
  createdById: string;
  departmentId: string;
  status: WorkforceRequestStatus;
}

export interface WorkforceVisibilityContext {
  isProcurementViewer?: boolean;
  isCurrentApprover?: boolean;
  hasParticipated?: boolean;
}

const TENANT_OVERSIGHT_ROLES: Role[] = [
  Role.GENERAL_MANAGER,
  Role.FINANCE_DIRECTOR,
];

/**
 * Workforce visibility policy. Capability answers "may use workforce" while
 * this function answers "which request may this user see".
 */
export function canViewWorkforceRequest(
  user: AuthUser,
  request: WorkforceRequestVisibilityRecord,
  context: WorkforceVisibilityContext = {},
): boolean {
  if (!user.capabilities.includes('workforce.read')) return false;
  if (TENANT_OVERSIGHT_ROLES.includes(user.role)) return true;
  if (context.isProcurementViewer) return true;
  if (request.createdById === user.id) return true;
  if (context.isCurrentApprover || context.hasParticipated) return true;

  return (user.role === Role.HOD || user.role === Role.SUPERVISOR) &&
    Boolean(user.departmentId) &&
    user.departmentId === request.departmentId;
}
