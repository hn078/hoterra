ALTER TABLE "EmailOutbox"
  ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lastError" TEXT,
  ADD COLUMN "nextAttemptAt" TIMESTAMP(3);

CREATE INDEX "EmailOutbox_tenantId_status_nextAttemptAt_idx"
  ON "EmailOutbox"("tenantId", "status", "nextAttemptAt");
