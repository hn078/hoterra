const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = (file) => fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8');
const policy = source('server/modules/templates/domain/templatePolicy.ts');
const reads = source('server/modules/templates/application/templateReadModel.ts');
const mutations = source('server/modules/templates/application/manageTemplates.ts');
const documents = source('server/modules/documents/application/manageDocumentContent.ts');

test('template read and mutation policies enforce capability, tenant, and department scope', () => {
  assert.match(policy, /actor\.tenantId !== template\.tenantId/);
  assert.match(policy, /templates\.read/);
  assert.match(policy, /templates\.manage/);
  assert.match(policy, /documents\.read\.all/);
  assert.match(policy, /actor\.departmentId === template\.departmentId/);
});

test('template list is bounded and uses a content-free explicit summary DTO', () => {
  const summary = reads.slice(reads.indexOf('const summarySelect'), reads.indexOf('const detailSelect'));
  assert.doesNotMatch(summary, /content: true/);
  assert.doesNotMatch(summary, /signaturePlacement: true/);
  assert.match(reads, /take: 500/);
  assert.match(reads, /tenantId: _tenantId/);
});

test('template writes validate values, signature zones, references, duplicates, and audit atomically', () => {
  assert.match(mutations, /Object\.values\(DocumentCategory\)/);
  assert.match(mutations, /A template can contain at most 30 signature zones/);
  assert.match(mutations, /must fit inside the page/);
  assert.match(mutations, /validateDepartment/);
  assert.match(mutations, /mode: 'insensitive'/);
  assert.match(mutations, /database\.\$transaction/);
  assert.match(mutations, /pg_advisory_xact_lock/);
  assert.match(mutations, /transaction\.auditLog\.create/);
  assert.match(mutations, /templateAuditState/);
  assert.match(mutations, /contentDigest: auditStateDigest/);
  assert.match(mutations, /signaturePlacementDigest: auditStateDigest/);
  assert.match(mutations, /beforeState: serializeAuditState/g);
  assert.match(mutations, /afterState: serializeAuditState/g);
  assert.doesNotMatch(mutations, /content:\s*template\.content/);
});

test('template deletion is recoverable archival and retains document references', () => {
  assert.match(mutations, /transaction\.document\.count\(\{ where: \{ templateId \} \}\)/);
  assert.match(mutations, /status: 'ARCHIVED', isActive: false/);
  assert.doesNotMatch(mutations, /template\.delete\(/);
});

test('document creation rejects inactive, draft, review, and archived templates', () => {
  assert.match(documents, /isUsableTemplate\(template\)/);
  assert.match(policy, /template\.isActive === true/);
  assert.match(policy, /toUpperCase\(\) === 'ACTIVE'/);
});

test('global search uses the scoped template read model instead of raw template queries', () => {
  const search = source('server/modules/search/application/globalSearch.ts');
  assert.match(search, /searchTemplates\(database, actor, query/);
  assert.doesNotMatch(search, /database\.template\.findMany/);
});

test('template management controls and editor links are capability and object-scope hidden', () => {
  const list = source('src/pages/TemplatesPage.tsx');
  const search = source('src/pages/SearchPage.tsx');
  assert.match(list, /hasCapability\(currentUser, 'templates\.manage'\)/);
  assert.match(list, /canManageItem/);
  assert.match(list, /status: 'ARCHIVED', isActive: false/);
  assert.match(search, /canManageTemplatesHotelWide/);
});
