-- Prevent a tenant-owned row from referencing a parent row belonging to a
-- different tenant. RLS protects reads; these triggers also protect relation
-- integrity for writes.
CREATE OR REPLACE FUNCTION hoterra_enforce_tenant_fk()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  fk_value text;
  referenced_tenant text;
BEGIN
  fk_value := to_jsonb(NEW) ->> TG_ARGV[1];
  IF fk_value IS NULL OR fk_value = '' THEN
    RETURN NEW;
  END IF;

  EXECUTE format('SELECT "tenantId" FROM %I WHERE "id" = $1', TG_ARGV[0])
    INTO referenced_tenant
    USING fk_value;

  IF referenced_tenant IS DISTINCT FROM NEW."tenantId" THEN
    RAISE EXCEPTION 'Tenant relation violation on %.% -> %', TG_TABLE_NAME, TG_ARGV[1], TG_ARGV[0]
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  relation_spec record;
  trigger_name text;
BEGIN
  FOR relation_spec IN
    SELECT * FROM (VALUES
      ('User', 'customRoleId', 'CustomRole'),
      ('User', 'departmentId', 'Department'),
      ('Document', 'departmentId', 'Department'),
      ('Document', 'authorId', 'User'),
      ('Document', 'ownerId', 'User'),
      ('Document', 'templateId', 'Template'),
      ('Document', 'workflowId', 'WorkflowRoute'),
      ('DocumentVersion', 'documentId', 'Document'),
      ('DocumentHistory', 'documentId', 'Document'),
      ('DocumentComment', 'documentId', 'Document'),
      ('DocumentComment', 'userId', 'User'),
      ('DocumentComment', 'attachedDocumentId', 'Document'),
      ('DocumentAttachment', 'documentId', 'Document'),
      ('Template', 'departmentId', 'Department'),
      ('Signature', 'documentId', 'Document'),
      ('Signature', 'userId', 'User'),
      ('AuditLog', 'userId', 'User'),
      ('UserFavorite', 'userId', 'User'),
      ('UserFavorite', 'documentId', 'Document'),
      ('Conversation', 'departmentId', 'Department'),
      ('ConversationParticipant', 'conversationId', 'Conversation'),
      ('ConversationParticipant', 'userId', 'User'),
      ('Message', 'conversationId', 'Conversation'),
      ('Message', 'senderId', 'User'),
      ('Message', 'documentId', 'Document'),
      ('WorkforcePosition', 'departmentId', 'Department'),
      ('VendorServiceRate', 'vendorId', 'Vendor'),
      ('VendorServiceRate', 'positionId', 'WorkforcePosition'),
      ('VendorApprovalEvent', 'vendorId', 'Vendor'),
      ('WorkforceApprovalRoute', 'departmentId', 'Department'),
      ('DepartmentCasualBudget', 'departmentId', 'Department'),
      ('WorkforceRequest', 'departmentId', 'Department'),
      ('WorkforceRequest', 'positionId', 'WorkforcePosition'),
      ('WorkforceRequest', 'vendorRateId', 'VendorServiceRate'),
      ('WorkforceRequest', 'vendorId', 'Vendor'),
      ('WorkforceRequest', 'acceptedVendorId', 'Vendor'),
      ('WorkforceRequest', 'createdById', 'User'),
      ('WorkforceRequestItem', 'requestId', 'WorkforceRequest'),
      ('WorkforceRequestItem', 'positionId', 'WorkforcePosition'),
      ('WorkforceRequestItem', 'vendorRateId', 'VendorServiceRate'),
      ('WorkforceRequestItem', 'vendorId', 'Vendor'),
      ('WorkforceVendorCorrectionReview', 'requestId', 'WorkforceRequest'),
      ('WorkforceVendorCorrection', 'reviewId', 'WorkforceVendorCorrectionReview'),
      ('WorkforceVendorCorrection', 'itemId', 'WorkforceRequestItem'),
      ('WorkforceQualityEvaluation', 'requestId', 'WorkforceRequest'),
      ('WorkforceQualityEvaluation', 'vendorId', 'Vendor'),
      ('WorkforceRequestEvent', 'requestId', 'WorkforceRequest'),
      ('WorkforceRequestTemplate', 'departmentId', 'Department'),
      ('WorkforceRequestTemplate', 'positionId', 'WorkforcePosition'),
      ('VendorInvite', 'requestId', 'WorkforceRequest'),
      ('VendorInvite', 'vendorId', 'Vendor'),
      ('VendorInvoice', 'requestId', 'WorkforceRequest'),
      ('VendorInvoice', 'vendorId', 'Vendor')
    ) AS specs(child_table, fk_column, parent_table)
  LOOP
    trigger_name := 'tenant_fk_' || substr(md5(relation_spec.child_table || ':' || relation_spec.fk_column), 1, 16);
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', trigger_name, relation_spec.child_table);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE INSERT OR UPDATE OF "tenantId", %I ON %I ' ||
      'FOR EACH ROW EXECUTE FUNCTION hoterra_enforce_tenant_fk(%L, %L)',
      trigger_name,
      relation_spec.fk_column,
      relation_spec.child_table,
      relation_spec.parent_table,
      relation_spec.fk_column
    );
  END LOOP;
END $$;
