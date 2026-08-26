const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

function loadTypeScriptModule(relativePath) {
  const fileName = path.join(root, relativePath);
  const source = fs.readFileSync(fileName, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName,
  }).outputText;
  const loaded = new Module(fileName, module);
  loaded.filename = fileName;
  loaded.paths = module.paths;
  loaded._compile(output, fileName);
  return loaded.exports;
}

const policy = loadTypeScriptModule(
  'server/modules/documents/domain/documentPolicy.ts',
);
const state = loadTypeScriptModule(
  'server/modules/documents/domain/documentStateMachine.ts',
);

const employee = {
  id: 'employee-1',
  tenantId: 'tenant-a',
  role: 'EMPLOYEE',
  departmentId: 'housekeeping',
  capabilities: ['documents.read', 'documents.create', 'documents.update'],
};
const housekeepingDocument = {
  tenantId: 'tenant-a',
  departmentId: 'housekeeping',
  authorId: 'author-2',
  ownerId: 'owner-2',
  status: 'DRAFT',
  allowDownload: true,
  allowComments: true,
};

test('document policy denies tenant crossover before any role/scope rule', () => {
  const otherTenantDocument = { ...housekeepingDocument, tenantId: 'tenant-b' };
  const admin = {
    ...employee,
    role: 'SYSTEM_ADMINISTRATOR',
    capabilities: ['documents.read', 'documents.read.all', 'documents.update'],
  };
  assert.equal(policy.canReadDocument(admin, otherTenantDocument), false);
  assert.equal(policy.canUpdateDocument(admin, otherTenantDocument), false);
});

test('published visibility grants read but never grants cross-department mutation', () => {
  const publishedKitchenDocument = {
    ...housekeepingDocument,
    departmentId: 'kitchen',
    status: 'PUBLISHED',
  };
  assert.equal(policy.canReadDocument(employee, publishedKitchenDocument), true);
  assert.equal(policy.canUpdateDocument(employee, publishedKitchenDocument), false);
});

test('dashboard responsibility excludes unrelated tenant-wide published activity', () => {
  assert.deepEqual(policy.documentDashboardScope(employee), {
    tenantId: 'tenant-a',
    OR: [
      { authorId: employee.id },
      { ownerId: employee.id },
      { departmentId: employee.departmentId },
    ],
  });
  assert.deepEqual(policy.documentDashboardScope({ ...employee, capabilities: [] }), {
    id: '__forbidden__',
  });
  assert.deepEqual(policy.documentDashboardScope({
    ...employee,
    capabilities: ['documents.read', 'documents.read.all'],
  }), { tenantId: 'tenant-a' });
});

test('employee mutation is limited to explicit authorship/ownership', () => {
  assert.equal(policy.canReadDocument(employee, housekeepingDocument), true);
  assert.equal(policy.canUpdateDocument(employee, housekeepingDocument), false);
  assert.equal(
    policy.canUpdateDocument(employee, { ...housekeepingDocument, ownerId: employee.id }),
    true,
  );
});

test('HOD archive/restore and current approval step stay department scoped', () => {
  const hod = {
    ...employee,
    id: 'hod-1',
    role: 'HOD',
    capabilities: [
      'documents.read',
      'documents.archive',
      'documents.restore',
      'documents.approve',
      'documents.sign',
    ],
  };
  const otherDepartment = { ...housekeepingDocument, departmentId: 'kitchen' };
  assert.equal(policy.canArchiveDocument(hod, housekeepingDocument), true);
  assert.equal(policy.canRestoreDocument(hod, housekeepingDocument), true);
  assert.equal(
    policy.canActOnDocumentWorkflow(hod, housekeepingDocument, 'HOD', 'documents.approve'),
    true,
  );
  assert.equal(policy.canArchiveDocument(hod, otherDepartment), false);
  assert.equal(
    policy.canActOnDocumentWorkflow(hod, otherDepartment, 'HOD', 'documents.approve'),
    false,
  );
});

test('Finance can perform its hotel-wide workflow step but cannot inherit archive rights', () => {
  const finance = {
    ...employee,
    id: 'finance-1',
    role: 'FINANCE_DIRECTOR',
    departmentId: 'finance',
    capabilities: ['documents.read', 'documents.read.all', 'documents.approve'],
  };
  assert.equal(
    policy.canActOnDocumentWorkflow(
      finance,
      housekeepingDocument,
      'FINANCE_DIRECTOR',
      'documents.approve',
    ),
    true,
  );
  assert.equal(policy.canArchiveDocument(finance, housekeepingDocument), false);
});

test('document approval state machine has one transition per HOD, Finance, and GM step', () => {
  assert.equal(state.nextApprovalStatus('IN_REVIEW'), 'SIGNED_HOD');
  assert.equal(state.nextApprovalStatus('SIGNED_HOD'), 'SIGNED_FINANCE');
  assert.equal(state.nextApprovalStatus('SIGNED_FINANCE'), 'PUBLISHED');
  assert.equal(state.nextApprovalStatus('SIGNED_GM'), 'PUBLISHED');
  assert.equal(state.nextApprovalStatus('DRAFT'), null);
  assert.equal(state.canSubmitForReview('DRAFT', 'IN_REVIEW'), true);
  assert.equal(state.canSubmitForReview('PUBLISHED', 'IN_REVIEW'), false);
});

test('document route requires signature evidence before approval advances', () => {
  const route = fs.readFileSync(path.join(root, 'server/routes/documents.ts'), 'utf8');
  const workflowRoute = fs.readFileSync(path.join(root, 'server/routes/documentWorkflow.ts'), 'utf8');
  const service = fs.readFileSync(
    path.join(root, 'server/modules/documents/application/decideDocumentApproval.ts'),
    'utf8',
  );
  assert.match(route, /router\.use\(documentWorkflowRouter\)/);
  assert.match(workflowRoute, /decideDocumentApproval\(prisma, req\.user!, id/);
  assert.match(service, /SIGNATURE_REQUIRED/);
  assert.match(service, /document\.updateMany/);
  assert.match(service, /transaction\.auditLog\.create/);
  assert.match(service, /beforeState: serializeDocumentAuditState\(current\)/);
  assert.match(service, /afterState: serializeDocumentAuditState\(updated\)/);
  assert.match(service, /transaction\.notification\.create/);
  const signingService = fs.readFileSync(
    path.join(root, 'server/modules/documents/application/signDocument.ts'),
    'utf8',
  );
  assert.match(workflowRoute, /signDocument\(prisma, req\.user!, id/);
  assert.match(signingService, /bcrypt\.compare/);
  assert.match(signingService, /FOR UPDATE/);
  assert.match(signingService, /createHash\('sha256'\)/);
  assert.match(signingService, /hashStoredFile\(document\.filePath\)/);
  assert.match(signingService, /documentVersion: locked\.version/);
  assert.match(signingService, /approvalCycle: locked\.approvalCycle/);
  assert.match(signingService, /signature\.documentVersion === locked\.version/);
  assert.match(signingService, /signature\.approvalCycle === locked\.approvalCycle/);
  assert.match(service, /signature\.documentVersion === current\.version/);
  assert.match(service, /signature\.approvalCycle === current\.approvalCycle/);
  assert.match(service, /request_changes'[\s\S]{0,100}approvalCycle: \{ increment: 1 \}/);
  assert.match(workflowRoute, /hashStoredFile: hashTenantPrivateFile/);
  assert.match(signingService, /transaction\.signature\.create/);
  assert.match(signingService, /transaction\.auditLog\.create/);
  assert.match(signingService, /signedDocumentDigest: signature\.docHash/);
  assert.match(signingService, /beforeState: serializeAuditState/);
  assert.match(signingService, /afterState: serializeAuditState/);
  assert.match(workflowRoute, /Signing records evidence only/);
  assert.match(
    fs.readFileSync(path.join(root, 'server/modules/documents/application/manageDocumentComments.ts'), 'utf8'),
    /canModerateDocumentComment/,
  );
  assert.match(
    fs.readFileSync(path.join(root, 'server/modules/documents/application/manageDocumentLifecycle.ts'), 'utf8'),
    /canRestoreDocument/,
  );
  assert.doesNotMatch(route, /canViewDocument\(req\.user!, doc\)/);
});

test('document submission and approval atomically notify the effective next signer', () => {
  const notificationService = fs.readFileSync(
    path.join(root, 'server/modules/documents/application/queueDocumentApprovalNotification.ts'),
    'utf8',
  );
  const contentService = fs.readFileSync(
    path.join(root, 'server/modules/documents/application/manageDocumentContent.ts'),
    'utf8',
  );
  const approvalService = fs.readFileSync(
    path.join(root, 'server/modules/documents/application/decideDocumentApproval.ts'),
    'utf8',
  );
  assert.match(notificationService, /expectedSignerRole\(document\.status\)/);
  assert.match(notificationService, /signerRole === 'HOD' \? \{ departmentId: document\.departmentId \} : \{\}/);
  assert.match(notificationService, /resolveEffectiveCapabilities\(candidate\.role, candidate\.customRole\)/);
  assert.match(notificationService, /capabilities\.includes\('documents\.approve'\)/);
  assert.match(notificationService, /link: `\/approvals\/\$\{document\.id\}\/review`/);
  assert.match(contentService, /document\.status === DocumentStatus\.IN_REVIEW[\s\S]*queueDocumentApprovalNotification\(transaction, document\)/);
  assert.match(contentService, /updated\.status === DocumentStatus\.IN_REVIEW[\s\S]*queueDocumentApprovalNotification\(transaction, updated\)/);
  assert.match(approvalService, /input\.action === 'approve'[\s\S]*queueDocumentApprovalNotification\(transaction, updated\)/);
});

test('pending approvals and dashboard counts use the actor current-step scope', () => {
  const policySource = fs.readFileSync(path.join(root, 'server/modules/documents/domain/documentPolicy.ts'), 'utf8');
  const route = fs.readFileSync(path.join(root, 'server/routes/documents.ts'), 'utf8');
  const queryRoute = fs.readFileSync(path.join(root, 'server/routes/documentQueries.ts'), 'utf8');
  const dashboardRoute = fs.readFileSync(path.join(root, 'server/routes/dashboard.ts'), 'utf8');
  const readModel = fs.readFileSync(path.join(root, 'server/modules/documents/application/documentReadModel.ts'), 'utf8');
  const dashboard = fs.readFileSync(path.join(root, 'server/modules/reporting/application/getDashboardStats.ts'), 'utf8');
  assert.match(policySource, /documentApprovalActionScope/);
  assert.match(policySource, /status: 'SIGNED_HOD'/);
  assert.match(policySource, /status: \{ in: \['SIGNED_FINANCE', 'SIGNED_GM'\] \}/);
  assert.match(route, /router\.use\(documentQueriesRouter\)/);
  assert.match(queryRoute, /listDocumentApprovals\(prisma, req\.user!, req\.query\)/);
  assert.match(dashboardRoute, /getDashboardStats\(prisma, req\.user!\)/);
  assert.match(readModel, /tab === 'pending'[\s\S]*documentApprovalActionScope\(actor\)/);
  assert.match(dashboard, /document\.count\(\{ where: approvalActionScope \}\)/);
  assert.match(dashboard, /documentDashboardScope\(actor\)/);
  assert.match(dashboard, /nextReviewDate: \{ lt: now \},[\s\S]{0,100}status: DocumentStatus\.PUBLISHED/);
  assert.doesNotMatch(dashboard, /documentReadScope\(actor\)/);
  assert.match(dashboard, /recentActivity: recentActivity\.map/);
  assert.match(dashboard, /document: \{ select: \{ id: true, title: true, code: true \} \}/);
  assert.match(dashboard, /id: activity\.document\.id/);
  assert.doesNotMatch(dashboard, /\n    recentActivity,\n    upcomingReviews:/);
  assert.match(dashboard, /listPendingWorkforceTasks\(database, actor, 8\)/);
  assert.match(dashboard, /status: DocumentStatus\.NEEDS_REVIEW/);
  assert.match(dashboard, /AND: \[[\s\S]{0,80}documentScope,[\s\S]{0,140}OR: \[\{ authorId: actor\.id \}, \{ ownerId: actor\.id \}\]/);
  assert.match(dashboard, /action: 'Revise and resubmit'/);
  assert.match(dashboard, /link: `\/documents\/\$\{document\.id\}`/);
  assert.match(dashboard, /prioritizeDashboardWork\(\[/);
  assert.match(dashboard, /left\.isOverdue !== right\.isOverdue/);
  assert.match(dashboard, /selected\.some\(\(item\) => item\.type === type\)/);
  assert.doesNotMatch(dashboard, /\]\s*\.slice\(0, 8\)/);
  const dashboardPage = fs.readFileSync(path.join(root, 'src/pages/DashboardPage.tsx'), 'utf8');
  assert.match(dashboardPage, /canReadDocuments = hasCapability\(user, 'documents\.read'\)/);
  assert.match(dashboardPage, /\{canReadDocuments && <div className="mb-6 grid/);
  assert.match(dashboardPage, /No related document activity yet/);

  const approvalCapabilities = ['documents.approve', 'approvals.read'];
  assert.deepEqual(
    policy.documentApprovalActionScope({ ...employee, role: 'HOD', capabilities: approvalCapabilities }),
    { tenantId: 'tenant-a', departmentId: 'housekeeping', status: 'IN_REVIEW' },
  );
  assert.deepEqual(
    policy.documentApprovalActionScope({ ...employee, role: 'FINANCE_DIRECTOR', capabilities: approvalCapabilities }),
    { tenantId: 'tenant-a', status: 'SIGNED_HOD' },
  );
  assert.deepEqual(
    policy.documentApprovalActionScope({ ...employee, role: 'SUPERVISOR', capabilities: approvalCapabilities }),
    { id: '__forbidden__' },
  );
});

test('document read model validates filters and never serializes storage paths', () => {
  const readModel = fs.readFileSync(
    path.join(root, 'server/modules/documents/application/documentReadModel.ts'),
    'utf8',
  );
  const queryRoute = fs.readFileSync(path.join(root, 'server/routes/documentQueries.ts'), 'utf8');
  assert.match(readModel, /Object\.values\(DocumentStatus\)/);
  assert.match(readModel, /positiveInteger\(query\.limit, 20, 100/);
  assert.match(readModel, /select: documentSummarySelect/);
  assert.match(readModel, /hasFile: Boolean\(document\.filePath\)/);
  assert.match(readModel, /hasImage: Boolean\(imagePath\)/);
  assert.match(readModel, /signature\.documentVersion === document\.version/);
  assert.match(readModel, /signature\.approvalCycle === document\.approvalCycle/);
  assert.doesNotMatch(readModel, /return document;/);
  assert.match(readModel, /take: 5001/);
  assert.match(readModel, /AuditAction\.DOWNLOAD/);
  assert.match(readModel, /\^\[=\+\\-@\]/);
  assert.match(queryRoute, /status\(413\)/);
});

test('document lifecycle mutations are transactional application services', () => {
  const route = fs.readFileSync(path.join(root, 'server/routes/documents.ts'), 'utf8');
  const lifecycleRoute = fs.readFileSync(path.join(root, 'server/routes/documentLifecycle.ts'), 'utf8');
  const service = fs.readFileSync(
    path.join(root, 'server/modules/documents/application/manageDocumentLifecycle.ts'),
    'utf8',
  );
  const recordsRoute = fs.readFileSync(path.join(root, 'server/routes/archive.ts'), 'utf8');
  const recordsService = fs.readFileSync(path.join(root, 'server/modules/archive/application/manageRecordsLifecycle.ts'), 'utf8');
  assert.match(route, /router\.use\(documentLifecycleRouter\)/);
  assert.match(lifecycleRoute, /archiveDocument\(prisma, req\.user!, id/);
  assert.match(lifecycleRoute, /restoreDocument\(prisma, req\.user!, id\)/);
  assert.match(lifecycleRoute, /createDocumentVersion\(prisma, req\.user!, id/);
  assert.match(lifecycleRoute, /archiveDocuments\(prisma, req\.user!, ids/);
  assert.doesNotMatch(lifecycleRoute, /router\.delete/);
  assert.match(recordsRoute, /requestDisposition\(prisma, req\.user!/);
  assert.match(recordsRoute, /reviewDisposition\(prisma, req\.user!/);
  assert.match(service, /transaction\.documentHistory\.create/g);
  assert.match(service, /transaction\.auditLog\.create/g);
  assert.match(service, /where: \{ id: documentId, status: current\.status \}/);
  assert.match(service, /where: \{ id: documentId, version: current\.version \}/);
  assert.match(service, /approvalCycle: \{ increment: 1 \}/);
  assert.doesNotMatch(service, /signature\.delete/);
  assert.match(service, /transaction\.documentHistory\.createMany/);
  assert.match(service, /transaction\.auditLog\.createMany/);
  assert.match(service, /serializeDocumentAuditState\(current\)/g);
  assert.match(service, /serializeDocumentAuditState\(updated\)/g);
  assert.match(service, /beforeState: serializeDocumentAuditState\(document\)/);
  assert.match(service, /afterState: serializeDocumentAuditState\(\{/);
  assert.match(recordsService, /DispositionStatus\.PENDING/);
  assert.match(recordsService, /request\.requestedById === actor\.id/);
  assert.match(recordsService, /DocumentStatus\.DISPOSED/);
  assert.match(recordsService, /metadata and audit evidence retained/);
});

test('document create and update are scoped transactional application services', () => {
  const route = fs.readFileSync(path.join(root, 'server/routes/documents.ts'), 'utf8');
  const contentRoute = fs.readFileSync(path.join(root, 'server/routes/documentContent.ts'), 'utf8');
  const service = fs.readFileSync(
    path.join(root, 'server/modules/documents/application/manageDocumentContent.ts'),
    'utf8',
  );
  assert.match(route, /router\.use\(documentContentRouter\)/);
  assert.match(contentRoute, /createDocument\(prisma, req\.user!, req\.body\)/);
  assert.match(contentRoute, /updateDocument\(prisma, req\.user!, id, req\.body\)/);
  assert.match(contentRoute, /Use Create Version to change the document version/);
  assert.match(service, /canCreateDocumentForDepartment/);
  assert.match(service, /canAssignDocumentOwner/);
  assert.match(service, /canUpdateDocument/);
  assert.match(service, /EDITABLE_DOCUMENT_STATUSES\.has\(current\.status\)/);
  assert.match(service, /\$executeRaw\(Prisma\.sql`SELECT pg_advisory_xact_lock/);
  assert.doesNotMatch(service, /\$queryRaw\(Prisma\.sql`SELECT pg_advisory_xact_lock/);
  assert.match(service, /transaction\.auditLog\.create/);
  assert.match(service, /afterState: serializeDocumentAuditState\(document\)/);
  assert.match(service, /beforeState: serializeDocumentAuditState\(current\)/);
  assert.match(service, /afterState: serializeDocumentAuditState\(updated\)/);
  const evidence = fs.readFileSync(
    path.join(root, 'server/modules/documents/application/documentAuditState.ts'),
    'utf8',
  );
  assert.match(evidence, /contentDigest: auditStateDigest/);
  assert.match(evidence, /descriptionDigest: auditStateDigest/);
  assert.match(evidence, /primaryFileNameDigest: auditStateDigest/);
  assert.doesNotMatch(evidence, /filePath:\s*document\.filePath/);
  assert.doesNotMatch(evidence, /content:\s*document\.content/);
  assert.doesNotMatch(contentRoute, /prisma\.document\.create\(/);
});

test('primary and attachment file mutations are blocked after review starts', () => {
  const upload = fs.readFileSync(
    path.join(root, 'server/modules/documents/application/uploadDocumentFile.ts'),
    'utf8',
  );
  assert.match(upload, /FILE_EDITABLE_STATUSES\.has\(current\.status\)/);
  assert.doesNotMatch(upload, /!input\.isAttachment/);
  assert.match(upload, /throw new DocumentUploadError\('LOCKED'\)/);
});

test('document comments and uploads are actor-scoped application services', () => {
  const route = fs.readFileSync(path.join(root, 'server/routes/documents.ts'), 'utf8');
  const collaborationRoute = fs.readFileSync(path.join(root, 'server/routes/documentCollaboration.ts'), 'utf8');
  const comments = fs.readFileSync(
    path.join(root, 'server/modules/documents/application/manageDocumentComments.ts'),
    'utf8',
  );
  const uploads = fs.readFileSync(
    path.join(root, 'server/modules/documents/application/uploadDocumentFile.ts'),
    'utf8',
  );
  assert.match(route, /router\.use\(documentCollaborationRouter\)/);
  assert.match(collaborationRoute, /addDocumentComment\(prisma, req\.user!, id/);
  assert.match(collaborationRoute, /comments\/:commentId'[\s\S]*requireCapability\('documents\.read'\)/);
  assert.match(collaborationRoute, /uploadDocumentFile\(/);
  assert.match(collaborationRoute, /deleteTenantUpload\(savedFile\.filePath, 'comments'\)/);
  assert.match(comments, /canCommentOnDocument/);
  assert.match(comments, /canModerateDocumentComment/);
  assert.match(comments, /canDownloadDocument/);
  assert.match(comments, /transaction\.auditLog\.create/);
  assert.match(uploads, /canUpdateDocument/);
  assert.match(uploads, /storage\.remove\(saved\.filePath\)/);
  assert.match(uploads, /previousFilePath/);
  assert.match(uploads, /fileNameDigest: auditStateDigest/);
  assert.match(uploads, /beforeState: serializeDocumentAuditState\(current\)/);
  assert.match(uploads, /afterState: serializeDocumentAuditState\(document\)/);
  assert.doesNotMatch(route, /prisma\.documentAttachment\.create\(/);
});

test('document detail actions mirror capability and object scope in the UI', () => {
  const page = fs.readFileSync(path.join(root, 'src/pages/DocumentDetailPage.tsx'), 'utf8');
  assert.match(page, /hasCapability\(currentUser, 'documents\.update'\)/);
  assert.match(page, /hasCapability\(currentUser, 'documents\.archive'\)/);
  assert.match(page, /isDocumentPrincipal/);
  assert.match(page, /currentUser\?\.role === 'HOD' && sameDepartment/);
  assert.match(page, /canSendForReview &&/);
  assert.match(page, /canCreateVersion &&/);
  assert.match(page, /c\.userId === currentUser\?\.id \|\| canUpdate/);
  assert.match(page, /doc\.hasFile && doc\.allowDownload !== false/);
  assert.doesNotMatch(page, /doc\.filePath\?\.startsWith/);
});

test('document approval UI exposes version-bound signature evidence', () => {
  const page = fs.readFileSync(path.join(root, 'src/pages/DocumentDetailPage.tsx'), 'utf8');
  assert.match(page, /Version \{sig\.documentVersion \?\? doc\.version\}/);
  assert.match(page, /title=\{sig\.docHash\}/);
});

test('document list actions and directory filters mirror effective capabilities', () => {
  const page = fs.readFileSync(path.join(root, 'src/pages/DocumentsPage.tsx'), 'utf8');
  assert.match(page, /hasCapability\(currentUser, 'documents\.create'\)/);
  assert.match(page, /hasCapability\(currentUser, 'documents\.export'\)/);
  assert.match(page, /hasCapability\(currentUser, 'documents\.archive'\)/);
  assert.match(page, /currentUser\.role === 'HOD' && currentUser\.department\?\.id === document\.departmentId/);
  assert.match(page, /documents\.filter\(canArchiveDocument\)/);
  assert.match(page, /if \(canReadDepartments\) api\.getDepartments/);
  assert.match(page, /if \(canReadUsers\) api\.getUsers/);
  assert.match(page, /\{canCreate && <div/);
  assert.match(page, /\{canExport && \(/);
  assert.doesNotMatch(page, /window\.print\(\)/);
});

test('document mutation adapters return safe read-model DTOs instead of raw persistence rows', () => {
  const content = fs.readFileSync(path.join(root, 'server/routes/documentContent.ts'), 'utf8');
  const lifecycle = fs.readFileSync(path.join(root, 'server/routes/documentLifecycle.ts'), 'utf8');
  const workflow = fs.readFileSync(path.join(root, 'server/routes/documentWorkflow.ts'), 'utf8');
  const collaboration = fs.readFileSync(path.join(root, 'server/routes/documentCollaboration.ts'), 'utf8');
  const signing = fs.readFileSync(path.join(root, 'server/modules/documents/application/signDocument.ts'), 'utf8');
  for (const adapter of [content, lifecycle, workflow, collaboration]) {
    assert.match(adapter, /getDocumentDetail\(prisma, req\.user!,/);
    assert.doesNotMatch(adapter, /parseDocumentTags/);
  }
  assert.match(content, /requireCapability\('documents\.read', 'documents\.create'\)/);
  assert.match(lifecycle, /requireCapability\('documents\.read', 'documents\.archive'\)/);
  assert.match(workflow, /requireCapability\('documents\.read', 'documents\.approve'\)/);
  assert.match(collaboration, /downloadUrl: `\/files\/documents\/\$\{id\}\/attachments\/\$\{attachment\.id\}`/);
  assert.match(signing, /return \{ \.\.\.signature, hasImage: true \}/);
  assert.doesNotMatch(signing, /select: \{[\s\S]*ipAddress: true/);
});

test('document creation UI loads only authorized option directories and exposes implemented fields', () => {
  const page = fs.readFileSync(path.join(root, 'src/pages/CreateDocumentPage.tsx'), 'utf8');
  const service = fs.readFileSync(path.join(root, 'server/modules/documents/application/manageDocumentContent.ts'), 'utf8');
  assert.match(page, /canReadDepartments\s*\? api\.getDepartments\(\)/);
  assert.match(page, /canReadTemplates \? api\.getTemplates\(\)/);
  assert.match(page, /canReadUsers \? api\.getUsers\(\)/);
  assert.match(page, /canReadWorkflows \? api\.getWorkflows\(\)/);
  assert.match(page, /File exceeds maximum size of 10 MB/);
  assert.match(page, /const addTag/);
  assert.match(page, /const selectDepartment/);
  assert.doesNotMatch(page, /authorId:/);
  assert.doesNotMatch(page, /isPublic:/);
  assert.doesNotMatch(page, /notifyOnPublish:/);
  assert.doesNotMatch(page, /requireAcknowledgment:/);
  assert.doesNotMatch(page, /Document Cover/);
  assert.doesNotMatch(page, /PPTX up to 25MB/);
  assert.match(service, /actor\.capabilities\.includes\('templates\.read'\)/);
  assert.match(service, /actor\.capabilities\.includes\('workflows\.read'\)/);
  assert.match(service, /category !== undefined[\s\S]*Object\.values\(DocumentCategory\)\.includes\(category\)/);
});
