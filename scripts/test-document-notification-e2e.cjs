const assert = require('node:assert/strict');
require('dotenv').config({ quiet: true });
const { PrismaClient } = require('@prisma/client');

const baseUrl = process.env.DOCUMENT_E2E_API_URL || 'http://127.0.0.1:3211/api';
const tenantSlug = process.env.DOCUMENT_E2E_TENANT || 'hgi';
const password = process.env.DOCUMENT_E2E_USER_PASSWORD || process.env.DEMO_USER_PASSWORD || 'password123';

if (!/^https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?\/api$/i.test(baseUrl)) {
  throw new Error('Document notification E2E is restricted to a local API');
}
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required for Document notification E2E cleanup');
if (!['127.0.0.1', 'localhost', '::1'].includes(new URL(databaseUrl).hostname)) {
  throw new Error('Document notification E2E database cleanup is restricted to local PostgreSQL');
}

const database = new PrismaClient();
const fixturePrefix = 'Document notification E2E ';

async function request(path, { token, method = 'GET', body, expected = [200] } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'x-tenant-slug': tenantSlug,
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  assert.ok(expected.includes(response.status), `${method} ${path}: ${response.status} ${text}`);
  return data;
}

async function login(email) {
  const data = await request('/auth/login', { method: 'POST', body: { email, password } });
  assert.ok(data.token, `${email} did not receive a token`);
  return data;
}

async function withTenant(operation) {
  const tenant = await database.tenant.findUnique({ where: { slug: tenantSlug }, select: { id: true } });
  assert.ok(tenant, `Tenant ${tenantSlug} is missing`);
  return database.$transaction(async (transaction) => {
    await transaction.$executeRawUnsafe("SELECT set_config('hoterra.tenant_id', $1, true)", tenant.id);
    return operation(transaction);
  });
}

async function cleanup() {
  await withTenant(async (transaction) => {
    const documents = await transaction.document.findMany({
      where: { title: { startsWith: fixturePrefix } },
      select: { id: true },
    });
    const ids = documents.map((document) => document.id);
    if (!ids.length) return;
    await transaction.notification.deleteMany({
      where: { OR: ids.flatMap((id) => [
        { link: `/approvals/${id}/review` },
        { link: `/documents/${id}` },
      ]) },
    });
    await transaction.documentHistory.deleteMany({ where: { documentId: { in: ids } } });
    await transaction.document.deleteMany({ where: { id: { in: ids } } });
  });
}

async function main() {
  await cleanup();
  const employee = await login('employee@hoterra.az');
  const hod = await login('nigar.rustamova@hoterra.az');
  assert.ok(employee.user.department?.id, 'Employee fixture has no department');

  const preference = await request('/notifications/preferences', { token: hod.token });
  assert.equal(preference.inAppRequired, true);

  const suffix = `${Date.now()}`;
  const created = await request('/documents', {
    token: employee.token,
    method: 'POST',
    expected: [201],
    body: {
      title: `${fixturePrefix}${suffix}`,
      code: `E2E-DOC-${suffix}`,
      category: 'SOP',
      departmentId: employee.user.department.id,
      status: 'IN_REVIEW',
      version: '1.0',
    },
  });
  assert.equal(created.status, 'IN_REVIEW');

  const approvalLink = `/approvals/${created.id}/review`;
  const notifications = await request('/notifications', { token: hod.token });
  const notification = notifications.find((item) => item.link === approvalLink);
  assert.ok(notification, 'Department HoD did not receive the document approval notification');
  assert.equal(notification.title, 'Document approval required');

  const opened = await request(`/notifications/${notification.id}/open`, {
    token: hod.token,
    method: 'POST',
  });
  assert.deepEqual(opened, { state: 'AVAILABLE', destination: approvalLink });
  const notificationsAfterOpen = await request('/notifications', { token: hod.token });
  assert.equal(
    notificationsAfterOpen.find((item) => item.id === notification.id)?.isRead,
    true,
    'Opening the notification did not atomically update its read state',
  );

  const dashboard = await request('/dashboard/stats', { token: hod.token });
  assert.ok(
    dashboard.myWork.some((item) => item.type === 'DOCUMENT' && item.id === created.id && item.link === approvalLink),
    'Submitted document is missing from the HoD My Work queue',
  );

  const returned = await request(`/documents/${created.id}/approve`, {
    token: hod.token,
    method: 'POST',
    body: { action: 'request_changes', comment: 'E2E revision required' },
  });
  assert.equal(returned.status, 'NEEDS_REVIEW');
  const completedNotification = await request(`/notifications/${notification.id}/open`, {
    token: hod.token,
    method: 'POST',
  });
  assert.equal(completedNotification.state, 'COMPLETED');
  assert.equal(completedNotification.destination, approvalLink);
  assert.ok(completedNotification.completedAt, 'Completed notification has no completion evidence');
  assert.equal(completedNotification.completedByName, `${hod.user.firstName} ${hod.user.lastName}`);
  const authorNotifications = await request('/notifications', { token: employee.token });
  assert.ok(
    authorNotifications.some((item) => item.link === `/documents/${created.id}`),
    'Document author did not receive the return-for-changes notification',
  );
  const authorDashboard = await request('/dashboard/stats', { token: employee.token });
  assert.ok(
    authorDashboard.myWork.some((item) =>
      item.id === created.id
      && item.status === 'NEEDS_REVIEW'
      && item.action === 'Revise and resubmit'
      && item.link === `/documents/${created.id}`
    ),
    'Returned document is missing from the author My Work queue',
  );
  console.log('[document-notification-e2e] typed target, server-authorized open, completed-action evidence, return, inbox deep-links and My Work checks passed');
}

cleanup()
  .then(main)
  .finally(async () => {
    await cleanup();
    await database.$disconnect();
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
