const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = (file) => fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8');

test('custom role mutations are locked, audited, and permission-ceiling protected', () => {
  const service = source('server/modules/access-control/application/manageCustomRoles.ts');
  assert.match(service, /database\.\$transaction/g);
  assert.match(service, /pg_advisory_xact_lock/);
  assert.match(service, /transaction\.auditLog\.create/g);
  assert.match(service, /assertPermissionCeiling\(actor, permissions\)/g);
  assert.match(service, /actor\.customRoleId === role\.id/);
});

test('custom roles are recoverably deactivated only after every user is reassigned', () => {
  const service = source('server/modules/access-control/application/manageCustomRoles.ts');
  const adapter = source('server/routes/roleManagement.ts');
  assert.match(service, /user\.count\(\{ where: \{ customRoleId: roleId \} \}\)/);
  assert.match(service, /data: \{ isActive: false \}/);
  assert.match(service, /ROLE_IN_USE/);
  assert.match(adapter, /router\.delete\('\/:id'/);
});

test('inactive custom roles have a safe audited reactivation lifecycle', () => {
  const service = source('server/modules/access-control/application/manageCustomRoles.ts');
  const readModel = source('server/modules/access-control/application/roleReadModel.ts');
  const adapter = source('server/routes/roleManagement.ts');
  const api = source('src/lib/api.ts');
  const page = source('src/pages/RolesPermissionsPage.tsx');

  assert.match(readModel, /const canManage = actor\.capabilities\.includes\('roles\.manage'\)/);
  assert.match(readModel, /where: canManage \? \{\} : \{ isActive: true \}/);
  assert.match(service, /export async function reactivateCustomRole/);
  assert.match(service, /if \(existing\.isActive\) return \{ ok: true, id: existing\.id \}/);
  assert.match(service, /assignedUsers[\s\S]{0,420}ROLE_IN_USE/);
  assert.match(service, /data: \{ isActive: true \}/);
  assert.match(service, /Reactivated custom role/);
  assert.match(adapter, /router\.post\('\/:id\/activate'/);
  assert.match(api, /reactivateRole\(id: string\)/);
  assert.match(page, /Inactive roles are read-only until reactivated/);
  assert.match(page, /Reactivate role/);
});

test('role directory does not double-count custom-role users as system-role users', () => {
  const readModel = source('server/modules/access-control/application/roleReadModel.ts');
  assert.match(readModel, /customRoleId: null/);
  assert.match(readModel, /select: \{ users: true \}/);
});

test('custom role mutations cannot exist without their read prerequisite', () => {
  const resolver = source('server/modules/access-control/application/resolveEffectiveCapabilities.ts');
  const service = source('server/modules/access-control/application/manageCustomRoles.ts');
  const page = source('src/pages/RolesPermissionsPage.tsx');
  assert.match(resolver, /CAPABILITY_PREREQUISITES/);
  assert.match(resolver, /'documents\.export': C\('documents\.read'\)/);
  assert.match(resolver, /'roles\.manage': C\('roles\.read'\)/);
  assert.match(resolver, /'workforce\.reports\.export': C\('workforce\.read', 'workforce\.reports\.read'\)/);
  assert.match(service, /Read is required for other permissions/);
  assert.match(page, /const updatePermission/);
  assert.match(page, /if \(checked && readIndex >= 0\) next\[readIndex\] = true/);
  assert.match(page, /index === readIndex && !checked[\s\S]*next\.fill\(false\)/);
});

test('role management presents capability-safe responsive controls', () => {
  const page = source('src/pages/RolesPermissionsPage.tsx');
  assert.match(page, /canReadUsers[\s\S]{0,160}users\.directory\.read/);
  assert.match(page, /canReadUsers[\s\S]{0,220}Users & Roles/);
  assert.match(page, /card hidden overflow-x-auto md:block/);
  assert.match(page, /space-y-3 md:hidden/);
  assert.match(page, /min-h-11 items-center/);
  assert.match(page, /items-end justify-center[\s\S]{0,120}sm:items-center/);
});
