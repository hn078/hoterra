const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = (file) => fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8');
const search = source('server/modules/search/application/globalSearch.ts');

test('global search is capability-gated, bounded, and validates every public filter', () => {
  assert.match(search, /capabilities\.includes\('search\.use'\)/);
  assert.match(search, /query\.length > 200/);
  assert.match(search, /Search type is invalid|Search type/);
  assert.match(search, /Department filter is invalid/);
  assert.match(search, /Date range is invalid/);
  assert.match(search, /Created-by filter is invalid/);
});

test('document search intersects text and filters with the document object scope', () => {
  assert.match(search, /AND: \[/);
  assert.match(search, /documentReadScope\(actor\)/);
  assert.match(search, /\{ OR: searchFields \}/);
  assert.match(search, /authorId: actor\.id/);
  assert.match(search, /DocumentStatus\.ARCHIVED/);
});

test('document search uses a secret-safe explicit DTO', () => {
  const select = search.slice(search.indexOf('const documentSearchSelect'), search.indexOf('function emptyResult'));
  assert.match(select, /title: true/);
  assert.match(select, /department: \{ select:/);
  assert.doesNotMatch(select, /content: true/);
  assert.doesNotMatch(select, /filePath: true/);
  assert.doesNotMatch(select, /signaturePlacement: true/);
});

test('search delegates each directory to its authoritative scoped module', () => {
  assert.match(search, /searchUserDirectory\(database, actor/);
  assert.match(search, /searchDepartments\(database, actor/);
  assert.match(search, /searchTemplates\(database, actor/);
  assert.match(search, /searchWorkflows\(database, actor/);
  assert.match(search, /searchWorkforceRequests\(database, actor/);
  assert.doesNotMatch(search, /database\.user\.findMany/);
  assert.doesNotMatch(search, /database\.template\.findMany/);
  assert.doesNotMatch(search, /database\.workflowRoute\.findMany/);
});

test('ordinary document listing cannot overwrite its object-scope OR predicate during text search', () => {
  const queries = source('server/modules/documents/application/documentReadModel.ts');
  assert.match(queries, /AND: \[documentReadScope\(actor\) as Prisma\.DocumentWhereInput, \.\.\.documentFilters\(query\)\]/);
  assert.doesNotMatch(queries, /where\.OR\s*=/);
});

test('search UI exposes only authorized tabs and sends real server filter values', () => {
  const page = source('src/pages/SearchPage.tsx');
  assert.match(page, /visibleTabs/);
  assert.match(page, /users\.directory\.read/);
  assert.match(page, /params\.departmentId = filters\.departmentId/);
  assert.match(page, /departments\.map/);
  assert.match(page, /workforce\.read/);
  assert.match(page, /results\.workforce\.map/);
  assert.match(page, /searchSequence\.current === sequence/);
  assert.match(page, /localStorage\.setItem\(savedSearchKey/);
  assert.doesNotMatch(page, /Q2 Financial Reports/);
});

test('workforce search reuses object scope and conceals vendor metadata until disclosure', () => {
  const workforce = source('server/modules/workforce/application/workforceRequestReadModel.ts');
  assert.match(workforce, /export async function searchWorkforceRequests/);
  assert.match(workforce, /canViewWorkforceRequest\(actor, request/);
  assert.match(workforce, /canSeeVendorDetails\(actor, request\.status, procurementViewer\)/);
  assert.match(workforce, /VENDOR_DETAILS_VISIBLE_STATUSES/);
  assert.match(workforce, /take: 50/);
  assert.doesNotMatch(workforce.slice(workforce.indexOf('export async function searchWorkforceRequests')), /portalPath|inviteToken|passwordHash/);
});
