-- A document version may be returned and resubmitted more than once. Keep old
-- evidence, but bind it to the approval cycle in which it was produced so it
-- cannot satisfy a later review round.
ALTER TABLE "Document"
ADD COLUMN "approvalCycle" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "Signature"
ADD COLUMN "approvalCycle" INTEGER NOT NULL DEFAULT 1;

DROP INDEX IF EXISTS "Signature_tenantId_documentId_documentVersion_idx";

CREATE INDEX "Signature_tenantId_documentId_documentVersion_approvalCycle_idx"
ON "Signature"("tenantId", "documentId", "documentVersion", "approvalCycle");
