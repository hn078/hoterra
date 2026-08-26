require('tsx/cjs');

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  AuditReadError,
  auditStateDigest,
  auditSeverity,
  exportAuditEvidence,
  listAuditEvents,
  serializeAuditState,
  verifyAuditIntegrity,
} = require('../server/modules/audit');
const {
  DocumentFavoriteError,
  addDocumentFavorite,
  listFavoriteDocumentIds,
} = require('../server/modules/documents');

function actor(overrides = {}) {
  return {
    id: 'user-a', tenantId: 'tenant-a', email: 'a@example.test', role: 'HOD',
    firstName: 'A', lastName: 'User', departmentId: 'department-a', customRoleId: null,
    capabilities: ['audit.read', 'documents.read'], ...overrides,
  };
}

test('audit severity catalog is stable for compliance filters', () => {
  assert.equal(auditSeverity('DELETE'), 'High');
  assert.equal(auditSeverity('REJECT'), 'High');
  assert.equal(auditSeverity('CREATE'), 'Medium');
  assert.equal(auditSeverity('LOGIN'), 'Low');
});

test('structured audit state is deterministic, bounded and strips secret-bearing keys', () => {
  const serialized = serializeAuditState({
    z: 1,
    nested: { safe: true, apiKey: 'must-not-leak', passwordHash: 'must-not-leak' },
    a: 'first',
  });
  assert.equal(serialized, '{"a":"first","nested":{"safe":true},"z":1}');
  assert.doesNotMatch(serialized, /must-not-leak|apiKey|passwordHash/);
  assert.equal(auditStateDigest('sensitive body'), auditStateDigest('sensitive body'));
  assert.notEqual(auditStateDigest('sensitive body'), auditStateDigest('different body'));
  assert.match(auditStateDigest('sensitive body'), /^[a-f0-9]{64}$/);
});

test('audit read model rejects invalid filters and missing capability before querying', async () => {
  await assert.rejects(
    () => listAuditEvents({}, actor({ capabilities: [] }), {}),
    (error) => error instanceof AuditReadError && error.code === 'FORBIDDEN',
  );
  await assert.rejects(
    () => listAuditEvents({}, actor(), { action: 'DROP_TABLE' }),
    (error) => error instanceof AuditReadError && error.code === 'INVALID_INPUT',
  );
  await assert.rejects(
    () => listAuditEvents({}, actor(), { from: '2026-13-90' }),
    (error) => error instanceof AuditReadError && error.code === 'INVALID_INPUT',
  );
});

test('audit read model applies tenant scope and an explicit secret-safe projection', async () => {
  let findArgs;
  const database = {
    auditLog: {
      findMany: async (args) => { findArgs = args; return [{ id: 'log-1', userId: null, userName: 'System', action: 'LOGIN', entityType: 'System', entityId: null, details: null, ipAddress: null, createdAt: new Date('2026-08-26') }]; },
      count: async () => 1,
      groupBy: async () => [],
    },
  };
  const result = await listAuditEvents(database, actor(), { page: '1', limit: '20' });
  assert.match(JSON.stringify(findArgs.where), /tenant-a/);
  assert.equal(findArgs.select.tenantId, undefined);
  assert.equal(findArgs.select.device, undefined);
  assert.equal(result.data[0].severity, 'Low');
});

test('audit page access is itself audited and returns only aggregate chain evidence', async () => {
  let created;
  const database = {
    auditLog: { create: async (args) => { created = args; } },
    $queryRaw: async () => [{ total: 12, broken: 0, lastSequence: 12, lastHash: 'a'.repeat(64) }],
  };
  const result = await verifyAuditIntegrity(database, actor(), {});
  assert.equal(created.data.action, 'VIEW');
  assert.equal(created.data.entityType, 'AuditLog');
  assert.equal(result.status, 'VERIFIED');
  assert.equal(result.total, 12);
  assert.equal(result.anchor, 'a'.repeat(64));
  assert.equal(Object.hasOwn(result, 'events'), false);

  await assert.rejects(
    () => verifyAuditIntegrity({}, actor({ capabilities: [] })),
    (error) => error instanceof AuditReadError && error.code === 'FORBIDDEN',
  );
});

test('audit evidence export is independently canonicalized and carries chain fields', async () => {
  let createArgs;
  let findArgs;
  const database = {
    auditLog: {
      create: async (args) => { createArgs = args; },
      findMany: async (args) => {
        findArgs = args;
        return [{
          id: 'event-1', tenantId: 'tenant-a', userId: 'user-a', userName: 'A User', action: 'VIEW',
          entityType: 'AuditLog', entityId: 'integrity', details: 'Verified', ipAddress: null, device: null, requestId: 'request-1',
          outcome: 'SUCCESS', reason: null, beforeState: null, afterState: null,
          createdAt: new Date('2026-08-26T10:11:12.123Z'), sequence: 1, previousHash: '', entryHash: 'b'.repeat(64),
        }];
      },
    },
    $queryRaw: async () => [{ total: 1, broken: 0, lastSequence: 1, lastHash: 'b'.repeat(64) }],
  };
  const result = await exportAuditEvidence(database, actor({ capabilities: ['audit.read', 'audit.export'] }), {});
  assert.equal(createArgs.data.entityId, 'evidence-export');
  assert.equal(findArgs.orderBy.sequence, 'asc');
  assert.equal(result.format, 'HOTERRA_AUDIT_EVIDENCE');
  assert.equal(result.chain.status, 'VERIFIED');
  assert.equal(result.events[0].createdAt, '2026-08-26T10:11:12.123');
  assert.equal(result.events[0].entryHash, 'b'.repeat(64));
  assert.deepEqual(result.canonicalization.fields.slice(-7), ['outcome', 'reason', 'beforeState', 'afterState', 'createdAt', 'sequence', 'previousHash']);
});

test('favorite list intersects ownership with the document read predicate in the database', async () => {
  let findArgs;
  const database = { userFavorite: { findMany: async (args) => { findArgs = args; return [{ documentId: 'document-a' }]; } } };
  const result = await listFavoriteDocumentIds(database, actor());
  assert.deepEqual(result, ['document-a']);
  assert.equal(findArgs.where.userId, 'user-a');
  assert.equal(findArgs.where.document.is.tenantId, 'tenant-a');
  assert.ok(findArgs.where.document.is.OR.some((entry) => entry.departmentId === 'department-a'));
});

test('favorite mutation conceals documents outside the actor scope', async () => {
  const database = {
    document: { findUnique: async () => ({ id: 'document-b', tenantId: 'tenant-a', departmentId: 'department-b', authorId: 'other', ownerId: null, status: 'DRAFT' }) },
    userFavorite: { upsert: async () => { throw new Error('must not write'); } },
  };
  await assert.rejects(
    () => addDocumentFavorite(database, actor(), 'document-b'),
    (error) => error instanceof DocumentFavoriteError && error.code === 'NOT_FOUND',
  );
});

test('archive UI capability-gates recoverable restore and four-eyes records disposition', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../src/pages/ArchivePage.tsx'), 'utf8');
  assert.doesNotMatch(source, /Reports/);
  assert.doesNotMatch(source, />\s*Filter\s*</);
  assert.doesNotMatch(source, /deleteDocument\(/);
  assert.match(source, /hasCapability\(currentUser, 'records\.manage'\)/);
  assert.match(source, /hasCapability\(currentUser, 'records\.disposition\.request'\)/);
  assert.match(source, /hasCapability\(currentUser, 'records\.disposition\.approve'\)/);
  assert.match(source, /hasCapability\(currentUser, 'templates\.manage'\)/);
  assert.match(source, /api\.restoreTemplate\(item\.id\)/);
  assert.match(source, /api\.getArchive/);
  assert.match(source, /api\.setDocumentLegalHold/);
  assert.match(source, /api\.reviewDocumentDisposition/);
});

test('archive read model intersects document/template scopes and returns explicit summary fields', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../server/modules/archive/application/archiveReadModel.ts'), 'utf8');
  assert.match(source, /documentReadScope\(actor\)/);
  assert.match(source, /templateReadScope\(actor\)/);
  assert.match(source, /status: DocumentStatus\.ARCHIVED/);
  assert.match(source, /Archive page is outside the supported result window/);
  assert.doesNotMatch(source, /content: true|filePath: true|signaturePlacement: true/);
});

test('template restore is recoverable, conflict-aware, audited, and returns as draft', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../server/modules/templates/application/manageTemplates.ts'), 'utf8');
  assert.match(source, /export async function restoreTemplate/);
  assert.match(source, /status: 'DRAFT', isActive: false/);
  assert.match(source, /Restored template .* from archive as draft/);
  assert.match(source, /duplicateName\(transaction, existing\.name/);
});
