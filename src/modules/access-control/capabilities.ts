import type { Role, User } from '@/types';

export const CAPABILITIES = [
  'dashboard.view',
  'documents.read',
  'documents.read.all',
  'documents.create',
  'documents.update',
  'documents.delete',
  'documents.export',
  'documents.archive',
  'documents.restore',
  'records.manage',
  'records.disposition.request',
  'records.disposition.approve',
  'documents.approve',
  'documents.sign',
  'approvals.read',
  'templates.read',
  'templates.manage',
  'departments.read',
  'departments.manage',
  'workflows.read',
  'workflows.manage',
  'users.directory.read',
  'users.create',
  'users.update',
  'users.deactivate',
  'users.password.reset',
  'roles.read',
  'roles.manage',
  'roles.assign.privileged',
  'workforce.read',
  'workforce.request.create',
  'workforce.templates.manage',
  'workforce.vendor.manage',
  'workforce.routes.manage',
  'workforce.reports.read',
  'workforce.reports.export',
  'workforce.settings.manage',
  'workforce.budget.manage',
  'workforce.invoice.manage',
  'reports.read',
  'reports.export',
  'audit.read',
  'audit.export',
  'settings.read',
  'settings.manage.business',
  'settings.manage.security',
  'notifications.read',
  'search.use',
  'messages.use',
] as const;

export type Capability = (typeof CAPABILITIES)[number];

const C = (...capabilities: Capability[]) => capabilities;

/**
 * Compatibility only for a session created before the backend started returning
 * effective capabilities. An explicitly returned empty array is authoritative.
 */
export const LEGACY_ROLE_CAPABILITIES: Record<Role, readonly Capability[]> = {
  SYSTEM_ADMINISTRATOR: C(
    'dashboard.view',
    'departments.read',
    'users.directory.read', 'users.create', 'users.update', 'users.deactivate', 'users.password.reset',
    'roles.read', 'roles.manage', 'roles.assign.privileged',
    'audit.read', 'audit.export',
    'settings.read', 'settings.manage.business', 'settings.manage.security',
    'notifications.read', 'search.use',
  ),
  GENERAL_MANAGER: C(
    'dashboard.view',
    'documents.read', 'documents.read.all', 'documents.create', 'documents.update',
    'documents.export', 'documents.archive', 'documents.restore',
    'records.manage', 'records.disposition.request', 'records.disposition.approve',
    'documents.approve', 'documents.sign', 'approvals.read',
    'templates.read', 'templates.manage',
    'departments.read', 'departments.manage',
    'workflows.read', 'workflows.manage',
    'users.directory.read', 'roles.read',
    'workforce.read', 'workforce.request.create', 'workforce.templates.manage', 'workforce.reports.read', 'workforce.reports.export', 'workforce.settings.manage', 'workforce.budget.manage',
    'reports.read', 'reports.export', 'audit.read',
    'settings.read', 'settings.manage.business',
    'notifications.read', 'search.use', 'messages.use',
  ),
  FINANCE_DIRECTOR: C(
    'dashboard.view',
    'documents.read', 'documents.read.all', 'documents.update', 'documents.export',
    'documents.approve', 'documents.sign', 'approvals.read',
    'templates.read', 'departments.read', 'workflows.read',
    'workforce.read', 'workforce.reports.read', 'workforce.reports.export', 'workforce.budget.manage', 'workforce.invoice.manage',
    'reports.read', 'reports.export',
    'notifications.read', 'search.use', 'messages.use',
  ),
  HOD: C(
    'dashboard.view',
    'documents.read', 'documents.create', 'documents.update',
    'documents.export', 'documents.archive', 'documents.restore',
    'records.disposition.request',
    'documents.approve', 'documents.sign', 'approvals.read',
    'templates.read', 'templates.manage', 'departments.read', 'workflows.read',
    'users.directory.read',
    'workforce.read', 'workforce.request.create', 'workforce.templates.manage', 'workforce.reports.read', 'workforce.reports.export',
    'notifications.read', 'search.use', 'messages.use',
  ),
  SUPERVISOR: C(
    'dashboard.view',
    'documents.read', 'documents.create', 'documents.update', 'approvals.read',
    'templates.read', 'departments.read', 'workflows.read',
    'notifications.read', 'search.use', 'messages.use',
  ),
  EMPLOYEE: C(
    'dashboard.view',
    'documents.read', 'documents.create', 'documents.update',
    'templates.read', 'departments.read', 'workflows.read',
    'notifications.read', 'search.use', 'messages.use',
  ),
};

export function effectiveCapabilities(user: User | null | undefined): readonly Capability[] {
  if (!user) return [];
  return user.capabilities === undefined
    ? LEGACY_ROLE_CAPABILITIES[user.role]
    : user.capabilities;
}

export function hasCapability(
  user: User | null | undefined,
  capability: Capability,
): boolean {
  return effectiveCapabilities(user).includes(capability);
}

export function hasEveryCapability(
  user: User | null | undefined,
  capabilities: readonly Capability[],
): boolean {
  return capabilities.every((capability) => hasCapability(user, capability));
}
