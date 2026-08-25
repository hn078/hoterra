const assert = require('node:assert/strict');

const baseUrl = process.env.WORKFORCE_E2E_API_URL || 'http://127.0.0.1:3211/api';
const tenantSlug = process.env.WORKFORCE_E2E_TENANT || 'hgi';
const userPassword = process.env.WORKFORCE_E2E_USER_PASSWORD || 'E2eUser-2026!';
const gmPassword = process.env.WORKFORCE_E2E_GM_PASSWORD || 'E2eGm-2026!';

if (!/^https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?\/api$/i.test(baseUrl)) {
  throw new Error('Workforce E2E is restricted to a local API');
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
  const hrUser = (await request('/users', {
    token: admin.token,
    method: 'POST',
    body: {
      email: `hr.e2e.${suffix}@example.test`,
      password: userPassword,
      firstName: 'E2E HR',
      lastName: 'HOD',
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
      password: userPassword,
      firstName: 'E2E Procurement',
      lastName: 'Manager',
      role: 'HOD',
      customRoleId: procurementRole.id,
      departmentId: procurement.id,
    },
    expected: [201],
  })).data;
  const hr = await login(hrUser.email);
  const procurementManager = await login(procurementUser.email);
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
    const vendor = (await request('/workforce/vendors', {
      token: procurementManager.token,
      method: 'POST',
      body: {
        name: `E2E ${label} ${suffix}`,
        contactEmail: `${label.toLowerCase()}.${suffix}@example.test`,
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
    token: admin.token,
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
  logStep(`bulk request ${workforceRequest.code} created`);

  const hrBefore = (await request('/workforce/requests?pendingMine=1', { token: hr.token })).data.data;
  assert.equal(hrBefore.some((entry) => entry.id === workforceRequest.id), false);
  await request(`/workforce/requests/${workforceRequest.id}/approve`, {
    token: employee.token,
    method: 'POST',
    expected: [403],
  });
  await request(`/workforce/requests/${workforceRequest.id}/approve`, { token: hod.token, method: 'POST' });
  const hrPending = (await request('/workforce/requests?pendingMine=1', { token: hr.token })).data.data;
  assert.equal(hrPending.some((entry) => entry.id === workforceRequest.id), true);
  await request(`/workforce/requests/${workforceRequest.id}/approve`, { token: hr.token, method: 'POST' });
  const duplicateHrApproval = await request(`/workforce/requests/${workforceRequest.id}/approve`, { token: hr.token, method: 'POST' });
  assert.equal(duplicateHrApproval.data.currentStepIndex, 2);
  const hrHistory = (await request('/workforce/requests', { token: hr.token })).data.data;
  assert.equal(hrHistory.some((entry) => entry.id === workforceRequest.id), true);
  await request(`/workforce/requests/${workforceRequest.id}`, { token: hr.token });
  await request(`/workforce/requests/${workforceRequest.id}/approve`, { token: finance.token, method: 'POST' });
  const gmConfirmed = (await request(`/workforce/requests/${workforceRequest.id}/approve`, { token: gm.token, method: 'POST' })).data;
  assert.equal(gmConfirmed.status, 'PROCUREMENT_REVIEW');
  assert.equal(gmConfirmed.items.every((item) => item.vendorId === vendorA.id), true);
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
  const portalOrder = (await request(`/vendor/order/${invite.token}`)).data;
  assert.equal(portalOrder.canRespond, true);
  await request(`/vendor/order/${invite.token}/accept`, { method: 'POST' });
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
  await request(`/workforce/requests/${workforceRequest.id}/vendor-correction-review/${draftReview.id}/decision`, {
    token: finance.token,
    method: 'POST',
    body: { decision: 'approve', comment: 'Finance accepts the correction' },
  });
  const corrected = (await request(`/workforce/requests/${workforceRequest.id}/vendor-correction-review/${draftReview.id}/decision`, {
    token: gm.token,
    method: 'POST',
    body: { decision: 'approve', comment: 'GM accepts the correction' },
  })).data;
  assert.equal(corrected.status, 'VENDORS_FULLY_APPROVED');
  assert.equal(corrected.items.find((item) => item.id === itemToCorrect.id).vendorId, vendorB.id);
  const visibleForHod = (await request(`/workforce/requests/${workforceRequest.id}`, { token: hod.token })).data;
  assert.equal(visibleForHod.items.some((item) => item.vendorId === vendorA.id), true);
  assert.equal(visibleForHod.items.some((item) => item.vendorId === vendorB.id), true);
  logStep('vendor correction → Finance Director → GM review passed');

  await request(`/workforce/requests/${workforceRequest.id}/evaluations`, {
    token: hod.token,
    method: 'POST',
    body: { phase: 'ONGOING', overallScore: 4, notes: 'E2E ongoing quality check' },
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
  await request(`/workforce/requests/${workforceRequest.id}/confirm-hod`, { token: hod.token, method: 'POST' });
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

main().catch((error) => {
  console.error('[workforce-e2e] FAILED', error);
  process.exitCode = 1;
});
