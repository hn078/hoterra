export type IdentityRole =
  | 'EMPLOYEE'
  | 'SUPERVISOR'
  | 'HOD'
  | 'FINANCE_DIRECTOR'
  | 'GENERAL_MANAGER'
  | 'SYSTEM_ADMINISTRATOR';

export interface AccountActor {
  id: string;
  role: IdentityRole;
}

export interface ManagedAccount {
  id: string;
  role: IdentityRole;
  customRoleId: string | null;
  isActive: boolean;
}

export interface AccountMutation {
  nextRole?: IdentityRole;
  nextCustomRoleId?: string | null;
  nextIsActive?: boolean;
}

export type AccountMutationDecision =
  | { allowed: true }
  | { allowed: false; status: 400 | 403; error: string };

/**
 * Domain-level account hierarchy. Capabilities decide whether an actor may
 * administer users at all; this policy protects privileged targets and the
 * actor's own account from unsafe lifecycle changes.
 */
export function authorizeAccountMutation(
  actor: AccountActor,
  target: ManagedAccount,
  mutation: AccountMutation = {},
): AccountMutationDecision {
  if (
    (target.role === 'SYSTEM_ADMINISTRATOR' || target.role === 'GENERAL_MANAGER')
    && actor.role !== 'SYSTEM_ADMINISTRATOR'
  ) {
    return {
      allowed: false,
      status: 403,
      error: 'Only a System Administrator can modify an executive account',
    };
  }

  if (actor.id !== target.id) return { allowed: true };

  if (mutation.nextIsActive === false) {
    return { allowed: false, status: 400, error: 'You cannot deactivate your own account' };
  }

  const changesRole = mutation.nextRole !== undefined && mutation.nextRole !== target.role;
  const changesCustomRole = mutation.nextCustomRoleId !== undefined
    && mutation.nextCustomRoleId !== target.customRoleId;
  if (changesRole || changesCustomRole) {
    return {
      allowed: false,
      status: 400,
      error: 'You cannot change your own role assignment',
    };
  }

  return { allowed: true };
}

export function canAssignSystemAdministrator(actor: AccountActor): boolean {
  return actor.role === 'SYSTEM_ADMINISTRATOR';
}

export function canAssignPrivilegedRole(actor: AccountActor, role: IdentityRole): boolean {
  if (role !== 'SYSTEM_ADMINISTRATOR' && role !== 'GENERAL_MANAGER') return true;
  return canAssignSystemAdministrator(actor);
}
