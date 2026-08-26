import { AuditAction, DocumentCategory, Prisma } from '@prisma/client';
import type * as DatabaseModule from '../../../db';
import type { AuthUser } from '../../../middleware/auth';
import type { SignaturePlacement } from '../../documents';
import { auditStateDigest, serializeAuditState } from '../../audit';
import { canManageTemplate, resolveTemplateDepartment } from '../domain/templatePolicy';
import { normalizedTemplateStatus, templateDetailSelect } from './templateReadModel';

type TemplateDatabase = typeof DatabaseModule.prisma;
type TemplateStatus = 'ACTIVE' | 'DRAFT' | 'UNDER_REVIEW' | 'ARCHIVED';

export type TemplateMutationErrorCode =
  | 'FORBIDDEN'
  | 'INVALID_INPUT'
  | 'INVALID_REFERENCE'
  | 'NOT_FOUND'
  | 'DUPLICATE';

export class TemplateMutationError extends Error {
  constructor(public readonly code: TemplateMutationErrorCode, public readonly detail?: string) {
    super(code);
    this.name = 'TemplateMutationError';
  }
}

const SIGNATURE_ROLES = new Set(['HOD', 'FINANCE_DIRECTOR', 'GENERAL_MANAGER']);
const TEMPLATE_STATUSES = new Set<TemplateStatus>(['ACTIVE', 'DRAFT', 'UNDER_REVIEW', 'ARCHIVED']);

function actorName(actor: AuthUser) {
  return `${actor.firstName} ${actor.lastName}`;
}

function text(value: unknown, field: string, maximum: number, required = false) {
  const result = String(value ?? '').trim();
  if ((required && !result) || result.length > maximum) {
    throw new TemplateMutationError('INVALID_INPUT', `${field} is invalid`);
  }
  return result;
}

function category(value: unknown) {
  const result = String(value || '') as DocumentCategory;
  if (!Object.values(DocumentCategory).includes(result)) {
    throw new TemplateMutationError('INVALID_INPUT', 'Template category is invalid');
  }
  return result;
}

function version(value: unknown) {
  const result = String(value || '1.0').trim();
  if (!/^\d+(?:\.\d+){0,2}$/.test(result) || result.length > 20) {
    throw new TemplateMutationError('INVALID_INPUT', 'Version must use numeric segments, for example 1.0');
  }
  return result;
}

function status(value: unknown, fallback: TemplateStatus): TemplateStatus {
  if (value === undefined) return fallback;
  const result = String(value).trim().toUpperCase().replaceAll(' ', '_') as TemplateStatus;
  if (!TEMPLATE_STATUSES.has(result)) throw new TemplateMutationError('INVALID_INPUT', 'Template status is invalid');
  return result;
}

function pages(value: unknown) {
  const result = Number(value ?? 1);
  if (!Number.isInteger(result) || result < 1 || result > 100) {
    throw new TemplateMutationError('INVALID_INPUT', 'Page count must be between 1 and 100');
  }
  return result;
}

function placements(value: unknown, pageCount: number) {
  let parsed = value;
  if (typeof parsed === 'string') {
    try { parsed = JSON.parse(parsed); } catch { throw new TemplateMutationError('INVALID_INPUT', 'Signature zones are invalid'); }
  }
  if (parsed === undefined || parsed === null) return '[]';
  if (!Array.isArray(parsed) || parsed.length > 30) {
    throw new TemplateMutationError('INVALID_INPUT', 'A template can contain at most 30 signature zones');
  }
  const ids = new Set<string>();
  const normalized: SignaturePlacement[] = parsed.map((raw, index) => {
    if (!raw || typeof raw !== 'object') throw new TemplateMutationError('INVALID_INPUT', `Signature zone ${index + 1} is invalid`);
    const zone = raw as Record<string, unknown>;
    const id = text(zone.id || `placement-${index + 1}`, 'Signature zone ID', 100, true);
    if (ids.has(id)) throw new TemplateMutationError('INVALID_INPUT', 'Signature zone IDs must be unique');
    ids.add(id);
    const role = String(zone.role || '');
    if (!SIGNATURE_ROLES.has(role)) throw new TemplateMutationError('INVALID_INPUT', `Signature zone ${index + 1} has an invalid role`);
    const page = zone.page === 'all' ? 'all' : Number(zone.page);
    if (page !== 'all' && (!Number.isInteger(page) || page < 1 || page > pageCount)) {
      throw new TemplateMutationError('INVALID_INPUT', `Signature zone ${index + 1} has an invalid page`);
    }
    const coordinate = (key: 'x' | 'y' | 'width' | 'height') => {
      const result = Number(zone[key]);
      if (!Number.isFinite(result)) throw new TemplateMutationError('INVALID_INPUT', `Signature zone ${index + 1} has invalid coordinates`);
      return result;
    };
    const x = coordinate('x');
    const y = coordinate('y');
    const width = coordinate('width');
    const height = coordinate('height');
    if (x < 0 || y < 0 || width <= 0 || height <= 0 || x + width > 100 || y + height > 100) {
      throw new TemplateMutationError('INVALID_INPUT', `Signature zone ${index + 1} must fit inside the page`);
    }
    return {
      id,
      role: role as SignaturePlacement['role'],
      label: text(zone.label || role, 'Signature zone label', 120, true),
      page,
      x,
      y,
      width,
      height,
    };
  });
  return JSON.stringify(normalized);
}

async function validateDepartment(transaction: any, departmentId: string | null | undefined) {
  if (departmentId === undefined) throw new TemplateMutationError('FORBIDDEN');
  if (departmentId && !await transaction.department.findFirst({ where: { id: departmentId, isActive: true }, select: { id: true } })) {
    throw new TemplateMutationError('INVALID_REFERENCE', 'Active department was not found');
  }
}

async function duplicateName(transaction: any, name: string, departmentId: string | null, excludeId?: string) {
  return transaction.template.findFirst({
    where: {
      ...(excludeId ? { id: { not: excludeId } } : {}),
      name: { equals: name, mode: 'insensitive' },
      departmentId,
      status: { notIn: ['ARCHIVED', 'Archived'] },
    },
    select: { id: true },
  });
}

function formatMutationResult<T extends { tenantId: string; status: string; isActive: boolean }>(template: T) {
  const { tenantId: _tenantId, ...safe } = template;
  const normalized = normalizedTemplateStatus(template.status, template.isActive);
  return { ...safe, status: normalized, isActive: normalized === 'ACTIVE' };
}

function templateAuditState(template: any) {
  let zones: unknown[] = [];
  try {
    const parsed = JSON.parse(String(template.signaturePlacement || '[]'));
    zones = Array.isArray(parsed) ? parsed : [];
  } catch {
    zones = [];
  }
  return {
    id: template.id,
    name: template.name,
    description: template.description,
    category: template.category,
    version: template.version,
    status: normalizedTemplateStatus(template.status, template.isActive),
    isActive: normalizedTemplateStatus(template.status, template.isActive) === 'ACTIVE',
    departmentId: template.departmentId,
    pageCount: template.pageCount,
    contentPresent: Boolean(template.content),
    contentLength: typeof template.content === 'string' ? template.content.length : 0,
    contentDigest: auditStateDigest(template.content),
    signatureZoneCount: zones.length,
    signatureRoles: [...new Set(zones.map((zone: any) => String(zone?.role || '')).filter(Boolean))].sort(),
    signaturePlacementDigest: auditStateDigest(String(template.signaturePlacement || '[]')),
  };
}

export async function createTemplate(database: TemplateDatabase, actor: AuthUser, inputValue: unknown) {
  if (!actor.capabilities.includes('templates.manage')) throw new TemplateMutationError('FORBIDDEN');
  const input = inputValue && typeof inputValue === 'object' ? inputValue as Record<string, unknown> : {};
  const templateName = text(input.name, 'Name', 160, true);
  const templateCategory = category(input.category);
  const templateDescription = text(input.description, 'Description', 2000) || null;
  const templateContent = text(input.content, 'Content', 1_000_000) || null;
  const templateVersion = version(input.version);
  const templateStatus = status(input.status, 'ACTIVE');
  if (templateStatus === 'ARCHIVED') throw new TemplateMutationError('INVALID_INPUT', 'A new template cannot start archived');
  const pageCount = pages(input.pageCount);
  const signaturePlacement = placements(input.signaturePlacement, pageCount);
  const departmentId = resolveTemplateDepartment(actor, input.departmentId);

  const created = await database.$transaction(async (transaction) => {
    await validateDepartment(transaction, departmentId);
    await transaction.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`template:${actor.tenantId}:${departmentId || 'global'}:${templateName.toLocaleLowerCase('en-US')}`}))`);
    if (await duplicateName(transaction, templateName, departmentId ?? null)) throw new TemplateMutationError('DUPLICATE');
    const template = await transaction.template.create({
      data: {
        name: templateName,
        description: templateDescription,
        category: templateCategory,
        content: templateContent,
        version: templateVersion,
        status: templateStatus,
        isActive: templateStatus === 'ACTIVE',
        departmentId: departmentId ?? null,
        signaturePlacement,
        pageCount,
      },
      select: templateDetailSelect,
    });
    await transaction.auditLog.create({
      data: {
        userId: actor.id, userName: actorName(actor), action: AuditAction.CREATE, entityType: 'Template', entityId: template.id,
        details: `Created ${templateStatus.toLowerCase()} template ${template.name}`,
        outcome: 'SUCCESS',
        reason: 'Authorized template creation',
        afterState: serializeAuditState(templateAuditState(template)),
      },
    });
    return template;
  });
  return formatMutationResult(created);
}

export async function updateTemplate(database: TemplateDatabase, actor: AuthUser, templateId: string, inputValue: unknown) {
  if (!actor.capabilities.includes('templates.manage')) throw new TemplateMutationError('FORBIDDEN');
  const input = inputValue && typeof inputValue === 'object' ? inputValue as Record<string, unknown> : {};
  const updated = await database.$transaction(async (transaction) => {
    await transaction.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`template:${templateId}`}))`);
    const existing = await transaction.template.findUnique({ where: { id: templateId } });
    if (!existing || !canManageTemplate(actor, existing)) throw new TemplateMutationError('NOT_FOUND');
    const departmentId = input.departmentId === undefined
      ? existing.departmentId
      : resolveTemplateDepartment(actor, input.departmentId);
    await validateDepartment(transaction, departmentId);
    const templateName = input.name === undefined ? existing.name : text(input.name, 'Name', 160, true);
    await transaction.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`template:${actor.tenantId}:${departmentId || 'global'}:${templateName.toLocaleLowerCase('en-US')}`}))`);
    if (await duplicateName(transaction, templateName, departmentId ?? null, templateId)) throw new TemplateMutationError('DUPLICATE');
    const pageCount = input.pageCount === undefined ? existing.pageCount : pages(input.pageCount);
    const signaturePlacement = input.signaturePlacement === undefined
      ? placements(existing.signaturePlacement, pageCount)
      : placements(input.signaturePlacement, pageCount);
    const currentStatus = normalizedTemplateStatus(existing.status, existing.isActive) as TemplateStatus;
    const templateStatus = input.isActive !== undefined && input.status === undefined
      ? input.isActive === true ? 'ACTIVE' : 'DRAFT'
      : status(input.status, currentStatus);
    const data = {
      name: templateName,
      description: input.description === undefined ? existing.description : text(input.description, 'Description', 2000) || null,
      category: input.category === undefined ? existing.category : category(input.category),
      content: input.content === undefined ? existing.content : text(input.content, 'Content', 1_000_000) || null,
      version: input.version === undefined ? existing.version : version(input.version),
      status: templateStatus,
      isActive: templateStatus === 'ACTIVE',
      departmentId: departmentId ?? null,
      signaturePlacement,
      pageCount,
    };
    const template = await transaction.template.update({ where: { id: templateId }, data, select: templateDetailSelect });
    await transaction.auditLog.create({
      data: {
        userId: actor.id, userName: actorName(actor), action: AuditAction.UPDATE, entityType: 'Template', entityId: template.id,
        details: `Updated template ${template.name}; status ${templateStatus}`,
        outcome: 'SUCCESS',
        reason: `Template fields updated: ${Object.keys(input).sort().join(', ')}`,
        beforeState: serializeAuditState(templateAuditState(existing)),
        afterState: serializeAuditState(templateAuditState(template)),
      },
    });
    return template;
  });
  return formatMutationResult(updated);
}

export async function archiveTemplate(database: TemplateDatabase, actor: AuthUser, templateId: string) {
  if (!actor.capabilities.includes('templates.manage')) throw new TemplateMutationError('FORBIDDEN');
  return database.$transaction(async (transaction) => {
    await transaction.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`template:${templateId}`}))`);
    const existing = await transaction.template.findUnique({ where: { id: templateId } });
    if (!existing || !canManageTemplate(actor, existing)) throw new TemplateMutationError('NOT_FOUND');
    if (normalizedTemplateStatus(existing.status, existing.isActive) === 'ARCHIVED') {
      return { ok: true, id: templateId, alreadyProcessed: true };
    }
    const references = await transaction.document.count({ where: { templateId } });
    const archived = await transaction.template.update({
      where: { id: templateId }, data: { status: 'ARCHIVED', isActive: false }, select: templateDetailSelect,
    });
    await transaction.auditLog.create({
      data: {
        userId: actor.id, userName: actorName(actor), action: AuditAction.ARCHIVE, entityType: 'Template', entityId: templateId,
        details: `Archived template ${existing.name}; retained ${references} document reference(s)`,
        outcome: 'SUCCESS',
        reason: 'Recoverable template archival',
        beforeState: serializeAuditState(templateAuditState(existing)),
        afterState: serializeAuditState({ ...templateAuditState(archived), retainedDocumentReferences: references }),
      },
    });
    return { ok: true, id: templateId, alreadyProcessed: false };
  });
}

export async function restoreTemplate(database: TemplateDatabase, actor: AuthUser, templateId: string) {
  if (!actor.capabilities.includes('templates.manage')) throw new TemplateMutationError('FORBIDDEN');
  return database.$transaction(async (transaction) => {
    await transaction.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`template:${templateId}`}))`);
    const existing = await transaction.template.findUnique({ where: { id: templateId } });
    if (!existing || !canManageTemplate(actor, existing)) throw new TemplateMutationError('NOT_FOUND');
    if (normalizedTemplateStatus(existing.status, existing.isActive) !== 'ARCHIVED') {
      throw new TemplateMutationError('INVALID_INPUT', 'Template is not archived');
    }
    await transaction.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`template:${actor.tenantId}:${existing.departmentId || 'global'}:${existing.name.toLocaleLowerCase('en-US')}`}))`);
    if (await duplicateName(transaction, existing.name, existing.departmentId, templateId)) {
      throw new TemplateMutationError('DUPLICATE');
    }
    const template = await transaction.template.update({
      where: { id: templateId }, data: { status: 'DRAFT', isActive: false }, select: templateDetailSelect,
    });
    await transaction.auditLog.create({
      data: {
        userId: actor.id, userName: actorName(actor), action: AuditAction.UPDATE, entityType: 'Template', entityId: templateId,
        details: `Restored template ${existing.name} from archive as draft`,
        outcome: 'SUCCESS',
        reason: 'Archived template restored as a non-active draft for review',
        beforeState: serializeAuditState(templateAuditState(existing)),
        afterState: serializeAuditState(templateAuditState(template)),
      },
    });
    return formatMutationResult(template);
  });
}
