const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('messaging endpoints require the named capability', () => {
  const route = read('server/routes/conversations.ts');
  assert.match(route, /router\.use\(authMiddleware, requireCapability\('messages\.use'\)\)/);
  assert.match(route, /router\.use\(conversationManagementRouter\)/);
});

test('conversation GETs are side-effect free and provisioning is explicit', () => {
  const route = read('server/routes/conversationQueries.ts');
  const managementRoute = read('server/routes/conversationManagement.ts');
  const bootstrap = read('server/modules/messaging/application/bootstrapUserConversations.ts');
  const api = read('src/lib/api.ts');
  const listStart = route.indexOf("router.get('/',");
  const listEnd = route.indexOf("router.get('/unread-count'", listStart);
  const unreadEnd = route.length;
  const getRoutes = route.slice(listStart, unreadEnd);
  assert.doesNotMatch(getRoutes, /\.create\(|\.update\(|\.upsert\(/);
  assert.doesNotMatch(getRoutes, /bootstrapUserConversations/);
  assert.match(bootstrap, /capabilities\.includes\('messages\.use'\)/);
  assert.match(bootstrap, /pg_advisory_xact_lock/);
  assert.match(bootstrap, /conversationParticipant\.upsert/);
  assert.match(managementRoute, /bootstrapUserConversations\(prisma, req\.user!\)/);
  assert.match(api, /await this\.request\('\/conversations\/bootstrap', \{ method: 'POST' \}\)/);
});

test('message operations are scoped, transactional, and redact inaccessible documents', () => {
  const route = read('server/routes/conversationMessages.ts');
  const service = read('server/modules/messaging/application/manageConversationMessages.ts');
  const messageGetStart = route.indexOf("router.get('/:id/messages'");
  const messagePostStart = route.indexOf("router.post('/:id/messages'", messageGetStart);
  assert.doesNotMatch(route.slice(messageGetStart, messagePostStart), /ensureParticipant|\.create\(|\.update\(|\.upsert\(/);
  assert.match(route, /listConversationMessages\(prisma, req\.user!, conversationId, req\.query\)/);
  assert.match(route, /sendConversationMessage\(prisma, req\.user!, conversationId/);
  assert.match(route, /markConversationRead\(prisma, req\.user!, conversationId\)/);
  assert.match(service, /capabilities\.includes\('messages\.use'\)/);
  assert.match(service, /canReadDocument\(actor, message\.document\)/);
  assert.match(service, /pg_advisory_xact_lock/);
  assert.match(service, /transaction\.message\.create/);
  assert.match(service, /transaction\.auditLog\.create/);
  assert.match(service, /assertDirectRecipientAvailable/);
  assert.match(service, /resolveEffectiveCapabilities\(recipient\.role, recipient\.customRole\)\.includes\('messages\.use'\)/);
  assert.match(route, /RECIPIENT_UNAVAILABLE/);
  assert.match(route, /status\(409\)/);
  assert.match(service, /storage\.remove\(saved\.filePath\)/);
  assert.doesNotMatch(service, /details:[^\n]*content/);
});

test('conversation list and direct creation use scoped module services', () => {
  const rootRoute = read('server/routes/conversations.ts');
  const queryRoute = read('server/routes/conversationQueries.ts');
  const managementRoute = read('server/routes/conversationManagement.ts');
  const readModel = read('server/modules/messaging/application/conversationReadModel.ts');
  const directService = read('server/modules/messaging/application/manageDirectConversation.ts');
  const dto = read('server/modules/messaging/application/conversationDtos.ts');
  assert.match(rootRoute, /router\.use\(conversationQueriesRouter\)/);
  assert.match(rootRoute, /router\.use\(conversationMessagesRouter\)/);
  assert.match(queryRoute, /listConversations\(prisma, req\.user!\)/);
  assert.match(managementRoute, /startDirectConversation\(prisma, req\.user!, req\.body\.userId\)/);
  assert.match(readModel, /take: 200/);
  assert.match(readModel, /listMessageContacts/);
  assert.match(readModel, /resolveEffectiveCapabilities\(user\.role, user\.customRole\)\.includes\('messages\.use'\)/);
  assert.match(readModel, /participant\.lastReadAt \?\? participant\.joinedAt/);
  assert.match(directService, /pg_advisory_xact_lock/);
  assert.match(directService, /resolveEffectiveCapabilities\(target\.role, target\.customRole\)\.includes\('messages\.use'\)/);
  assert.match(directService, /conversationParticipant\.upsert/);
  assert.match(directService, /transaction\.auditLog\.create/);
  assert.match(dto, /canReadDocument\(actor, message\.document\)/);
});

test('direct message picker uses the messaging-scoped contact directory', () => {
  const queryRoute = read('server/routes/conversationQueries.ts');
  const page = read('src/pages/MessagesPage.tsx');
  const api = read('src/lib/api.ts');
  assert.match(queryRoute, /router\.get\('\/contacts'/);
  assert.match(api, /getMessageContacts\(\)/);
  assert.match(page, /\.getMessageContacts\(\)/);
  assert.doesNotMatch(page, /\.getUsers\(\)/);
});

test('message deep links select only conversations returned by the actor-scoped directory', () => {
  const page = read('src/pages/MessagesPage.tsx');
  const header = read('src/components/layout/HeaderActions.tsx');
  assert.match(page, /searchParams\.get\('conversation'\)/);
  assert.match(
    page,
    /requestedConversationId && items\.some\(\(item\) => item\.id === requestedConversationId\)/,
  );
  assert.doesNotMatch(page, /setSelectedId\(requestedConversationId\);/);
  assert.match(header, /\/messages\?conversation=\$\{encodeURIComponent\(conv\.id\)\}/);
});
