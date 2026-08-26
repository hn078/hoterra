const assert = require('node:assert/strict');
const crypto = require('node:crypto');
require('dotenv').config({ quiet: true });

const baseUrl = process.env.AUTH_E2E_API_URL || 'http://127.0.0.1:3211/api';
const tenantSlug = process.env.AUTH_E2E_TENANT || 'hgi';
const userPassword = process.env.AUTH_E2E_USER_PASSWORD || process.env.DEMO_USER_PASSWORD || 'password123';
const gmPassword = process.env.AUTH_E2E_GM_PASSWORD || process.env.DEMO_GM_PASSWORD || 'Test12345';

if (!/^https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?\/api$/i.test(baseUrl)) {
  throw new Error('Authorization E2E is restricted to a local API');
}

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
  const requestId = response.headers.get('x-request-id');
  const rateLimitRemaining = Number(response.headers.get('ratelimit-remaining'));
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  assert.ok(expected.includes(response.status), `${method} ${path}: expected ${expected}, got ${response.status}: ${text}`);
  assert.match(requestId || '', /^[a-f0-9-]{36}$/i, `${method} ${path}: server request ID is missing`);
  return { status: response.status, data, requestId, rateLimitRemaining };
}

async function login(email, password = userPassword) {
  const { data } = await request('/auth/login', { method: 'POST', body: { email, password } });
  assert.ok(data.token);
  assert.ok(Array.isArray(data.user.capabilities), `${email} login has no capability contract`);
  return data;
}

function assertNoSecrets(value) {
  if (Array.isArray(value)) return value.forEach(assertNoSecrets);
  if (!value || typeof value !== 'object') return;
  for (const [key, nested] of Object.entries(value)) {
    assert.notEqual(key, 'passwordHash', 'response exposed passwordHash');
    assert.notEqual(key, 'pinHash', 'response exposed pinHash');
    assertNoSecrets(nested);
  }
}

function recomputeAuditHash(event, canonicalization) {
  assert.deepEqual(canonicalization.fields, [
    'id', 'tenantId', 'userId', 'userName', 'action', 'entityType', 'entityId',
    'details', 'ipAddress', 'device', 'requestId', 'outcome', 'reason', 'beforeState',
    'afterState', 'createdAt', 'sequence', 'previousHash',
  ]);
  const payload = canonicalization.fields
    .map((field) => event[field] === null || event[field] === undefined ? '' : String(event[field]))
    .join('\x1f');
  return crypto.createHash('sha256').update(payload, 'utf8').digest('hex');
}

async function main() {
  const admin = await login('admin@hoterra.az');
  const gm = await login('rasul.mursagulov@hgibaku.com', gmPassword);
  const hod = await login('nigar.rustamova@hoterra.az');
  const employee = await login('employee@hoterra.az');

  assert.ok(admin.user.capabilities.includes('settings.manage.security'));
  assert.equal(admin.user.capabilities.includes('documents.approve'), false);
  assert.equal(admin.user.capabilities.includes('documents.sign'), false);
  assert.equal(admin.user.capabilities.includes('workforce.read'), false);
  assert.equal(admin.user.capabilities.includes('reports.read'), false);
  assert.equal(admin.user.capabilities.includes('messages.use'), false);
  assert.equal(gm.user.capabilities.includes('settings.manage.security'), false);
  assert.equal(employee.user.capabilities.includes('roles.read'), false);

  const adminRateProbe = await request('/settings', { token: admin.token });
  const employeeRateProbe = await request('/settings', { token: employee.token, expected: [403] });
  assert.equal(adminRateProbe.rateLimitRemaining, employeeRateProbe.rateLimitRemaining, 'Authenticated sessions share a rate-limit bucket');
  assert.ok(adminRateProbe.rateLimitRemaining > 500, 'Fresh authenticated session has an unexpectedly exhausted rate limit');

  await request('/documents', { token: admin.token, expected: [403] });
  await request('/workforce/requests', { token: admin.token, expected: [403] });
  await request('/reports', { token: admin.token, expected: [403] });
  await request('/conversations', { token: admin.token, expected: [403] });
  await request('/settings', { token: admin.token });
  const cacheMaintenance = await request('/settings/maintenance/clear-cache', {
    token: admin.token,
    method: 'POST',
  });
  assert.equal(cacheMaintenance.data.ok, true);
  await request('/audit', { token: admin.token });
  const auditIntegrity = await request('/audit/integrity', { token: admin.token, method: 'POST' });
  assert.equal(auditIntegrity.data.status, 'VERIFIED');
  assert.equal(auditIntegrity.data.broken, 0);
  assert.ok(auditIntegrity.data.total > 0);
  assert.match(auditIntegrity.data.anchor, /^[a-f0-9]{64}$/);
  const auditEvidence = await request('/audit/export/evidence', { token: admin.token });
  assert.equal(auditEvidence.data.format, 'HOTERRA_AUDIT_EVIDENCE');
  assert.equal(auditEvidence.data.version, 3);
  assert.equal(auditEvidence.data.chain.status, 'VERIFIED');
  assert.ok(auditEvidence.data.events.length > 0);
  assert.ok(auditEvidence.data.events.every((event) => /^[a-f0-9]{64}$/.test(event.entryHash)));
  assert.ok(auditEvidence.data.events.some((event) => event.requestId === auditIntegrity.requestId), 'Integrity event is not correlated to its HTTP request');
  assert.ok(auditEvidence.data.events.some((event) => event.requestId === auditEvidence.requestId), 'Evidence export event is not correlated to its HTTP request');
  const structuredMaintenanceEvent = auditEvidence.data.events.find((event) => event.requestId === cacheMaintenance.requestId);
  assert.ok(structuredMaintenanceEvent, 'Structured maintenance event is not correlated to its HTTP request');
  assert.equal(structuredMaintenanceEvent.outcome, 'SUCCESS');
  assert.equal(structuredMaintenanceEvent.reason, 'Administrator requested cache clear');
  assert.doesNotThrow(() => JSON.parse(structuredMaintenanceEvent.beforeState));
  assert.doesNotThrow(() => JSON.parse(structuredMaintenanceEvent.afterState));
  assert.notEqual(structuredMaintenanceEvent.beforeState, structuredMaintenanceEvent.afterState);
  assert.ok(auditEvidence.data.events.every((event) =>
    recomputeAuditHash(event, auditEvidence.data.canonicalization) === event.entryHash
  ), 'Evidence package contains an event whose canonical SHA-256 hash does not match');
  if (!auditEvidence.data.scope.filtered && !auditEvidence.data.scope.truncated) {
    assert.equal(auditEvidence.data.events[0].sequence, 1);
    assert.equal(auditEvidence.data.events[0].previousHash, '');
    for (let index = 1; index < auditEvidence.data.events.length; index += 1) {
      assert.equal(auditEvidence.data.events[index].sequence, auditEvidence.data.events[index - 1].sequence + 1);
      assert.equal(auditEvidence.data.events[index].previousHash, auditEvidence.data.events[index - 1].entryHash);
    }
    assert.equal(auditEvidence.data.events.at(-1).entryHash, auditEvidence.data.chain.anchor);
    assert.equal(auditEvidence.data.events.at(-1).sequence, auditEvidence.data.chain.lastSequence);
  }
  assertNoSecrets(auditEvidence.data);

  await request('/roles', { token: employee.token, expected: [403] });
  await request('/users', { token: employee.token, expected: [403] });
  await request('/settings', { token: employee.token, expected: [403] });
  await request('/audit', { token: employee.token, expected: [403] });
  await request('/audit/integrity', { token: employee.token, method: 'POST', expected: [403] });
  await request('/audit/export/evidence', { token: employee.token, expected: [403] });

  const search = await request('/search?q=admin', { token: employee.token });
  assertNoSecrets(search.data);

  const adminUsers = await request('/users', { token: admin.token });
  assert.ok(adminUsers.data.every((user) => typeof user.isActive === 'boolean'), 'Lifecycle manager directory omitted account status');
  const systemAdministrator = adminUsers.data.find((user) => user.role === 'SYSTEM_ADMINISTRATOR');
  assert.ok(systemAdministrator, 'System Administrator fixture is missing');
  await request(`/users/${systemAdministrator.id}`, {
    token: gm.token,
    method: 'PATCH',
    body: { isActive: true },
    expected: [403],
  });

  const hodUsers = await request('/users', { token: hod.token });
  assert.ok(hodUsers.data.every((user) => user.department?.id === hod.user.department?.id), 'HOD received another department user');

  await request('/workforce/requests', { token: employee.token, expected: [403] });

  console.log('[authorization-e2e] capability, hierarchy, safe DTO, audit evidence and scope checks passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
