ALTER TABLE "Notification"
ADD COLUMN "entityType" TEXT,
ADD COLUMN "entityId" TEXT,
ADD COLUMN "actionType" TEXT,
ADD COLUMN "dedupeKey" TEXT,
ADD COLUMN "expiresAt" TIMESTAMP(3),
ADD COLUMN "actionCompletedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "Notification_tenantId_dedupeKey_key"
ON "Notification"("tenantId", "dedupeKey");

CREATE INDEX "Notification_tenantId_entityType_entityId_idx"
ON "Notification"("tenantId", "entityType", "entityId");

CREATE INDEX "Notification_tenantId_userId_actionType_actionCompletedAt_idx"
ON "Notification"("tenantId", "userId", "actionType", "actionCompletedAt");
