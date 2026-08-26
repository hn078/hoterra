const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('notification destinations are same-origin, allowlisted, and capability checked', () => {
  const policy = read('server/modules/notifications/application/resolveNotificationDestination.ts');
  assert.match(policy, /link\.startsWith\('\/\/'\)/);
  assert.match(policy, /DESTINATION_CAPABILITIES/);
  assert.match(policy, /capabilities\.includes\(requirement\[1\]\)/);
});

test('notification routes require the named notification capability', () => {
  const route = read('server/routes/notifications.ts');
  assert.equal((route.match(/requireCapability\('notifications\.read'\)/g) || []).length, 7);
  assert.match(route, /listNotifications\(prisma, req\.user!\)/);
  assert.match(route, /openNotification\(prisma, req\.user!/);
  assert.doesNotMatch(route, /prisma\.notification\./);
});

test('notification preferences are personal, audited, and cannot disable assigned in-app work', () => {
  const service = read('server/modules/notifications/application/manageNotificationPreferences.ts');
  const page = read('src/pages/NotificationsPage.tsx');
  const outbox = read('server/modules/workforce/application/workforceNotificationOutbox.ts');
  assert.match(service, /where: \{ userId: actor\.id \}/);
  assert.match(service, /entityType: 'UserNotificationPreference'/);
  assert.match(service, /inAppRequired: true/);
  assert.match(page, /api\.getNotificationPreferences\(\)/);
  assert.match(page, /api\.updateNotificationPreferences\(next\.email\)/);
  assert.doesNotMatch(page, /api\.updateSettings\(/);
  assert.match(outbox, /notificationPreference\?\.emailEnabled !== false/);
});

test('notification clicks verify object access before returning a destination', () => {
  const service = read('server/modules/notifications/application/openNotification.ts');
  assert.match(service, /where: \{ id: notificationId, userId: actor\.id \}/);
  assert.match(service, /getDocumentDetail\(database, actor, target\.id\)/);
  assert.match(service, /getWorkforceRequestDetail\(database, actor, target\.id\)/);
  assert.match(service, /state: 'UNAVAILABLE', destination: null/);
  assert.match(service, /state: 'COMPLETED'/);
  assert.match(service, /documentApprovalActionScope\(actor\)/);
  assert.match(service, /WORKFORCE_ACTION_LABELS\[notification\.actionType\]/);
  assert.match(service, /listPendingWorkforceTasks\(database, actor, 200\)/);
  assert.match(service, /isRead: true/);
});

test('action notifications carry typed targets, dedupe document steps, and record completion', () => {
  const schema = read('prisma/schema.prisma');
  const documentQueue = read('server/modules/documents/application/queueDocumentApprovalNotification.ts');
  const documentDecision = read('server/modules/documents/application/decideDocumentApproval.ts');
  const workforceQueue = read('server/modules/workforce/application/workforceNotificationOutbox.ts');
  const workforceDecision = read('server/modules/workforce/application/approveWorkforceRequest.ts');
  const correctionSubmit = read('server/modules/workforce/application/submitVendorCorrectionReview.ts');
  const correctionDecision = read('server/modules/workforce/application/decideVendorCorrectionReview.ts');
  const lifecycle = read('server/modules/workforce/application/reconcileWorkforceLifecycle.ts');
  assert.match(schema, /entityType\s+String\?/);
  assert.match(schema, /actionType\s+String\?/);
  assert.match(schema, /actionCompletedAt\s+DateTime\?/);
  assert.match(schema, /actionCompletedByName\s+String\?/);
  assert.match(schema, /@@unique\(\[tenantId, dedupeKey\]\)/);
  assert.match(documentQueue, /actionType: 'DOCUMENT_APPROVAL'/);
  assert.match(documentQueue, /skipDuplicates: true/);
  assert.match(documentDecision, /actionCompletedAt: new Date\(\)/);
  assert.match(workforceQueue, /actionType: 'WORKFORCE_APPROVAL'/);
  assert.match(workforceDecision, /actionType: 'WORKFORCE_APPROVAL'/);
  assert.match(correctionSubmit, /actionType: 'VENDOR_CORRECTION_REVIEW'/);
  assert.match(correctionDecision, /actionType: 'PROCUREMENT_CORRECTION_REVISION'/);
  assert.match(lifecycle, /actionType: 'WORKFORCE_FINAL_EVALUATION'/);
  assert.match(lifecycle, /resolveEffectiveCapabilities/);
});

test('notification application service scopes every operation to the actor', () => {
  const service = read('server/modules/notifications/application/manageNotifications.ts');
  assert.match(service, /where: \{ userId: actor\.id \}/);
  assert.match(service, /select: \{[\s\S]*title: true,[\s\S]*createdAt: true/);
  assert.doesNotMatch(service, /\.\.\.notification/);
  assert.match(service, /where: \{ id: notificationId, userId: actorId \}/);
  assert.match(service, /result\.count > 0/);
});

test('notification cards use the server-authorized deep-link contract', () => {
  const page = read('src/pages/NotificationsPage.tsx');
  assert.match(page, /api\.openNotification\(n\.id\)/);
  assert.match(page, /navigate\(result\.destination\)/);
  assert.match(page, /result\.state === 'COMPLETED'/);
  assert.doesNotMatch(page, /navigate\(n\.link\)/);
  assert.doesNotMatch(page, /getSettings\(\)/);
  assert.doesNotMatch(page, /updateSettings\(/);
  assert.match(page, /\{ id: 'workforce', label: 'Workforce' \}/);
});

test('global badges and header panels never call modules the actor cannot read', () => {
  const badges = read('src/hooks/useNavBadges.ts');
  const header = read('src/components/layout/HeaderActions.tsx');
  assert.match(badges, /canReadApprovals\s*\?\s*api\.getApprovals/);
  assert.match(badges, /canReadNotifications\s*\?\s*api\.getUnreadCount/);
  assert.match(badges, /canUseMessages\s*\?\s*api\.getMessagesUnreadCount/);
  assert.match(header, /openPanel !== 'calendar' \|\| !canViewCalendar/);
  assert.match(header, /openPanel !== 'notifications' \|\| !canReadNotifications/);
  assert.match(header, /openPanel !== 'messages' \|\| !canUseMessages/);
});

test('mobile navigation exposes alerts and the full menu exposes messages', () => {
  const layout = read('src/components/layout/Sidebar.tsx');
  assert.match(layout, /to: '\/messages'[\s\S]*capability: 'messages\.use'/);
  assert.match(layout, /to: '\/notifications'[\s\S]*label: 'Alerts'/);
  assert.match(layout, /gridTemplateColumns: `repeat\(\$\{visibleItems\.length \+ 1\}/);
});
