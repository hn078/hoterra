-- Defense in depth: PostgreSQL enforces tenant visibility even if an API query
-- accidentally omits its tenant filter. Application and migration clients set
-- `hoterra.tenant_id` on every database connection.
DO $$
DECLARE
  table_name text;
  tenant_tables text[] := ARRAY[
    'Department', 'User', 'CustomRole', 'Document', 'DocumentVersion',
    'DocumentHistory', 'DocumentComment', 'DocumentAttachment', 'Template',
    'WorkflowRoute', 'Signature', 'AuditLog', 'Notification', 'SystemSettings',
    'UserFavorite', 'Conversation', 'ConversationParticipant', 'Message',
    'WorkforcePosition', 'Vendor', 'VendorServiceRate', 'VendorApprovalEvent',
    'WorkforceApprovalRoute', 'DepartmentCasualBudget', 'WorkforceSettings',
    'WorkforceRequest', 'WorkforceRequestItem',
    'WorkforceVendorCorrectionReview', 'WorkforceVendorCorrection',
    'WorkforceQualityEvaluation', 'WorkforceRequestEvent',
    'WorkforceRequestTemplate', 'VendorInvite', 'VendorInvoice', 'EmailOutbox'
  ];
BEGIN
  FOREACH table_name IN ARRAY tenant_tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', table_name);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (' ||
      'current_setting(''hoterra.tenant_id'', true) = ''*'' OR "tenantId" = current_setting(''hoterra.tenant_id'', true)' ||
      ') WITH CHECK (' ||
      'current_setting(''hoterra.tenant_id'', true) = ''*'' OR "tenantId" = current_setting(''hoterra.tenant_id'', true)' ||
      ')',
      table_name
    );
  END LOOP;
END $$;
