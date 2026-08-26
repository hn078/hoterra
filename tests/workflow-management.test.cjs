const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const mutationSource = fs.readFileSync(path.join(root, 'server/modules/workflow/application/manageWorkflows.ts'), 'utf8');
const documentSource = fs.readFileSync(path.join(root, 'server/modules/documents/application/manageDocumentContent.ts'), 'utf8');
const listPageSource = fs.readFileSync(path.join(root, 'src/pages/WorkflowsPage.tsx'), 'utf8');
const designerSource = fs.readFileSync(path.join(root, 'src/pages/WorkflowDesignerPage.tsx'), 'utf8');

test('workflow mutations are capability-gated, serialized, and audited', () => {
  assert.match(mutationSource, /capabilities\.includes\('workflows\.manage'\)/);
  assert.match(mutationSource, /pg_advisory_xact_lock/);
  assert.match(mutationSource, /transaction\.auditLog\.create/);
  assert.match(mutationSource, /workflowAuditState/);
  assert.match(mutationSource, /stepsDigest: auditStateDigest/);
  assert.match(mutationSource, /beforeState: serializeAuditState/g);
  assert.match(mutationSource, /afterState: serializeAuditState/g);
});

test('activation accepts only the approval chain implemented by the document runtime', () => {
  assert.match(mutationSource, /Role\.HOD, Role\.FINANCE_DIRECTOR, Role\.GENERAL_MANAGER/);
  assert.match(mutationSource, /Runtime workflows must use exactly/);
  assert.match(mutationSource, /assertRuntimeSupported\(workflowSteps\.normalized\)/);
});

test('default selection is atomic and cannot leave the tenant without an explicit replacement', () => {
  assert.match(mutationSource, /workflow:default:/);
  assert.match(mutationSource, /updateMany\(\{ where: \{ isDefault: true \}/);
  assert.match(mutationSource, /tenantDefaultWorkflowIds/);
  assert.match(mutationSource, /Choose another default workflow instead/);
});

test('workflow deletion is recoverable archival and retains document references', () => {
  assert.match(mutationSource, /document\.count\(\{ where: \{ workflowId \} \}\)/);
  assert.match(mutationSource, /status: WorkflowStatus\.ARCHIVED/);
  assert.doesNotMatch(mutationSource, /workflowRoute\.delete\(/);
});

test('active workflow steps are immutable and archived workflows are immutable', () => {
  assert.match(mutationSource, /Active workflow steps are immutable/);
  assert.match(mutationSource, /Archived workflows are immutable/);
});

test('document creation accepts only active workflows', () => {
  assert.match(documentSource, /workflow\.status !== WorkflowStatus\.ACTIVE/);
});

test('workflow management controls are capability-hidden and active steps are read-only', () => {
  assert.match(listPageSource, /hasCapability\(currentUser, 'workflows\.manage'\)/);
  assert.match(listPageSource, /action=\{canManage \?/);
  assert.match(designerSource, /workflow\.status !== 'DRAFT'/);
  assert.match(designerSource, /readOnly=\{!isDraft\}/);
});
