require('tsx/cjs');

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const {
  createVendorInviteToken,
  hashVendorInviteToken,
  vendorInviteTokenCandidates,
} = require('../server/modules/workforce/domain/vendorInviteToken');
const {
  DocumentFileError,
  getDocumentAttachmentFile,
  getPrimaryDocumentFile,
} = require('../server/modules/documents');
const {
  getOwnSignatureFile,
  OwnSignatureFileError,
} = require('../server/modules/identity');
const { resolveRequestedTenantSlug } = require('../server/middleware/tenant');
const { inspectBase64Upload, InvalidUploadError } = require('../server/lib/uploads');

function tenantRequest(headers = {}) {
  return { headers };
}

test('production tenant resolution fails closed without explicit context', () => {
  assert.equal(
    resolveRequestedTenantSlug(tenantRequest({ host: 'api.hoterra.net' }), { allowDefault: false }),
    '',
  );
  assert.equal(
    resolveRequestedTenantSlug(tenantRequest({ host: 'unrelated.example' }), { allowDefault: false }),
    '',
  );
  assert.equal(
    resolveRequestedTenantSlug(tenantRequest({ host: 'api.hoterra.net', 'x-tenant-slug': ' HGI ' }), { allowDefault: false }),
    'hgi',
  );
  assert.equal(
    resolveRequestedTenantSlug(tenantRequest({ host: 'baku.hoterra.net' }), { allowDefault: false }),
    'baku',
  );
});

test('development tenant resolution retains the local default fixture', () => {
  assert.equal(
    resolveRequestedTenantSlug(tenantRequest({ host: 'localhost:3211' }), { allowDefault: true }),
    process.env.DEFAULT_TENANT_SLUG || 'hgi',
  );
});

test('vendor invite bearer value is never the value persisted to the database', () => {
  const first = createVendorInviteToken();
  const second = createVendorInviteToken();
  assert.match(first.raw, /^[a-f0-9]{64}$/);
  assert.match(first.stored, /^[a-f0-9]{64}$/);
  assert.notEqual(first.raw, first.stored);
  assert.notEqual(first.raw, second.raw);
  assert.equal(first.stored, hashVendorInviteToken(first.raw));
  assert.deepEqual(vendorInviteTokenCandidates(first.raw), [first.stored, first.raw]);
});

test('malformed vendor invite tokens are rejected before database access', () => {
  for (const token of ['', 'short', '../uploads/file', 'g'.repeat(64), 'a'.repeat(65)]) {
    assert.deepEqual(vendorInviteTokenCandidates(token), []);
  }
});

const documentActor = {
  id: 'user-a',
  tenantId: 'tenant-a',
  role: 'EMPLOYEE',
  departmentId: 'department-a',
  firstName: 'Test',
  lastName: 'User',
  capabilities: ['documents.read'],
};

test('private document file reads stay tenant/object scoped inside the documents module', async () => {
  const allowedDocument = {
    tenantId: 'tenant-a',
    departmentId: 'department-a',
    authorId: 'user-a',
    ownerId: null,
    status: 'DRAFT',
    allowDownload: true,
    filePath: '/uploads/tenant-a/documents/file.pdf',
    fileName: 'file.pdf',
  };
  const primary = await getPrimaryDocumentFile({
    document: { findFirst: async ({ where }) => where.tenantId === 'tenant-a' ? allowedDocument : null },
  }, documentActor, 'document-a');
  assert.equal(primary.filePath, allowedDocument.filePath);

  const attachment = await getDocumentAttachmentFile({
    document: { findFirst: async () => ({ ...allowedDocument, attachments: [{ id: 'attachment-a', filePath: '/uploads/tenant-a/documents/a.pdf', fileName: 'a.pdf' }] }) },
  }, documentActor, 'document-a', 'attachment-a');
  assert.equal(attachment.fileName, 'a.pdf');

  await assert.rejects(
    () => getPrimaryDocumentFile({ document: { findFirst: async () => ({ ...allowedDocument, departmentId: 'department-b', authorId: 'other' }) } }, documentActor, 'document-b'),
    DocumentFileError,
  );
});

test('reusable signature files are owner-only before database access', async () => {
  let queried = false;
  const database = { user: { findFirst: async () => { queried = true; return { signatureImage: '/uploads/tenant-a/signatures/self.png' }; } } };
  await assert.rejects(() => getOwnSignatureFile(database, documentActor, 'other-user'), OwnSignatureFileError);
  assert.equal(queried, false);
  const own = await getOwnSignatureFile(database, documentActor, documentActor.id);
  assert.equal(queried, true);
  assert.equal(own.inline, true);
});

test('signature evidence hashes tenant-private files with real SHA-256', () => {
  const privateFiles = read('server/lib/privateFiles.ts');
  const schema = read('prisma/schema.prisma');
  const migration = read('prisma/migrations/20260826050000_signature_version_evidence/migration.sql');
  const cycleMigration = read('prisma/migrations/20260826060000_signature_approval_cycle/migration.sql');
  assert.match(privateFiles, /hashTenantPrivateFile/);
  assert.match(privateFiles, /createReadStream\(absolutePath\)/);
  assert.match(privateFiles, /createHash\('sha256'\)/);
  assert.match(schema, /documentVersion\s+String/);
  assert.match(migration, /UPDATE "Signature" AS signature/);
  assert.match(migration, /ALTER COLUMN "documentVersion" SET NOT NULL/);
  assert.match(schema, /approvalCycle\s+Int\s+@default\(1\)/);
  assert.match(cycleMigration, /ADD COLUMN "approvalCycle" INTEGER NOT NULL DEFAULT 1/);
});

test('uploads derive MIME from verified content and sanitize untrusted file names', () => {
  const pdf = inspectBase64Upload(
    '../Finance\u202Efdp.pdf',
    Buffer.from('%PDF-1.4\n%%EOF', 'ascii').toString('base64'),
  );
  assert.equal(pdf.fileName, 'Financefdp.pdf');
  assert.equal(pdf.fileType, 'application/pdf');
  assert.equal(pdf.extension, '.pdf');

  assert.throws(
    () => inspectBase64Upload('spoofed.pdf', Buffer.from('<script>alert(1)</script>').toString('base64')),
    InvalidUploadError,
  );
  assert.throws(
    () => inspectBase64Upload('binary.txt', Buffer.from([0x41, 0x00, 0x42]).toString('base64')),
    InvalidUploadError,
  );
});

test('Office uploads require a matching OOXML or compound-file signature', () => {
  const fakeDocx = Buffer.concat([
    Buffer.from([0x50, 0x4b, 0x03, 0x04]),
    Buffer.from('[Content_Types].xml word/document.xml'),
  ]).toString('base64');
  assert.equal(inspectBase64Upload('policy.docx', fakeDocx).fileType,
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  assert.throws(() => inspectBase64Upload('policy.xlsx', fakeDocx), InvalidUploadError);

  const compound = Buffer.concat([
    Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
    Buffer.alloc(8),
  ]).toString('base64');
  assert.equal(inspectBase64Upload('legacy.xls', compound).fileType, 'application/vnd.ms-excel');
});

test('reusable signature uploads use the image-only verified storage path', () => {
  const route = read('server/routes/userSignature.ts');
  assert.match(route, /saveBase64ImageUpload\(fileName, data, 'signatures'\)/);
  assert.doesNotMatch(route, /saveBase64Upload\(fileName, data/);
});
