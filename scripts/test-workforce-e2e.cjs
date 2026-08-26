const assert = require('node:assert/strict');
require('dotenv').config({ quiet: true });
const { PrismaClient } = require('@prisma/client');

const baseUrl = process.env.WORKFORCE_E2E_API_URL || 'http://127.0.0.1:3211/api';
const tenantSlug = process.env.WORKFORCE_E2E_TENANT || 'hgi';
const userPassword = process.env.WORKFORCE_E2E_USER_PASSWORD || process.env.DEMO_USER_PASSWORD || 'password123';
const gmPassword = process.env.WORKFORCE_E2E_GM_PASSWORD || process.env.DEMO_GM_PASSWORD || 'Test12345';
const createdUserPassword = process.env.WORKFORCE_E2E_CREATED_USER_PASSWORD || 'E2eUser-2026!';

if (!/^https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?\/api$/i.test(baseUrl)) {
  throw new Error('Workforce E2E is restricted to a local API');
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required for the local Workforce E2E outbox check');
const databaseHost = new URL(databaseUrl).hostname;
if (!['127.0.0.1', 'localhost', '::1'].includes(databaseHost)) {
  throw new Error('Workforce E2E database cleanup is restricted to a local PostgreSQL host');
}

const testDatabase = new PrismaClient();

async function withTenantDatabase(operation) {
  const tenant = await testDatabase.tenant.findUnique({
    where: { slug: tenantSlug },
    select: { id: true },
  });
  assert.ok(tenant, `Tenant ${tenantSlug} is missing`);
  return testDatabase.$transaction(async (transaction) => {
    await transaction.$executeRawUnsafe(
      "SELECT set_config('hoterra.tenant_id', $1, true)",
      tenant.id,
    );
    return operation(transaction);
  });
}

async function cleanupLocalE2eFixtures() {
  return withTenantDatabase(async (transaction) => {
    const [requests, users, vendors, positions, roles, frontOffice] = await Promise.all([
      transaction.workforceRequest.findMany({
        where: { comment: { startsWith: 'Workforce E2E ' } },
        select: {
          id: true,
          code: true,
          invites: { select: { id: true } },
          invoices: { select: { id: true } },
          items: { select: { id: true, vendorRateId: true } },
        },
      }),
      transaction.user.findMany({
        where: { OR: [{ email: { startsWith: 'hr.e2e.' } }, { email: { startsWith: 'procurement.e2e.' } }] },
        select: { id: true },
      }),
      transaction.vendor.findMany({ where: { name: { startsWith: 'E2E ' } }, select: { id: true } }),
      transaction.workforcePosition.findMany({ where: { name: { startsWith: 'E2E ' } }, select: { id: true } }),
      transaction.customRole.findMany({ where: { name: { startsWith: 'E2E Procurement Workforce Manager ' } }, select: { id: true } }),
      transaction.department.findFirst({ where: { code: 'FO' }, select: { id: true } }),
    ]);
    const requestIds = requests.map((request) => request.id);
    const requestCodes = requests.map((request) => request.code);
    const inviteIds = requests.flatMap((request) => request.invites.map((invite) => invite.id));
    const invoiceIds = requests.flatMap((request) => request.invoices.map((invoice) => invoice.id));
    const itemIds = requests.flatMap((request) => request.items.map((item) => item.id));
    const rateIds = requests.flatMap((request) => request.items.map((item) => item.vendorRateId).filter(Boolean));
    const userIds = users.map((user) => user.id);
    const vendorIds = vendors.map((vendor) => vendor.id);
    const positionIds = positions.map((position) => position.id);
    const roleIds = roles.map((role) => role.id);
    const entityIds = [...requestIds, ...inviteIds, ...invoiceIds, ...itemIds, ...rateIds, ...userIds, ...vendorIds, ...positionIds, ...roleIds];

    await transaction.emailOutbox.deleteMany({
      where: {
        OR: [
          ...(entityIds.length ? [{ entityId: { in: entityIds } }] : []),
          { toEmail: { contains: '.e2e.' } },
          ...requestCodes.map((code) => ({ subject: { contains: code } })),
        ],
      },
    });
    await transaction.notification.deleteMany({
      where: {
        OR: [
          ...(userIds.length ? [{ userId: { in: userIds } }] : []),
          ...requestIds.map((id) => ({ link: `/workforce/${id}` })),
          { message: { contains: 'E2E' } },
        ],
      },
    });
    if (requestIds.length) await transaction.workforceRequest.deleteMany({ where: { id: { in: requestIds } } });
    if (vendorIds.length) await transaction.vendor.deleteMany({ where: { id: { in: vendorIds } } });
    if (positionIds.length) await transaction.workforcePosition.deleteMany({ where: { id: { in: positionIds } } });
    // AuditLog is append-only evidence. Fixture actors/roles are retained as inactive
    // references instead of deleting their audit rows and breaking the tenant chain.
    if (userIds.length) await transaction.user.updateMany({
      where: { id: { in: userIds } },
      data: { isActive: false, tokenVersion: { increment: 1 } },
    });
    if (roleIds.length) await transaction.customRole.updateMany({
      where: { id: { in: roleIds } },
      data: { isActive: false },
    });
    if (frontOffice) {
      await transaction.workforceApprovalRoute.upsert({
        where: { departmentId: frontOffice.id },
        update: {
          name: 'Front Office Casual Route',
          steps: JSON.stringify([
            { role: 'HOD', label: 'Front Office Manager' },
            { role: 'FINANCE_DIRECTOR', label: 'Finance Director' },
            { role: 'GENERAL_MANAGER', label: 'General Manager' },
          ]),
        },
        create: {
          departmentId: frontOffice.id,
          name: 'Front Office Casual Route',
          steps: JSON.stringify([
            { role: 'HOD', label: 'Front Office Manager' },
            { role: 'FINANCE_DIRECTOR', label: 'Finance Director' },
            { role: 'GENERAL_MANAGER', label: 'General Manager' },
          ]),
        },
      });
    }
    return { requests: requestIds.length, users: userIds.length, vendors: vendorIds.length };
  });
}

async function readInviteTokenFromLocalOutbox(inviteId) {
  const email = await withTenantDatabase(async (transaction) => {
    return transaction.emailOutbox.findFirst({
      where: { entityType: 'VendorInvite', entityId: inviteId },
      orderBy: { createdAt: 'desc' },
      select: { body: true },
    });
  });
  assert.ok(email, `Vendor invite ${inviteId} has no committed email outbox row`);
  const match = email.body.match(/\/vendor\/order\/([^\s/]+)/);
  assert.ok(match, 'Vendor portal link is missing from the committed email');
  return match[1];
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
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }
  if (!expected.includes(response.status)) {
    throw new Error(`${method} ${path} returned ${response.status}: ${text}`);
  }
  return { status: response.status, data: payload, headers: response.headers };
}

async function login(email, password = userPassword) {
  const { data } = await request('/auth/login', {
    method: 'POST',
    body: { email, password },
  });
  assert.ok(data.token, `Login token missing for ${email}`);
  return data;
}

function isoDay(daysFromNow) {
  const value = new Date();
  value.setUTCHours(12, 0, 0, 0);
  value.setUTCDate(value.getUTCDate() + daysFromNow);
  return value.toISOString().slice(0, 10);
}

function logStep(message) {
  console.log(`[workforce-e2e] ${message}`);
}

async function main() {
  const suffix = Date.now().toString(36);
  const admin = await login('admin@hoterra.az');
  const hod = await login('nigar.rustamova@hoterra.az');
  const finance = await login('elnur.mahmudov@hoterra.az');
  const gm = await login('rasul.mursagulov@hgibaku.com', gmPassword);
  const employee = await login('employee@hoterra.az');
  logStep('role logins passed');

  const departments = (await request('/departments', { token: admin.token })).data;
  const frontOffice = departments.find((department) => department.code === 'FO');
  const humanResources = departments.find((department) => department.code === 'HR');
  const procurement = departments.find((department) => department.code === 'PR');
  assert.ok(frontOffice && humanResources && procurement, 'Required departments are missing');

  const procurementRole = (await request('/roles', {
    token: admin.token,
    method: 'POST',
    body: {
      name: `E2E Procurement Workforce Manager ${suffix}`,
      description: 'Isolated Workforce E2E role',
      baseRole: 'HOD',
    },
    expected: [201],
  })).data;
  const procurementPermissions = Object.fromEntries(
    Object.entries(procurementRole.permissions).map(([moduleName, row]) => [moduleName, [...row]]),
  );
  procurementPermissions.Dashboard[1] = true;
  procurementPermissions['Casual Workforce'][2] = true;
  procurementPermissions['Casual Workforce'][6] = true;
  await request(`/roles/${procurementRole.id}`, {
    token: admin.token,
    method: 'PATCH',
    body: { permissions: procurementPermissions },
  });
  const hrUser = (await request('/users', {
    token: admin.token,
    method: 'POST',
    body: {
      email: `hr.e2e.${suffix}@example.test`,
      password: createdUserPassword,
      firstName: 'E2E HR',
      lastName: 'HOD',
      jobTitle: 'Human Resources Manager',
      role: 'HOD',
      departmentId: humanResources.id,
    },
    expected: [201],
  })).data;
  const procurementUser = (await request('/users', {
    token: admin.token,
    method: 'POST',
    body: {
      email: `procurement.e2e.${suffix}@example.test`,
      password: createdUserPassword,
      firstName: 'E2E Procurement',
      lastName: 'Manager',
      jobTitle: 'Procurement Workforce Manager',
      role: 'HOD',
      customRoleId: procurementRole.id,
      departmentId: procurement.id,
    },
    expected: [201],
  })).data;
  const hr = await login(hrUser.email, createdUserPassword);
  const procurementManager = await login(procurementUser.email, createdUserPassword);
  logStep('HR and Procurement test users created');

  const hourlyPosition = (await request('/workforce/positions', {
    token: procurementManager.token,
    method: 'POST',
    body: { name: `E2E Reception Agent ${suffix}`, departmentId: frontOffice.id },
    expected: [201],
  })).data;
  const dailyPosition = (await request('/workforce/positions', {
    token: procurementManager.token,
    method: 'POST',
    body: { name: `E2E Bell Agent ${suffix}`, departmentId: frontOffice.id },
    expected: [201],
  })).data;

  async function createAndApproveVendor(label) {
    const emailLabel = label.toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '');
    const vendor = (await request('/workforce/vendors', {
      token: procurementManager.token,
      method: 'POST',
      body: {
        name: `E2E ${label} ${suffix}`,
        contactEmail: `${emailLabel}.${suffix}@example.test`,
        phone: '+994 12 555 0101',
        insuranceNotes: 'E2E insurance verified',
      },
      expected: [201],
    })).data;
    await request(`/workforce/vendors/${vendor.id}/approve`, {
      token: gm.token,
      method: 'POST',
      body: { comment: 'Wrong-order negative test' },
      expected: [403],
    });
    const afterFinance = (await request(`/workforce/vendors/${vendor.id}/approve`, {
      token: finance.token,
      method: 'POST',
      body: { comment: 'Finance approved E2E vendor' },
    })).data;
    assert.equal(afterFinance.approvalStatus, 'PENDING_APPROVAL');
    const approved = (await request(`/workforce/vendors/${vendor.id}/approve`, {
      token: gm.token,
      method: 'POST',
      body: { comment: 'GM approved E2E vendor' },
    })).data;
    assert.equal(approved.approvalStatus, 'APPROVED');
    assert.equal(approved.isApproved, true);
    return approved;
  }

  const vendorA = await createAndApproveVendor('Vendor A');
  const vendorB = await createAndApproveVendor('Vendor B');
  logStep('vendor submission and Finance Director/GM approval passed');

  async function addRate(vendorId, positionId, unit, price) {
    return (await request('/workforce/rates', {
      token: procurementManager.token,
      method: 'POST',
      body: { vendorId, positionId, unit, price, currency: 'AZN', requirements: 'E2E approved service' },
      expected: [201],
    })).data;
  }

  const rateAHourly = await addRate(vendorA.id, hourlyPosition.id, 'HOURLY', 5);
  const rateBHourly = await addRate(vendorB.id, hourlyPosition.id, 'HOURLY', 6);
  const rateADaily = await addRate(vendorA.id, dailyPosition.id, 'DAILY_9', 40);
  await addRate(vendorB.id, dailyPosition.id, 'DAILY_9', 45);
  assert.equal(rateAHourly.price, 5);
  assert.equal(rateADaily.price, 40);

  await request(`/workforce/routes/${frontOffice.id}`, {
    token: procurementManager.token,
    method: 'PUT',
    body: {
      name: `E2E Front Office Route ${suffix}`,
      steps: [
        { role: 'HOD', label: 'Front Office Head of Department', approverUserId: hod.user.id },
        { role: 'HOD', label: 'Human Resources — Head of Department', approverUserId: hr.user.id, approverDepartmentId: humanResources.id },
        { role: 'FINANCE_DIRECTOR', label: 'Finance Director', approverUserId: finance.user.id },
        { role: 'GENERAL_MANAGER', label: 'General Manager — Request confirmation', approverUserId: gm.user.id },
      ],
    },
  });

  const requestBody = {
    hotelName: 'HOTERRA E2E',
    departmentId: frontOffice.id,
    workDate: isoDay(3),
    endDate: isoDay(4),
    comment: `Workforce E2E ${suffix}`,
    items: [
      { positionId: hourlyPosition.id, rateUnit: 'HOURLY', quantity: 3, hours: 4 },
      { positionId: dailyPosition.id, rateUnit: 'DAILY_9', quantity: 2, hours: null },
    ],
  };
  await request('/workforce/requests', {
    token: employee.token,
    method: 'POST',
    body: requestBody,
    expected: [403],
  });
  const workforceRequest = (await request('/workforce/requests', {
    token: hod.token,
    method: 'POST',
    body: requestBody,
    expected: [201],
  })).data;
  assert.equal(workforceRequest.items.length, 2);
  assert.equal(workforceRequest.quantity, 5);
  assert.equal(workforceRequest.approvalSteps.length, 4);
  const gmInitialDetail = (await request(`/workforce/requests/${workforceRequest.id}`, { token: gm.token })).data;
  assert.equal(gmInitialDetail.canApprove, false, 'GM was exposed as approver before the GM step');
  const gmInitialPending = (await request('/workforce/requests?pendingMine=1', { token: gm.token })).data.data;
  assert.equal(gmInitialPending.some((entry) => entry.id === workforceRequest.id), false);
  const hodInitialWork = (await request('/dashboard/stats', { token: hod.token })).data.myWork;
  assert.ok(hodInitialWork.some((entry) => entry.id === workforceRequest.id && entry.action === 'Review workforce request'));
  const hodNotifications = (await request('/notifications', { token: hod.token })).data;
  const hodApprovalNotification = hodNotifications.find((entry) =>
    entry.entityId === workforceRequest.id && entry.actionType === 'WORKFORCE_APPROVAL'
  );
  assert.ok(hodApprovalNotification, 'HOD typed workforce approval notification is missing');
  const hodNotificationBefore = (await request(`/notifications/${hodApprovalNotification.id}/open`, {
    token: hod.token,
    method: 'POST',
  })).data;
  assert.equal(hodNotificationBefore.state, 'AVAILABLE');
  logStep(`bulk request ${workforceRequest.code} created`);

  const hrBefore = (await request('/workforce/requests?pendingMine=1', { token: hr.token })).data.data;
  assert.equal(hrBefore.some((entry) => entry.id === workforceRequest.id), false);
  await request(`/workforce/requests/${workforceRequest.id}/approve`, {
    token: employee.token,
    method: 'POST',
    expected: [403],
  });
  await request(`/workforce/requests/${workforceRequest.id}/approve`, { token: hod.token, method: 'POST' });
  const hodNotificationAfter = (await request(`/notifications/${hodApprovalNotification.id}/open`, {
    token: hod.token,
    method: 'POST',
  })).data;
  assert.equal(hodNotificationAfter.state, 'COMPLETED');
  assert.equal(hodNotificationAfter.completedByName, `${hod.user.firstName} ${hod.user.lastName}`);
  const hrPending = (await request('/workforce/requests?pendingMine=1', { token: hr.token })).data.data;
  assert.equal(hrPending.some((entry) => entry.id === workforceRequest.id), true);
  const hrWork = (await request('/dashboard/stats', { token: hr.token })).data.myWork;
  assert.ok(hrWork.some((entry) => entry.id === workforceRequest.id && entry.action === 'Review workforce request'));
  await request(`/workforce/requests/${workforceRequest.id}/approve`, { token: hr.token, method: 'POST' });
  const duplicateHrApproval = await request(`/workforce/requests/${workforceRequest.id}/approve`, { token: hr.token, method: 'POST' });
  assert.equal(duplicateHrApproval.data.currentStepIndex, 2);
  const hrHistory = (await request('/workforce/requests', { token: hr.token })).data.data;
  assert.equal(hrHistory.some((entry) => entry.id === workforceRequest.id), true);
  await request(`/workforce/requests/${workforceRequest.id}`, { token: hr.token });
  await request(`/workforce/requests/${workforceRequest.id}/approve`, { token: finance.token, method: 'POST' });
  const gmCurrentDetail = (await request(`/workforce/requests/${workforceRequest.id}`, { token: gm.token })).data;
  assert.equal(gmCurrentDetail.canApprove, true);
  const gmWork = (await request('/dashboard/stats', { token: gm.token })).data.myWork;
  assert.ok(gmWork.some((entry) => entry.id === workforceRequest.id && entry.action === 'Review workforce request'));
  const gmConfirmed = (await request(`/workforce/requests/${workforceRequest.id}/approve`, { token: gm.token, method: 'POST' })).data;
  assert.equal(gmConfirmed.status, 'PROCUREMENT_REVIEW');
  assert.equal(gmConfirmed.items.every((item) => item.vendorId === vendorA.id), true);
  const procurementWork = (await request('/dashboard/stats', { token: procurementManager.token })).data.myWork;
  assert.ok(procurementWork.some((entry) => entry.id === workforceRequest.id && entry.action === 'Confirm selected vendors'));
  logStep('HOD → HR → Finance Director → GM approval passed');

  const hiddenForHod = (await request(`/workforce/requests/${workforceRequest.id}`, { token: hod.token })).data;
  assert.equal(hiddenForHod.vendor, null);
  assert.equal(hiddenForHod.items.every((item) => item.vendor === null), true);

  const sent = (await request(`/workforce/requests/${workforceRequest.id}/procurement-confirm`, {
    token: procurementManager.token,
    method: 'POST',
  })).data;
  assert.equal(sent.status, 'SENT_TO_VENDOR');
  assert.equal(sent.invites.length, 1);
  const invite = sent.invites[0];
  assert.equal(invite.token, undefined, 'Authenticated DTO exposed a vendor bearer token');
  const inviteToken = await readInviteTokenFromLocalOutbox(invite.id);
  const portalOrder = (await request(`/vendor/order/${inviteToken}`)).data;
  assert.equal(portalOrder.canRespond, true);
  await request(`/vendor/order/${inviteToken}/accept`, { method: 'POST' });
  const accepted = (await request(`/workforce/requests/${workforceRequest.id}`, { token: procurementManager.token })).data;
  assert.equal(accepted.status, 'VENDOR_ACCEPTED');
  logStep('Procurement confirmation and vendor portal acceptance passed');

  const itemToCorrect = accepted.items.find((item) => item.positionId === hourlyPosition.id);
  assert.ok(itemToCorrect);
  const drafted = (await request(`/workforce/requests/${workforceRequest.id}/items/${itemToCorrect.id}/vendor-correction`, {
    token: procurementManager.token,
    method: 'POST',
    body: { vendorRateId: rateBHourly.id, comment: 'Vendor A unavailable for the requested hours' },
  })).data;
  const draftReview = drafted.vendorCorrectionReviews.find((review) => review.status === 'DRAFT');
  assert.ok(draftReview);
  const submitted = (await request(`/workforce/requests/${workforceRequest.id}/vendor-correction-review/submit`, {
    token: procurementManager.token,
    method: 'POST',
  })).data;
  const pendingFd = submitted.vendorCorrectionReviews.find((review) => review.id === draftReview.id);
  assert.equal(pendingFd.status, 'PENDING_FD');
  const financeCorrectionWork = (await request('/dashboard/stats', { token: finance.token })).data.myWork;
  assert.ok(financeCorrectionWork.some((entry) => entry.id === workforceRequest.id && entry.action === 'Review vendor changes'));
  const financeCorrectionNotification = (await request('/notifications', { token: finance.token })).data.find((entry) =>
    entry.entityId === workforceRequest.id && entry.actionType === 'VENDOR_CORRECTION_REVIEW' && !entry.actionCompletedAt
  );
  assert.ok(financeCorrectionNotification, 'Finance typed vendor-correction notification is missing');
  assert.equal((await request(`/notifications/${financeCorrectionNotification.id}/open`, { token: finance.token, method: 'POST' })).data.state, 'AVAILABLE');
  await request(`/workforce/requests/${workforceRequest.id}/vendor-correction-review/${draftReview.id}/decision`, {
    token: finance.token,
    method: 'POST',
    body: { decision: 'approve', comment: 'Finance accepts the correction' },
  });
  const financeCorrectionCompleted = (await request(`/notifications/${financeCorrectionNotification.id}/open`, {
    token: finance.token,
    method: 'POST',
  })).data;
  assert.equal(financeCorrectionCompleted.state, 'COMPLETED');
  assert.equal(financeCorrectionCompleted.completedByName, `${finance.user.firstName} ${finance.user.lastName}`);
  const gmCorrectionWork = (await request('/dashboard/stats', { token: gm.token })).data.myWork;
  assert.ok(gmCorrectionWork.some((entry) => entry.id === workforceRequest.id && entry.action === 'Review vendor changes'));
  const gmCorrectionNotification = (await request('/notifications', { token: gm.token })).data.find((entry) =>
    entry.entityId === workforceRequest.id && entry.actionType === 'VENDOR_CORRECTION_REVIEW' && !entry.actionCompletedAt
  );
  assert.ok(gmCorrectionNotification, 'GM typed vendor-correction notification is missing');
  assert.equal((await request(`/notifications/${gmCorrectionNotification.id}/open`, { token: gm.token, method: 'POST' })).data.state, 'AVAILABLE');
  const corrected = (await request(`/workforce/requests/${workforceRequest.id}/vendor-correction-review/${draftReview.id}/decision`, {
    token: gm.token,
    method: 'POST',
    body: { decision: 'approve', comment: 'GM accepts the correction' },
  })).data;
  const gmCorrectionCompleted = (await request(`/notifications/${gmCorrectionNotification.id}/open`, {
    token: gm.token,
    method: 'POST',
  })).data;
  assert.equal(gmCorrectionCompleted.state, 'COMPLETED');
  assert.equal(gmCorrectionCompleted.completedByName, `${gm.user.firstName} ${gm.user.lastName}`);
  assert.equal(corrected.status, 'VENDORS_FULLY_APPROVED');
  assert.equal(corrected.items.find((item) => item.id === itemToCorrect.id).vendorId, vendorB.id);
  const visibleForHod = (await request(`/workforce/requests/${workforceRequest.id}`, { token: hod.token })).data;
  assert.equal(visibleForHod.items.some((item) => item.vendorId === vendorA.id), true);
  assert.equal(visibleForHod.items.some((item) => item.vendorId === vendorB.id), true);
  logStep('vendor correction → Finance Director → GM review passed');

  await request(`/workforce/requests/${workforceRequest.id}/evaluations`, {
    token: hod.token,
    method: 'POST',
    body: { vendorId: vendorA.id, phase: 'ONGOING', overallScore: 4, notes: 'E2E ongoing quality check' },
    expected: [201],
  });
  const actualCost = corrected.estimatedCost;
  await request(`/workforce/requests/${workforceRequest.id}/completion`, {
    token: employee.token,
    method: 'POST',
    body: { actualQuantity: 5, actualHours: 24, actualCost },
    expected: [403],
  });
  await request(`/workforce/requests/${workforceRequest.id}/completion`, {
    token: hod.token,
    method: 'POST',
    body: { actualQuantity: 5, actualHours: 24, actualCost },
  });
  const hodCompletionWork = (await request('/dashboard/stats', { token: hod.token })).data.myWork;
  assert.ok(hodCompletionWork.some((entry) => entry.id === workforceRequest.id && entry.action === 'Confirm service delivery'));
  await request(`/workforce/requests/${workforceRequest.id}/confirm-hod`, { token: hod.token, method: 'POST' });
  const financeCompletionWork = (await request('/dashboard/stats', { token: finance.token })).data.myWork;
  assert.ok(financeCompletionWork.some((entry) => entry.id === workforceRequest.id && entry.action === 'Confirm actuals and complete'));
  const completed = (await request(`/workforce/requests/${workforceRequest.id}/confirm-finance`, { token: finance.token, method: 'POST' })).data;
  assert.equal(completed.status, 'COMPLETED');
  logStep('quality evaluation, actuals, HOD and Finance completion passed');

  const reportDate = new Date(`${requestBody.workDate}T12:00:00Z`);
  const reportQuery = `year=${reportDate.getUTCFullYear()}&month=${reportDate.getUTCMonth() + 1}`;
  const reportBeforeInvoices = (await request(`/workforce/reports?${reportQuery}`, { token: finance.token })).data;
  const vendorRows = reportBeforeInvoices.paymentDetails.filter((row) => row.requestCode === workforceRequest.code);
  assert.equal(vendorRows.length, 2);
  await request('/workforce/payroll/invoices', {
    token: finance.token,
    method: 'POST',
    body: {
      requestId: workforceRequest.id,
      invoiceNumber: `E2E-MISSING-VENDOR-${suffix}`,
      invoiceHours: 24,
      invoiceAmount: actualCost,
      invoiceDate: isoDay(0),
    },
    expected: [400],
  });
  const vendorIds = new Map([[vendorA.name, vendorA.id], [vendorB.name, vendorB.id]]);
  for (const [index, row] of vendorRows.entries()) {
    const invoice = (await request('/workforce/payroll/invoices', {
      token: finance.token,
      method: 'POST',
      body: {
        requestId: workforceRequest.id,
        vendorId: vendorIds.get(row.vendor),
        invoiceNumber: `E2E-${suffix}-${index + 1}`,
        invoiceHours: row.hours,
        invoiceAmount: row.committedAmount,
        invoiceDate: isoDay(0),
      },
      expected: [201],
    })).data;
    const matched = (await request(`/workforce/payroll/invoices/${invoice.id}/match`, { token: finance.token, method: 'POST' })).data;
    assert.equal(matched.status, 'MATCHED');
    const paid = (await request(`/workforce/payroll/invoices/${invoice.id}/paid`, { token: finance.token, method: 'POST' })).data;
    assert.equal(paid.status, 'PAID');
  }

  const report = (await request(`/workforce/reports?${reportQuery}`, { token: finance.token })).data;
  assert.equal(report.paymentDetails.some((row) => row.requestCode === workforceRequest.code), true);
  const completedPaymentRows = report.paymentDetails.filter((row) => row.requestCode === workforceRequest.code);
  assert.equal(completedPaymentRows.every((row) => row.paymentStatus === 'PAID' && row.amountPayable === 0), true);
  const csv = await request(`/workforce/reports/export.csv?${reportQuery}`, { token: finance.token });
  assert.match(String(csv.data), /amountPayableAZN/);
  assert.match(String(csv.data), new RegExp(workforceRequest.code));
  logStep('payroll, vendor payment report and CSV export passed');

  const statusFiltered = (await request('/workforce/requests?status=COMPLETED', { token: finance.token })).data.data;
  assert.equal(statusFiltered.some((entry) => entry.id === workforceRequest.id), true);
  const searchMeta = (await request('/workforce/meta', { token: procurementManager.token })).data;
  assert.equal(searchMeta.catalogRates.some((rate) => rate.id === rateAHourly.id), true);
  assert.equal(searchMeta.catalogRates.some((rate) => rate.id === rateBHourly.id), true);

  console.log(JSON.stringify({
    ok: true,
    requestId: workforceRequest.id,
    requestCode: workforceRequest.code,
    finalStatus: completed.status,
    vendorCorrectionStatus: 'APPROVED',
    invoiceStatus: 'PAID',
  }, null, 2));
}

cleanupLocalE2eFixtures()
  .then(() => main())
  .catch((error) => {
    console.error('[workforce-e2e] FAILED', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await cleanupLocalE2eFixtures();
    await testDatabase.$disconnect();
  });
