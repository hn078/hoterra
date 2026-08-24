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

test('production runtime rejects weak configuration', () => {
  const config = read('server/config.ts');
  assert.match(config, /at least 32 characters/);
  assert.match(config, /FRONTEND_URL must use HTTPS/);
  assert.match(config, /Production DATABASE_URL must use PostgreSQL/);
});
