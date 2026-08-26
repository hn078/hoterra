-- Bind every signature to the exact document version it approved. Existing
-- evidence is backfilled from the document version that was current before
-- this migration; all new writes provide the version explicitly.
ALTER TABLE "Signature" ADD COLUMN "documentVersion" TEXT;

UPDATE "Signature" AS signature
SET "documentVersion" = document."version"
FROM "Document" AS document
WHERE document."id" = signature."documentId"
  AND document."tenantId" = signature."tenantId";

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "Signature" WHERE "documentVersion" IS NULL) THEN
    RAISE EXCEPTION 'Cannot backfill Signature.documentVersion';
  END IF;
END $$;

ALTER TABLE "Signature" ALTER COLUMN "documentVersion" SET NOT NULL;

CREATE INDEX "Signature_tenantId_documentId_documentVersion_idx"
ON "Signature"("tenantId", "documentId", "documentVersion");
