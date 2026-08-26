const assert = require('node:assert/strict');
const { PrismaClient } = require('@prisma/client');
require('dotenv').config({ quiet: true });

const baseUrl = process.env.AUDIT_E2E_API_URL || 'http://127.0.0.1:3211/api';
const tenantSlug = process.env.AUDIT_E2E_TENANT || 'hgi';
const email = process.env.AUDIT_E2E_EMAIL || 'admin@hoterra.az';
const password = process.env.AUDIT_E2E_PASSWORD || process.env.DEMO_USER_PASSWORD || 'password123';

if (!/^https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?\/api$/i.test(baseUrl)) {
  throw new Error('Audit integrity E2E is restricted to a local API');
}
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl || !['127.0.0.1', 'localhost', '::1'].includes(new URL(databaseUrl).hostname)) {
  throw new Error('Audit integrity E2E requires local PostgreSQL');
}

const database = new PrismaClient();

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

async function withTenant(operation) {
  const tenant = await database.tenant.findUnique({ where: { slug: tenantSlug }, select: { id: true } });
  assert.ok(tenant, `Tenant ${tenantSlug} is missing`);
  return database.$transaction(async (transaction) => {
    await transaction.$executeRawUnsafe("SELECT set_config('hoterra.tenant_id', $1, true)", tenant.id);
    return operation(transaction, tenant.id);
  });
}

async function main() {
  const auth = await request('/auth/login', { method: 'POST', body: { email, password } });
  assert.ok(auth.token && auth.user.capabilities.includes('audit.read'));
  const healthy = await request('/audit/integrity', { token: auth.token, method: 'POST' });
  assert.equal(healthy.status, 'VERIFIED');

  const target = await withTenant((transaction) => transaction.auditLog.findFirst({
    where: { userId: auth.user.id, entityType: 'AuditLog', entityId: 'integrity' },
    orderBy: { sequence: 'desc' },
    select: { id: true, details: true },
  }));
  assert.ok(target, 'Integrity access event was not written');
  const originalDetails = target.details;
  try {
    await withTenant((transaction) => transaction.auditLog.update({
      where: { id: target.id },
      data: { details: `${originalDetails || ''} [tampered by local E2E]` },
    }));
    const broken = await request('/audit/integrity', { token: auth.token, method: 'POST' });
    assert.equal(broken.status, 'BROKEN');
    assert.ok(broken.broken >= 1);
  } finally {
    await withTenant((transaction) => transaction.auditLog.update({
      where: { id: target.id },
      data: { details: originalDetails },
    }));
  }

  const restored = await request('/audit/integrity', { token: auth.token, method: 'POST' });
  assert.equal(restored.status, 'VERIFIED');
  assert.equal(restored.broken, 0);
  console.log('[audit-integrity-e2e] verified -> tampered/broken -> restored/verified chain checks passed');
  await database.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await database.$disconnect().catch(() => undefined);
  process.exitCode = 1;
});
