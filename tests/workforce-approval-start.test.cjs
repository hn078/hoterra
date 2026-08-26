require('tsx/cjs');

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { initialWorkforceApprovalStepIndex } = require('../server/modules/workforce/application/manageWorkforceRequestPlanning');

const steps = [
  { role: 'HOD', label: 'Requesting department HoD', approverDepartmentId: 'food' },
  { role: 'HOD', label: 'Human Resources — Head of Department', approverDepartmentId: 'hr' },
  { role: 'FINANCE_DIRECTOR', label: 'Finance Director' },
  { role: 'GENERAL_MANAGER', label: 'General Manager' },
];

test('an explicit department HoD draft submission starts at Human Resources HoD', () => {
  assert.equal(initialWorkforceApprovalStepIndex(steps, { id: 'food-hod', role: 'HOD', departmentId: 'food' }, 'food'), 1);
});

test('a non-HoD or another department cannot bypass the requesting HoD', () => {
  assert.equal(initialWorkforceApprovalStepIndex(steps, { id: 'employee', role: 'EMPLOYEE', departmentId: 'food' }, 'food'), 0);
  assert.equal(initialWorkforceApprovalStepIndex(steps, { id: 'other-hod', role: 'HOD', departmentId: 'rooms' }, 'food'), 0);
});

test('an explicitly assigned different HoD must still approve', () => {
  const assigned = [{ ...steps[0], approverUserId: 'director' }, ...steps.slice(1)];
  assert.equal(initialWorkforceApprovalStepIndex(assigned, { id: 'food-hod', role: 'HOD', departmentId: 'food' }, 'food'), 0);
});

test('creation remains a draft and only explicit HoD submission notifies HR', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../server/modules/workforce/application/manageWorkforceRequestPlanning.ts'), 'utf8');
  assert.match(source, /status: WorkforceRequestStatus\.DRAFT/);
  const createBlock = source.slice(source.indexOf('export async function createWorkforceRequestInTransaction'), source.indexOf('export async function submitDraftWorkforceRequest'));
  assert.doesNotMatch(createBlock, /queueRequestApprovalNotifications/);
  const submitBlock = source.slice(source.indexOf('export async function submitDraftWorkforceRequest'), source.indexOf('export async function createWorkforceRequest\('));
  assert.match(submitBlock, /status !== WorkforceRequestStatus\.DRAFT/);
  assert.match(submitBlock, /queueRequestApprovalNotifications/);
  assert.match(submitBlock, /currentStepIndex: nextStepIndex/);
});
