const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const sourceFiles = (directory) => fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const target = path.join(directory, entry.name);
  if (entry.isDirectory()) return sourceFiles(target);
  return /\.(?:ts|tsx)$/.test(entry.name) ? [target] : [];
});

test('production startup never uses prisma db push or accept-data-loss', () => {
  const packageJson = JSON.parse(read('package.json'));
  assert.doesNotMatch(packageJson.scripts['start:backend'], /db push|accept-data-loss/);
  assert.doesNotMatch(packageJson.scripts['start:backend'], /migrateTenants|migrate|prisma/);
  const railway = read('.railway/railway.ts');
  assert.match(railway, /preDeploy: "npm run db:migrate:deploy"/);
  assert.match(railway, /healthcheck: "\/api\/ready"/);
});

test('dependency locks use the patched deep merge graph and explicit build allowlist', () => {
  const packageJson = JSON.parse(read('package.json'));
  const npmLock = read('package-lock.json');
  const pnpmLock = read('pnpm-lock.yaml');
  const pnpmWorkspace = read('pnpm-workspace.yaml');

  assert.equal(packageJson.overrides['deepmerge-ts'], '^8.0.0');
  assert.match(npmLock, /node_modules\/deepmerge-ts[\s\S]{0,220}"version": "8\.0\.2"/);
  assert.match(pnpmLock, /deepmerge-ts@8\.0\.2/);
  assert.doesNotMatch(pnpmLock, /deepmerge-ts@7\./);
  assert.match(pnpmWorkspace, /overrides:\s+deepmerge-ts: \^8\.0\.0/);
  for (const dependency of ['@prisma/client', '@prisma/engines', 'electron', 'electron-winstaller', 'esbuild', 'prisma']) {
    assert.match(pnpmWorkspace, new RegExp(`['"]?${dependency.replace('/', '\\/')}['"]?: true`));
  }
  assert.doesNotMatch(pnpmWorkspace, /set this to true or false/);
});

test('PostgreSQL migrations enforce required tenant foreign keys', () => {
  assert.match(read('prisma/migrations/migration_lock.toml'), /provider = "postgresql"/);
  const migration = read('prisma/migrations/20260824010000_tenant_integrity/migration.sql');
  assert.match(migration, /ALTER COLUMN "tenantId" SET NOT NULL/);
  assert.match(migration, /Department_tenantId_fkey/);
  assert.match(migration, /User_tenantId_email_key/);
  assert.match(migration, /Document_tenantId_code_key/);
  const rls = read('prisma/migrations/20260824020000_tenant_rls/migration.sql');
  assert.match(rls, /FORCE ROW LEVEL SECURITY/);
  assert.match(rls, /CREATE POLICY tenant_isolation/);
  const hardenedRls = read('prisma/migrations/20260826020000_remove_runtime_rls_wildcard/migration.sql');
  assert.match(hardenedRls, /"tenantId" = current_setting/);
  assert.doesNotMatch(hardenedRls, /tenant_id'', true\) = ''\*''/);
  const relationIntegrity = read('prisma/migrations/20260824040000_tenant_relation_integrity/migration.sql');
  assert.match(relationIntegrity, /hoterra_enforce_tenant_fk/);
  assert.match(relationIntegrity, /Tenant relation violation/);
});

test('uploads are private and tenant-prefixed', () => {
  assert.doesNotMatch(read('server/index.ts'), /express\.static/);
  const uploads = read('server/lib/uploads.ts');
  assert.match(uploads, /tenant\.id/);
  assert.match(uploads, /resolved\.startsWith/);
  assert.doesNotMatch(uploads, /\.svg/);
});

test('login branding exposes only selected tenant-scoped image assets', () => {
  const migration = read('prisma/migrations/20260824050000_tenant_login_branding/migration.sql');
  assert.match(migration, /loginLogoPath/);
  assert.match(migration, /loginBackgroundPath/);

  const uploads = read('server/lib/uploads.ts');
  assert.match(uploads, /BRANDING_IMAGE_EXTENSIONS/);
  assert.match(uploads, /detectedImageType/);
  assert.match(uploads, /Image content does not match its file extension/);

  const publicTenant = read('server/routes/publicTenant.ts');
  const tenancyService = read('server/modules/tenancy/application/publicTenantBranding.ts');
  assert.match(tenancyService, /expectedPrefix = `\/uploads\/\$\{tenant\.id\}\/branding\//);
  assert.match(tenancyService, /isActive: true/);
  assert.match(publicTenant, /Cross-Origin-Resource-Policy', 'cross-origin'/);
  assert.doesNotMatch(publicTenant, /authMiddleware/);

  const settingsBusiness = read('server/routes/settingsBusiness.ts');
  const settingsSecurity = read('server/routes/settingsSecurity.ts');
  const businessService = read('server/modules/settings/application/manageBusinessSettings.ts');
  assert.match(settingsBusiness, /requireCapability\('settings\.manage\.business'\)/);
  assert.match(settingsSecurity, /requireCapability\('settings\.manage\.security'\)/);
  assert.doesNotMatch(businessService, /loginLogoPath/);
  assert.doesNotMatch(businessService, /loginBackgroundPath/);
});

test('production runtime rejects weak configuration', () => {
  const config = read('server/config.ts');
  const server = read('server/index.ts');
  const messages = read('src/pages/MessagesPage.tsx');
  assert.match(config, /at least 32 characters/);
  assert.match(config, /FRONTEND_URL must use HTTPS/);
  assert.match(config, /Production DATABASE_URL must use PostgreSQL/);
  assert.match(config, /globalIpRateLimitMax/);
  assert.match(server, /sessionRateLimitKey/);
  assert.match(server, /createHash\('sha256'\)\.update\(bearer\)/);
  assert.match(server, /max: runtimeConfig\.globalIpRateLimitMax/);
  assert.match(server, /max: runtimeConfig\.globalRateLimitMax,[\s\S]*key: sessionRateLimitKey/);
  assert.match(messages, /document\.visibilityState !== 'visible'/);
  assert.match(messages, /receivedNewMessage/);
  assert.match(messages, /const POLL_MS = 10_000/);
});

test('runtime database role cannot use superuser, BYPASSRLS, or wildcard tenant context', () => {
  const security = read('server/databaseSecurity.ts');
  const database = read('server/db.ts');
  const provision = read('scripts/provision-app-role.cjs');
  const loadEnv = read('server/loadEnv.ts');
  assert.match(database, /newClient\('__system__', 2\)/);
  assert.doesNotMatch(database, /newClient\('\*', 2\)/);
  assert.match(security, /bypassRls/);
  assert.match(security, /wildcardPolicyCount/);
  assert.match(security, /runtime database role can mutate the append-only AuditLog/);
  assert.match(provision, /NOBYPASSRLS/);
  assert.match(provision, /REVOKE INSERT, DELETE ON TABLE "Tenant"/);
  assert.match(provision, /REVOKE UPDATE, DELETE ON TABLE "AuditLog"/);
  assert.match(loadEnv, /process\.env\.NODE_ENV !== 'production'/);
  assert.match(loadEnv, /process\.env\.DATABASE_ADMIN_URL \|\|= process\.env\.DATABASE_URL/);
  assert.match(loadEnv, /runtimeUrl\.username = process\.env\.APP_DATABASE_USER/);

  const isolation = read('scripts/test-tenant-isolation.cjs');
  assert.match(isolation, /require\('\.\.\/dist-server\/loadEnv\.js'\)/);
  assert.match(isolation, /Remote tenant-isolation testing requires TENANT_ISOLATION_ALLOW_REMOTE=true/);
  assert.match(isolation, /systemPrisma\.workforceRequest\.findUnique/);
  assert.match(isolation, /disconnectPrisma\(\)/);
});

test('audit evidence is tenant-chained and runtime append-only', () => {
  const migration = read('prisma/migrations/20260826170000_tamper_evident_audit_log/migration.sql');
  const correlationMigration = read('prisma/migrations/20260826180000_audit_request_correlation/migration.sql');
  const structuredMigration = read('prisma/migrations/20260826190000_structured_audit_evidence/migration.sql');
  const auditService = read('server/modules/audit/application/auditReadModel.ts');
  const database = read('server/db.ts');
  const server = read('server/index.ts');
  const auditRoute = read('server/routes/auditQueries.ts');
  const auditExport = read('server/routes/auditExport.ts');
  const productionMigrate = read('scripts/production-migrate.cjs');
  assert.match(migration, /CREATE EXTENSION IF NOT EXISTS pgcrypto/);
  assert.match(migration, /hoterra_audit_hash/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /AuditLog_chain_insert/);
  assert.match(migration, /AuditLog_prevent_runtime_mutation/);
  assert.match(migration, /ALTER TABLE "AuditLog" FORCE ROW LEVEL SECURITY/);
  assert.match(correlationMigration, /hoterra_audit_hash_v2/);
  assert.match(correlationMigration, /audit_request_id/);
  assert.match(correlationMigration, /NEW\."requestId"/);
  assert.match(correlationMigration, /ALTER TABLE "AuditLog" FORCE ROW LEVEL SECURITY/);
  assert.match(structuredMigration, /hoterra_audit_hash_v3/);
  assert.match(structuredMigration, /audit_before_state/);
  assert.match(structuredMigration, /AuditLog_outcome_check/);
  assert.match(structuredMigration, /ALTER TABLE "AuditLog" FORCE ROW LEVEL SECURITY/);
  assert.match(database, /model === 'AuditLog' && requestId/);
  assert.match(database, /addAuditRequestId/);
  assert.match(server, /const requestId = randomUUID\(\)/);
  assert.doesNotMatch(server, /req\.headers\['x-request-id'\] \|\| randomUUID/);
  assert.match(server, /runWithRequestContext\(requestId, next\)/);
  assert.match(auditService, /Opened Audit Log and verified the tenant evidence chain/);
  assert.match(auditService, /ROW_NUMBER\(\) OVER \(ORDER BY log\."sequence"\)/);
  assert.match(auditService, /LAG\(log\."entryHash"\)/);
  assert.match(auditRoute, /post\('\/integrity'/);
  assert.match(auditExport, /get\('\/export\/evidence'/);
  assert.match(auditService, /HOTERRA_AUDIT_EVIDENCE/);
  assert.match(auditService, /previousHash: true/);
  assert.match(auditService, /entryHash: true/);
  assert.match(auditService, /requestId: true/);
  assert.match(auditService, /beforeState: true/);
  assert.match(auditService, /afterState: true/);
  assert.match(productionMigrate, /enforceRuntimeAppendOnlyPrivileges/);
  assert.match(productionMigrate, /REVOKE UPDATE, DELETE ON TABLE \"AuditLog\"/);
  assert.match(productionMigrate, /runPrisma\(\['migrate', 'deploy'\]\);[\s\S]*enforceRuntimeAppendOnlyPrivileges/);
});

test('tenant injection preserves Prisma scalar class instances', () => {
  const db = read('server/db.ts');
  assert.match(db, /Object\.getPrototypeOf\(value\)/);
  assert.match(db, /prototype !== Object\.prototype && prototype !== null/);
  assert.match(db, /Prisma arguments contain class instances such as Date/);
});

test('frontend CSP allows the production API and Cloudflare analytics only', () => {
  const frontend = read('scripts/serve-frontend.cjs');
  assert.match(frontend, /script-src 'self' https:\/\/static\.cloudflareinsights\.com/);
  assert.match(frontend, /img-src 'self' data: blob: https:\/\/api\.hoterra\.net/);
  assert.match(frontend, /connect-src 'self' https:\/\/api\.hoterra\.net https:\/\/cloudflareinsights\.com/);
  assert.doesNotMatch(frontend, /connect-src[^;]*up\.railway\.app/);
});

test('frontend build assets stay root-relative on nested SPA routes', () => {
  const viteConfig = read('vite.config.ts');
  assert.match(viteConfig, /base:\s*['"]\/["']/);
  assert.doesNotMatch(viteConfig, /base:\s*['"]\.\/["']/);
});

test('workforce HOD approvals remain visible and duplicate submissions are idempotent', () => {
  const workforceReadModel = read('server/modules/workforce/application/workforceRequestReadModel.ts');
  const approvalService = read('server/modules/workforce/application/approveWorkforceRequest.ts');
  assert.match(workforceReadModel, /hasParticipated:/);
  assert.match(workforceReadModel, /\['APPROVED', 'REJECTED'\]\.includes\(event\.action\)/);
  assert.match(approvalService, /\['APPROVED', 'GM_CONFIRMED_AUTO_SELECTED'\]\.includes\(last\.action\)/);
  assert.match(approvalService, /outcome: 'already_processed'/);

  const requestPage = read('src/pages/WorkforceRequestPage.tsx');
  assert.match(requestPage, /const load = async \(\) =>/);
  assert.match(requestPage, /await load\(\)/);
});

test('vendor approval is an atomic actor-scoped workforce application service', () => {
  const workforceRoute = read('server/routes/workforce.ts');
  const catalogRoute = read('server/routes/workforceCatalog.ts');
  const approvalService = read('server/modules/workforce/application/manageVendorApproval.ts');
  const approvalRoutes = catalogRoute.slice(
    catalogRoute.indexOf("router.post('/vendors/:id/approve'"),
    catalogRoute.indexOf("router.post('/rates'"),
  );
  assert.match(workforceRoute, /router\.use\(workforceCatalogRouter\)/);
  assert.match(catalogRoute, /approveVendor\(prisma, req\.user!, id/);
  assert.match(catalogRoute, /rejectVendor\(prisma, req\.user!, id/);
  assert.doesNotMatch(approvalRoutes, /approvalEvents:\s*\{\s*create:/);
  assert.match(approvalService, /database\.\$transaction/);
  assert.match(approvalService, /currentStepIndex:\s*vendor\.currentStepIndex/);
  assert.match(approvalService, /transaction\.vendorApprovalEvent\.create/);
  assert.match(approvalService, /transaction\.auditLog\.create/);
  assert.doesNotMatch(approvalService, /Role\.SYSTEM_ADMINISTRATOR/);
});

test('System Administrator has no Workforce business-service bypass', () => {
  const businessServices = [
    'approveWorkforceRequest.ts',
    'cancelWorkforceRequest.ts',
    'decideVendorCorrectionReview.ts',
    'evaluateWorkforceVendor.ts',
    'generateRecurringWorkforceRequests.ts',
    'manageVendorApproval.ts',
    'manageWorkforceActuals.ts',
    'manageWorkforceAdministration.ts',
    'manageWorkforceRequestDecision.ts',
    'manageWorkforceRequestPlanning.ts',
    'manageWorkforceTemplates.ts',
    'procurementAccess.ts',
    'requestVisibility.ts',
    'workforceMetaReadModel.ts',
    'workforceNotificationOutbox.ts',
    'workforceReportReadModel.ts',
    'workforceRequestReadModel.ts',
  ];
  for (const file of businessServices) {
    assert.doesNotMatch(
      read(`server/modules/workforce/application/${file}`),
      /Role\.SYSTEM_ADMINISTRATOR/,
      `${file} grants a technical administrator a business override`,
    );
  }
  assert.match(read('server/modules/workforce/application/simulateVendorResponse.ts'), /Role\.SYSTEM_ADMINISTRATOR/);
  assert.match(read('server/modules/workforce/application/workforceOutboxReadModel.ts'), /Role\.SYSTEM_ADMINISTRATOR/);
});

test('authentication middleware exposes no legacy role-only document bypass helpers', () => {
  const auth = read('server/middleware/auth.ts');
  assert.doesNotMatch(auth, /canViewAllDocuments|canViewDocument|canManageDocuments|VIEW_ALL_ROLES|MANAGE_DOC_ROLES/);
});

test('Workforce mutation adapters and decision services deny missing module access', () => {
  for (const adapter of [
    'server/routes/workforceDecisions.ts',
    'server/routes/workforceLifecycle.ts',
    'server/routes/workforceProcurement.ts',
  ]) {
    assert.match(read(adapter), /router\.use\(authMiddleware, requireCapability\('workforce\.read'\)\)/);
  }
  for (const service of [
    'manageWorkforceRequestDecision.ts',
    'manageVendorApproval.ts',
    'evaluateWorkforceVendor.ts',
    'manageWorkforceActuals.ts',
    'cancelWorkforceRequest.ts',
  ]) {
    assert.match(
      read(`server/modules/workforce/application/${service}`),
      /capabilities\.includes\('workforce\.read'\)/,
      `${service} does not enforce the module capability`,
    );
  }
});

test('unchanged accepted vendors are finalized atomically by Procurement', () => {
  const workforceRoute = read('server/routes/workforce.ts');
  const procurementRoute = read('server/routes/workforceProcurement.ts');
  const finalizationService = read('server/modules/workforce/application/finalizeWorkforceVendors.ts');
  const accessService = read('server/modules/workforce/application/procurementAccess.ts');
  assert.match(workforceRoute, /router\.use\(workforceProcurementRouter\)/);
  assert.match(procurementRoute, /finalizeWorkforceVendors\(prisma, req\.user!, id\)/);
  assert.match(finalizationService, /canManageProcurementWorkforce/);
  assert.match(finalizationService, /database\.\$transaction/);
  assert.match(finalizationService, /WorkforceRequestStatus\.VENDORS_FULLY_APPROVED/);
  assert.match(finalizationService, /transaction\.workforceRequestEvent\.create/);
  assert.match(finalizationService, /transaction\.auditLog\.create/);
  assert.match(finalizationService, /transaction\.notification\.createMany/);
  assert.match(accessService, /department\?\.code !== 'PR'/);
  assert.match(accessService, /capabilities\.includes\('workforce\.vendor\.manage'\)/);
  assert.doesNotMatch(accessService, /customRole\.permissions|workforcePermissions/);
});

test('vendor correction drafts and Finance submissions are transactional services', () => {
  const workforceRoute = read('server/routes/workforce.ts');
  const procurementRoute = read('server/routes/workforceProcurement.ts');
  const draftService = read('server/modules/workforce/application/draftVendorCorrection.ts');
  const submitService = read('server/modules/workforce/application/submitVendorCorrectionReview.ts');
  assert.match(workforceRoute, /router\.use\(workforceProcurementRouter\)/);
  assert.match(procurementRoute, /draftVendorCorrection\(prisma, req\.user!, id, itemId, req\.body\)/);
  assert.match(procurementRoute, /submitVendorCorrectionReview\(prisma, req\.user!, id\)/);
  assert.match(draftService, /canManageProcurementWorkforce/);
  assert.match(draftService, /pg_advisory_xact_lock/);
  assert.match(draftService, /transaction\.workforceVendorCorrection\.upsert/);
  assert.match(draftService, /transaction\.auditLog\.create/);
  assert.match(submitService, /status: 'PENDING_FD'/);
  assert.match(submitService, /transaction\.notification\.createMany/);
  assert.match(submitService, /transaction\.auditLog\.create/);
});

test('Finance and General Manager vendor-correction decisions are atomic', () => {
  const workforceRoute = read('server/routes/workforce.ts');
  const procurementRoute = read('server/routes/workforceProcurement.ts');
  const decisionService = read('server/modules/workforce/application/decideVendorCorrectionReview.ts');
  assert.match(workforceRoute, /router\.use\(workforceProcurementRouter\)/);
  assert.match(procurementRoute, /decideVendorCorrectionReview\(prisma, req\.user!, id, reviewId, req\.body\)/);
  assert.match(decisionService, /role === Role\.FINANCE_DIRECTOR/);
  assert.match(decisionService, /role === Role\.GENERAL_MANAGER/);
  assert.match(decisionService, /status: 'PENDING_GM'/);
  assert.match(decisionService, /status: 'APPROVED'/);
  assert.match(decisionService, /WorkforceRequestStatus\.VENDORS_FULLY_APPROVED/);
  assert.match(decisionService, /transaction\.vendorInvite\.updateMany/);
  assert.match(decisionService, /transaction\.auditLog\.create/);
  assert.match(decisionService, /transaction\.notification\.createMany/);
});

test('workforce rejection and returns to HOD are transactional application decisions', () => {
  const workforceRoute = read('server/routes/workforce.ts');
  const decisionsRoute = read('server/routes/workforceDecisions.ts');
  const decisionService = read('server/modules/workforce/application/manageWorkforceRequestDecision.ts');
  assert.match(workforceRoute, /router\.use\(workforceDecisionsRouter\)/);
  assert.match(decisionsRoute, /returnWorkforceRequestForRevision\(prisma, req\.user!, id, req\.body\)/);
  assert.match(decisionsRoute, /financeReturnWorkforceRequestToHod\(prisma, req\.user!, id, req\.body\)/);
  assert.match(decisionsRoute, /rejectWorkforceRequest\(prisma, req\.user!, id, req\.body\)/);
  assert.match(decisionService, /canDecideCurrentWorkforceStep/);
  assert.match(decisionService, /currentStepIndex: request\.currentStepIndex/);
  assert.match(decisionService, /WorkforceRequestStatus\.RETURNED_FOR_REVISION/);
  assert.match(decisionService, /WorkforceRequestStatus\.REJECTED/);
  assert.match(decisionService, /transaction\.auditLog\.create/);
  assert.match(decisionService, /transaction\.notification\.create/);
});

test('workforce step approval and final lowest-offer selection are atomic', () => {
  const workforceRoute = read('server/routes/workforce.ts');
  const decisionsRoute = read('server/routes/workforceDecisions.ts');
  const approvalService = read('server/modules/workforce/application/approveWorkforceRequest.ts');
  assert.match(workforceRoute, /router\.use\(workforceDecisionsRouter\)/);
  assert.match(decisionsRoute, /approveWorkforceRequest\(prisma, req\.user!, id, notificationOptions\(\)\)/);
  assert.match(approvalService, /canDecideCurrentWorkforceStep/);
  assert.match(approvalService, /pg_advisory_xact_lock/);
  assert.match(approvalService, /already_processed/);
  assert.match(approvalService, /orderBy: \[\{ price: 'asc' \}/);
  assert.match(approvalService, /VendorApprovalStatus\.APPROVED/);
  assert.match(approvalService, /WorkforceRequestStatus\.PROCUREMENT_REVIEW/);
  assert.match(approvalService, /transaction\.workforceRequestEvent\.create/);
  assert.match(approvalService, /transaction\.auditLog\.create/);
  assert.match(approvalService, /transaction\.notification\.create/);
  assert.match(approvalService, /transaction\.notification\.createMany/);
  assert.match(approvalService, /Procurement confirmation required/);
});

test('Procurement selection confirmation and vendor dispatch are one atomic use case', () => {
  const workforceRoute = read('server/routes/workforce.ts');
  const procurementRoute = read('server/routes/workforceProcurement.ts');
  const dispatchService = read('server/modules/workforce/application/dispatchWorkforceRequestToVendors.ts');
  const accessService = read('server/modules/workforce/application/procurementAccess.ts');
  assert.match(workforceRoute, /router\.use\(workforceProcurementRouter\)/);
  assert.match(procurementRoute, /confirmAndDispatchWorkforceRequest\(prisma, req\.user!, id/);
  assert.doesNotMatch(procurementRoute, /confirmProcurementSelection\(prisma/);
  assert.match(dispatchService, /canConfirmProcurementSelection/);
  assert.match(dispatchService, /pg_advisory_xact_lock/);
  assert.match(dispatchService, /confirmSelection[\s\S]*WorkforceRequestStatus\.PROCUREMENT_REVIEW/);
  assert.match(dispatchService, /data: \{ status: WorkforceRequestStatus\.SENT_TO_VENDOR \}/);
  assert.match(dispatchService, /transaction\.vendorInvite\.create/);
  assert.match(dispatchService, /transaction\.emailOutbox\.create/);
  assert.match(dispatchService, /transaction\.workforceRequestEvent\.create/);
  assert.match(dispatchService, /transaction\.auditLog\.create/);
  assert.match(accessService, /actor\.role === Role\.HOD/);
});

test('vendor responses cannot be impersonated by hotel users in production', () => {
  const workforceRoute = read('server/routes/workforce.ts');
  const simulationRoute = read('server/routes/workforceSimulation.ts');
  const simulationService = read('server/modules/workforce/application/simulateVendorResponse.ts');
  const vendorResponseService = read('server/modules/workforce/application/respondToVendorInvite.ts');
  const requestPage = read('src/pages/WorkforceRequestPage.tsx');
  const apiClient = read('src/lib/api.ts');
  const config = read('server/config.ts');
  assert.match(config, /vendorSimulationEnabled: !isProduction && process\.env\.ENABLE_VENDOR_SIMULATION === 'true'/);
  assert.match(workforceRoute, /router\.use\(workforceSimulationRouter\)/);
  assert.doesNotMatch(workforceRoute, /'\/requests\/:id\/vendor-(accept|decline)'/);
  assert.match(simulationRoute, /if \(runtimeConfig\.vendorSimulationEnabled\) \{/);
  assert.match(simulationRoute, /'\/requests\/:id\/vendor-accept'[\s\S]*?requireRoles\(Role\.SYSTEM_ADMINISTRATOR\)/);
  assert.match(simulationRoute, /'\/requests\/:id\/vendor-decline'[\s\S]*?requireRoles\(Role\.SYSTEM_ADMINISTRATOR\)/);
  assert.match(simulationRoute, /simulateVendorResponse\(prisma, req\.user!, id, action, req\.body\)/);
  assert.match(simulationService, /actor\.role !== Role\.SYSTEM_ADMINISTRATOR/);
  assert.match(simulationService, /respondToVendorInvite\([\s\S]*actor/);
  assert.match(vendorResponseService, /if \(simulationActor\)[\s\S]*transaction\.auditLog\.create/);
  assert.doesNotMatch(requestPage, /Simulate Accept/);
  assert.doesNotMatch(apiClient, /vendorAcceptWorkforceRequest/);
  const dispatchService = read('server/modules/workforce/application/dispatchWorkforceRequestToVendors.ts');
  assert.match(dispatchService, /canConfirmProcurementSelection\(database, actor\)/);
});

test('public vendor invite responses are request-locked and idempotent', () => {
  const vendorAdapter = read('server/routes/vendorPortal.ts');
  const responseService = read('server/modules/workforce/application/respondToVendorInvite.ts');
  assert.match(vendorAdapter, /respondToVendorInvite\(prisma, routeParam\(req\.params\.token\), 'accept'\)/);
  assert.match(responseService, /pg_advisory_xact_lock/);
  assert.match(responseService, /alreadyProcessed: true/);
  assert.match(responseService, /transaction\.vendorInvite\.updateMany/);
  assert.match(responseService, /transaction\.workforceRequest\.updateMany/);
  assert.match(responseService, /transaction\.workforceRequestEvent\.create/);
  assert.match(responseService, /transaction\.auditLog\.create/);
  assert.match(responseService, /transaction\.notification\.create/);
});

test('workforce actuals and HOD/Finance confirmations are locked application services', () => {
  const workforceRoute = read('server/routes/workforce.ts');
  const lifecycleRoute = read('server/routes/workforceLifecycle.ts');
  const actualsService = read('server/modules/workforce/application/manageWorkforceActuals.ts');
  assert.match(workforceRoute, /router\.use\(workforceLifecycleRouter\)/);
  assert.match(lifecycleRoute, /submitWorkforceActuals\(prisma, req\.user!, id, req\.body\)/);
  assert.match(lifecycleRoute, /confirmWorkforceActualsByHod\(prisma, req\.user!, id\)/);
  assert.match(lifecycleRoute, /confirmWorkforceActualsByFinance\(prisma, req\.user!, id\)/);
  assert.match(actualsService, /canConfirmProcurementSelection/);
  assert.match(actualsService, /ACTUALS_LOCKED/);
  assert.match(actualsService, /actor\.departmentId === request\.departmentId/);
  assert.match(actualsService, /pg_advisory_xact_lock/);
  assert.match(actualsService, /WorkforceRequestStatus\.COMPLETED/);
  assert.match(actualsService, /transaction\.workforceRequestEvent\.create/);
  assert.match(actualsService, /transaction\.auditLog\.create/);
  assert.match(actualsService, /transaction\.notification\.create/);
});

test('workforce cancellation is stage-scoped, invoice-safe, and transactional', () => {
  const workforceRoute = read('server/routes/workforce.ts');
  const lifecycleRoute = read('server/routes/workforceLifecycle.ts');
  const cancellationService = read('server/modules/workforce/application/cancelWorkforceRequest.ts');
  assert.match(workforceRoute, /router\.use\(workforceLifecycleRouter\)/);
  assert.match(lifecycleRoute, /cancelWorkforceRequest\(prisma, req\.user!, id, req\.body\)/);
  assert.match(cancellationService, /CREATOR_CANCELLABLE/);
  assert.match(cancellationService, /WorkforceRequestStatus\.VENDORS_FULLY_APPROVED/);
  assert.match(cancellationService, /INVOICE_EXISTS/);
  assert.match(cancellationService, /pg_advisory_xact_lock/);
  assert.match(cancellationService, /transaction\.vendorInvite\.updateMany/);
  assert.match(cancellationService, /transaction\.workforceRequestEvent\.create/);
  assert.match(cancellationService, /transaction\.auditLog\.create/);
  assert.match(cancellationService, /transaction\.notification\.create/);
});

test('quality evaluations are vendor-specific, scoped, and do not bypass Finance completion', () => {
  const workforceRoute = read('server/routes/workforce.ts');
  const lifecycleRoute = read('server/routes/workforceLifecycle.ts');
  const evaluationService = read('server/modules/workforce/application/evaluateWorkforceVendor.ts');
  const requestPage = read('src/pages/WorkforceRequestPage.tsx');
  assert.match(workforceRoute, /router\.use\(workforceLifecycleRouter\)/);
  assert.match(lifecycleRoute, /evaluateWorkforceVendor\(prisma, req\.user!, id, req\.body\)/);
  assert.match(lifecycleRoute, /requestWorkforceVendorReplacement\(prisma, req\.user!, id, req\.body\)/);
  assert.match(evaluationService, /selectAssignedVendor/);
  assert.match(evaluationService, /ids\.length > 1 && !requested/);
  assert.match(evaluationService, /actor\.departmentId === request\.departmentId/);
  assert.match(evaluationService, /lowCount >= 5/);
  assert.match(evaluationService, /WorkforceRequestStatus\.AWAITING_EVALUATION/);
  assert.match(evaluationService, /transaction\.auditLog\.create/);
  assert.match(requestPage, /selectedEvaluationVendor/);
  assert.match(requestPage, /item\.vendor\.name/);
});

test('Procurement Workforce managers can access cross-department requests', () => {
  const workforceReadModel = read('server/modules/workforce/application/workforceRequestReadModel.ts');
  assert.match(workforceReadModel, /canManageProcurementWorkforce\(database, actor\)/);
  assert.match(workforceReadModel, /const hotelWide = HOTEL_WIDE_ROLES\.includes\(actor\.role\) \|\| procurementViewer/);
  assert.match(workforceReadModel, /isProcurementViewer: procurementViewer/);
});

test('workforce actuals support in-service requests and remain role protected', () => {
  const lifecycleRoute = read('server/routes/workforceLifecycle.ts');
  assert.match(lifecycleRoute, /Department HOD or Procurement permission required/);

  const actualsService = read('server/modules/workforce/application/manageWorkforceActuals.ts');
  assert.match(actualsService, /WorkforceRequestStatus\.IN_SERVICE/);
  assert.match(actualsService, /canConfirmProcurementSelection\(database, actor\)/);

  const requestPage = read('src/pages/WorkforceRequestPage.tsx');
  assert.match(requestPage, /canEnterActuals/);
  assert.match(requestPage, /'IN_SERVICE', 'AWAITING_EVALUATION'/);
});

test('workforce mutation responses reuse the scoped request detail read model', () => {
  const workforceRoute = read('server/routes/workforce.ts');
  const planningRoute = read('server/routes/workforcePlanning.ts');
  const httpHelpers = read('server/routes/workforceHttp.ts');
  assert.match(httpHelpers, /return getWorkforceRequestDetail\(prisma, req\.user!, requestId\)/);
  assert.doesNotMatch(workforceRoute, /formatRequest\(/);
  assert.doesNotMatch(planningRoute, /formatRequest\(/);
  assert.doesNotMatch(workforceRoute, /Legacy body retained temporarily/);
});

test('multi-vendor workforce invoices require and match the selected vendor share', () => {
  const payrollRoute = read('server/routes/workforcePayroll.ts');
  assert.match(payrollRoute, /vendorId is required for multi-vendor requests/);
  assert.match(payrollRoute, /Selected vendor is not assigned to this request/);

  const payroll = read('server/modules/workforce/application/manageWorkforcePayroll.ts');
  assert.match(payroll, /capabilities\.includes\('workforce\.invoice\.manage'\)/);
  assert.match(payroll, /vendorEstimatedCost/);
  assert.match(payroll, /vendorEstimatedHours/);

  const panel = read('src/components/workforce/WorkforceAdminPanels.tsx');
  assert.match(panel, /vendorId: form\.vendorId/);
  assert.match(panel, /Vendor…/);
});

test('workforce payroll is transactional, duplicate-safe, and cannot bypass matching', () => {
  const payroll = read('server/modules/workforce/application/manageWorkforcePayroll.ts');
  assert.match(payroll, /pg_advisory_xact_lock/);
  assert.match(payroll, /DUPLICATE_INVOICE/);
  assert.match(payroll, /mode: 'insensitive'/);
  assert.match(payroll, /invoiceHours < 0/);
  assert.match(payroll, /invoiceAmount < 0/);
  assert.match(payroll, /invoice\.status !== 'MATCHED'/);
  assert.match(payroll, /paidAt, paidById: actor\.id/);
  assert.match(payroll, /return \{ invoice: result, status: result\.status \}/);
  assert.match(payroll, /auditLog\.create/);

  const route = read('server/routes/workforce.ts');
  const payrollRoute = read('server/routes/workforcePayroll.ts');
  assert.match(route, /router\.use\(workforcePayrollRouter\)/);
  assert.match(payrollRoute, /router\.use\('\/payroll', authMiddleware, requireCapability\('workforce\.invoice\.manage'\)\)/);
  assert.match(payrollRoute, /createWorkforceInvoice\(prisma, req\.user!, req\.body\)/);
  assert.match(payrollRoute, /matchWorkforceInvoice\(prisma, req\.user!, routeParam/);
  assert.match(payrollRoute, /markWorkforceInvoicePaid\(prisma, req\.user!, routeParam/);
});

test('workforce administration uses capabilities and keeps GM out of Procurement overrides', () => {
  const settings = read('server/modules/workforce/application/manageWorkforceSettings.ts');
  assert.match(settings, /capabilities\.includes\('workforce\.settings\.manage'\)/);
  assert.match(settings, /payrollTolerancePct, 0, 100/);
  assert.match(settings, /pg_advisory_xact_lock/);
  assert.match(settings, /auditLog\.create/);

  const procurement = read('server/modules/workforce/application/procurementAccess.ts');
  assert.doesNotMatch(procurement, /SYSTEM_ADMINISTRATOR \|\| actor\.role === Role\.GENERAL_MANAGER/);
  assert.doesNotMatch(procurement, /workforcePermissions\?\.\[1\]/);

  const page = read('src/pages/WorkforcePage.tsx');
  assert.match(page, /capability: 'workforce\.invoice\.manage'/);
  assert.match(page, /capability: 'workforce\.routes\.manage'/);
  assert.match(page, /capability: 'workforce\.settings\.manage'/);
  assert.match(page, /canManageCatalog &&/);

  const route = read('server/routes/workforce.ts');
  const configurationRoute = read('server/routes/workforceConfiguration.ts');
  const metaReadModel = read('server/modules/workforce/application/workforceMetaReadModel.ts');
  assert.match(route, /router\.use\(workforceConfigurationRouter\)/);
  assert.match(configurationRoute, /getWorkforceMeta\(prisma, req\.user!\)/);
  assert.match(metaReadModel, /where: canManageRoutes \? undefined : noRows/);
  assert.match(metaReadModel, /actor\.role === Role\.HOD && actor\.departmentId/);
  assert.match(metaReadModel, /where: canSeeVendorCatalog \? undefined : noRows/);
  assert.match(metaReadModel, /database\.workforceSettings\.findFirst\(\)/);
  assert.doesNotMatch(metaReadModel, /workforceSettings\.create/);
});

test('workforce catalog mutations are Procurement-scoped, validated, and audited', () => {
  const catalog = read('server/modules/workforce/application/manageWorkforceCatalog.ts');
  const vendorApproval = read('server/modules/workforce/application/manageVendorApproval.ts');
  const notificationOutbox = read('server/modules/workforce/application/workforceNotificationOutbox.ts');
  assert.match(catalog, /canManageProcurementWorkforce\(database, actor\)/);
  assert.match(catalog, /pg_advisory_xact_lock/);
  assert.match(catalog, /mode: 'insensitive'/);
  assert.match(catalog, /price < 0 \|\| price > 1_000_000/);
  assert.match(catalog, /approvalStatus: VendorApprovalStatus\.PENDING_APPROVAL/);
  assert.match(catalog, /needsResubmission/);
  assert.match(catalog, /action: 'RESUBMITTED'/);
  assert.match(catalog, /serviceRates: \{ updateMany:/);
  assert.match(catalog, /auditLog\.create/g);
  assert.match(catalog, /queueVendorApprovalNotifications\(transaction, vendor, notificationOptions\)/);
  assert.match(vendorApproval, /queueVendorApprovalNotifications\(transaction, updatedVendor, notificationOptions\)/);
  assert.match(notificationOutbox, /transaction\.notification\.createMany/);
  assert.match(notificationOutbox, /transaction\.emailOutbox\.createMany/);
  assert.match(notificationOutbox, /status: options\.emailDeliveryEnabled \? 'QUEUED' : 'DISABLED'/);

  const route = read('server/routes/workforce.ts');
  const catalogRoute = read('server/routes/workforceCatalog.ts');
  assert.match(route, /router\.use\(workforceCatalogRouter\)/);
  assert.match(catalogRoute, /createWorkforcePosition\(prisma, req\.user!, req\.body\)/);
  assert.match(catalogRoute, /createWorkforceVendor\(prisma, req\.user!, req\.body, notificationOptions\(\)\)/);
  assert.match(catalogRoute, /upsertWorkforceRate\(prisma, req\.user!, req\.body\)/);
  assert.doesNotMatch(catalogRoute, /Failed to notify vendor approvers/);
  assert.doesNotMatch(catalogRoute, /prisma\.notification\./);
  assert.doesNotMatch(catalogRoute, /requireCatalogManager/);
});

test('workforce approval routes and budgets are capability-scoped transactional services', () => {
  const administration = read('server/modules/workforce/application/manageWorkforceAdministration.ts');
  assert.match(administration, /capabilities\.includes\('workforce\.routes\.manage'\)/);
  assert.match(administration, /capabilities\.includes\('workforce\.budget\.manage'\)/);
  assert.match(administration, /HR_DEPARTMENT_REQUIRED/);
  assert.match(administration, /Human Resources — Head of Department/);
  assert.match(administration, /const steps: WorkforceApprovalStep\[\] = \[requesterHod, \.\.\.customSteps, hrHod, finance, generalManager\]/);
  assert.match(administration, /month < 1 \|\| month > 12/);
  assert.match(administration, /rawAmount < 0 \|\| rawAmount > 1_000_000_000/);
  assert.match(administration, /pg_advisory_xact_lock/g);
  assert.match(administration, /auditLog\.create/g);

  const route = read('server/routes/workforce.ts');
  const configurationRoute = read('server/routes/workforceConfiguration.ts');
  assert.match(route, /router\.use\(workforceConfigurationRouter\)/);
  assert.match(configurationRoute, /requireCapability\('workforce\.routes\.manage'\)/);
  assert.match(configurationRoute, /requireCapability\('workforce\.budget\.manage'\)/);
  assert.match(configurationRoute, /saveWorkforceApprovalRoute\(prisma, req\.user!/);
  assert.match(configurationRoute, /saveDepartmentCasualBudget\(prisma, req\.user!/);

  const panel = read('src/components/workforce/WorkforceAdminPanels.tsx');
  assert.match(panel, /canManageRoutes: boolean/);
  assert.match(panel, /canManageBudget: boolean/);
});

test('workforce templates are department-scoped and recurring automation is privileged', () => {
  const templates = read('server/modules/workforce/application/manageWorkforceTemplates.ts');
  assert.match(templates, /capabilities\.includes\('workforce\.templates\.manage'\)/);
  assert.match(templates, /departmentId !== actor\.departmentId/);
  assert.match(templates, /RECURRING_FORBIDDEN/);
  assert.match(templates, /capabilities\.includes\('workforce\.settings\.manage'\)/);
  assert.match(templates, /approvalStatus !== VendorApprovalStatus\.APPROVED/);
  assert.match(templates, /isActive: false, isRecurring: false/);
  assert.match(templates, /pg_advisory_xact_lock/g);
  assert.match(templates, /auditLog\.create/g);

  const route = read('server/routes/workforce.ts');
  const configurationRoute = read('server/routes/workforceConfiguration.ts');
  const operationsRoute = read('server/routes/workforceOperations.ts');
  assert.match(route, /router\.use\(workforceConfigurationRouter\)/);
  assert.match(configurationRoute, /requireCapability\('workforce\.templates\.manage'\)/);
  assert.match(configurationRoute, /createWorkforceTemplate\(prisma, req\.user!, req\.body\)/);
  assert.match(configurationRoute, /disableWorkforceTemplate\(prisma, req\.user!/);
  assert.match(route, /router\.use\(workforceOperationsRouter\)/);
  assert.match(operationsRoute, /'\/recurring\/run'[\s\S]*requireCapability\('workforce\.settings\.manage'\)/);

  const panel = read('src/components/workforce/WorkforceAdminPanels.tsx');
  assert.match(panel, /canManageRecurring: boolean/);
  assert.match(panel, /canManageRecurring &&/);
});

test('workforce reports and CSV exports share an actor-scoped read model', () => {
  const readModel = read('server/modules/workforce/application/workforceReportReadModel.ts');
  assert.match(readModel, /capabilities\.includes\('workforce\.reports\.read'\)/);
  assert.match(readModel, /capabilities\.includes\('workforce\.reports\.export'\)/);
  assert.match(readModel, /actor\.departmentId \|\| '__unassigned_department__'/);
  assert.match(readModel, /department\?\.code === 'PR'/);
  assert.match(readModel, /month < 1 \|\| month > 12/);
  assert.match(readModel, /buildWorkforceReport\(database, selectedPeriod\.year, selectedPeriod\.month, scope\)/g);
  assert.match(readModel, /action: AuditAction\.DOWNLOAD/);
  assert.match(readModel, /\\uFEFF/);

  const builder = read('server/modules/workforce/application/buildWorkforceReport.ts');
  assert.match(builder, /hideUnconfirmedVendors/);
  assert.match(builder, /Pending Procurement confirmation/);
  assert.match(builder, /if \(group\.visible\)/);
  assert.doesNotMatch(builder, /import \{ prisma \} from/);

  const route = read('server/routes/workforce.ts');
  const reportRoute = read('server/routes/workforceReports.ts');
  assert.match(route, /router\.use\(workforceReportsRouter\)/);
  assert.match(reportRoute, /getWorkforceReport\(prisma, req\.user!, req\.query\)/);
  assert.match(reportRoute, /exportWorkforceReportCsv\(prisma, req\.user!, req\.query\)/);
  assert.match(reportRoute, /requireCapability\('workforce\.reports\.read'\)/);
  assert.match(reportRoute, /requireCapability\('workforce\.reports\.export'\)/);
});

test('ended workforce requests advance through an audited scheduler use case, never a GET side effect', () => {
  const lifecycle = read('server/modules/workforce/application/reconcileWorkforceLifecycle.ts');
  assert.match(lifecycle, /database\.\$transaction/);
  assert.match(lifecycle, /endDate: \{ lt: endedBefore \}/);
  assert.match(lifecycle, /status: \{ in: ENDABLE_STATUSES \}/);
  assert.match(lifecycle, /where: \{ id: request\.id, status: request\.status \}/);
  assert.match(lifecycle, /status: WorkforceRequestStatus\.AWAITING_EVALUATION/);
  assert.match(lifecycle, /action: 'FINAL_EVALUATION_DUE'/);
  assert.match(lifecycle, /action: AuditAction\.UPDATE/);
  assert.match(lifecycle, /notification\.createMany/);
  assert.match(lifecycle, /link: `\/workforce\/\$\{request\.id\}`/);

  const scheduler = read('server/modules/workforce/infrastructure/workforceScheduler.ts');
  const automation = read('server/modules/workforce/application/runWorkforceAutomation.ts');
  assert.match(scheduler, /runWorkforceAutomation\(prisma, \{/);
  assert.match(automation, /reconcileWorkforceLifecycle\(database, now\)/);

  const route = read('server/routes/workforce.ts');
  assert.doesNotMatch(route, /updateEndedRequests/);
  assert.doesNotMatch(route, /router\.get\([\s\S]{0,250}workforceRequest\.updateMany/);
});

test('workforce request creation and revision are locked transactional planning use cases', () => {
  const planning = read('server/modules/workforce/application/manageWorkforceRequestPlanning.ts');
  assert.match(planning, /capabilities\.includes\('workforce\.request\.create'\)/);
  assert.match(planning, /actor\.departmentId !== departmentId/);
  assert.match(planning, /pg_advisory_xact_lock/g);
  assert.match(planning, /maximum \+ 1/);
  assert.match(planning, /rawItems\.length > 100/);
  assert.match(planning, /quantity > 10_000/);
  assert.match(planning, /Number\(hours\) > 24/);
  assert.match(planning, /approvalStatus: VendorApprovalStatus\.APPROVED/);
  assert.match(planning, /Human Resources — Head of Department/);
  assert.match(planning, /endDate.*366|inclusiveWorkforceDays\(start, end\) > 366/);
  assert.match(planning, /status: 'EXPIRED'/);
  assert.match(planning, /workforceVendorCorrectionReview\.deleteMany/);
  assert.match(planning, /_count: \{ select: \{ invoices: true \} \}/);
  assert.match(planning, /action: AuditAction\.CREATE/);
  assert.match(planning, /action: AuditAction\.SUBMIT/);
  assert.match(planning, /queueRequestApprovalNotifications\(transaction/);

  const notificationOutbox = read('server/modules/workforce/application/workforceNotificationOutbox.ts');
  assert.match(notificationOutbox, /Casual staff approval required/);
  assert.match(notificationOutbox, /entityType: 'WorkforceRequest'/);
  assert.match(notificationOutbox, /transaction\.notification\.createMany/);
  assert.match(notificationOutbox, /transaction\.emailOutbox\.createMany/);

  const route = read('server/routes/workforce.ts');
  const planningRoute = read('server/routes/workforcePlanning.ts');
  assert.match(route, /router\.use\(workforcePlanningRouter\)/);
  assert.match(planningRoute, /createWorkforceRequest\(prisma, req\.user!, req\.body, notificationOptions\(\)\)/);
  assert.match(planningRoute, /reviseAndResubmitWorkforceRequest\(prisma, req\.user!, id, req\.body, notificationOptions\(\)\)/);
  assert.match(planningRoute, /'\/requests\/:id\/resubmit'[\s\S]{0,160}requireCapability\('workforce\.request\.create'\)/);
  assert.doesNotMatch(planningRoute, /const normalizedItems = \[\] as Array/);
});

test('workforce request read models enforce actor scope and never expose vendor bearer tokens', () => {
  const readModel = read('server/modules/workforce/application/workforceRequestReadModel.ts');
  assert.match(readModel, /capabilities\.includes\('workforce\.read'\)/);
  assert.match(readModel, /Object\.values\(WorkforceRequestStatus\)\.includes/);
  assert.match(readModel, /canManageProcurementWorkforce\(database, actor\)/);
  assert.match(readModel, /canViewWorkforceRequest\(actor, request/);
  assert.match(readModel, /isCurrentApprover: canApproveCurrentStep/);
  assert.match(
    read('server/modules/workforce/application/workforceRequestSerialization.ts'),
    /return canDecideCurrentWorkforceStep\(user, request\)/,
  );
  assert.match(readModel, /hasParticipated:/);
  assert.match(readModel, /take: 500/);
  assert.match(readModel, /VENDOR_DETAILS_VISIBLE_STATUSES/);
  assert.match(readModel, /invites: \[\]/);
  assert.match(readModel, /const \{ token: _token, portalPath: _portalPath, \.\.\.safe \}/);

  const serializer = read('server/modules/workforce/application/workforceRequestSerialization.ts');
  assert.doesNotMatch(serializer, /portalPath: `\/vendor\/order\/\$\{i\.token\}`/);
  assert.doesNotMatch(serializer, /\n\s+token: i\.token,/);

  const route = read('server/routes/workforce.ts');
  const planningRoute = read('server/routes/workforcePlanning.ts');
  assert.match(route, /router\.use\(workforcePlanningRouter\)/);
  assert.match(planningRoute, /listWorkforceRequests\(prisma, req\.user!, req\.query\)/);
  assert.match(planningRoute, /getWorkforceRequestDetail\(prisma, req\.user!, routeParam\(req\.params\.id\)\)/);

  const page = read('src/pages/WorkforceRequestPage.tsx');
  assert.match(page, /Vendor dispatch status/);
  assert.doesNotMatch(page, /href=\{inv\.portalPath\}/);
});

test('recurring workforce generation is tenant-local, timezone-aware, locked, and atomic', () => {
  const generator = read('server/modules/workforce/application/generateRecurringWorkforceRequests.ts');
  assert.match(generator, /systemSettings\.findFirst\(\{ select: \{ timezone: true \} \}\)/);
  assert.match(generator, /Intl\.DateTimeFormat/);
  assert.match(generator, /pg_advisory_xact_lock/);
  assert.match(generator, /workforce-recurring:\$\{templateId\}/);
  assert.match(generator, /lastGeneratedAt.*tenantDateKey/);
  assert.match(generator, /createWorkforceRequestInTransaction/);
  assert.match(generator, /notification: notificationOptions/);
  assert.match(generator, /workforceRequestTemplate\.update/);
  assert.match(generator, /role: Role\.HOD, departmentId: template\.departmentId/);

  const scheduler = read('server/modules/workforce/infrastructure/workforceScheduler.ts');
  const automation = read('server/modules/workforce/application/runWorkforceAutomation.ts');
  assert.match(scheduler, /runRecurringTemplatesForCurrentTenant/);
  assert.match(scheduler, /systemPrisma\.tenant\.findMany/);
  assert.match(scheduler, /runWithTenant/);
  assert.match(scheduler, /runWorkforceAutomation\(prisma, \{/);
  assert.match(automation, /reconcileWorkforceLifecycle\(database, now\)/);
  assert.match(automation, /generateRecurringWorkforceRequests\(database, notificationOptions, now\)/);
  assert.doesNotMatch(scheduler, /notifyApprovers/);

  const route = read('server/routes/workforce.ts');
  const operationsRoute = read('server/routes/workforceOperations.ts');
  assert.match(route, /router\.use\(workforceOperationsRouter\)/);
  assert.match(operationsRoute, /runWorkforceAutomation\(prisma, workforceNotificationOptions\(\)\)/);
  assert.doesNotMatch(operationsRoute, /lib\/workforceRecurring/);
  assert.match(operationsRoute, /requireCapability\('workforce\.settings\.manage'\)/);
  assert.doesNotMatch(operationsRoute, /const created = await runRecurringTemplates\(\)/);
});

test('vendor dispatch and resend rotate bearer tokens and commit through the email outbox', () => {
  const dispatch = read('server/modules/workforce/application/dispatchWorkforceRequestToVendors.ts');
  const tokenPolicy = read('server/modules/workforce/domain/vendorInviteToken.ts');
  assert.match(dispatch, /canConfirmProcurementSelection\(database, actor\)/);
  assert.match(dispatch, /database\.\$transaction/);
  assert.match(dispatch, /pg_advisory_xact_lock/);
  assert.match(dispatch, /status: options\.resend \? 'REPLACED' : 'EXPIRED'/);
  assert.match(dispatch, /createVendorInviteToken\(\)/);
  assert.match(dispatch, /token: inviteToken\.stored/);
  assert.match(dispatch, /inviteToken\.raw/);
  assert.match(tokenPolicy, /randomBytes\(32\)/);
  assert.match(tokenPolicy, /createHash\('sha256'\)/);
  assert.match(dispatch, /MISSING_VENDOR_EMAIL/);
  assert.doesNotMatch(dispatch, /ops@/);
  assert.match(dispatch, /emailOutbox\.create/);
  assert.match(dispatch, /entityType: 'VendorInvite'/);
  assert.match(dispatch, /workforceRequestEvent\.create/);
  assert.match(dispatch, /auditLog\.create/);
  assert.match(dispatch, /createdCount: created\.length/);

  const route = read('server/routes/workforce.ts');
  const procurementRoute = read('server/routes/workforceProcurement.ts');
  assert.match(route, /router\.use\(workforceProcurementRouter\)/);
  assert.match(procurementRoute, /confirmAndDispatchWorkforceRequest\(prisma, req\.user!, id/);
  assert.match(procurementRoute, /dispatchWorkforceRequestToVendors\(prisma, req\.user!, id/);
  assert.match(procurementRoute, /resend: true/);
  assert.doesNotMatch(procurementRoute, /requestConfirmed: true/);
  assert.doesNotMatch(procurementRoute, /dispatchToVendors\(id\)/);

  const portalReadModel = read('server/modules/workforce/application/vendorPortalReadModel.ts');
  assert.match(portalReadModel, /vendorInviteTokenCandidates/);
  assert.equal(fs.existsSync(path.resolve(root, 'server/lib/workforceVendor.ts')), false);
});

test('dashboard workforce tasks cover the exact lifecycle actor without read-model overrides', () => {
  const tasks = read('server/modules/workforce/application/listPendingWorkforceTasks.ts');
  const serializer = read('server/modules/workforce/application/workforceRequestSerialization.ts');
  const dashboard = read('server/modules/reporting/application/getDashboardStats.ts');
  assert.match(serializer, /return canDecideCurrentWorkforceStep\(user, request\)/);
  assert.doesNotMatch(serializer, /isPrivilegedApprover/);
  assert.match(tasks, /Confirm selected vendors/);
  assert.match(tasks, /Review vendor changes/);
  assert.match(tasks, /Complete final vendor evaluation/);
  assert.match(tasks, /Submit service actuals/);
  assert.match(tasks, /Confirm service delivery/);
  assert.match(tasks, /Confirm actuals and complete/);
  assert.match(tasks, /canManageProcurementWorkforce\(database, actor\)/);
  assert.match(tasks, /canConfirmProcurementSelection\(database, actor\)/);
  assert.match(tasks, /canReviewVendorCorrection\(actor\.role, correctionReview\.status\)/);
  assert.match(dashboard, /action: request\.action/);
});

test('private files and login tokens have revocable tenant-safe boundaries', () => {
  const fileRoute = read('server/routes/files.ts');
  const documentFiles = read('server/modules/documents/application/getDocumentFile.ts');
  const ownSignature = read('server/modules/identity/application/getOwnSignatureFile.ts');
  const privateFiles = read('server/lib/privateFiles.ts');
  const uploads = read('server/lib/uploads.ts');
  const authMiddleware = read('server/middleware/auth.ts');
  const authService = read('server/modules/authentication/application/manageAccountSession.ts');
  const userAccounts = read('server/modules/identity/application/manageUserAccounts.ts');
  const migration = read('prisma/migrations/20260826030000_revocable_auth_tokens/migration.sql');

  assert.match(fileRoute, /getPrimaryDocumentFile\(prisma, req\.user!/);
  assert.match(fileRoute, /getOwnSignatureFile\(prisma, req\.user!/);
  assert.match(documentFiles, /canDownloadDocument\(actor, document\)/);
  assert.match(documentFiles, /canReadDocument\(actor, signature\.document\)/);
  assert.match(documentFiles, /tenantId: actor\.tenantId/g);
  assert.match(ownSignature, /requestedUserId !== actor\.id/);
  assert.match(ownSignature, /tenantId: actor\.tenantId/);
  assert.doesNotMatch(fileRoute, /canViewDocument/);
  assert.match(privateFiles, /resolveTenantUploadPath/);
  assert.match(privateFiles, /Cache-Control', 'private, no-store/);
  assert.match(uploads, /expectedPrefix = `\/uploads\/\$\{tenant\.id\}\//);
  assert.match(authMiddleware, /claims\.version !== currentUser\.tokenVersion/);
  assert.match(authService, /tokenVersion: \{ increment: 1 \}/);
  assert.match(userAccounts, /data\.tokenVersion = \{ increment: 1 \}/);
  assert.match(migration, /ADD COLUMN "tokenVersion" INTEGER NOT NULL DEFAULT 0/);
});

test('expired vendor links are closed and public responses are rate limited', () => {
  const portal = read('server/routes/vendorPortal.ts');
  const portalReadModel = read('server/modules/workforce/application/vendorPortalReadModel.ts');
  const responseService = read('server/modules/workforce/application/respondToVendorInvite.ts');
  const portalPage = read('src/pages/VendorPortalPage.tsx');
  assert.match(portal, /vendorReadLimiter/);
  assert.match(portal, /vendorResponseLimiter/);
  assert.match(portal, /res\.status\(410\)/);
  assert.doesNotMatch(portal, /token: invite\.token/);
  assert.match(portal, /getVendorPortalOrder\(prisma/);
  assert.match(portalReadModel, /items\.filter\(\(item\) => item\.vendorId === invite\.vendorId\)/);
  assert.match(portalReadModel, /startDate: invite\.request\.workDate/);
  assert.doesNotMatch(portalReadModel, /return \{[\s\S]{0,200}token:/);
  assert.doesNotMatch(portalReadModel, /token: invite\./);
  assert.match(portalPage, /data\.order\.items\.map/);
  assert.match(portalPage, /Reason for declining/);
  assert.doesNotMatch(portalPage, /data\.order\.shift/);
  assert.match(responseService, /typeof reason === 'string'/);
  assert.match(responseService, /vendorInviteTokenCandidates/);
});

test('workforce outbox diagnostics never serialize email bodies or vendor bearer links', () => {
  const readModel = read('server/modules/workforce/application/workforceOutboxReadModel.ts');
  const route = read('server/routes/workforce.ts');
  const operationsRoute = read('server/routes/workforceOperations.ts');
  const apiClient = read('src/lib/api.ts');
  const adminPanels = read('src/components/workforce/WorkforceAdminPanels.tsx');
  const workforcePage = read('src/pages/WorkforcePage.tsx');
  assert.match(readModel, /actor\.role !== Role\.SYSTEM_ADMINISTRATOR/);
  assert.match(readModel, /select: \{/);
  assert.doesNotMatch(readModel, /body: true/);
  assert.match(route, /router\.use\(workforceOperationsRouter\)/);
  assert.match(operationsRoute, /requireRoles\(Role\.SYSTEM_ADMINISTRATOR\)/);
  assert.match(operationsRoute, /listWorkforceEmailOutbox\(prisma, req\.user!, 100\)/);
  assert.doesNotMatch(operationsRoute, /listOutbox\(/);
  assert.doesNotMatch(apiClient, /subject: string;\s*body: string;/);
  assert.match(adminPanels, /canViewOutbox && <div/);
  assert.match(workforcePage, /canViewOutbox=\{user\?\.role === 'SYSTEM_ADMINISTRATOR'\}/);
});

test('workforce read models strip persistence and credential fields from nested DTOs', () => {
  const readModel = read('server/modules/workforce/application/workforceRequestReadModel.ts');
  assert.match(readModel, /INTERNAL_RESPONSE_FIELDS = new Set/);
  assert.match(readModel, /'tenantId'/);
  assert.match(readModel, /'token'/);
  assert.match(readModel, /'portalPath'/);
  assert.match(readModel, /stripInternalResponseFields\(formatRequest\(request\)\)/);
});

test('document approval dialogs are application-owned and accessible on mobile', () => {
  const provider = read('src/components/ui/AppDialogProvider.tsx');
  const approval = read('src/pages/ApprovalReviewPage.tsx');
  const detail = read('src/pages/DocumentDetailPage.tsx');
  const documents = read('src/pages/DocumentsPage.tsx');
  const approvals = read('src/pages/MyApprovalsPage.tsx');

  assert.match(provider, /aria-modal="true"/);
  assert.match(provider, /focusable/);
  assert.match(provider, /event\.key === 'Escape'/);
  assert.match(provider, /inputType\?: 'text' \| 'password'/);
  assert.match(approval, /inputType: 'password'/);
  assert.doesNotMatch(approval, /(?<![.\w])(alert|confirm|prompt)\(/);
  assert.doesNotMatch(detail, /(?<![.\w])(alert|confirm|prompt)\(/);
  assert.doesNotMatch(documents, /(?<![.\w])(alert|confirm|prompt)\(/);
  assert.doesNotMatch(approvals, /(?<![.\w])(alert|confirm|prompt)\(/);
  assert.match(approvals, /Promise\.allSettled\(documentIds\.map/);
  assert.match(approvals, /canArchive && <button onClick=\{handleBulkArchive\}/);
});

test('frontend operations never fall back to native browser dialogs', () => {
  for (const file of sourceFiles(path.join(root, 'src'))) {
    const source = fs.readFileSync(file, 'utf8');
    assert.doesNotMatch(source, /(?<![.\w])(alert|confirm|prompt)\(/, file);
  }

  const designer = read('src/pages/WorkflowDesignerPage.tsx');
  assert.match(designer, /WORKFLOW_STEP_TYPES\.filter\(\(\{ runtimeImplemented \}\) => runtimeImplemented\)/);
  assert.match(designer, /dialog\.confirm\('Activate this workflow/);
});

test('remember-me controls token persistence and defaults to a session-only login', () => {
  const api = read('src/lib/api.ts');
  const store = read('src/store/auth.ts');
  const login = read('src/pages/LoginPage.tsx');
  assert.match(api, /const storage = remember \? localStorage : sessionStorage/);
  assert.match(api, /sessionStorage\.getItem\('hoterra_token'\) \|\| localStorage\.getItem/);
  assert.match(api, /localStorage\.removeItem\('hoterra_token'\)/);
  assert.match(api, /sessionStorage\.removeItem\('hoterra_token'\)/);
  assert.match(store, /api\.setToken\(token, remember\)/);
  assert.match(login, /useState\(false\)/);
  assert.match(login, /login\(email, password, remember\)/);
});

test('tenant security session lifetime controls newly issued JWT expiry', () => {
  const authService = read('server/modules/authentication/application/manageAccountSession.ts');
  const authRoute = read('server/routes/auth.ts');
  const authMiddleware = read('server/middleware/auth.ts');
  assert.match(authService, /systemSettings\.findFirst\(\{ select: \{ autoLogoutMinutes: true \} \}\)/);
  assert.match(authService, /Math\.max\(5, Math\.min\(1440/);
  assert.match(authService, /sessionLifetimeSeconds: sessionLifetimeMinutes \* 60/);
  assert.match(authRoute, /signToken\(result\.actor, result\.tokenVersion, result\.sessionLifetimeSeconds\)/);
  assert.match(authMiddleware, /expiresIn: SignOptions\['expiresIn'\]/);
  assert.match(authMiddleware, /expiresIn,/);
});

test('workforce request serializer exposes only active read-model primitives', () => {
  const legacy = read('server/modules/workforce/application/workforceRequestSerialization.ts');

  assert.doesNotMatch(
    legacy,
    /export async function (getWorkforceSettings|resolveApprovalSteps|monthSpend|addEvent|nextRequestCode|loadRequest)/
  );
  assert.doesNotMatch(
    legacy,
    /export function (estimateCost|canManageCatalog|canCreateRequest|isShift|isVendorMode|appendGmIfMissing)/
  );
  assert.doesNotMatch(legacy, /from '\.\.\/db'/);
  assert.doesNotMatch(legacy, /export const DEFAULT_APPROVAL_STEPS/);
  assert.doesNotMatch(legacy, /export function isPrivilegedApprover/);
  assert.match(legacy, /export function canApproveCurrentStep/);
  assert.match(legacy, /export function formatRequest/);
});

test('local Workforce E2E follows production authorization and cleans its fixtures', () => {
  const e2e = read('scripts/test-workforce-e2e.cjs');
  assert.match(e2e, /127\.0\.0\.1:3211\/api/);
  assert.match(e2e, /database cleanup is restricted to a local PostgreSQL host/);
  assert.match(e2e, /cleanupLocalE2eFixtures\(\)/g);
  assert.match(e2e, /set_config\('hoterra\.tenant_id'/);
  assert.match(e2e, /token: procurementManager\.token,[\s\S]{0,120}method: 'PUT'/);
  assert.match(e2e, /assert\.equal\(invite\.token, undefined/);
  assert.match(e2e, /readInviteTokenFromLocalOutbox\(invite\.id\)/);
  assert.match(e2e, /WORKFORCE_E2E_CREATED_USER_PASSWORD/);
  assert.doesNotMatch(e2e, /auditLog\.deleteMany/);
  assert.match(e2e, /Fixture actors\/roles are retained as inactive/);
});

test('core Workforce transitions keep bounded structured evidence without portal secrets', () => {
  const evidence = read('server/modules/workforce/application/workforceAuditState.ts');
  const planning = read('server/modules/workforce/application/manageWorkforceRequestPlanning.ts');
  const approval = read('server/modules/workforce/application/approveWorkforceRequest.ts');
  const dispatch = read('server/modules/workforce/application/dispatchWorkforceRequestToVendors.ts');
  const correctionDraft = read('server/modules/workforce/application/draftVendorCorrection.ts');
  const correctionSubmit = read('server/modules/workforce/application/submitVendorCorrectionReview.ts');
  const correctionDecision = read('server/modules/workforce/application/decideVendorCorrectionReview.ts');
  const finalize = read('server/modules/workforce/application/finalizeWorkforceVendors.ts');

  assert.match(evidence, /auditStateDigest/);
  assert.match(evidence, /serializeAuditState/);
  assert.match(evidence, /approvalStepsDigest/);
  assert.match(evidence, /comment: textEvidence/);
  assert.doesNotMatch(evidence, /contactEmail:\s*vendor\.contactEmail|emailBody|portalLink|inviteToken|toEmail/);
  for (const source of [planning, approval, dispatch, correctionDraft, correctionSubmit, correctionDecision, finalize]) {
    assert.match(source, /outcome: 'SUCCESS'/);
    assert.match(source, /reason:/);
    assert.match(source, /serializeWorkforce/);
  }
  assert.match(planning, /beforeState: serializeWorkforceRequestAuditState\(request\)/);
  assert.match(approval, /afterState: serializeWorkforceRequestAuditState\(procurementReview\)/);
  assert.match(correctionDecision, /serializeWorkforceVendorCorrectionReviewAuditState\(approvedReview\)/);
});

test('Workforce actuals payroll catalog and configuration mutations retain structured evidence', () => {
  const evidence = read('server/modules/workforce/application/workforceAuditState.ts');
  const actuals = read('server/modules/workforce/application/manageWorkforceActuals.ts');
  const payroll = read('server/modules/workforce/application/manageWorkforcePayroll.ts');
  const catalog = read('server/modules/workforce/application/manageWorkforceCatalog.ts');
  const vendorApproval = read('server/modules/workforce/application/manageVendorApproval.ts');
  const settings = read('server/modules/workforce/application/manageWorkforceSettings.ts');
  const templates = read('server/modules/workforce/application/manageWorkforceTemplates.ts');
  const administration = read('server/modules/workforce/application/manageWorkforceAdministration.ts');

  assert.match(evidence, /invoiceNumberDigest/);
  assert.match(evidence, /insuranceNotes: textEvidence/);
  assert.match(evidence, /requirements: textEvidence/);
  assert.match(evidence, /hotelsDigest/);
  assert.match(evidence, /value == null \? null : serializeAuditState/);
  for (const source of [actuals, payroll, catalog, vendorApproval, settings, templates, administration]) {
    assert.match(source, /outcome: 'SUCCESS'/);
    assert.match(source, /reason:/);
    assert.match(source, /beforeState:|afterState:/);
  }
  assert.match(payroll, /details: `\$\{request\.code\}: Vendor invoice recorded`/);
  assert.match(payroll, /details: `\$\{invoice\.request\.code\}: matched invoice marked paid`/);
  assert.doesNotMatch(vendorApproval, /details: `Rejected vendor \$\{vendor\.name\}: \$\{reason\}`/);
});
