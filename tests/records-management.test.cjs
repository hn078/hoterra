const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');

test('records schema preserves disposed metadata and models retention and independent disposition review', () => {
  const schema = fs.readFileSync(path.join(root, 'prisma/schema.prisma'), 'utf8');
  const migration = fs.readFileSync(path.join(root, 'prisma/migrations/20260826140000_records_management/migration.sql'), 'utf8');
  assert.match(schema, /model RetentionPolicy/);
  assert.match(schema, /model DocumentDispositionRequest/);
  assert.match(schema, /DISPOSED/);
  assert.match(schema, /legalHoldAt/);
  assert.match(migration, /one_pending_per_document/);
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/g);
  assert.match(migration, /FORCE ROW LEVEL SECURITY/g);
});

test('records disposition requires expired retention, no legal hold, and a different reviewer', () => {
  const source = fs.readFileSync(path.join(root, 'server/modules/archive/application/manageRecordsLifecycle.ts'), 'utf8');
  assert.match(source, /current\.legalHoldAt/);
  assert.match(source, /current\.retentionUntil\.getTime\(\) > Date\.now\(\)/);
  assert.match(source, /request\.requestedById === actor\.id/);
  assert.match(source, /records\.disposition\.approve/);
  assert.match(source, /documentAttachment\.deleteMany/);
  assert.match(source, /documentVersion\.updateMany/);
  assert.match(source, /DocumentStatus\.DISPOSED/);
  assert.doesNotMatch(source, /transaction\.document\.delete/);
});

test('archiving assigns an active default retention policy', () => {
  const source = fs.readFileSync(path.join(root, 'server/modules/documents/application/manageDocumentLifecycle.ts'), 'utf8');
  assert.match(source, /retentionForArchive/);
  assert.match(source, /isActive: true, isDefault: true/);
  assert.match(source, /retentionPolicyId: policy\.id/);
  assert.match(source, /policy\.retentionDays \* 86_400_000/);
});

test('records HTTP adapters expose capability-separated management, request, and approval actions', () => {
  const source = fs.readFileSync(path.join(root, 'server/routes/archive.ts'), 'utf8');
  assert.match(source, /requireCapability\('records\.manage'\)/g);
  assert.match(source, /requireCapability\('records\.disposition\.request'\)/);
  assert.match(source, /requireCapability\('records\.disposition\.approve'\)/);
  assert.match(source, /The requester cannot approve their own disposition request/);
});
