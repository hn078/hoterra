require('tsx/cjs');

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { getReport, recordReportExport, reportDocumentScope, ReportReadError } = require('../server/modules/reporting');

function actor(overrides = {}) {
  return {
    id: 'hod-a', tenantId: 'tenant-a', email: 'hod@example.test', role: 'HOD',
    firstName: 'Hotel', lastName: 'HOD', departmentId: 'department-a', customRoleId: null,
    capabilities: ['reports.read', 'documents.read'], ...overrides,
  };
}

function emptyDatabase() {
  const calls = [];
  return {
    calls,
    document: {
      count: async (args) => { calls.push(['document.count', args]); return 0; },
      groupBy: async (args) => { calls.push(['document.groupBy', args]); return []; },
      findMany: async (args) => { calls.push(['document.findMany', args]); return []; },
      aggregate: async (args) => { calls.push(['document.aggregate', args]); return { _sum: { fileSize: null } }; },
    },
    documentHistory: {
      count: async (args) => { calls.push(['history.count', args]); return 0; },
      findMany: async (args) => { calls.push(['history.findMany', args]); return []; },
    },
    documentAttachment: {
      findMany: async (args) => { calls.push(['attachment.findMany', args]); return []; },
      aggregate: async (args) => { calls.push(['attachment.aggregate', args]); return { _sum: { fileSize: null } }; },
    },
    user: { count: async (args) => { calls.push(['user.count', args]); return 1; } },
    department: { findMany: async () => [] },
  };
}

test('report input rejects invalid ranges and missing capability before database access', async () => {
  await assert.rejects(
    () => getReport({}, actor({ capabilities: [] }), {}),
    (error) => error instanceof ReportReadError && error.code === 'FORBIDDEN',
  );
  await assert.rejects(
    () => getReport({}, actor(), { from: '2026-12-31', to: '2026-01-01' }),
    (error) => error instanceof ReportReadError && error.code === 'INVALID_INPUT',
  );
  await assert.rejects(
    () => getReport({}, actor(), { from: '2024-01-01', to: '2026-01-01' }),
    (error) => error instanceof ReportReadError && error.code === 'INVALID_INPUT',
  );
});

test('department report queries reuse document object scope and aggregate users only in that department', async () => {
  const database = emptyDatabase();
  const report = await getReport(database, actor(), { from: '2026-08-01', to: '2026-08-26', compare: 'none' });
  const serializedCalls = JSON.stringify(database.calls);
  assert.match(serializedCalls, /department-a/);
  assert.match(serializedCalls, /PUBLISHED/);
  const userCall = database.calls.find(([name]) => name === 'user.count');
  assert.equal(userCall[1].where.departmentId, 'department-a');
  assert.equal(report.activityTimeline.length, 0);
  assert.equal(report.comparison.newDocuments, null);
});

test('report-only roles receive department aggregates without direct document activity', async () => {
  const reportOnly = actor({ capabilities: ['reports.read'] });
  assert.deepEqual(reportDocumentScope(reportOnly), { tenantId: 'tenant-a', departmentId: 'department-a' });
  const database = emptyDatabase();
  await getReport(database, reportOnly, { from: '2026-08-01', to: '2026-08-26', compare: 'none' });
  const activityCall = database.calls.filter(([name]) => name === 'history.findMany').at(-1);
  assert.equal(activityCall[1].where.document.is.id, '__forbidden__');
});

test('report export requires its separate capability', async () => {
  await assert.rejects(
    () => recordReportExport({}, actor(), { period: { from: '2026-08-01', to: '2026-08-26' } }),
    (error) => error instanceof ReportReadError && error.code === 'FORBIDDEN',
  );
});

test('reports UI contains no static report history, dates, storage chart, or dead detail buttons', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../src/pages/ReportsPage.tsx'), 'utf8');
  assert.doesNotMatch(source, /RECENT_REPORTS|STORAGE_USAGE|2025-05-01|View Details|MoreHorizontal/);
  assert.match(source, /api\.getReports\(applied\)/);
  assert.match(source, /api\.exportReports\(applied\)/);
  assert.match(source, /comparisonText/);
  assert.match(source, /Only documents inside your authorized scope/);
});

test('report service never reads the hotel-wide audit log for document activity', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../server/modules/reporting/application/reportReadModel.ts'), 'utf8');
  assert.match(source, /reportDocumentScope\(actor\)/);
  assert.match(source, /documentHistory\.findMany/);
  assert.doesNotMatch(source, /auditLog\.findMany/);
  assert.match(source, /take: 20_000/);
});
