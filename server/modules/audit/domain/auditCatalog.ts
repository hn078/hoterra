export const AUDIT_MODULES = [
  'System', 'Documents', 'My Approvals', 'Archive', 'Templates',
  'Organization', 'Users & Roles', 'Reports', 'Workforce', 'Messaging',
] as const;

export const AUDIT_SEVERITIES = ['Low', 'Medium', 'High'] as const;

export const AUDIT_ENTITY_TYPES = [
  'System', 'SystemSettings', 'TenantBranding', 'AuditLog', 'Document', 'DocumentAttachment',
  'DocumentComment', 'Template', 'User', 'CustomRole', 'Department', 'WorkflowRoute',
  'Conversation', 'Message', 'WorkforceRequest', 'WorkforceVendorCorrectionReview',
  'WorkforceQualityEvaluation', 'WorkforceApprovalRoute', 'WorkforcePosition',
  'WorkforceSettings', 'WorkforceRequestTemplate', 'DepartmentCasualBudget', 'Vendor',
  'VendorInvite', 'VendorServiceRate', 'VendorInvoice', 'WorkforceReport', 'Report',
] as const;

export type AuditModule = (typeof AUDIT_MODULES)[number];
export type AuditSeverity = (typeof AUDIT_SEVERITIES)[number];

const SEVERITY_BY_ACTION: Record<string, AuditSeverity> = {
  LOGIN: 'Low', LOGOUT: 'Low', VIEW: 'Low', DOWNLOAD: 'Low', PRINT: 'Low',
  CREATE: 'Medium', UPDATE: 'Medium', DELETE: 'High', SIGN: 'Medium',
  PUBLISH: 'Medium', UNPUBLISH: 'Medium', ARCHIVE: 'Low', APPROVE: 'Medium',
  REJECT: 'High', SUBMIT: 'Medium',
};

export function auditSeverity(action: string): AuditSeverity {
  return SEVERITY_BY_ACTION[action] ?? 'Low';
}

export function actionsForSeverity(severity: AuditSeverity, actions: readonly string[]) {
  return actions.filter((action) => auditSeverity(action) === severity);
}
