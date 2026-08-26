export interface TemplateActor {
  tenantId: string;
  departmentId?: string | null;
  capabilities: readonly string[];
}

export interface TemplateResource {
  tenantId: string;
  departmentId?: string | null;
}

function has(actor: TemplateActor, capability: string) {
  return actor.capabilities.includes(capability);
}

export function canReadTemplate(actor: TemplateActor, template: TemplateResource) {
  if (actor.tenantId !== template.tenantId || !has(actor, 'templates.read')) return false;
  return has(actor, 'documents.read.all')
    || template.departmentId === null
    || (Boolean(actor.departmentId) && actor.departmentId === template.departmentId);
}

export function templateReadScope(actor: TemplateActor): Record<string, unknown> {
  if (!has(actor, 'templates.read')) return { id: '__forbidden__' };
  if (has(actor, 'documents.read.all')) return { tenantId: actor.tenantId };
  return {
    tenantId: actor.tenantId,
    OR: [
      { departmentId: null },
      { departmentId: actor.departmentId || '__unassigned__' },
    ],
  };
}

export function canManageTemplate(actor: TemplateActor, template: TemplateResource) {
  if (actor.tenantId !== template.tenantId || !has(actor, 'templates.manage')) return false;
  return has(actor, 'documents.read.all')
    || (Boolean(actor.departmentId) && actor.departmentId === template.departmentId);
}

export function resolveTemplateDepartment(actor: TemplateActor, requestedDepartmentId: unknown) {
  if (!has(actor, 'templates.manage')) return undefined;
  if (has(actor, 'documents.read.all')) {
    const value = String(requestedDepartmentId ?? '').trim();
    return value || null;
  }
  return actor.departmentId || undefined;
}

export function isUsableTemplate(template: { status?: string | null; isActive?: boolean | null }) {
  return template.isActive === true && String(template.status || '').trim().toUpperCase() === 'ACTIVE';
}
