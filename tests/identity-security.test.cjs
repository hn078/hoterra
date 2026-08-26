const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('tsx/cjs');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const { Role } = require('@prisma/client');
const {
  authorizeAccountMutation,
} = require('../server/modules/identity/domain/accountHierarchy.ts');
const {
  updateUserAccount,
} = require('../server/modules/identity/application/manageUserAccounts.ts');

const systemAdmin = {
  id: 'system-admin',
  role: Role.SYSTEM_ADMINISTRATOR,
  customRoleId: null,
  isActive: true,
};

test('search users are built from an explicit secret-free DTO', () => {
  const search = read('server/modules/identity/application/userReadModel.ts');
  const globalSearch = read('server/modules/search/application/globalSearch.ts');
  const dto = read('server/modules/identity/application/userDtos.ts');

  assert.match(search, /select: searchUserSelect/);
  assert.match(search, /users\.map\(toSearchUserDto\)/);
  assert.match(search, /users\.directory\.read/);
  assert.match(globalSearch, /searchUserDirectory\(database, actor, query/);
  assert.doesNotMatch(dto, /passwordHash\s*:/);
  assert.doesNotMatch(dto, /pinHash\s*:/);
  assert.doesNotMatch(dto, /tenantId\s*:/);
});

test('General Manager cannot mutate a System Administrator account', () => {
  const decision = authorizeAccountMutation(
    { id: 'gm', role: Role.GENERAL_MANAGER },
    systemAdmin,
    { nextIsActive: false },
  );
  assert.equal(decision.allowed, false);
  assert.equal(decision.status, 403);
});

test('delegated account managers cannot mutate General Manager accounts', () => {
  const decision = authorizeAccountMutation(
    { id: 'delegated-manager', role: Role.HOD },
    { id: 'gm', role: Role.GENERAL_MANAGER, customRoleId: null, isActive: true },
    { nextIsActive: false },
  );
  assert.equal(decision.allowed, false);
  assert.equal(decision.status, 403);
});

test('System Administrator can manage ordinary accounts', () => {
  const decision = authorizeAccountMutation(
    { id: 'system-admin', role: Role.SYSTEM_ADMINISTRATOR },
    { id: 'employee', role: Role.EMPLOYEE, customRoleId: null, isActive: true },
    { nextIsActive: false },
  );
  assert.deepEqual(decision, { allowed: true });
});

test('administrators cannot deactivate or demote their own account', () => {
  const deactivate = authorizeAccountMutation(systemAdmin, systemAdmin, { nextIsActive: false });
  assert.equal(deactivate.allowed, false);
  assert.equal(deactivate.status, 400);

  const demote = authorizeAccountMutation(systemAdmin, systemAdmin, {
    nextRole: Role.EMPLOYEE,
    nextCustomRoleId: null,
  });
  assert.equal(demote.allowed, false);
  assert.equal(demote.status, 400);
});

test('user mutations are capability protected', () => {
  const route = read('server/routes/users.ts');
  const accountRoute = read('server/routes/userAccounts.ts');
  const service = read('server/modules/identity/application/manageUserAccounts.ts');
  assert.match(route, /router\.use\(userAccountsRouter\)/);
  assert.ok(
    route.indexOf('router.use(userAccountsRouter)') < route.indexOf('router.use(userQueriesRouter)'),
    'specific account subroutes must be mounted before the generic /:id profile route',
  );
  assert.match(accountRoute, /requireCapability\('users\.create'\)/);
  assert.match(accountRoute, /router\.patch\('\/:id', authMiddleware, requireCapability\('users\.update'\)/);
  assert.match(accountRoute, /createUserAccount\(prisma, req\.user!, req\.body\)/);
  assert.match(accountRoute, /updateUserAccount\(prisma, req\.user!, routeParam/);
  assert.match(service, /capabilities\.includes\('users\.update'\)/);
  assert.match(service, /capabilities\.includes\('users\.deactivate'\)/);
  assert.match(service, /capabilities\.includes\('users\.password\.reset'\)/);
  assert.match(service, /authorizeAccountMutation\(actor, target/);
  assert.match(service, /canAssignPrivilegedRole\(actor, role\)/);
  assert.match(service, /pg_advisory_xact_lock/);
  assert.match(service, /identity:system-admin-lifecycle/);
  assert.match(service, /remainingActiveAdministrators === 0/);
  assert.match(service, /UserAccountError\('LAST_SYSTEM_ADMIN'\)/);
  assert.match(service, /input\.isActive !== target\.isActive[\s\S]{0,360}tokenVersion = \{ increment: 1 \}/);
  assert.match(service, /transaction\.auditLog\.create/g);
  assert.doesNotMatch(service, /details:\s*`[^`]*passwordHash/);
});

test('user reads and signatures are actor-scoped application services', () => {
  const rootRoute = read('server/routes/users.ts');
  const queryRoute = read('server/routes/userQueries.ts');
  const signatureRoute = read('server/routes/userSignature.ts');
  const readModel = read('server/modules/identity/application/userReadModel.ts');
  const signatureService = read('server/modules/identity/application/updateUserSignature.ts');
  assert.match(rootRoute, /router\.use\(userQueriesRouter\)/);
  assert.match(rootRoute, /router\.use\(userSignatureRouter\)/);
  assert.match(queryRoute, /requireCapability\('users\.directory\.read'\)/);
  assert.match(queryRoute, /getUserProfile\(prisma, req\.user!, routeParam/);
  assert.match(readModel, /actor\.role === Role\.HOD/);
  assert.match(readModel, /canManageLifecycle = actor\.capabilities\.includes\('users\.deactivate'\)/);
  assert.match(readModel, /!canManageLifecycle \? \{ isActive: true \} : \{\}/);
  assert.match(readModel, /role: true,[\s\S]{0,80}isActive: true/);
  assert.match(readModel, /documentReadScope\(actor\)/);
  assert.match(readModel, /actor\.capabilities\.includes\('audit\.read'\)/);
  assert.match(signatureRoute, /updateUserSignature\(/);
  assert.match(signatureService, /if \(actor\.id !== userId\) throw new UserSignatureError\('FORBIDDEN'\)/);
  assert.doesNotMatch(signatureService, /capabilities\.includes\('users\.update'\)/);
  assert.match(signatureService, /pg_advisory_xact_lock/);
  assert.match(signatureService, /transaction\.auditLog\.create/);
  assert.match(signatureService, /storage\.remove\(saved\.filePath\)/);
});

test('identity DTOs never disclose reusable signature storage paths', () => {
  const readModel = read('server/modules/identity/application/userReadModel.ts');
  const authentication = read('server/modules/authentication/application/manageAccountSession.ts');
  const signatureService = read('server/modules/identity/application/updateUserSignature.ts');
  const profilePage = read('src/pages/UserProfilePage.tsx');

  const directorySection = readModel.slice(
    readModel.indexOf('export async function listUserDirectory'),
    readModel.indexOf('export async function searchUserDirectory'),
  );
  const accountDtoSection = authentication.slice(
    authentication.indexOf('function accountDto'),
    authentication.indexOf('export async function authenticateAccount'),
  );

  assert.doesNotMatch(directorySection, /signatureImage\s*:/);
  assert.doesNotMatch(accountDtoSection, /signatureImage\s*:/);
  assert.match(accountDtoSection, /hasSignature:\s*Boolean\(user\.signatureImage\)/);
  assert.match(readModel, /actor\.id === userId \? \{ hasSignature: Boolean\(user\.signatureImage\) \} : \{\}/);
  assert.match(signatureService, /return \{ \.\.\.user, hasSignature: true \}/);
  assert.doesNotMatch(profilePage, /signatureImage/);
  assert.match(profilePage, /canEditSignature[\s\S]{0,180}\/files\/users\/\$\{id\}\/signature/);
});

test('user document metadata and profile panels respect viewer scope', () => {
  const readModel = read('server/modules/identity/application/userReadModel.ts');
  const profilePage = read('src/pages/UserProfilePage.tsx');
  const usersPage = read('src/pages/UsersPage.tsx');

  assert.match(readModel, /documents: \{ where: documentScope \}/);
  assert.match(readModel, /signatures: \{ where: \{ document: \{ is: documentScope \} \} \}/);
  assert.match(readModel, /select:\s*\{\s*id: true,\s*action: true,\s*entityType: true,\s*createdAt: true/);
  assert.doesNotMatch(
    readModel.slice(readModel.indexOf('database.auditLog.findMany'), readModel.indexOf("orderBy: { createdAt: 'desc' }")),
    /details: true|entityId: true/,
  );
  assert.match(profilePage, /hasCapability\(currentUser, 'documents\.read'\)/);
  assert.match(profilePage, /hasCapability\(currentUser, 'audit\.read'\)/);
  assert.match(profilePage, /PageTabs tabs=\{visibleTabs\}/);
  assert.doesNotMatch(profilePage, /Standard Document Approval|SOP Review Process/);
  assert.match(usersPage, /canReadDocuments && <th[^>]*>Documents<\/th>/);
});

test('session identity response uses explicit nested projections', () => {
  const authentication = read('server/modules/authentication/application/manageAccountSession.ts');
  const accountDtoSection = authentication.slice(
    authentication.indexOf('function accountDto'),
    authentication.indexOf('export async function authenticateAccount'),
  );

  assert.match(accountDtoSection, /customRole: user\.customRole[\s\S]{0,260}permissions: user\.customRole\.permissions/);
  assert.match(accountDtoSection, /department: user\.department[\s\S]{0,220}color: user\.department\.color/);
  assert.doesNotMatch(accountDtoSection, /tenantId|createdAt|updatedAt|passwordHash|pinHash/);
});

test('account access changes fail closed while the user owns open responsibilities', async () => {
  let updateCalled = false;
  const transaction = {
    $executeRaw: async () => 1,
    user: {
      findUnique: async () => ({
        id: 'employee',
        role: Role.EMPLOYEE,
        customRoleId: null,
        departmentId: 'department-a',
        isActive: true,
      }),
      update: async () => { updateCalled = true; },
    },
    customRole: { findFirst: async () => null },
    department: { findUnique: async () => ({ id: 'department-a' }) },
    notification: { count: async () => 1 },
    document: { count: async () => 0 },
    workforceRequest: { count: async () => 0 },
  };
  const database = { $transaction: async (callback) => callback(transaction) };
  const actor = {
    id: 'system-admin',
    role: Role.SYSTEM_ADMINISTRATOR,
    capabilities: ['users.update', 'users.deactivate', 'roles.assign.privileged'],
  };

  await assert.rejects(
    () => updateUserAccount(database, actor, 'employee', { isActive: false }),
    (error) => error?.code === 'OUTSTANDING_RESPONSIBILITIES' && /Complete or reassign 1 open task/.test(error.detail),
  );
  assert.equal(updateCalled, false);
});

test('user lifecycle guard covers action notifications and returned owner work', () => {
  const service = read('server/modules/identity/application/manageUserAccounts.ts');
  const route = read('server/routes/userAccounts.ts');
  const page = read('src/pages/UsersPage.tsx');
  assert.match(service, /actionType: \{ notIn: \['DOCUMENT_REVISION'\] \}/);
  assert.match(service, /actionCompletedAt: null/);
  assert.match(service, /status: DocumentStatus\.NEEDS_REVIEW/);
  assert.match(service, /\{ ownerId: userId \}[\s\S]{0,100}\{ ownerId: null, authorId: userId \}/);
  assert.doesNotMatch(service, /WorkforceRequestStatus\.RETURNED_FOR_REVISION/);
  assert.match(service, /nextRole !== target\.role/);
  assert.match(service, /departmentId !== target\.departmentId/);
  assert.match(route, /OUTSTANDING_RESPONSIBILITIES[\s\S]{0,120}status\(409\)/);
  assert.match(route, /\/:id\/responsibilities[\s\S]{0,120}users\.update/);
  assert.match(service, /getUserResponsibilitySummary/);
  assert.match(page, /getUserResponsibilities\(user\.id\)/);
  assert.match(page, /Resolve Open Tasks First/);
});

test('user directory and profile present only working capability-aware controls', () => {
  const usersPage = read('src/pages/UsersPage.tsx');
  const profilePage = read('src/pages/UserProfilePage.tsx');

  assert.doesNotMatch(usersPage, /type="checkbox" className="rounded" \/>/);
  assert.match(usersPage, /filterRole\.startsWith\('custom:'\)/);
  assert.match(usersPage, /value=\{`custom:\$\{role\.id\}`\}/);
  assert.match(usersPage, /md:hidden[\s\S]*View Profile/);
  assert.match(usersPage, /items-end justify-center[\s\S]{0,100}sm:items-center/);
  assert.match(profilePage, /setLoadError\(error instanceof Error/);
  assert.match(profilePage, /You cannot open this profile/);
  assert.match(profilePage, /hasCapability\(currentUser, 'users\.directory\.read'\)[\s\S]{0,120}Users & Roles/);
});

test('employee job title is mandatory descriptive identity and never grants access', () => {
  const schema = read('prisma/schema.prisma');
  const backfill = read('prisma/migrations/20260826120000_backfill_user_job_titles/migration.sql');
  const accountService = read('server/modules/identity/application/manageUserAccounts.ts');
  const accountRoute = read('server/routes/userAccounts.ts');
  const readModel = read('server/modules/identity/application/userReadModel.ts');
  const authentication = read('server/modules/authentication/application/manageAccountSession.ts');
  const signatureService = read('server/modules/documents/application/signDocument.ts');
  const hierarchy = read('server/modules/identity/domain/accountHierarchy.ts');
  const usersPage = read('src/pages/UsersPage.tsx');
  const profilePage = read('src/pages/UserProfilePage.tsx');

  assert.match(schema, /jobTitle\s+String\s*$/m);
  assert.doesNotMatch(schema, /jobTitle\s+String\?/);
  assert.match(backfill, /WHERE "jobTitle" IS NULL/);
  assert.match(backfill, /ALTER TABLE "User" ALTER COLUMN "jobTitle" SET NOT NULL/);
  assert.match(accountService, /!input\.jobTitle/);
  assert.match(accountService, /title\.length > 120/);
  assert.match(accountService, /jobTitle,\s*\n\s*role:/);
  assert.match(accountRoute, /INVALID_JOB_TITLE[\s\S]{0,160}120 characters or fewer/);
  assert.match(readModel, /jobTitle: true/);
  assert.match(readModel, /\{ jobTitle: \{ contains: query, mode: 'insensitive' \} \}/);
  assert.match(authentication, /jobTitle: user\.jobTitle/);
  assert.match(signatureService, /position: user\.jobTitle \|\| POSITION_LABELS\[user\.role\]/);
  assert.match(usersPage, /Job Title/);
  assert.match(usersPage, /Changing a title does not change access permissions/);
  assert.match(profilePage, /Access: \{user\.customRole\?\.name \?\? ROLE_LABELS\[user\.role\]\}/);
  assert.doesNotMatch(hierarchy, /jobTitle/);
});
