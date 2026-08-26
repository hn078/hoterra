const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const modulesRoot = path.resolve(__dirname, '../server/modules');

function typescriptFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? typescriptFiles(target) : entry.name.endsWith('.ts') ? [target] : [];
  });
}

test('module domain code is framework and persistence independent', () => {
  const domainFiles = typescriptFiles(modulesRoot).filter((file) => file.includes(`${path.sep}domain${path.sep}`));
  assert.ok(domainFiles.length > 0);
  for (const file of domainFiles) {
    const source = fs.readFileSync(file, 'utf8');
    assert.doesNotMatch(source, /from ['"]express['"]/, file);
    assert.doesNotMatch(source, /from ['"]@prisma\/client['"]/, file);
    assert.doesNotMatch(source, /from ['"].*(?:routes|\/db)['"]/, file);
  }
});

test('modules never depend on legacy HTTP route implementations', () => {
  for (const file of typescriptFiles(modulesRoot)) {
    const source = fs.readFileSync(file, 'utf8');
    assert.doesNotMatch(source, /from ['"].*routes\//, file);
  }
});

test('every backend module exposes a public entry point', () => {
  const moduleDirectories = fs.readdirSync(modulesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory());
  assert.ok(moduleDirectories.length >= 16);
  for (const entry of moduleDirectories) {
    assert.ok(fs.existsSync(path.join(modulesRoot, entry.name, 'index.ts')), entry.name);
  }
});

test('cross-module dependencies use public module entry points only', () => {
  for (const file of typescriptFiles(modulesRoot)) {
    const source = fs.readFileSync(file, 'utf8');
    assert.doesNotMatch(
      source,
      /from ['"]\.\.\/\.\.\/[a-z-]+\/(?:application|domain|http|infrastructure)\//,
      file,
    );
  }
});

test('shared lib contains infrastructure only, not business modules', () => {
  const allowedInfrastructure = new Set([
    'asyncHandler.ts',
    'mail.ts',
    'paths.ts',
    'privateFiles.ts',
    'requestContext.ts',
    'tenantContext.ts',
    'uploads.ts',
  ]);
  const actual = fs.readdirSync(path.resolve(__dirname, '../server/lib'));
  assert.deepEqual(new Set(actual), allowedInfrastructure);
});

test('Workflow business definitions are owned by the Workflow module', () => {
  const workflowDomain = path.resolve(modulesRoot, 'workflow/domain/workflowDefinition.ts');
  assert.ok(fs.existsSync(workflowDomain));
  assert.equal(fs.existsSync(path.resolve(__dirname, '../server/lib/workflows.ts')), false);
  for (const file of typescriptFiles(modulesRoot)) {
    const source = fs.readFileSync(file, 'utf8');
    assert.doesNotMatch(source, /lib\/workflows/, file);
  }
});

test('document signature policy is owned by the Documents module', () => {
  const signatureDomain = path.resolve(modulesRoot, 'documents/domain/signaturePolicy.ts');
  assert.ok(fs.existsSync(signatureDomain));
  assert.equal(fs.existsSync(path.resolve(__dirname, '../server/lib/signatures.ts')), false);
  for (const file of typescriptFiles(modulesRoot)) {
    const source = fs.readFileSync(file, 'utf8');
    assert.doesNotMatch(source, /lib\/signatures/, file);
  }
});

test('workforce reporting is owned by the Workforce module', () => {
  const reportService = path.resolve(modulesRoot, 'workforce/application/buildWorkforceReport.ts');
  assert.ok(fs.existsSync(reportService));
  assert.equal(fs.existsSync(path.resolve(__dirname, '../server/lib/workforceReport.ts')), false);
  for (const file of typescriptFiles(modulesRoot)) {
    const source = fs.readFileSync(file, 'utf8');
    assert.doesNotMatch(source, /lib\/workforceReport/, file);
  }
});

test('workforce request serialization is owned by the Workforce module', () => {
  const serializer = path.resolve(modulesRoot, 'workforce/application/workforceRequestSerialization.ts');
  assert.ok(fs.existsSync(serializer));
  assert.equal(fs.existsSync(path.resolve(__dirname, '../server/lib/workforce.ts')), false);
  for (const file of typescriptFiles(modulesRoot)) {
    const source = fs.readFileSync(file, 'utf8');
    assert.doesNotMatch(source, /lib\/workforce(?:['"]|$)/, file);
  }
});

test('workforce scheduler infrastructure is owned by the Workforce module', () => {
  const scheduler = path.resolve(modulesRoot, 'workforce/infrastructure/workforceScheduler.ts');
  assert.ok(fs.existsSync(scheduler));
  assert.equal(fs.existsSync(path.resolve(__dirname, '../server/lib/workforceRecurring.ts')), false);
});

test('settings schema and role matrices are module-owned', () => {
  assert.ok(fs.existsSync(path.resolve(modulesRoot, 'settings/domain/extendedConfig.ts')));
  assert.ok(fs.existsSync(path.resolve(modulesRoot, 'access-control/application/permissionMatrixCatalog.ts')));
  assert.equal(fs.existsSync(path.resolve(__dirname, '../server/settingsExtended.ts')), false);
  assert.equal(fs.existsSync(path.resolve(__dirname, '../server/permissions.ts')), false);
});

test('workforce root router remains composition-only', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../server/routes/workforce.ts'), 'utf8');
  assert.doesNotMatch(source, /router\.(?:get|post|put|patch|delete)\s*\(/);
  assert.match(source, /router\.use\(workforcePlanningRouter\)/);
  assert.match(source, /router\.use\(workforceDecisionsRouter\)/);
  assert.match(source, /router\.use\(workforceProcurementRouter\)/);
  assert.match(source, /router\.use\(workforceLifecycleRouter\)/);
});

test('documents root router remains composition-only', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../server/routes/documents.ts'), 'utf8');
  assert.doesNotMatch(source, /router\.(?:get|post|put|patch|delete)\s*\(/);
  assert.match(source, /router\.use\(documentQueriesRouter\)/);
  assert.match(source, /router\.use\(documentWorkflowRouter\)/);
  assert.match(source, /router\.use\(documentContentRouter\)/);
  assert.match(source, /router\.use\(documentLifecycleRouter\)/);
  assert.match(source, /router\.use\(documentCollaborationRouter\)/);
});

test('users root router remains composition-only', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../server/routes/users.ts'), 'utf8');
  assert.doesNotMatch(source, /router\.(?:get|post|put|patch|delete)\s*\(/);
  assert.match(source, /router\.use\(userQueriesRouter\)/);
  assert.match(source, /router\.use\(userAccountsRouter\)/);
  assert.match(source, /router\.use\(userSignatureRouter\)/);
});

test('conversations root router remains composition-only', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../server/routes/conversations.ts'), 'utf8');
  assert.doesNotMatch(source, /router\.(?:get|post|put|patch|delete)\s*\(/);
  assert.match(source, /router\.use\(conversationQueriesRouter\)/);
  assert.match(source, /router\.use\(conversationManagementRouter\)/);
  assert.match(source, /router\.use\(conversationMessagesRouter\)/);
});

test('settings root router remains composition-only', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../server/routes/settings.ts'), 'utf8');
  assert.doesNotMatch(source, /router\.(?:get|post|put|patch|delete)\s*\(/);
  assert.match(source, /router\.use\(settingsQueriesRouter\)/);
  assert.match(source, /router\.use\(settingsBusinessRouter\)/);
  assert.match(source, /router\.use\(settingsSecurityRouter\)/);
});

test('roles root router remains composition-only', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../server/routes/roles.ts'), 'utf8');
  assert.doesNotMatch(source, /router\.(?:get|post|put|patch|delete)\s*\(/);
  assert.match(source, /router\.use\(roleQueriesRouter\)/);
  assert.match(source, /router\.use\(roleManagementRouter\)/);
});

test('departments root router remains composition-only', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../server/routes/departments.ts'), 'utf8');
  assert.doesNotMatch(source, /router\.(?:get|post|put|patch|delete)\s*\(/);
  assert.match(source, /router\.use\(departmentQueriesRouter\)/);
  assert.match(source, /router\.use\(departmentManagementRouter\)/);
});

test('workflows root router remains composition-only', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../server/routes/workflows.ts'), 'utf8');
  assert.doesNotMatch(source, /router\.(?:get|post|put|patch|delete)\s*\(/);
  assert.match(source, /router\.use\(workflowQueriesRouter\)/);
  assert.match(source, /router\.use\(workflowManagementRouter\)/);
});

test('templates root router remains composition-only', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../server/routes/templates.ts'), 'utf8');
  assert.doesNotMatch(source, /router\.(?:get|post|put|patch|delete)\s*\(/);
  assert.match(source, /router\.use\(templateQueriesRouter\)/);
  assert.match(source, /router\.use\(templateManagementRouter\)/);
});

test('search root router remains composition-only', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../server/routes/search.ts'), 'utf8');
  assert.doesNotMatch(source, /router\.(?:get|post|put|patch|delete)\s*\(/);
  assert.match(source, /router\.use\(searchQueriesRouter\)/);
});

test('audit root router remains composition-only', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../server/routes/audit.ts'), 'utf8');
  assert.doesNotMatch(source, /router\.(?:get|post|put|patch|delete)\s*\(/);
  assert.match(source, /router\.use\(auditQueriesRouter\)/);
  assert.match(source, /router\.use\(auditExportRouter\)/);
});

test('reports root router remains composition-only', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../server/routes/reports.ts'), 'utf8');
  assert.doesNotMatch(source, /router\.(?:get|post|put|patch|delete)\s*\(/);
  assert.match(source, /router\.use\(reportQueriesRouter\)/);
  assert.match(source, /router\.use\(reportExportRouter\)/);
});

test('Dashboard HTTP adapter is owned outside the Documents router', () => {
  const dashboardRoute = fs.readFileSync(path.resolve(__dirname, '../server/routes/dashboard.ts'), 'utf8');
  const documentQueries = fs.readFileSync(path.resolve(__dirname, '../server/routes/documentQueries.ts'), 'utf8');
  const api = fs.readFileSync(path.resolve(__dirname, '../src/lib/api.ts'), 'utf8');
  assert.match(dashboardRoute, /requireCapability\('dashboard\.view'\)/);
  assert.match(dashboardRoute, /getDashboardStats\(prisma, req\.user!\)/);
  assert.doesNotMatch(documentQueries, /getDashboardStats|\/stats/);
  assert.match(api, /'\/dashboard\/stats'/);
  assert.doesNotMatch(api, /'\/documents\/stats'/);
});

test('HTTP routes delegate persistence instead of querying Prisma directly', () => {
  const routesRoot = path.resolve(__dirname, '../server/routes');
  for (const file of typescriptFiles(routesRoot)) {
    const source = fs.readFileSync(file, 'utf8');
    assert.doesNotMatch(source, /\b(?:prisma|systemPrisma)\.[A-Za-z_$]/, file);
  }
  const filesRoute = fs.readFileSync(path.join(routesRoot, 'files.ts'), 'utf8');
  assert.match(filesRoute, /getPrimaryDocumentFile\(prisma, req\.user!/);
  assert.match(filesRoute, /getOwnSignatureFile\(prisma, req\.user!/);
});

test('public tenant HTTP adapter delegates tenant registry reads to the Tenancy module', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../server/routes/publicTenant.ts'), 'utf8');
  assert.match(source, /readPublicTenantBranding\(systemPrisma, req\.params\.slug\)/);
  assert.match(source, /readPublicBrandingAsset\(/);
  assert.doesNotMatch(source, /tenant\.find(?:First|Unique)/);
});
