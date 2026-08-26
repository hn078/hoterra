ALTER TABLE "Department"
  ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "deactivatedAt" TIMESTAMP(3);

CREATE INDEX "Department_tenantId_isActive_idx" ON "Department"("tenantId", "isActive");
