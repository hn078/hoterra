import { Role } from '@prisma/client';
import { CAPABILITIES, type Capability } from '../domain/capability';

type PermissionMatrix = Record<string, boolean[]>;

const C = (...capabilities: Capability[]) => capabilities;

export const SYSTEM_ROLE_CAPABILITIES: Record<Role, readonly Capability[]> = {
  // A technical administrator owns tenant identity and infrastructure, not hotel
  // business decisions. Keeping approval/signing and Workforce operations out of
  // this role prevents an IT account from becoming an implicit business signer.
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

const MODULE_CAPABILITIES: Record<string, Partial<Record<number, readonly Capability[]>>> = {
  Dashboard: {
    1: C('dashboard.view'), 2: C('dashboard.view'), 5: C('reports.export'), 6: C('dashboard.view'),
  },
  Documents: {
    1: C('documents.create'), 2: C('documents.read'), 3: C('documents.update'),
    4: C('documents.delete'), 5: C('documents.export'),
    6: C('documents.approve', 'documents.sign', 'documents.archive', 'documents.restore', 'approvals.read'),
  },
  'Records Management': {
    2: C('documents.archive'),
    3: C('records.manage'),
    4: C('records.disposition.request'),
    6: C('records.manage', 'records.disposition.request', 'records.disposition.approve'),
  },
  Templates: {
    1: C('templates.manage'), 2: C('templates.read'), 3: C('templates.manage'),
    4: C('templates.manage'), 5: C('templates.read'), 6: C('templates.manage'),
  },
  Departments: {
    1: C('departments.manage'), 2: C('departments.read'), 3: C('departments.manage'),
    4: C('departments.manage'), 5: C('departments.read'), 6: C('departments.manage'),
  },
  Workflows: {
    1: C('workflows.manage'), 2: C('workflows.read'), 3: C('workflows.manage'),
    4: C('workflows.manage'), 5: C('workflows.read'), 6: C('workflows.manage'),
  },
  'Users & Roles': {
    1: C('users.create'), 2: C('users.directory.read', 'roles.read'),
    3: C('users.update'), 4: C('users.deactivate'), 5: C('users.directory.read'),
    6: C('roles.manage', 'users.password.reset'),
  },
  'Casual Workforce': {
    1: C('workforce.request.create', 'workforce.templates.manage'), 2: C('workforce.read'),
    3: C('workforce.vendor.manage'), 4: C('workforce.vendor.manage'),
    5: C('workforce.reports.read', 'workforce.reports.export'),
    6: C('workforce.templates.manage', 'workforce.vendor.manage', 'workforce.routes.manage', 'workforce.settings.manage', 'workforce.budget.manage', 'workforce.invoice.manage'),
  },
  Reports: {
    1: C('reports.read'), 2: C('reports.read'), 3: C('reports.read'),
    4: C('reports.read'), 5: C('reports.export'), 6: C('reports.read'),
  },
  Settings: {
    1: C('settings.manage.business'), 2: C('settings.read'), 3: C('settings.manage.business'),
    4: C('settings.manage.business'), 5: C('settings.read'), 6: C('settings.manage.business'),
  },
};

const FULL_ACCESS_INDEX = 0;

const CAPABILITY_PREREQUISITES: Partial<Record<Capability, readonly Capability[]>> = {
  'documents.read.all': C('documents.read'),
  'documents.create': C('documents.read'),
  'documents.update': C('documents.read'),
  'documents.delete': C('documents.read'),
  'documents.export': C('documents.read'),
  'documents.archive': C('documents.read'),
  'documents.restore': C('documents.read'),
  'records.manage': C('documents.read', 'documents.archive'),
  'records.disposition.request': C('documents.read', 'documents.archive'),
  'records.disposition.approve': C('documents.read', 'documents.archive'),
  'documents.approve': C('documents.read'),
  'documents.sign': C('documents.read'),
  'approvals.read': C('documents.read'),
  'templates.manage': C('templates.read'),
  'departments.manage': C('departments.read'),
  'workflows.manage': C('workflows.read'),
  'users.create': C('users.directory.read'),
  'users.update': C('users.directory.read'),
  'users.deactivate': C('users.directory.read'),
  'users.password.reset': C('users.directory.read'),
  'roles.manage': C('roles.read'),
  'roles.assign.privileged': C('roles.read', 'roles.manage'),
  'workforce.request.create': C('workforce.read'),
  'workforce.templates.manage': C('workforce.read'),
  'workforce.vendor.manage': C('workforce.read'),
  'workforce.routes.manage': C('workforce.read'),
  'workforce.reports.read': C('workforce.read'),
  'workforce.reports.export': C('workforce.read', 'workforce.reports.read'),
  'workforce.settings.manage': C('workforce.read'),
  'workforce.budget.manage': C('workforce.read'),
  'workforce.invoice.manage': C('workforce.read'),
  'reports.export': C('reports.read'),
  'audit.export': C('audit.read'),
  'settings.manage.business': C('settings.read'),
  'settings.manage.security': C('settings.read'),
};

function asPermissionMatrix(value: unknown): PermissionMatrix | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as PermissionMatrix;
}

export function capabilitiesFromPermissionMatrix(value: unknown): Capability[] {
  const matrix = asPermissionMatrix(value);
  if (!matrix) return [];
  const effective = new Set<Capability>();

  for (const [moduleName, row] of Object.entries(matrix)) {
    if (!Array.isArray(row)) continue;
    const mapping = MODULE_CAPABILITIES[moduleName];
    if (!mapping) continue;
    const indexes = row[FULL_ACCESS_INDEX]
      ? Object.keys(mapping).map(Number)
      : row.flatMap((enabled, index) => (enabled ? [index] : []));
    for (const index of indexes) {
      for (const capability of mapping[index] ?? []) effective.add(capability);
    }
  }

  // Authenticated-user utilities stay available; data scope is still enforced server-side.
  effective.add('notifications.read');
  effective.add('search.use');
  effective.add('messages.use');
  return [...effective].filter((capability) =>
    (CAPABILITY_PREREQUISITES[capability] ?? []).every((required) => effective.has(required))
  );
}

export function resolveEffectiveCapabilities(
  role: Role,
  customRole?: { permissions: unknown; isActive: boolean } | null,
): Capability[] {
  if (customRole?.isActive) return capabilitiesFromPermissionMatrix(customRole.permissions);
  return [...SYSTEM_ROLE_CAPABILITIES[role]];
}
