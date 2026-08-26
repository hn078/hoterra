-- Audit evidence is tenant-local, append-only for the runtime role, and chained.
-- The migration owner retains break-glass maintenance authority; ordinary
-- application roles cannot update/delete rows even if application code regresses.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE "AuditLog" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "AuditLog"
  ADD COLUMN "sequence" INTEGER,
  ADD COLUMN "previousHash" TEXT,
  ADD COLUMN "entryHash" TEXT;

CREATE OR REPLACE FUNCTION hoterra_audit_hash(
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
  next_sequence INTEGER;
  previous_hash TEXT;
  calculated_hash TEXT;
BEGIN
  FOR tenant_row IN SELECT "id" FROM "Tenant" ORDER BY "id" LOOP
    next_sequence := 0;
    previous_hash := '';
    FOR audit_row IN
      SELECT * FROM "AuditLog"
      WHERE "tenantId" = tenant_row."id"
      ORDER BY "createdAt", "id"
    LOOP
      next_sequence := next_sequence + 1;
      calculated_hash := hoterra_audit_hash(
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
        audit_row."createdAt",
        next_sequence,
        previous_hash
      );
      UPDATE "AuditLog"
      SET "sequence" = next_sequence,
          "previousHash" = previous_hash,
          "entryHash" = calculated_hash
      WHERE "id" = audit_row."id";
      previous_hash := calculated_hash;
    END LOOP;
  END LOOP;
END $$;

ALTER TABLE "AuditLog"
  ALTER COLUMN "sequence" SET NOT NULL,
  ALTER COLUMN "previousHash" SET NOT NULL,
  ALTER COLUMN "entryHash" SET NOT NULL;

CREATE UNIQUE INDEX "AuditLog_tenantId_sequence_key" ON "AuditLog"("tenantId", "sequence");

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
  NEW."entryHash" := hoterra_audit_hash(
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
    NEW."createdAt",
    NEW."sequence",
    NEW."previousHash"
  );
  RETURN NEW;
END $$;

CREATE TRIGGER "AuditLog_chain_insert"
BEFORE INSERT ON "AuditLog"
FOR EACH ROW EXECUTE FUNCTION hoterra_chain_audit_insert();

CREATE OR REPLACE FUNCTION hoterra_prevent_runtime_audit_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  owner_name TEXT;
BEGIN
  SELECT pg_get_userbyid(relowner) INTO owner_name
  FROM pg_class WHERE oid = 'public."AuditLog"'::regclass;
  IF current_user <> owner_name THEN
    RAISE EXCEPTION 'AuditLog is append-only for the application role' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "AuditLog_prevent_runtime_mutation"
BEFORE UPDATE OR DELETE ON "AuditLog"
FOR EACH ROW EXECUTE FUNCTION hoterra_prevent_runtime_audit_mutation();

ALTER TABLE "AuditLog" FORCE ROW LEVEL SECURITY;
