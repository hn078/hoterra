CREATE TABLE "UserNotificationPreference" (
  "tenantId" TEXT NOT NULL DEFAULT current_setting('hoterra.tenant_id', true),
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "emailEnabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "UserNotificationPreference_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "UserNotificationPreference_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "UserNotificationPreference_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "UserNotificationPreference_userId_key"
ON "UserNotificationPreference"("userId");

CREATE UNIQUE INDEX "UserNotificationPreference_tenantId_userId_key"
ON "UserNotificationPreference"("tenantId", "userId");

CREATE INDEX "UserNotificationPreference_tenantId_idx"
ON "UserNotificationPreference"("tenantId");

ALTER TABLE "UserNotificationPreference" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "UserNotificationPreference" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "UserNotificationPreference"
USING ("tenantId" = current_setting('hoterra.tenant_id', true))
WITH CHECK ("tenantId" = current_setting('hoterra.tenant_id', true));
