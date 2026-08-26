require('tsx/cjs');

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  CAPABILITIES,
  CustomRoleError,
  normalizePermissions,
  resolveEffectiveCapabilities,
} = require('../server/modules/access-control');
const {
  canConfirmProcurementSelection,
  canDecideCurrentWorkforceStep,
  canManageProcurementWorkforce,
  canViewWorkforceRequest,
} = require('../server/modules/workforce');
const {
  CAPABILITIES: CLIENT_CAPABILITIES,
  LEGACY_ROLE_CAPABILITIES,
} = require('../src/modules/access-control/capabilities.ts');

function user(overrides = {}) {
  return {
    id: 'user-1',
    tenantId: 'tenant-1',
    email: 'user@example.test',
    role: 'EMPLOYEE',
    firstName: 'Test',
    lastName: 'User',
    departmentId: 'department-a',
    customRoleId: null,
    capabilities: resolveEffectiveCapabilities('EMPLOYEE'),
    ...overrides,
  };
}

test('System Administrator is a technical administrator, not a business signatory', () => {
  const capabilities = resolveEffectiveCapabilities('SYSTEM_ADMINISTRATOR');
  for (const capability of [
    'users.create', 'users.update', 'users.deactivate', 'users.password.reset',
    'roles.manage', 'roles.assign.privileged', 'audit.read', 'audit.export',
    'settings.manage.business', 'settings.manage.security',
  ]) {
    assert.ok(capabilities.includes(capability), `missing technical capability ${capability}`);
  }
  for (const capability of [
    'documents.read', 'documents.approve', 'documents.sign',
    'workforce.read', 'workforce.vendor.manage', 'workforce.invoice.manage',
    'reports.read', 'messages.use',
  ]) {
    assert.equal(capabilities.includes(capability), false, `unexpected business capability ${capability}`);
  }
  assert.ok(capabilities.length < CAPABILITIES.length);
});

test('frontend fallback capability contract matches the backend contract', () => {
  assert.deepEqual(new Set(CLIENT_CAPABILITIES), new Set(CAPABILITIES));
  for (const role of Object.keys(LEGACY_ROLE_CAPABILITIES)) {
    assert.deepEqual(
      new Set(LEGACY_ROLE_CAPABILITIES[role]),
      new Set(resolveEffectiveCapabilities(role)),
      `capability mismatch for ${role}`,
    );
  }
});

test('General Manager has business oversight without technical security or identity mutation', () => {
  const capabilities = resolveEffectiveCapabilities('GENERAL_MANAGER');
  assert.ok(capabilities.includes('settings.manage.business'));
  assert.ok(capabilities.includes('users.directory.read'));
  assert.equal(capabilities.includes('settings.manage.security'), false);
  assert.equal(capabilities.includes('users.create'), false);
  assert.equal(capabilities.includes('roles.manage'), false);
});

test('ordinary employees are not authorized for hotel-wide reports or workforce', () => {
  const capabilities = resolveEffectiveCapabilities('EMPLOYEE');
  assert.equal(capabilities.includes('reports.read'), false);
  assert.equal(capabilities.includes('workforce.read'), false);
  assert.equal(capabilities.includes('workforce.request.create'), false);
});

test('active custom role matrix is authoritative and can reduce base-role access', () => {
  const matrix = {
    Dashboard: [false, false, true, false, false, false, false],
    Documents: [false, false, false, false, false, false, false],
    Templates: [false, false, false, false, false, false, false],
    Departments: [false, false, false, false, false, false, false],
    Workflows: [false, false, false, false, false, false, false],
    'Users & Roles': [false, false, true, false, false, false, false],
    'Casual Workforce': [false, false, false, false, false, false, false],
    Reports: [false, false, false, false, false, false, false],
    Settings: [false, false, false, false, false, false, false],
  };
  const capabilities = resolveEffectiveCapabilities('HOD', { permissions: matrix, isActive: true });
  assert.ok(capabilities.includes('dashboard.view'));
  assert.ok(capabilities.includes('users.directory.read'));
  assert.ok(capabilities.includes('roles.read'));
  assert.equal(capabilities.includes('documents.read'), false);
  assert.equal(capabilities.includes('workforce.read'), false);
});

test('inactive custom role falls back to the system role', () => {
  const capabilities = resolveEffectiveCapabilities('HOD', { permissions: {}, isActive: false });
  assert.ok(capabilities.includes('documents.read'));
  assert.ok(capabilities.includes('workforce.read'));
});

test('workforce scope denies tenant-wide employee access', () => {
  const employee = user({ capabilities: ['workforce.read'] });
  const otherRequest = {
    createdById: 'other-user',
    departmentId: 'department-b',
    status: 'PENDING',
  };
  assert.equal(canViewWorkforceRequest(employee, otherRequest), false);
  assert.equal(canViewWorkforceRequest(employee, { ...otherRequest, createdById: employee.id }), true);
});

test('workforce scope supports department and current-approver access', () => {
  const request = { createdById: 'other-user', departmentId: 'department-a', status: 'PENDING' };
  const hod = user({ role: 'HOD', capabilities: resolveEffectiveCapabilities('HOD') });
  assert.equal(canViewWorkforceRequest(hod, request), true);
  assert.equal(
    canViewWorkforceRequest(hod, { ...request, departmentId: 'department-b' }, { isCurrentApprover: true }),
    true,
  );
  const finance = user({ role: 'FINANCE_DIRECTOR', capabilities: resolveEffectiveCapabilities('FINANCE_DIRECTOR') });
  assert.equal(canViewWorkforceRequest(finance, { ...request, departmentId: 'department-b' }), true);
});

test('workforce object scope cannot bypass a missing capability', () => {
  const hod = user({ role: 'HOD', capabilities: [] });
  const request = { createdById: hod.id, departmentId: hod.departmentId, status: 'PENDING' };
  assert.equal(canViewWorkforceRequest(hod, request, { isCurrentApprover: true }), false);
});

test('workforce decisions require the exact current role and department step', () => {
  const approvalSteps = JSON.stringify([
    { role: 'HOD', label: 'Department HoD', approverDepartmentId: 'department-a' },
    { role: 'HOD', label: 'Human Resources HoD', approverDepartmentId: 'department-hr' },
    { role: 'FINANCE_DIRECTOR', label: 'Finance Director' },
    { role: 'GENERAL_MANAGER', label: 'General Manager' },
  ]);
  const request = {
    status: 'PENDING',
    departmentId: 'department-a',
    currentStepIndex: 0,
    approvalSteps,
  };
  const gm = user({ role: 'GENERAL_MANAGER', departmentId: 'department-gm', capabilities: resolveEffectiveCapabilities('GENERAL_MANAGER') });
  const systemAdministrator = user({ role: 'SYSTEM_ADMINISTRATOR', departmentId: null, capabilities: resolveEffectiveCapabilities('SYSTEM_ADMINISTRATOR') });
  const departmentHod = user({ role: 'HOD', departmentId: 'department-a', capabilities: resolveEffectiveCapabilities('HOD') });
  const hrHod = user({ role: 'HOD', departmentId: 'department-hr', capabilities: resolveEffectiveCapabilities('HOD') });
  const finance = user({ role: 'FINANCE_DIRECTOR', departmentId: 'department-finance', capabilities: resolveEffectiveCapabilities('FINANCE_DIRECTOR') });

  assert.equal(canDecideCurrentWorkforceStep(gm, request), false);
  assert.equal(canDecideCurrentWorkforceStep(systemAdministrator, request), false);
  assert.equal(canDecideCurrentWorkforceStep({ ...departmentHod, capabilities: [] }, request), false);
  assert.equal(canDecideCurrentWorkforceStep(departmentHod, request), true);
  assert.equal(canDecideCurrentWorkforceStep(hrHod, request), false);
  assert.equal(canDecideCurrentWorkforceStep(hrHod, { ...request, currentStepIndex: 1 }), true);
  assert.equal(canDecideCurrentWorkforceStep(finance, { ...request, currentStepIndex: 2 }), true);
  assert.equal(canDecideCurrentWorkforceStep(gm, { ...request, currentStepIndex: 3 }), true);
});

test('Procurement access uses effective capabilities instead of raw custom-role JSON', async () => {
  const database = {
    user: {
      findUnique: async () => ({ isActive: true, department: { code: 'PR' } }),
    },
  };
  const manager = user({
    role: 'EMPLOYEE',
    capabilities: ['workforce.read', 'workforce.vendor.manage'],
  });
  assert.equal(await canManageProcurementWorkforce(database, manager), true);
  assert.equal(await canManageProcurementWorkforce(database, { ...manager, capabilities: ['workforce.read'] }), false);
  assert.equal(await canManageProcurementWorkforce(database, { ...manager, capabilities: ['workforce.vendor.manage'] }), false);

  const procurementHod = user({ role: 'HOD', capabilities: ['workforce.read'] });
  assert.equal(await canConfirmProcurementSelection(database, procurementHod), true);
  assert.equal(await canConfirmProcurementSelection(database, { ...procurementHod, capabilities: [] }), false);

  const outsideProcurement = {
    user: { findUnique: async () => ({ isActive: true, department: { code: 'FI' } }) },
  };
  assert.equal(await canManageProcurementWorkforce(outsideProcurement, manager), false);
});

test('migrated module HTTP adapters enforce named capabilities', () => {
  const root = path.resolve(__dirname, '..');
  const expectations = {
    'server/routes/templateQueries.ts': ['templates.read'],
    'server/routes/templateManagement.ts': ['templates.manage'],
    'server/routes/workflowQueries.ts': ['workflows.read'],
    'server/routes/workflowManagement.ts': ['workflows.manage'],
    'server/routes/departmentQueries.ts': ['departments.read'],
    'server/routes/departmentManagement.ts': ['departments.manage'],
    'server/routes/roleQueries.ts': ['roles.read'],
    'server/routes/roleManagement.ts': ['roles.manage'],
    'server/routes/searchQueries.ts': ['search.use'],
    'server/routes/auditQueries.ts': ['audit.read'],
    'server/routes/auditExport.ts': ['audit.export'],
    'server/routes/favorites.ts': ['documents.read'],
    'server/routes/archive.ts': ['documents.archive'],
    'server/routes/reportQueries.ts': ['reports.read'],
    'server/routes/reportExport.ts': ['reports.export'],
  };
  for (const [file, capabilities] of Object.entries(expectations)) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    for (const capability of capabilities) {
      assert.match(source, new RegExp(`requireCapability\\('${capability.replaceAll('.', '\\.')}'\\)`));
    }
  }
});

test('custom role permission matrices accept booleans only', () => {
  const matrix = Object.fromEntries([
    'Dashboard', 'Documents', 'Records Management', 'Templates', 'Departments', 'Workflows',
    'Users & Roles', 'Casual Workforce', 'Reports', 'Settings',
  ].map((module) => [module, [false, false, false, false, false, false, false]]));
  assert.deepEqual(normalizePermissions(matrix), matrix);
  assert.throws(
    () => normalizePermissions({ ...matrix, Dashboard: [false, 'false', false, false, false, false, false] }),
    (error) => error instanceof CustomRoleError && error.code === 'INVALID_PERMISSIONS',
  );
});
