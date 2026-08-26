-- Bind each HTTP-originated audit event to the server-issued correlation ID.
-- Existing events remain valid with an empty requestId and the complete tenant
-- chain is rebuilt under the v2 canonicalization contract.
ALTER TABLE "AuditLog" NO FORCE ROW LEVEL SECURITY;

ALTER TABLE "AuditLog" ADD COLUMN "requestId" TEXT;
CREATE INDEX "AuditLog_tenantId_requestId_idx" ON "AuditLog"("tenantId", "requestId");

CREATE OR REPLACE FUNCTION hoterra_audit_hash_v2(
  audit_id TEXT,
  audit_tenant_id TEXT,
  audit_user_id TEXT,
  audit_user_name TEXT,
  audit_action TEXT,
  audit_entity_type TEXT,
  audit_entity_id TEXT,
  audit_details TEXT,
  audit_ip_address TEXT,
  audit_device TEXT,
  audit_request_id TEXT,
  audit_created_at TIMESTAMP(3),
  audit_sequence INTEGER,
  audit_previous_hash TEXT
) RETURNS TEXT
LANGUAGE SQL
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT encode(
    digest(
      concat_ws(E'\x1f',
        COALESCE(audit_id, ''),
        COALESCE(audit_tenant_id, ''),
        COALESCE(audit_user_id, ''),
        COALESCE(audit_user_name, ''),
        COALESCE(audit_action, ''),
        COALESCE(audit_entity_type, ''),
        COALESCE(audit_entity_id, ''),
        COALESCE(audit_details, ''),
        COALESCE(audit_ip_address, ''),
        COALESCE(audit_device, ''),
        COALESCE(audit_request_id, ''),
        to_char(audit_created_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS'),
        COALESCE(audit_sequence::TEXT, ''),
        COALESCE(audit_previous_hash, '')
      ),
      'sha256'
    ),
    'hex'
  );
$$;

DO $$
DECLARE
  tenant_row RECORD;
  audit_row RECORD;
  previous_hash TEXT;
  calculated_hash TEXT;
BEGIN
  FOR tenant_row IN SELECT "id" FROM "Tenant" ORDER BY "id" LOOP
    previous_hash := '';
    FOR audit_row IN
      SELECT * FROM "AuditLog"
      WHERE "tenantId" = tenant_row."id"
      ORDER BY "sequence"
    LOOP
      calculated_hash := hoterra_audit_hash_v2(
        audit_row."id",
        audit_row."tenantId",
        audit_row."userId",
        audit_row."userName",
        audit_row."action"::TEXT,
        audit_row."entityType",
        audit_row."entityId",
        audit_row."details",
        audit_row."ipAddress",
        audit_row."device",
        audit_row."requestId",
        audit_row."createdAt",
        audit_row."sequence",
        previous_hash
      );
      UPDATE "AuditLog"
      SET "previousHash" = previous_hash,
          "entryHash" = calculated_hash
      WHERE "id" = audit_row."id";
      previous_hash := calculated_hash;
    END LOOP;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION hoterra_chain_audit_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  last_sequence INTEGER;
  last_hash TEXT;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW."tenantId", 1700));
  SELECT "sequence", "entryHash"
    INTO last_sequence, last_hash
    FROM "AuditLog"
    WHERE "tenantId" = NEW."tenantId"
    ORDER BY "sequence" DESC
    LIMIT 1;

  NEW."sequence" := COALESCE(last_sequence, 0) + 1;
  NEW."previousHash" := COALESCE(last_hash, '');
  NEW."entryHash" := hoterra_audit_hash_v2(
    NEW."id",
    NEW."tenantId",
    NEW."userId",
    NEW."userName",
    NEW."action"::TEXT,
    NEW."entityType",
    NEW."entityId",
    NEW."details",
    NEW."ipAddress",
    NEW."device",
    NEW."requestId",
    NEW."createdAt",
    NEW."sequence",
    NEW."previousHash"
  );
  RETURN NEW;
END $$;

ALTER TABLE "AuditLog" FORCE ROW LEVEL SECURITY;
