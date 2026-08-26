const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('tsx/cjs');

const {
  deactivateDepartment,
  DepartmentLifecycleError,
} = require('../server/modules/organization/application/manageDepartmentLifecycle.ts');

const source = (file) => fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8');

test('department detail is object-scoped and directory email is capability-redacted', () => {
  const readModel = source('server/modules/organization/application/departmentReadModel.ts');
  assert.match(readModel, /documents\.read\.all/);
  assert.match(readModel, /actor\.capabilities\.includes\('documents\.read'\)/);
  assert.match(readModel, /actor\.departmentId === departmentId/);
  assert.match(readModel, /users\.directory\.read/);
  assert.match(readModel, /\.\.\.\(includeEmail \? \{ email: person\.email \} : \{\}\)/);
});

test('department list avoids per-department count queries and returns an explicit DTO', () => {
  const readModel = source('server/modules/organization/application/departmentReadModel.ts');
  assert.match(readModel, /document\.groupBy/);
  assert.doesNotMatch(readModel, /departments\.map\(async/);
  assert.doesNotMatch(readModel, /\.\.\.department/);
});

test('department directory and detail links follow actor object scope', () => {
  const readModel = source('server/modules/organization/application/departmentReadModel.ts');
  const listPage = source('src/pages/DepartmentsPage.tsx');
  assert.match(readModel, /function canListAllDepartments/);
  assert.match(readModel, /documents\.read\.all/);
  assert.match(readModel, /departments\.manage/);
  assert.match(readModel, /users\.create/);
  assert.match(readModel, /visibleDepartmentIds[\s\S]{0,360}actor\.departmentId/);
  assert.match(readModel, /const departmentWhere = \{/);
  assert.match(readModel, /!includeInactive \? \{ isActive: true \} : \{\}/);
  assert.match(readModel, /canOpen: canReadDetail\(actor, department\.id\)/);
  assert.match(readModel, /const scopedDepartmentId = canListAllDepartments/);
  assert.match(listPage, /dept\.canOpen/);
  assert.match(listPage, /Directory only/);
});

test('department mutations validate, lock, audit, and report duplicates deterministically', () => {
  const service = source('server/modules/organization/application/manageDepartments.ts');
  assert.match(service, /departments\.manage/g);
  assert.match(service, /database\.\$transaction/g);
  assert.match(service, /pg_advisory_xact_lock/g);
  assert.match(service, /transaction\.auditLog\.create/g);
  assert.match(service, /serializeAuditState\(departmentAuditState\(existing\)\)/);
  assert.match(service, /beforeState:/);
  assert.match(service, /afterState:/);
  assert.match(service, /mode: 'insensitive'/g);
  assert.match(service, /P2002/);
});

test('department management controls are capability-hidden in the frontend', () => {
  const listPage = source('src/pages/DepartmentsPage.tsx');
  const detailPage = source('src/pages/DepartmentDetailPage.tsx');
  assert.match(listPage, /hasCapability\(currentUser, 'departments\.manage'\)/);
  assert.match(detailPage, /canManageDepartments/);
  assert.match(detailPage, /canManageWorkflows/);
  assert.match(detailPage, /canManageTemplates/);
  assert.match(detailPage, /canReadUserDirectory/);
});

test('department screens expose only working responsive controls and safe failure states', () => {
  const listPage = source('src/pages/DepartmentsPage.tsx');
  const detailPage = source('src/pages/DepartmentDetailPage.tsx');
  assert.doesNotMatch(listPage, />\s*Filter\s*</);
  assert.match(listPage, /hidden w-full min-w-\[1000px\] text-sm md:table/);
  assert.match(listPage, /space-y-3 bg-hoterra-page p-4 md:hidden/);
  assert.match(listPage, /Departments unavailable/);
  assert.match(listPage, /items-end justify-center[\s\S]{0,120}sm:items-center/);
  assert.match(detailPage, /Department unavailable/);
  assert.match(detailPage, /canReadUserDirectory \? \(/);
  assert.match(detailPage, /overflow-x-auto rounded-xl/);
});

test('department lifecycle is recoverable, dependency-aware, and transactional', () => {
  const schema = source('prisma/schema.prisma');
  const migration = source('prisma/migrations/20260826130000_department_lifecycle/migration.sql');
  const lifecycle = source('server/modules/organization/application/manageDepartmentLifecycle.ts');
  const route = source('server/routes/departmentManagement.ts');
  const listPage = source('src/pages/DepartmentsPage.tsx');

  assert.match(schema, /isActive\s+Boolean\s+@default\(true\)/);
  assert.match(schema, /deactivatedAt\s+DateTime\?/);
  assert.match(migration, /ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true/);
  assert.match(lifecycle, /capabilities\.includes\('departments\.manage'\)/g);
  assert.match(lifecycle, /database\.\$transaction/g);
  assert.match(lifecycle, /pg_advisory_xact_lock/g);
  assert.match(lifecycle, /openUserResponsibilities/);
  assert.match(lifecycle, /openDocuments/);
  assert.match(lifecycle, /openWorkforceRequests/);
  assert.match(lifecycle, /activeDocumentTemplates/);
  assert.match(lifecycle, /activeWorkforcePositions/);
  assert.match(lifecycle, /activeWorkforceTemplates/);
  assert.match(lifecycle, /tokenVersion: \{ increment: 1 \}/);
  assert.match(lifecycle, /conversationParticipant\.deleteMany/);
  assert.match(lifecycle, /transaction\.auditLog\.create/g);
  assert.match(lifecycle, /beforeState: serializeAuditState/g);
  assert.match(lifecycle, /afterState: serializeAuditState/g);
  assert.doesNotMatch(lifecycle, /department\.delete/);
  assert.match(route, /\/:id\/lifecycle/);
  assert.match(route, /\/:id\/deactivate/);
  assert.match(route, /\/:id\/reactivate/);
  assert.match(listPage, /Historical documents and audit evidence will be retained/);
  assert.match(listPage, /Transfer active staff to/);
  assert.match(listPage, /Active departments/);
});

test('inactive departments cannot receive new accounts, documents, templates, or Workforce configuration', () => {
  const accounts = source('server/modules/identity/application/manageUserAccounts.ts');
  const documents = source('server/modules/documents/application/manageDocumentContent.ts');
  const templates = source('server/modules/templates/application/manageTemplates.ts');
  const catalog = source('server/modules/workforce/application/manageWorkforceCatalog.ts');
  const workforceTemplates = source('server/modules/workforce/application/manageWorkforceTemplates.ts');
  const planning = source('server/modules/workforce/application/manageWorkforceRequestPlanning.ts');
  const administration = source('server/modules/workforce/application/manageWorkforceAdministration.ts');

  assert.match(accounts, /department\.findFirst\(\{ where: \{ id: departmentId, isActive: true \}/g);
  assert.match(documents, /department\.findFirst\(\{ where: \{ id: departmentId, isActive: true \}/);
  assert.match(templates, /department\.findFirst\(\{ where: \{ id: departmentId, isActive: true \}/);
  assert.match(catalog, /department\.findFirst\(\{ where: \{ id: departmentId, isActive: true \}/);
  assert.match(workforceTemplates, /department\.findFirst\(\{ where: \{ id: departmentId, isActive: true \}/);
  assert.match(planning, /department\.findFirst\(\{ where: \{ id: departmentId, isActive: true \}/);
  assert.match(administration, /department\.findFirst\(\{ where: \{ id: departmentId, isActive: true \}/g);
});

function lifecycleFixture(overrides = {}) {
  let updateCalled = false;
  let auditCalled = false;
  let auditData = null;
  const transaction = {
    $executeRaw: async () => 1,
    department: {
      findUnique: async () => ({ id: 'source', name: 'Source', code: 'SRC', isActive: true }),
      findFirst: async () => ({ id: 'target', name: 'Target' }),
      update: async () => {
        updateCalled = true;
        return { id: 'source', name: 'Source', code: 'SRC', isActive: false, deactivatedAt: new Date() };
      },
    },
    user: { findMany: async () => [], updateMany: async () => ({ count: 0 }) },
    notification: { count: async () => 0, createMany: async () => ({ count: 0 }) },
    document: { count: async () => 0 },
    workforceRequest: { count: async () => 0 },
    template: { count: async () => overrides.activeDocumentTemplates ?? 0 },
    workforcePosition: { count: async () => 0 },
    workforceRequestTemplate: { count: async () => 0 },
    conversation: { findFirst: async () => null },
    conversationParticipant: { deleteMany: async () => ({ count: 0 }) },
    auditLog: { create: async ({ data }) => { auditCalled = true; auditData = data; } },
  };
  return {
    database: { $transaction: async (callback) => callback(transaction) },
    actor: { id: 'gm', firstName: 'General', lastName: 'Manager', capabilities: ['departments.manage'] },
    state: () => ({ updateCalled, auditCalled, auditData }),
  };
}

test('department deactivation commits state and audit only when dependencies are clear', async () => {
  const fixture = lifecycleFixture();
  const result = await deactivateDepartment(fixture.database, fixture.actor, 'source', { reason: 'Property restructure' });
  assert.equal(result.isActive, false);
  const state = fixture.state();
  assert.equal(state.updateCalled, true);
  assert.equal(state.auditCalled, true);
  assert.equal(state.auditData.outcome, 'SUCCESS');
  assert.equal(state.auditData.reason, 'Property restructure');
  assert.equal(JSON.parse(state.auditData.beforeState).isActive, true);
  assert.equal(JSON.parse(state.auditData.afterState).isActive, false);
});

test('department deactivation fails closed before mutation when a dependency remains', async () => {
  const fixture = lifecycleFixture({ activeDocumentTemplates: 1 });
  await assert.rejects(
    () => deactivateDepartment(fixture.database, fixture.actor, 'source', { reason: 'Property restructure' }),
    (error) => error instanceof DepartmentLifecycleError && error.code === 'BLOCKED',
  );
  assert.equal(fixture.state().updateCalled, false);
  assert.equal(fixture.state().auditCalled, false);
});
