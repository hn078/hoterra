CREATE UNIQUE INDEX IF NOT EXISTS "User_tenantId_id_key"
ON "User"("tenantId", "id");

ALTER TABLE "UserNotificationPreference"
ADD CONSTRAINT "UserNotificationPreference_tenantId_userId_fkey"
FOREIGN KEY ("tenantId", "userId")
REFERENCES "User"("tenantId", "id")
ON DELETE CASCADE ON UPDATE CASCADE;
