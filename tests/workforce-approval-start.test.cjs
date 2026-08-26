require('tsx/cjs');

const test = require('node:test');
const assert = require('node:assert/strict');
const { initialWorkforceApprovalStepIndex } = require('../server/modules/workforce/application/manageWorkforceRequestPlanning');

const steps = [
  { role: 'HOD', label: 'Requesting department HoD', approverDepartmentId: 'food' },
  { role: 'HOD', label: 'Human Resources — Head of Department', approverDepartmentId: 'hr' },
  { role: 'FINANCE_DIRECTOR', label: 'Finance Director' },
  { role: 'GENERAL_MANAGER', label: 'General Manager' },
];

test('a department HoD submission starts directly at Human Resources HoD', () => {
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
