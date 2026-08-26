ALTER TYPE "DocumentStatus" ADD VALUE 'DISPOSED';

CREATE TYPE "DispositionStatus" AS ENUM ('PENDING', 'REJECTED', 'EXECUTED', 'CANCELLED');

CREATE TABLE "RetentionPolicy" (
  "tenantId" TEXT NOT NULL DEFAULT current_setting('hoterra.tenant_id', true),
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "category" "DocumentCategory",
  "retentionDays" INTEGER NOT NULL,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RetentionPolicy_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DocumentDispositionRequest" (
  "tenantId" TEXT NOT NULL DEFAULT current_setting('hoterra.tenant_id', true),
  "id" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "status" "DispositionStatus" NOT NULL DEFAULT 'PENDING',
  "reason" TEXT NOT NULL,
  "requestedById" TEXT NOT NULL,
  "requestedByName" TEXT NOT NULL,
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedById" TEXT,
  "reviewedByName" TEXT,
  "reviewComment" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "documentCode" TEXT NOT NULL,
  "documentTitle" TEXT NOT NULL,
  "retentionUntil" TIMESTAMP(3),
  "executedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DocumentDispositionRequest_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Document"
  ADD COLUMN "retentionPolicyId" TEXT,
  ADD COLUMN "retentionUntil" TIMESTAMP(3),
  ADD COLUMN "legalHoldAt" TIMESTAMP(3),
  ADD COLUMN "legalHoldById" TEXT,
  ADD COLUMN "legalHoldByName" TEXT,
  ADD COLUMN "legalHoldReason" TEXT,
  ADD COLUMN "disposedAt" TIMESTAMP(3),
  ADD COLUMN "disposedById" TEXT,
  ADD COLUMN "disposedByName" TEXT,
  ADD COLUMN "dispositionReason" TEXT;

CREATE UNIQUE INDEX "RetentionPolicy_tenantId_name_key" ON "RetentionPolicy"("tenantId", "name");
CREATE INDEX "RetentionPolicy_tenantId_isActive_idx" ON "RetentionPolicy"("tenantId", "isActive");
CREATE INDEX "RetentionPolicy_tenantId_category_idx" ON "RetentionPolicy"("tenantId", "category");
CREATE INDEX "DocumentDispositionRequest_tenantId_status_requestedAt_idx" ON "DocumentDispositionRequest"("tenantId", "status", "requestedAt");
CREATE INDEX "DocumentDispositionRequest_tenantId_documentId_requestedAt_idx" ON "DocumentDispositionRequest"("tenantId", "documentId", "requestedAt");
CREATE UNIQUE INDEX "DocumentDispositionRequest_one_pending_per_document" ON "DocumentDispositionRequest"("tenantId", "documentId") WHERE "status" = 'PENDING';
CREATE INDEX "Document_tenantId_status_retentionUntil_idx" ON "Document"("tenantId", "status", "retentionUntil");
CREATE INDEX "Document_tenantId_legalHoldAt_idx" ON "Document"("tenantId", "legalHoldAt");

ALTER TABLE "RetentionPolicy" ADD CONSTRAINT "RetentionPolicy_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DocumentDispositionRequest" ADD CONSTRAINT "DocumentDispositionRequest_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DocumentDispositionRequest" ADD CONSTRAINT "DocumentDispositionRequest_documentId_fkey"
  FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Document" ADD CONSTRAINT "Document_retentionPolicyId_fkey"
  FOREIGN KEY ("retentionPolicyId") REFERENCES "RetentionPolicy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "RetentionPolicy" (
  "tenantId", "id", "name", "description", "retentionDays", "isDefault", "isActive", "updatedAt"
)
SELECT "id", gen_random_uuid()::text, 'Hotel records — 7 years',
       'Default records retention policy. Review against local legal and brand requirements.',
       2555, true, true, CURRENT_TIMESTAMP
FROM "Tenant";

UPDATE "Document" AS document
SET "retentionPolicyId" = policy."id",
    "retentionUntil" = COALESCE(document."archivedAt", CURRENT_TIMESTAMP) + (policy."retentionDays" * INTERVAL '1 day')
FROM "RetentionPolicy" AS policy
WHERE document."tenantId" = policy."tenantId"
  AND policy."isDefault" = true
  AND document."status" = 'ARCHIVED';

ALTER TABLE "RetentionPolicy" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RetentionPolicy" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "RetentionPolicy"
  USING ("tenantId" = current_setting('hoterra.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('hoterra.tenant_id', true));

ALTER TABLE "DocumentDispositionRequest" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DocumentDispositionRequest" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "DocumentDispositionRequest"
  USING ("tenantId" = current_setting('hoterra.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('hoterra.tenant_id', true));
