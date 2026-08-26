CREATE TYPE "DocumentIndexSourceType" AS ENUM ('PRIMARY', 'ATTACHMENT');

ALTER TABLE "DocumentSearchIndex"
  ADD COLUMN "attachmentId" TEXT,
  ADD COLUMN "sourceType" "DocumentIndexSourceType" NOT NULL DEFAULT 'PRIMARY',
  ADD COLUMN "sourceKey" TEXT NOT NULL DEFAULT 'PRIMARY';

DROP INDEX "DocumentSearchIndex_documentId_key";
DROP INDEX "DocumentSearchIndex_tenantId_documentId_key";

CREATE UNIQUE INDEX "DocumentSearchIndex_attachmentId_key" ON "DocumentSearchIndex"("attachmentId");
CREATE UNIQUE INDEX "DocumentSearchIndex_documentId_sourceKey_key" ON "DocumentSearchIndex"("documentId", "sourceKey");
CREATE UNIQUE INDEX "DocumentSearchIndex_tenantId_documentId_sourceKey_key" ON "DocumentSearchIndex"("tenantId", "documentId", "sourceKey");
CREATE INDEX "DocumentSearchIndex_tenantId_documentId_sourceType_idx" ON "DocumentSearchIndex"("tenantId", "documentId", "sourceType");

ALTER TABLE "DocumentSearchIndex" ADD CONSTRAINT "DocumentSearchIndex_attachmentId_fkey"
  FOREIGN KEY ("attachmentId") REFERENCES "DocumentAttachment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
