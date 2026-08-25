const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('production startup never uses prisma db push or accept-data-loss', () => {
  const packageJson = JSON.parse(read('package.json'));
  assert.doesNotMatch(packageJson.scripts['start:backend'], /db push|accept-data-loss/);
  const railway = read('.railway/railway.ts');
  assert.match(railway, /preDeploy: "npm run db:migrate:deploy"/);
  assert.match(railway, /healthcheck: "\/api\/ready"/);
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
  assert.match(publicTenant, /expectedPrefix = `\/uploads\/\$\{tenant\.id\}\/branding\//);
  assert.match(publicTenant, /isActive: true/);
  assert.match(publicTenant, /Cross-Origin-Resource-Policy', 'cross-origin'/);
  assert.doesNotMatch(publicTenant, /authMiddleware/);

  const settings = read('server/routes/settings.ts');
  assert.match(settings, /requireRoles\(Role\.SYSTEM_ADMINISTRATOR, Role\.GENERAL_MANAGER\)/);
  assert.match(settings, /loginLogoPath: _loginLogoPath/);
  assert.match(settings, /loginBackgroundPath: _loginBackgroundPath/);
});

test('production runtime rejects weak configuration', () => {
  const config = read('server/config.ts');
  assert.match(config, /at least 32 characters/);
  assert.match(config, /FRONTEND_URL must use HTTPS/);
  assert.match(config, /Production DATABASE_URL must use PostgreSQL/);
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
  const workforceRoute = read('server/routes/workforce.ts');
  assert.match(workforceRoute, /participatedRequestIds\.has\(request\.id\)/);
  assert.match(workforceRoute, /\['APPROVED', 'REJECTED'\]\.includes\(event\.action\)/);
  assert.match(workforceRoute, /latestEvent\?\.action === 'APPROVED'/);

  const requestPage = read('src/pages/WorkforceRequestPage.tsx');
  assert.match(requestPage, /const load = async \(\) =>/);
  assert.match(requestPage, /await load\(\)/);
});

test('Procurement Workforce managers can access cross-department requests', () => {
  const workforceRoute = read('server/routes/workforce.ts');
  assert.match(workforceRoute, /const scopedDepartmentId = isProcurementViewer \? undefined : hodDepartmentId\(req\)/);
  assert.match(workforceRoute, /!canViewWorkforceRequest\(req, request\) && !canCorrectVendors && !canConfirmProcurementSelection/);
});

test('workforce actuals support in-service requests and remain role protected', () => {
  const workforceRoute = read('server/routes/workforce.ts');
  assert.match(workforceRoute, /WorkforceRequestStatus\.IN_SERVICE/);
  assert.match(workforceRoute, /Department HOD or Procurement permission required/);

  const requestPage = read('src/pages/WorkforceRequestPage.tsx');
  assert.match(requestPage, /canEnterActuals/);
  assert.match(requestPage, /'IN_SERVICE', 'AWAITING_EVALUATION'/);
});

test('multi-vendor workforce invoices require and match the selected vendor share', () => {
  const workforceRoute = read('server/routes/workforce.ts');
  assert.match(workforceRoute, /vendorId required for multi-vendor requests/);
  assert.match(workforceRoute, /Selected vendor is not assigned to this request/);

  const payroll = read('server/lib/workforcePayroll.ts');
  assert.match(payroll, /vendorEstimatedCost/);
  assert.match(payroll, /vendorEstimatedHours/);

  const panel = read('src/components/workforce/WorkforceAdminPanels.tsx');
  assert.match(panel, /vendorId: form\.vendorId/);
  assert.match(panel, /Vendor…/);
});
