import { DocumentStatus, Prisma } from '@prisma/client';
import type * as DatabaseModule from '../../../db';
import type { AuthUser } from '../../../middleware/auth';
import { documentReadScope } from '../../documents';
import { templateReadScope } from '../../templates';

type ArchiveDatabase = typeof DatabaseModule.prisma;
export class ArchiveReadError extends Error {
  constructor(public readonly code: 'FORBIDDEN' | 'INVALID_INPUT', public readonly detail?: string) {
    super(code);
    this.name = 'ArchiveReadError';
  }
}

export interface ArchiveQueryInput { search?: unknown; module?: unknown; page?: unknown; limit?: unknown }
type ArchiveKind = 'Document' | 'Template';

function integer(value: unknown, fallback: number, maximum: number) {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > maximum) throw new ArchiveReadError('INVALID_INPUT', 'Pagination is invalid');
  return parsed;
}

function parseInput(input: ArchiveQueryInput) {
  const search = String(input.search ?? '').trim();
  if (search.length > 200) throw new ArchiveReadError('INVALID_INPUT', 'Search is too long');
  const module = String(input.module || 'ALL');
  if (!['ALL', 'Document', 'Template'].includes(module)) throw new ArchiveReadError('INVALID_INPUT', 'Archive type is invalid');
  const page = integer(input.page, 1, 10_000);
  const limit = integer(input.limit, 20, 100);
  if (page * limit > 10_000) throw new ArchiveReadError('INVALID_INPUT', 'Archive page is outside the supported result window');
  return { search, module: module as 'ALL' | ArchiveKind, page, limit };
}

export async function listArchive(database: ArchiveDatabase, actor: AuthUser, input: ArchiveQueryInput) {
  if (!actor.capabilities.includes('documents.archive')) throw new ArchiveReadError('FORBIDDEN');
  const { search, module, page, limit } = parseInput(input);
  const offset = (page - 1) * limit;
  const documentWhere: Prisma.DocumentWhereInput = {
    AND: [documentReadScope(actor) as Prisma.DocumentWhereInput, { status: { in: [DocumentStatus.ARCHIVED, DocumentStatus.DISPOSED] } }, ...(search ? [{ OR: [
      { title: { contains: search, mode: 'insensitive' as const } }, { code: { contains: search, mode: 'insensitive' as const } },
      { archivedBy: { contains: search, mode: 'insensitive' as const } }, { archiveReason: { contains: search, mode: 'insensitive' as const } },
    ] }] : [])],
  };
  const templateWhere: Prisma.TemplateWhereInput = {
    AND: [templateReadScope(actor) as Prisma.TemplateWhereInput, { status: { in: ['ARCHIVED', 'Archived'] } }, ...(search ? [{ OR: [
      { name: { contains: search, mode: 'insensitive' as const } }, { description: { contains: search, mode: 'insensitive' as const } },
    ] }] : [])],
  };
  const includeDocuments = module !== 'Template';
  const includeTemplates = module !== 'Document' && actor.capabilities.includes('templates.read');
  const take = module === 'ALL' ? offset + limit : limit;
  const skip = module === 'ALL' ? 0 : offset;

  const [documents, templates, documentTotal, templateTotal, documentStats, templateStatsTotal, documentsThisMonth, templatesThisMonth, legalHolds, pendingDispositions, disposed] = await Promise.all([
    includeDocuments ? database.document.findMany({ where: documentWhere, select: {
      id: true, title: true, code: true, status: true, archivedBy: true, archivedAt: true, archiveReason: true, fileSize: true,
      retentionUntil: true, legalHoldAt: true, legalHoldByName: true, legalHoldReason: true, disposedAt: true,
      retentionPolicy: { select: { id: true, name: true, retentionDays: true } },
      dispositionRequests: { orderBy: { requestedAt: 'desc' }, take: 1, select: {
        id: true, status: true, reason: true, requestedById: true, requestedByName: true, requestedAt: true,
        reviewedByName: true, reviewComment: true, reviewedAt: true,
      } },
    }, orderBy: { archivedAt: 'desc' }, skip, take }) : [],
    includeTemplates ? database.template.findMany({ where: templateWhere, select: {
      id: true, name: true, updatedAt: true,
    }, orderBy: { updatedAt: 'desc' }, skip, take }) : [],
    includeDocuments ? database.document.count({ where: documentWhere }) : 0,
    includeTemplates ? database.template.count({ where: templateWhere }) : 0,
    database.document.aggregate({ where: { AND: [documentReadScope(actor) as Prisma.DocumentWhereInput, { status: { in: [DocumentStatus.ARCHIVED, DocumentStatus.DISPOSED] } }] }, _count: true, _sum: { fileSize: true } }),
    actor.capabilities.includes('templates.read') ? database.template.count({ where: { AND: [templateReadScope(actor) as Prisma.TemplateWhereInput, { status: { in: ['ARCHIVED', 'Archived'] } }] } }) : 0,
    database.document.count({ where: { AND: [documentReadScope(actor) as Prisma.DocumentWhereInput, { status: DocumentStatus.ARCHIVED }, { archivedAt: { gte: new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)) } }] } }),
    actor.capabilities.includes('templates.read') ? database.template.count({ where: { AND: [templateReadScope(actor) as Prisma.TemplateWhereInput, { status: { in: ['ARCHIVED', 'Archived'] }, updatedAt: { gte: new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)) } }] } }) : 0,
    database.document.count({ where: { AND: [documentReadScope(actor) as Prisma.DocumentWhereInput, { status: DocumentStatus.ARCHIVED, legalHoldAt: { not: null } }] } }),
    database.documentDispositionRequest.count({ where: { status: 'PENDING', document: documentReadScope(actor) as Prisma.DocumentWhereInput } }),
    database.document.count({ where: { AND: [documentReadScope(actor) as Prisma.DocumentWhereInput, { status: DocumentStatus.DISPOSED }] } }),
  ]);

  const items = [
    ...documents.map((document) => {
      const disposition = document.dispositionRequests[0] ?? null;
      return {
        id: document.id, kind: 'Document' as const, name: document.title, code: document.code, status: document.status,
        archivedBy: document.archivedBy, archivedAt: document.archivedAt, reason: document.archiveReason, size: document.fileSize,
        retentionUntil: document.retentionUntil, retentionPolicy: document.retentionPolicy,
        legalHoldAt: document.legalHoldAt, legalHoldByName: document.legalHoldByName, legalHoldReason: document.legalHoldReason,
        disposedAt: document.disposedAt, disposition,
        canRequestDisposition: actor.capabilities.includes('records.disposition.request') && document.status === DocumentStatus.ARCHIVED
          && !document.legalHoldAt && Boolean(document.retentionUntil && document.retentionUntil.getTime() <= Date.now())
          && disposition?.status !== 'PENDING',
        canReviewDisposition: actor.capabilities.includes('records.disposition.approve') && disposition?.status === 'PENDING'
          && disposition.requestedById !== actor.id,
      };
    }),
    ...templates.map((template) => ({ id: template.id, kind: 'Template' as const, name: template.name, code: `TPL-${template.id.slice(0, 8).toUpperCase()}`, archivedBy: null, archivedAt: template.updatedAt, reason: 'Template archived', size: null })),
  ].sort((left, right) => new Date(right.archivedAt || 0).getTime() - new Date(left.archivedAt || 0).getTime());
  const total = documentTotal + templateTotal;
  return {
    data: module === 'ALL' ? items.slice(offset, offset + limit) : items,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    stats: {
      total: documentStats._count + templateStatsTotal,
      documents: documentStats._count,
      templates: templateStatsTotal,
      storageBytes: documentStats._sum.fileSize ?? 0,
      thisMonth: documentsThisMonth + templatesThisMonth,
      legalHolds,
      pendingDispositions,
      disposed,
    },
  };
}
