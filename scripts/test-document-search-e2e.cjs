const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { PrismaClient } = require('@prisma/client');
const ExcelJS = require('exceljs');
require('dotenv').config({ quiet: true });

const baseUrl = process.env.DOCUMENT_SEARCH_E2E_API_URL || 'http://127.0.0.1:3211/api';
const tenantSlug = process.env.DOCUMENT_SEARCH_E2E_TENANT || 'hgi';
const email = process.env.DOCUMENT_SEARCH_E2E_EMAIL || 'employee@hoterra.az';
const password = process.env.DOCUMENT_SEARCH_E2E_PASSWORD || process.env.DEMO_USER_PASSWORD || 'password123';
const adminEmail = process.env.DOCUMENT_SEARCH_E2E_ADMIN_EMAIL || 'admin@hoterra.az';
const adminPassword = process.env.DOCUMENT_SEARCH_E2E_ADMIN_PASSWORD || process.env.DEMO_USER_PASSWORD || 'password123';
const fixturePrefix = 'SEARCH-E2E-';

if (!/^https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?\/api$/i.test(baseUrl)) {
  throw new Error('Document search E2E is restricted to a local API');
}
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl || !['127.0.0.1', 'localhost', '::1'].includes(new URL(databaseUrl).hostname)) {
  throw new Error('Document search E2E requires local PostgreSQL');
}

const database = new PrismaClient();

function simplePdf(text) {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${text.length + 34} >>\nstream\nBT /F1 12 Tf 72 720 Td (${text}) Tj ET\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let output = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(output, 'ascii'));
    output += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(output, 'ascii');
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) output += `${String(offset).padStart(10, '0')} 00000 n \n`;
  output += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(output, 'ascii');
}

async function withTenant(operation) {
  const tenant = await database.tenant.findUnique({ where: { slug: tenantSlug }, select: { id: true } });
  assert.ok(tenant, `Tenant ${tenantSlug} is missing`);
  return database.$transaction(async (transaction) => {
    await transaction.$executeRawUnsafe("SELECT set_config('hoterra.tenant_id', $1, true)", tenant.id);
    return operation(transaction, tenant.id);
  });
}

async function request(route, { token, method = 'GET', body, expected = [200] } = {}) {
  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers: {
      'x-tenant-slug': tenantSlug,
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  assert.ok(expected.includes(response.status), `${method} ${route}: ${response.status} ${text}`);
  return data;
}

async function cleanup() {
  const storedFiles = await withTenant(async (transaction, tenantId) => {
    const documents = await transaction.document.findMany({
      where: { code: { startsWith: fixturePrefix } },
      select: { id: true, filePath: true, attachments: { select: { filePath: true } } },
    });
    const ids = documents.map(({ id }) => id);
    if (ids.length) {
      await transaction.documentHistory.deleteMany({ where: { documentId: { in: ids } } });
      await transaction.document.deleteMany({ where: { id: { in: ids } } });
    }
    return {
      tenantId,
      paths: documents.flatMap(({ filePath, attachments }) => [
        ...(filePath ? [filePath] : []),
        ...attachments.map((attachment) => attachment.filePath),
      ]),
    };
  });
  const uploadsRoot = path.resolve(process.env.HOTERRA_UPLOADS_DIR || path.join(process.cwd(), 'uploads'));
  for (const storedPath of storedFiles.paths) {
    const expectedPrefix = `/uploads/${storedFiles.tenantId}/documents/`;
    assert.ok(storedPath.startsWith(expectedPrefix), 'Fixture path escaped the tenant document directory');
    const absolutePath = path.resolve(uploadsRoot, storedPath.slice('/uploads/'.length));
    assert.ok(absolutePath.startsWith(`${uploadsRoot}${path.sep}`));
    await fs.rm(absolutePath, { force: true });
  }
}

async function main() {
  await cleanup();
  try {
    const auth = await request('/auth/login', { method: 'POST', body: { email, password } });
    assert.ok(auth.token && auth.user.department?.id, 'Search E2E user cannot authenticate or has no department');
    const suffix = `${Date.now()}`;
    const code = `${fixturePrefix}${suffix}`;
    const document = await request('/documents', {
      token: auth.token,
      method: 'POST',
      expected: [201],
      body: {
        title: `Uploaded file search fixture ${suffix}`,
        code,
        category: 'REPORTS',
        departmentId: auth.user.department.id,
        version: '1.0',
      },
    });

    const uniqueNeedle = `zephyr-${suffix}-hotel-evidence`;
    const uploaded = await request(`/documents/${document.id}/upload`, {
      token: auth.token,
      method: 'POST',
      body: {
        fileName: `../private-evidence-${suffix}.txt`,
        fileType: 'text/plain',
        data: Buffer.from(`This phrase exists only in the private uploaded file: ${uniqueNeedle}`).toString('base64'),
      },
    });
    assert.equal(uploaded.fileName, `private-evidence-${suffix}.txt`, 'Untrusted upload name was not reduced to a safe basename');
    assert.equal(uploaded.searchIndex.status, 'READY');
    assert.equal(uploaded.searchIndex.errorCode, null);

    const spoofed = await request(`/documents/${document.id}/upload`, {
      token: auth.token,
      method: 'POST',
      expected: [400],
      body: {
        fileName: `spoofed-${suffix}.pdf`,
        fileType: 'application/pdf',
        data: Buffer.from('<html><script>not a pdf</script></html>').toString('base64'),
      },
    });
    assert.match(spoofed.error, /does not match/i);

    const results = await request(`/search?type=documents&searchIn=content&q=${encodeURIComponent(uniqueNeedle)}`, { token: auth.token });
    const match = results.documents.find(({ id }) => id === document.id);
    assert.ok(match, 'Uploaded-file-only text was not found');
    assert.equal(match.matchedInUploadedFile, true);
    assert.equal(match.searchIndexStatus, 'READY');
    assert.equal(Object.hasOwn(match, 'extractedText'), false, 'Extracted private text leaked in the search DTO');

    const replacementNeedle = `replacement-${suffix}-evidence`;
    const replaced = await request(`/documents/${document.id}/upload`, {
      token: auth.token,
      method: 'POST',
      body: {
        fileName: `replacement-${suffix}.txt`,
        fileType: 'text/plain',
        data: Buffer.from(replacementNeedle).toString('base64'),
      },
    });
    assert.equal(replaced.searchIndex.status, 'READY');
    const staleResults = await request(`/search?type=documents&searchIn=content&q=${encodeURIComponent(uniqueNeedle)}`, { token: auth.token });
    assert.equal(staleResults.documents.some(({ id }) => id === document.id), false, 'Old primary-file text remained searchable');
    const currentResults = await request(`/search?type=documents&searchIn=content&q=${encodeURIComponent(replacementNeedle)}`, { token: auth.token });
    assert.ok(currentResults.documents.some(({ id }) => id === document.id));

    const workbookNeedle = `workbook-${suffix}-budget`;
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet('Budget').addRow(['Department', 'Evidence', workbookNeedle]);
    const workbookBuffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const indexedWorkbook = await request(`/documents/${document.id}/upload`, {
      token: auth.token,
      method: 'POST',
      body: {
        fileName: `budget-${suffix}.xlsx`,
        fileType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        data: workbookBuffer.toString('base64'),
      },
    });
    assert.equal(indexedWorkbook.searchIndex.status, 'READY');
    const workbookResults = await request(`/search?type=documents&searchIn=content&q=${encodeURIComponent(workbookNeedle)}`, { token: auth.token });
    assert.ok(workbookResults.documents.some(({ id }) => id === document.id), 'Workbook text was not indexed');

    const pdfNeedle = `pdf-${suffix}-policy`;
    const indexedPdf = await request(`/documents/${document.id}/upload`, {
      token: auth.token,
      method: 'POST',
      body: {
        fileName: `policy-${suffix}.pdf`,
        fileType: 'application/pdf',
        data: simplePdf(pdfNeedle).toString('base64'),
      },
    });
    assert.equal(indexedPdf.searchIndex.status, 'READY');
    const pdfResults = await request(`/search?type=documents&searchIn=content&q=${encodeURIComponent(pdfNeedle)}`, { token: auth.token });
    assert.ok(pdfResults.documents.some(({ id }) => id === document.id), 'PDF text was not indexed');

    const attachmentNeedle = `attachment-${suffix}-incident`;
    const attachmentName = `incident-${suffix}.txt`;
    const indexedAttachment = await request(`/documents/${document.id}/upload`, {
      token: auth.token,
      method: 'POST',
      expected: [201],
      body: {
        fileName: attachmentName,
        fileType: 'text/plain',
        data: Buffer.from(`Attachment-only evidence: ${attachmentNeedle}`).toString('base64'),
        isAttachment: true,
      },
    });
    assert.equal(indexedAttachment.searchIndex.status, 'READY');
    const attachmentResults = await request(`/search?type=documents&searchIn=content&fileType=txt&q=${encodeURIComponent(attachmentNeedle)}`, { token: auth.token });
    const attachmentMatch = attachmentResults.documents.find(({ id }) => id === document.id);
    assert.ok(attachmentMatch, 'Attachment text was not indexed');
    assert.equal(attachmentMatch.matchedInAttachment, true);
    assert.deepEqual(attachmentMatch.matchedFileNames, [attachmentName]);

    const adminAuth = await request('/auth/login', {
      method: 'POST',
      body: { email: adminEmail, password: adminPassword },
    });
    assert.ok(adminAuth.token, 'System administrator cannot authenticate for index maintenance checks');
    const initialHealth = await request('/settings/maintenance/search-index', { token: adminAuth.token });
    assert.ok(initialHealth.totalFiles >= 2, 'Index health did not include the fixture files');
    assert.equal(Object.hasOwn(initialHealth, 'documents'), false, 'Index health leaked document metadata');
    assert.equal(Object.hasOwn(initialHealth, 'fileName'), false, 'Index health leaked a private file name');
    assert.equal(Object.hasOwn(initialHealth, 'extractedText'), false, 'Index health leaked extracted private text');

    await withTenant((transaction) => transaction.documentSearchIndex.update({
      where: { attachmentId: indexedAttachment.id },
      data: {
        status: 'FAILED',
        extractedText: null,
        errorCode: 'EXTRACTION_FAILED',
        indexedAt: null,
      },
    }));
    const failedHealth = await request('/settings/maintenance/search-index', { token: adminAuth.token });
    assert.ok(failedHealth.failed >= 1, 'Failed index was not reflected in health counters');
    const retry = await request('/settings/maintenance/search-index/retry-failed', {
      token: adminAuth.token,
      method: 'POST',
    });
    assert.ok(retry.queued >= 1, 'Failed index retry did not queue the fixture');
    assert.ok(['RUNNING', 'UP_TO_DATE'].includes(retry.status));
    const attachmentIndex = await withTenant((transaction) => transaction.documentSearchIndex.findUnique({
      where: { attachmentId: indexedAttachment.id },
      select: { status: true },
    }));
    assert.ok(attachmentIndex && attachmentIndex.status !== 'FAILED', 'Failed fixture remained in FAILED state after retry');

    console.log('[document-search-e2e] tenant-scoped indexing, upload signature/name checks, safe search DTO and admin retry checks passed');
  } finally {
    await cleanup();
    await database.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
