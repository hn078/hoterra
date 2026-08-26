const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
require('dotenv').config({ quiet: true });

const baseUrl = process.env.RECORDS_E2E_API_URL || 'http://127.0.0.1:3211/api';
const tenantSlug = process.env.RECORDS_E2E_TENANT || 'hgi';
const gmEmail = process.env.RECORDS_E2E_GM_EMAIL || 'rasul.mursagulov@hgibaku.com';
const gmPassword = process.env.RECORDS_E2E_GM_PASSWORD || process.env.DEMO_GM_PASSWORD || 'Test12345';
const reviewerPassword = 'Records-E2E-2026!';
const fixturePrefix = 'REC-E2E-';
const reviewerEmail = 'records.e2e.reviewer@hoterra.local';

if (!/^https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?\/api$/i.test(baseUrl)) throw new Error('Records E2E is restricted to a local API');
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl || !['127.0.0.1', 'localhost', '::1'].includes(new URL(databaseUrl).hostname)) throw new Error('Records E2E requires local PostgreSQL');
const database = new PrismaClient();

async function tenantTransaction(operation) {
  const tenant = await database.tenant.findUnique({ where: { slug: tenantSlug }, select: { id: true } });
  assert.ok(tenant, `Tenant ${tenantSlug} is missing`);
  return database.$transaction(async (transaction) => {
    await transaction.$executeRawUnsafe("SELECT set_config('hoterra.tenant_id', $1, true)", tenant.id);
    return operation(transaction, tenant.id);
  });
}

async function request(path, { token, method = 'GET', body, expected = [200] } = {}) {
  const response = await fetch(`${baseUrl}${path}`, { method, headers: {
    'x-tenant-slug': tenantSlug,
    ...(token ? { authorization: `Bearer ${token}` } : {}),
    ...(body === undefined ? {} : { 'content-type': 'application/json' }),
  }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  assert.ok(expected.includes(response.status), `${method} ${path}: expected ${expected}, got ${response.status}: ${text}`);
  return data;
}

async function login(email, password) {
  const data = await request('/auth/login', { method: 'POST', body: { email, password } });
  assert.ok(data.token);
  return data;
}

async function cleanup() {
  await tenantTransaction(async (transaction) => {
    const documents = await transaction.document.findMany({ where: { code: { startsWith: fixturePrefix } }, select: { id: true } });
    const ids = documents.map(({ id }) => id);
    if (ids.length) {
      const dispositions = await transaction.documentDispositionRequest.findMany({ where: { documentId: { in: ids } }, select: { id: true } });
      const dispositionIds = dispositions.map(({ id }) => id);
      await transaction.notification.deleteMany({ where: { entityId: { in: [...ids, ...dispositionIds] } } });
      await transaction.documentDispositionRequest.deleteMany({ where: { documentId: { in: ids } } });
      await transaction.userFavorite.deleteMany({ where: { documentId: { in: ids } } });
      await transaction.documentComment.deleteMany({ where: { documentId: { in: ids } } });
      await transaction.documentAttachment.deleteMany({ where: { documentId: { in: ids } } });
      await transaction.signature.deleteMany({ where: { documentId: { in: ids } } });
      await transaction.documentVersion.deleteMany({ where: { documentId: { in: ids } } });
      await transaction.documentHistory.deleteMany({ where: { documentId: { in: ids } } });
      await transaction.document.deleteMany({ where: { id: { in: ids } } });
    }
    await transaction.notification.deleteMany({ where: { userId: { in: (await transaction.user.findMany({ where: { email: reviewerEmail }, select: { id: true } })).map(({ id }) => id) } } });
  });
}

async function main() {
  await cleanup();
  let fixture;
  try {
    const gm = await login(gmEmail, gmPassword);
    assert.ok(gm.user.capabilities.includes('records.disposition.request'));
    assert.ok(gm.user.capabilities.includes('records.disposition.approve'));
    fixture = await tenantTransaction(async (transaction, tenantId) => {
      const department = await transaction.department.findFirst({ where: { isActive: true }, select: { id: true } });
      const policy = await transaction.retentionPolicy.findFirst({ where: { isActive: true, isDefault: true }, select: { id: true } });
      assert.ok(department && policy, 'Records fixtures require an active department and default policy');
      const reviewer = await transaction.user.upsert({
        where: { tenantId_email: { tenantId, email: reviewerEmail } },
        update: {
          passwordHash: await bcrypt.hash(reviewerPassword, 10),
          firstName: 'Records', lastName: 'Reviewer', jobTitle: 'General Manager',
          role: 'GENERAL_MANAGER', departmentId: department.id, isActive: true,
        },
        create: {
          tenantId, email: reviewerEmail, passwordHash: await bcrypt.hash(reviewerPassword, 10),
          firstName: 'Records', lastName: 'Reviewer', jobTitle: 'General Manager', role: 'GENERAL_MANAGER', departmentId: department.id,
        },
      });
      const expired = await transaction.document.create({ data: {
        tenantId, title: 'Records E2E expired record', code: `${fixturePrefix}${randomUUID().slice(0, 8).toUpperCase()}`,
        category: 'REPORTS', departmentId: department.id, authorId: gm.user.id, status: 'ARCHIVED',
        content: 'must be purged', archivedAt: new Date(Date.now() - 10 * 86_400_000), archivedBy: 'Records E2E',
        retentionPolicyId: policy.id, retentionUntil: new Date(Date.now() - 86_400_000),
      } });
      const held = await transaction.document.create({ data: {
        tenantId, title: 'Records E2E held record', code: `${fixturePrefix}${randomUUID().slice(0, 8).toUpperCase()}`,
        category: 'REPORTS', departmentId: department.id, authorId: gm.user.id, status: 'ARCHIVED',
        content: 'must remain', archivedAt: new Date(Date.now() - 10 * 86_400_000), archivedBy: 'Records E2E',
        retentionPolicyId: policy.id, retentionUntil: new Date(Date.now() - 86_400_000),
      } });
      return { reviewer, expired, held };
    });

    await request(`/archive/documents/${fixture.held.id}/legal-hold`, { token: gm.token, method: 'POST', body: { active: true, reason: 'Active investigation' } });
    await request(`/archive/documents/${fixture.held.id}/disposition`, { token: gm.token, method: 'POST', body: { reason: 'should be blocked' }, expected: [409] });

    const disposition = await request(`/archive/documents/${fixture.expired.id}/disposition`, { token: gm.token, method: 'POST', body: { reason: 'Retention expired and no legal hold' }, expected: [201] });
    await request(`/archive/dispositions/${disposition.id}/review`, { token: gm.token, method: 'POST', body: { decision: 'APPROVE' }, expected: [409] });
    const reviewer = await login(reviewerEmail, reviewerPassword);
    const result = await request(`/archive/dispositions/${disposition.id}/review`, { token: reviewer.token, method: 'POST', body: { decision: 'APPROVE', comment: 'Independently verified' } });
    assert.equal(result.ok, true);

    const stored = await tenantTransaction((transaction) => transaction.document.findUnique({ where: { id: fixture.expired.id }, include: { dispositionRequests: true } }));
    assert.equal(stored.status, 'DISPOSED');
    assert.equal(stored.content, null);
    assert.ok(stored.disposedAt);
    assert.equal(stored.dispositionRequests[0].status, 'EXECUTED');
    const archive = await request('/archive?module=Document&page=1&limit=100', { token: reviewer.token });
    assert.ok(archive.data.some((item) => item.id === fixture.expired.id && item.status === 'DISPOSED'));
    console.log('Records Management E2E passed');
  } finally {
    await cleanup();
    await database.$disconnect();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
