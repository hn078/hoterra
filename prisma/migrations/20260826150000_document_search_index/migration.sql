CREATE TYPE "DocumentIndexStatus" AS ENUM (
  'PENDING', 'READY', 'EMPTY', 'FAILED', 'UNSUPPORTED', 'OCR_REQUIRED'
);

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE "DocumentSearchIndex" (
  "tenantId" TEXT NOT NULL DEFAULT current_setting('hoterra.tenant_id', true),
  "id" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "sourcePath" TEXT,
  "sourceFileName" TEXT,
  "sourceVersion" TEXT,
  "status" "DocumentIndexStatus" NOT NULL DEFAULT 'PENDING',
  "extractedText" TEXT,
  "errorCode" TEXT,
  "indexedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DocumentSearchIndex_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DocumentSearchIndex_documentId_key" ON "DocumentSearchIndex"("documentId");
CREATE UNIQUE INDEX "DocumentSearchIndex_tenantId_documentId_key" ON "DocumentSearchIndex"("tenantId", "documentId");
CREATE INDEX "DocumentSearchIndex_tenantId_status_idx" ON "DocumentSearchIndex"("tenantId", "status");
CREATE INDEX "DocumentSearchIndex_tenantId_updatedAt_idx" ON "DocumentSearchIndex"("tenantId", "updatedAt");
CREATE INDEX "DocumentSearchIndex_extractedText_trgm_idx" ON "DocumentSearchIndex"
  USING GIN ("extractedText" gin_trgm_ops)
  WHERE "status" = 'READY';

ALTER TABLE "DocumentSearchIndex" ADD CONSTRAINT "DocumentSearchIndex_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DocumentSearchIndex" ADD CONSTRAINT "DocumentSearchIndex_documentId_fkey"
  FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DocumentSearchIndex" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DocumentSearchIndex" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "DocumentSearchIndex"
  USING ("tenantId" = current_setting('hoterra.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('hoterra.tenant_id', true));
