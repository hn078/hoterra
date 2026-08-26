import {
  AuditAction,
  DocumentCategory,
  DocumentPriority,
  DocumentStatus,
  Prisma,
} from '@prisma/client';
import type * as DatabaseModule from '../../../db';
import type { AuthUser } from '../../../middleware/auth';
import { formatWorkflow } from '../../workflow';
import {
  canDownloadDocument,
  canReadDocument,
  documentApprovalActionScope,
  documentReadScope,
} from '../domain/documentPolicy';
import { toDocumentCommentDto } from './manageDocumentComments';

type DocumentDatabase = typeof DatabaseModule.prisma;
export type DocumentReadErrorCode = 'INVALID_INPUT' | 'FORBIDDEN' | 'NOT_FOUND' | 'EXPORT_TOO_LARGE';

export class DocumentReadError extends Error {
  constructor(public readonly code: DocumentReadErrorCode, public readonly detail?: string) {
    super(code);
    this.name = 'DocumentReadError';
  }
}

const departmentSelect = { id: true, name: true, code: true, color: true } as const;
const userSelect = { id: true, firstName: true, lastName: true, role: true } as const;
const documentSummarySelect = {
  id: true,
  title: true,
  code: true,
  version: true,
  description: true,
  status: true,
  category: true,
  priority: true,
  language: true,
  tags: true,
  departmentId: true,
  authorId: true,
  ownerId: true,
  nextReviewDate: true,
  effectiveDate: true,
  isLocked: true,
  pageCount: true,
  allowDownload: true,
  allowComments: true,
  createdAt: true,
  updatedAt: true,
  department: { select: departmentSelect },
  author: { select: userSelect },
  owner: { select: userSelect },
} satisfies Prisma.DocumentSelect;

const attachedDocumentSelect = {
  id: true,
  tenantId: true,
  title: true,
  code: true,
  status: true,
  departmentId: true,
  authorId: true,
  ownerId: true,
} as const;

const documentDetailSelect = {
  ...documentSummarySelect,
  tenantId: true,
  content: true,
  filePath: true,
  fileName: true,
  fileType: true,
  fileSize: true,
  searchIndexes: {
    where: { sourceType: 'PRIMARY' as const },
    select: { status: true, sourceFileName: true, indexedAt: true, errorCode: true },
    take: 1,
  },
  archiveReason: true,
  archivedAt: true,
  archivedBy: true,
  signaturePlacement: true,
  approvalCycle: true,
  history: {
    select: { id: true, action: true, details: true, userId: true, userName: true, createdAt: true },
    orderBy: { createdAt: 'desc' as const },
  },
  signatures: {
    select: {
      id: true,
      userId: true,
      fullName: true,
      position: true,
      signedAt: true,
      docHash: true,
      documentVersion: true,
      approvalCycle: true,
      imagePath: true,
      placementId: true,
      page: true,
      user: { select: userSelect },
    },
    orderBy: { signedAt: 'asc' as const },
  },
  versions: {
    select: { id: true, version: true, changeNote: true, createdBy: true, createdAt: true },
    orderBy: { createdAt: 'desc' as const },
  },
  comments: {
    select: {
      id: true,
      documentId: true,
      userId: true,
      text: true,
      status: true,
      createdAt: true,
      attachmentFileName: true,
      attachmentFilePath: true,
      attachmentFileSize: true,
      attachmentFileType: true,
      user: { select: { id: true, firstName: true, lastName: true } },
      attachedDocument: { select: attachedDocumentSelect },
    },
    orderBy: { createdAt: 'desc' as const },
  },
  attachments: {
    select: {
      id: true,
      documentId: true,
      fileName: true,
      fileSize: true,
      fileType: true,
      createdAt: true,
      searchIndex: { select: { status: true, indexedAt: true, errorCode: true } },
    },
    orderBy: { createdAt: 'desc' as const },
  },
  workflow: {
    select: { id: true, name: true, description: true, steps: true, isDefault: true, status: true, createdAt: true },
  },
} satisfies Prisma.DocumentSelect;

type DocumentSummary = Prisma.DocumentGetPayload<{ select: typeof documentSummarySelect }>;

function tags(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string').slice(0, 50) : [];
  } catch {
    return [];
  }
}

function summaryDto(document: DocumentSummary) {
  return { ...document, tags: tags(document.tags) };
}

function singleString(value: unknown, name: string, maxLength = 200): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') throw new DocumentReadError('INVALID_INPUT', `${name} must be a string`);
  const clean = value.trim();
  if (!clean || clean.length > maxLength) throw new DocumentReadError('INVALID_INPUT', `Invalid ${name}`);
  return clean;
}

function positiveInteger(value: unknown, fallback: number, max: number, name: string): number {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    throw new DocumentReadError('INVALID_INPUT', `${name} must be a positive integer`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > max) {
    throw new DocumentReadError('INVALID_INPUT', `${name} must be between 1 and ${max}`);
  }
  return parsed;
}

function enumValue<T extends string>(value: unknown, values: readonly T[], name: string): T | undefined {
  const clean = singleString(value, name, 100);
  if (!clean) return undefined;
  if (!values.includes(clean as T)) throw new DocumentReadError('INVALID_INPUT', `Invalid ${name}`);
  return clean as T;
}

function documentFilters(query: Record<string, unknown>): Prisma.DocumentWhereInput[] {
  const filters: Prisma.DocumentWhereInput[] = [];
  const departmentId = singleString(query.departmentId, 'departmentId', 100);
  const authorId = singleString(query.authorId, 'authorId', 100);
  const category = enumValue(query.category, Object.values(DocumentCategory), 'category');
  const status = enumValue(query.status, Object.values(DocumentStatus), 'status');
  const priority = enumValue(query.priority, Object.values(DocumentPriority), 'priority');
  const search = singleString(query.search, 'search', 200);
  if (departmentId) filters.push({ departmentId });
  if (authorId) filters.push({ authorId });
  if (category) filters.push({ category });
  if (status) filters.push({ status });
  else filters.push({ status: { notIn: [DocumentStatus.ARCHIVED, DocumentStatus.DISPOSED] } });
  if (priority) filters.push({ priority });
  if (search) filters.push({ OR: [
    { title: { contains: search, mode: 'insensitive' } },
    { code: { contains: search, mode: 'insensitive' } },
    { description: { contains: search, mode: 'insensitive' } },
  ] });
  return filters;
}

export async function listDocuments(database: DocumentDatabase, actor: AuthUser, query: Record<string, unknown>) {
  if (!actor.capabilities.includes('documents.read')) throw new DocumentReadError('FORBIDDEN');
  const page = positiveInteger(query.page, 1, 100_000, 'page');
  const limit = positiveInteger(query.limit, 20, 100, 'limit');
  const where: Prisma.DocumentWhereInput = {
    AND: [documentReadScope(actor) as Prisma.DocumentWhereInput, ...documentFilters(query)],
  };
  const [documents, total] = await Promise.all([
    database.document.findMany({
      where,
      select: documentSummarySelect,
      orderBy: { updatedAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    database.document.count({ where }),
  ]);
  return {
    data: documents.map(summaryDto),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

const approvalTabs = ['pending', 'approved', 'rejected', 'returned', 'completed'] as const;
type ApprovalTab = typeof approvalTabs[number];

function approvalWhere(actor: AuthUser, tab: ApprovalTab, now: Date): Prisma.DocumentWhereInput {
  if (tab === 'pending') return documentApprovalActionScope(actor) as Prisma.DocumentWhereInput;
  const readScope = documentReadScope(actor) as Prisma.DocumentWhereInput;
  if (tab === 'approved') return { AND: [readScope, { history: { some: { userId: actor.id, action: 'Approved' } } }] };
  if (tab === 'rejected') return { AND: [readScope, { history: { some: { userId: actor.id, action: 'Rejected' } } }] };
  if (tab === 'returned') return { AND: [readScope, { history: { some: { userId: actor.id, action: 'Returned for changes' } } }] };
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  return {
    AND: [
      readScope,
      { status: { in: [DocumentStatus.PUBLISHED, DocumentStatus.REJECTED, DocumentStatus.ARCHIVED] } },
      { updatedAt: { gte: ninetyDaysAgo } },
      { history: { some: { userId: actor.id } } },
    ],
  };
}

export async function listDocumentApprovals(
  database: DocumentDatabase,
  actor: AuthUser,
  query: Record<string, unknown>,
  now = new Date(),
) {
  if (!actor.capabilities.includes('approvals.read')) throw new DocumentReadError('FORBIDDEN');
  const tabValue = singleString(query.tab, 'tab', 20) || 'pending';
  if (!approvalTabs.includes(tabValue as ApprovalTab)) throw new DocumentReadError('INVALID_INPUT', 'Invalid approval tab');
  const tab = tabValue as ApprovalTab;
  const page = positiveInteger(query.page, 1, 100_000, 'page');
  const limit = positiveInteger(query.limit, 20, 100, 'limit');
  const where = approvalWhere(actor, tab, now);
  const countWheres = approvalTabs.map((item) => approvalWhere(actor, item, now));
  const [documents, total, ...counts] = await Promise.all([
    database.document.findMany({
      where,
      select: documentSummarySelect,
      orderBy: { updatedAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    database.document.count({ where }),
    ...countWheres.map((countWhere) => database.document.count({ where: countWhere })),
  ]);
  return {
    data: documents.map(summaryDto),
    counts: Object.fromEntries(approvalTabs.map((name, index) => [name, counts[index]])),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

export async function getDocumentDetail(database: DocumentDatabase, actor: AuthUser, documentId: string) {
  if (!actor.capabilities.includes('documents.read')) throw new DocumentReadError('FORBIDDEN');
  const document = await database.document.findUnique({ where: { id: documentId }, select: documentDetailSelect });
  if (!document || !canReadDocument(actor, document)) throw new DocumentReadError('NOT_FOUND');
  const canDownload = canDownloadDocument(actor, document);
  return {
    id: document.id,
    title: document.title,
    code: document.code,
    version: document.version,
    description: document.description,
    content: document.content,
    status: document.status,
    category: document.category,
    priority: document.priority,
    language: document.language,
    tags: tags(document.tags),
    departmentId: document.departmentId,
    department: document.department,
    authorId: document.authorId,
    author: document.author,
    owner: document.owner,
    nextReviewDate: document.nextReviewDate,
    effectiveDate: document.effectiveDate,
    archiveReason: document.archiveReason,
    archivedAt: document.archivedAt,
    archivedBy: document.archivedBy,
    isLocked: document.isLocked,
    pageCount: document.pageCount,
    signaturePlacement: document.signaturePlacement,
    allowDownload: document.allowDownload,
    allowComments: document.allowComments,
    hasFile: Boolean(document.filePath),
    fileName: document.fileName,
    fileType: document.fileType,
    fileSize: document.fileSize,
    searchIndex: document.searchIndexes[0] ?? null,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
    history: document.history,
    signatures: document.signatures
      .filter((signature) => signature.documentVersion === document.version)
      .filter((signature) => signature.approvalCycle === document.approvalCycle)
      .map(({ imagePath, ...signature }) => ({ ...signature, hasImage: Boolean(imagePath) })),
    versions: document.versions,
    comments: document.comments.map((comment) => toDocumentCommentDto(comment, actor)),
    attachments: document.attachments.map((attachment) => ({
      ...attachment,
      canDownload,
      downloadUrl: canDownload ? `/files/documents/${document.id}/attachments/${attachment.id}` : null,
    })),
    workflow: document.workflow ? formatWorkflow(document.workflow) : null,
  };
}

export async function listRelatedDocuments(database: DocumentDatabase, actor: AuthUser, documentId: string) {
  if (!actor.capabilities.includes('documents.read')) throw new DocumentReadError('FORBIDDEN');
  const document = await database.document.findUnique({
    where: { id: documentId },
    select: { tenantId: true, id: true, departmentId: true, category: true, tags: true, authorId: true, ownerId: true, status: true },
  });
  if (!document || !canReadDocument(actor, document)) throw new DocumentReadError('NOT_FOUND');
  const firstTag = tags(document.tags)[0];
  const similarities: Prisma.DocumentWhereInput[] = [{ departmentId: document.departmentId }, { category: document.category }];
  if (firstTag) similarities.push({ tags: { contains: JSON.stringify(firstTag) } });
  const related = await database.document.findMany({
    where: {
      AND: [
        documentReadScope(actor) as Prisma.DocumentWhereInput,
        { id: { not: documentId }, OR: similarities },
      ],
    },
    select: documentSummarySelect,
    take: 10,
    orderBy: { updatedAt: 'desc' },
  });
  return related.map(summaryDto);
}

function csvCell(value: unknown): string {
  let text = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@]/.test(text.trimStart())) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export async function exportDocumentsCsv(database: DocumentDatabase, actor: AuthUser, query: Record<string, unknown>) {
  if (!actor.capabilities.includes('documents.export')) throw new DocumentReadError('FORBIDDEN');
  const where: Prisma.DocumentWhereInput = {
    AND: [documentReadScope(actor) as Prisma.DocumentWhereInput, ...documentFilters(query)],
  };
  return database.$transaction(async (transaction) => {
    const documents = await transaction.document.findMany({
      where,
      select: {
        code: true,
        title: true,
        category: true,
        status: true,
        version: true,
        updatedAt: true,
        department: { select: { name: true } },
        author: { select: { firstName: true, lastName: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 5001,
    });
    if (documents.length > 5000) throw new DocumentReadError('EXPORT_TOO_LARGE', 'Narrow the filters before exporting');
    await transaction.auditLog.create({
      data: {
        userId: actor.id,
        userName: `${actor.firstName} ${actor.lastName}`,
        action: AuditAction.DOWNLOAD,
        entityType: 'DocumentExport',
        details: `Exported ${documents.length} document summary row(s)`,
      },
    });
    const header = ['Code', 'Title', 'Department', 'Category', 'Status', 'Version', 'Author', 'Updated'];
    const rows = documents.map((document) => [
      document.code,
      document.title,
      document.department.name,
      document.category,
      document.status,
      document.version,
      `${document.author.firstName} ${document.author.lastName}`,
      document.updatedAt.toISOString(),
    ]);
    return `\uFEFF${[header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
  });
}
