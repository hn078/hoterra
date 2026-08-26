export interface ReportActor {
  id: string;
  tenantId: string;
  departmentId?: string | null;
  capabilities: readonly string[];
}
/** Report visibility is independent from direct document-directory access. */
export function reportDocumentScope(actor: ReportActor): Record<string, unknown> {
  if (!actor.capabilities.includes('reports.read')) return { id: '__forbidden__' };
  if (actor.capabilities.includes('documents.read.all')) return { tenantId: actor.tenantId };
  if (actor.departmentId) return { tenantId: actor.tenantId, departmentId: actor.departmentId };
  return { tenantId: actor.tenantId, OR: [{ authorId: actor.id }, { ownerId: actor.id }] };
}
