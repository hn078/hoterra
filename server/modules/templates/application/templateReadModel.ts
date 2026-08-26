import type * as DatabaseModule from '../../../db';
import type { AuthUser } from '../../../middleware/auth';
import { canReadTemplate, templateReadScope } from '../domain/templatePolicy';

type TemplateDatabase = typeof DatabaseModule.prisma;

export class TemplateReadError extends Error {
  constructor(public readonly code: 'FORBIDDEN' | 'NOT_FOUND') {
    super(code);
    this.name = 'TemplateReadError';
  }
}

const departmentSelect = { id: true, name: true, code: true, color: true } as const;

const summarySelect = {
  id: true,
  tenantId: true,
  name: true,
  description: true,
  category: true,
  version: true,
  status: true,
  departmentId: true,
  department: { select: departmentSelect },
  isActive: true,
  pageCount: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { documents: true } },
} as const;

const detailSelect = {
  ...summarySelect,
  content: true,
  signaturePlacement: true,
} as const;

export function normalizedTemplateStatus(status: string, isActive: boolean) {
  const normalized = status.trim().toUpperCase().replaceAll(' ', '_');
  if (normalized === 'ARCHIVED') return 'ARCHIVED';
  if (normalized === 'UNDER_REVIEW') return 'UNDER_REVIEW';
  if (normalized === 'DRAFT') return 'DRAFT';
  return isActive ? 'ACTIVE' : 'DRAFT';
}

function formatTemplate<T extends { tenantId: string; status: string; isActive: boolean }>(template: T) {
  const { tenantId: _tenantId, ...safe } = template;
  const status = normalizedTemplateStatus(template.status, template.isActive);
  return { ...safe, status, isActive: status === 'ACTIVE' };
}

export async function listTemplates(database: TemplateDatabase, actor: AuthUser) {
  if (!actor.capabilities.includes('templates.read')) throw new TemplateReadError('FORBIDDEN');
  const templates = await database.template.findMany({
    where: templateReadScope(actor),
    select: summarySelect,
    orderBy: { updatedAt: 'desc' },
    take: 500,
  });
  return templates.map(formatTemplate);
}

export async function readTemplate(database: TemplateDatabase, actor: AuthUser, templateId: string) {
  if (!actor.capabilities.includes('templates.read')) throw new TemplateReadError('FORBIDDEN');
  const template = await database.template.findUnique({ where: { id: templateId }, select: detailSelect });
  if (!template || !canReadTemplate(actor, template)) throw new TemplateReadError('NOT_FOUND');
  return formatTemplate(template);
}

export async function searchTemplates(
  database: TemplateDatabase,
  actor: AuthUser,
  query: string,
  options?: { includeArchived?: boolean; dateFrom?: Date; departmentId?: string; sort?: 'relevance' | 'date' | 'name' },
) {
  if (!actor.capabilities.includes('templates.read')) return [];
  const normalized = query.trim().slice(0, 200);
  if (!normalized) return [];
  const templates = await database.template.findMany({
    where: {
      AND: [
        templateReadScope(actor),
        { OR: [{ name: { contains: normalized, mode: 'insensitive' } }, { description: { contains: normalized, mode: 'insensitive' } }] },
        ...(!options?.includeArchived ? [{ status: { notIn: ['ARCHIVED', 'Archived'] } }] : []),
        ...(options?.dateFrom ? [{ updatedAt: { gte: options.dateFrom } }] : []),
        ...(options?.departmentId ? [{ OR: [{ departmentId: null }, { departmentId: options.departmentId }] }] : []),
      ],
    },
    select: summarySelect,
    orderBy: options?.sort === 'name' ? { name: 'asc' } : { updatedAt: 'desc' },
    take: 10,
  });
  return templates.map(formatTemplate);
}

export { detailSelect as templateDetailSelect };
