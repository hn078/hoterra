const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('uploaded-file search index is tenant-scoped, RLS-enforced, and purgeable', () => {
  const schema = read('prisma/schema.prisma');
  const migration = read('prisma/migrations/20260826150000_document_search_index/migration.sql');
  const records = read('server/modules/archive/application/manageRecordsLifecycle.ts');
  assert.match(schema, /model DocumentSearchIndex[\s\S]*tenantId[\s\S]*documentId\s+String[\s\S]*sourceKey\s+String/);
  assert.match(schema, /attachmentId\s+String\?\s+@unique/);
  assert.match(schema, /@@unique\(\[tenantId, documentId, sourceKey\]\)/);
  assert.match(migration, /ALTER TABLE "DocumentSearchIndex" FORCE ROW LEVEL SECURITY/);
  assert.match(migration, /"extractedText" gin_trgm_ops/);
  assert.match(records, /documentSearchIndex\.deleteMany\(\{ where: \{ documentId: request\.documentId \} \}\)/);
});

test('file extraction is bounded and an older job cannot overwrite a replacement', () => {
  const service = read('server/modules/documents/application/indexDocumentFile.ts');
  assert.match(service, /MAX_INDEX_CHARACTERS = 1_000_000/);
  assert.match(service, /MAX_PDF_PAGES = 250/);
  assert.match(service, /MAX_WORKBOOK_CELLS = 100_000/);
  assert.match(service, /updateMany\(\{[\s\S]*where: \{ documentId, sourceKey, sourcePath, sourceFileName, sourceVersion, status: DocumentIndexStatus\.PENDING \}/);
  assert.match(service, /indexDocumentAttachmentFile/);
  assert.match(service, /OCR_REQUIRED/);
  assert.doesNotMatch(service, /error\.message\s*[,}]/, 'Raw parser errors must not be persisted');
});

test('global search intersects extracted text with the authoritative document scope and redacts it', () => {
  const search = read('server/modules/search/application/globalSearch.ts');
  assert.match(search, /documentReadScope\(actor\)/);
  assert.match(search, /searchIndexes: \{ some: \{ status: DocumentIndexStatus\.READY, extractedText:/);
  assert.match(search, /database\.documentSearchIndex\.findMany/);
  assert.match(search, /matchedInUploadedFile/);
  assert.match(search, /select: \{ documentId: true, sourceType: true, sourceFileName: true, status: true, indexedAt: true \}/);
});

test('document indexing backfill is bounded and isolated per active tenant', () => {
  const scheduler = read('server/modules/documents/infrastructure/documentIndexScheduler.ts');
  assert.match(scheduler, /INDEX_BATCH_SIZE = 5/);
  assert.match(scheduler, /systemPrisma\.tenant\.findMany\([\s\S]*isActive: true/);
  assert.match(scheduler, /runWithTenant\(tenant, runCurrentTenantDocumentIndexingBatch\)/);
  assert.match(scheduler, /searchIndex: \{ is: null \}/);
  assert.match(scheduler, /indexDocumentAttachmentFile/);
  assert.match(scheduler, /if \(running\) return 0/);
  assert.match(scheduler, /runningTenants\.has\(tenantId\)/);
});

test('search-index operations expose tenant health without document metadata and run behind security settings capability', () => {
  const management = read('server/modules/documents/application/manageDocumentSearchIndex.ts');
  const route = read('server/routes/settingsSecurity.ts');
  const ui = read('src/pages/SettingsPage.tsx');
  assert.match(management, /actor\.capabilities\.includes\('settings\.manage\.security'\)/);
  assert.match(management, /groupBy\(\{[\s\S]*by: \['status', 'sourceType'\]/);
  assert.doesNotMatch(management, /title:\s*true|fileName:\s*true|extractedText:\s*true/);
  assert.match(route, /\/maintenance\/search-index'/);
  assert.match(route, /\/maintenance\/search-index\/retry-failed'/);
  assert.match(route, /\/maintenance\/search-index\/run'/);
  assert.match(route, /requireCapability\('settings\.manage\.security'\)/);
  assert.match(route, /queueDocumentSearchReindex/);
  assert.match(route, /runCurrentTenantDocumentIndexingBatch/);
  assert.match(ui, /Document Search Index Health/);
  assert.match(ui, /OCR-required and unsupported files are not retried/);
});
