import { DocumentCategory, DocumentIndexStatus, DocumentStatus, Prisma } from '@prisma/client';
import type * as DatabaseModule from '../../../db';
import type { AuthUser } from '../../../middleware/auth';
import { documentReadScope } from '../../documents';
import { searchUserDirectory } from '../../identity';
import { searchDepartments } from '../../organization';
import { searchTemplates } from '../../templates';
import { searchWorkflows } from '../../workflow';
import { searchWorkforceRequests } from '../../workforce';

type SearchDatabase = typeof DatabaseModule.prisma;
type SearchType = 'all' | 'documents' | 'users' | 'departments' | 'templates' | 'workflows' | 'workforce';
type SearchIn = 'all' | 'title' | 'content';
type SearchSort = 'relevance' | 'date' | 'name';

export class GlobalSearchError extends Error {
  constructor(public readonly code: 'FORBIDDEN' | 'INVALID_INPUT', public readonly detail?: string) {
    super(code);
    this.name = 'GlobalSearchError';
  }
}

export interface GlobalSearchInput {
  q?: unknown;
  type?: unknown;
  module?: unknown;
  searchIn?: unknown;
  fileType?: unknown;
  dateRange?: unknown;
  createdBy?: unknown;
  departmentId?: unknown;
  category?: unknown;
  status?: unknown;
  includeArchived?: unknown;
  sort?: unknown;
}

const SEARCH_TYPES = new Set<SearchType>(['all', 'documents', 'users', 'departments', 'templates', 'workflows', 'workforce']);
const SEARCH_IN = new Set<SearchIn>(['all', 'title', 'content']);
const SEARCH_SORT = new Set<SearchSort>(['relevance', 'date', 'name']);
const DATE_RANGES: Record<string, number> = { '7d': 7, '30d': 30, '90d': 90 };
const FILE_TYPES = new Set(['pdf', 'docx', 'xlsx', 'txt', 'csv']);

function choice<T extends string>(value: unknown, allowed: Set<T>, fallback: T, label: string): T {
  const normalized = String(value ?? fallback).trim().toLowerCase() as T;
  if (!allowed.has(normalized)) throw new GlobalSearchError('INVALID_INPUT', `${label} is invalid`);
  return normalized;
}

function optionalId(value: unknown) {
  if (value === undefined || value === null || value === '' || value === 'all') return undefined;
  const result = String(value).trim();
  if (!/^[0-9a-f-]{36}$/i.test(result)) throw new GlobalSearchError('INVALID_INPUT', 'Department filter is invalid');
  return result;
}

function dateFrom(value: unknown, now: Date) {
  const normalized = String(value ?? 'all').trim().toLowerCase();
  if (normalized === 'all' || normalized === 'custom') return undefined;
  const days = DATE_RANGES[normalized];
  if (!days) throw new GlobalSearchError('INVALID_INPUT', 'Date range is invalid');
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

function enumValue<T extends string>(value: unknown, values: readonly T[], label: string): T | undefined {
  if (value === undefined || value === null || value === '' || value === 'all') return undefined;
  const normalized = String(value).trim().toUpperCase() as T;
  if (!values.includes(normalized)) throw new GlobalSearchError('INVALID_INPUT', `${label} is invalid`);
  return normalized;
}

function booleanValue(value: unknown) {
  return value === true || String(value).toLowerCase() === 'true';
}

function parseTags(raw: string) {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String).slice(0, 50) : [];
  } catch {
    return [];
  }
}

const documentSearchSelect = {
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
  department: { select: { id: true, name: true, code: true, color: true } },
  authorId: true,
  author: { select: { id: true, firstName: true, lastName: true } },
  nextReviewDate: true,
  effectiveDate: true,
  isLocked: true,
  pageCount: true,
  createdAt: true,
  updatedAt: true,
} as const;

function emptyResult() {
  return { documents: [], users: [], departments: [], templates: [], workflows: [], workforce: [], total: 0 };
}

export async function globalSearch(
  database: SearchDatabase,
  actor: AuthUser,
  input: GlobalSearchInput,
  now = new Date(),
) {
  if (!actor.capabilities.includes('search.use')) throw new GlobalSearchError('FORBIDDEN');
  const query = String(input.q ?? '').trim();
  if (!query) return emptyResult();
  if (query.length > 200) throw new GlobalSearchError('INVALID_INPUT', 'Search query is too long');

  const requestedType = choice(input.type, SEARCH_TYPES, 'all', 'Search type');
  const requestedModule = choice(input.module, SEARCH_TYPES, 'all', 'Module');
  const type = requestedType === 'all' && requestedModule !== 'all' ? requestedModule : requestedType;
  const searchIn = choice(input.searchIn, SEARCH_IN, 'all', 'Search field');
  const sort = choice(input.sort, SEARCH_SORT, 'relevance', 'Sort');
  const fileType = input.fileType === undefined || input.fileType === 'all'
    ? undefined
    : choice(input.fileType, FILE_TYPES, 'pdf', 'File type');
  const from = dateFrom(input.dateRange, now);
  const departmentId = optionalId(input.departmentId);
  const category = enumValue(input.category, Object.values(DocumentCategory), 'Category');
  const status = enumValue(input.status, Object.values(DocumentStatus), 'Status');
  const includeArchived = booleanValue(input.includeArchived);
  const createdByMe = String(input.createdBy ?? 'all').toLowerCase() === 'me';
  if (!['all', 'me'].includes(String(input.createdBy ?? 'all').toLowerCase())) {
    throw new GlobalSearchError('INVALID_INPUT', 'Created-by filter is invalid');
  }

  const searchFields: Prisma.DocumentWhereInput[] = searchIn === 'title'
    ? [{ title: { contains: query, mode: 'insensitive' } }, { code: { contains: query, mode: 'insensitive' } }]
    : searchIn === 'content'
      ? [
          { content: { contains: query, mode: 'insensitive' } },
          { description: { contains: query, mode: 'insensitive' } },
          { searchIndexes: { some: { status: DocumentIndexStatus.READY, extractedText: { contains: query, mode: 'insensitive' } } } },
        ]
      : [
          { title: { contains: query, mode: 'insensitive' } },
          { code: { contains: query, mode: 'insensitive' } },
          { description: { contains: query, mode: 'insensitive' } },
          { content: { contains: query, mode: 'insensitive' } },
          { searchIndexes: { some: { status: DocumentIndexStatus.READY, extractedText: { contains: query, mode: 'insensitive' } } } },
        ];
  const fileFilter: Prisma.DocumentWhereInput[] = fileType ? [{
    OR: [
      { fileType: { contains: fileType, mode: 'insensitive' } },
      { fileName: { endsWith: `.${fileType}`, mode: 'insensitive' } },
      {
        attachments: {
          some: {
            OR: [
              { fileType: { contains: fileType, mode: 'insensitive' } },
              { fileName: { endsWith: `.${fileType}`, mode: 'insensitive' } },
            ],
          },
        },
      },
    ],
  }] : [];
  const documentWhere: Prisma.DocumentWhereInput = {
    AND: [
      documentReadScope(actor) as Prisma.DocumentWhereInput,
      { OR: searchFields },
      ...(!includeArchived ? [{ status: { notIn: [DocumentStatus.ARCHIVED, DocumentStatus.DISPOSED] } } as Prisma.DocumentWhereInput] : [{ status: { not: DocumentStatus.DISPOSED } } as Prisma.DocumentWhereInput]),
      ...(departmentId ? [{ departmentId }] : []),
      ...(category ? [{ category }] : []),
      ...(status ? [{ status }] : []),
      ...fileFilter,
      ...(from ? [{ updatedAt: { gte: from } }] : []),
      ...(createdByMe ? [{ authorId: actor.id }] : []),
    ],
  };
  const documentOrder: Prisma.DocumentOrderByWithRelationInput[] = sort === 'name'
    ? [{ title: 'asc' }]
    : [{ updatedAt: 'desc' }];
  const sharedOptions = { includeArchived, dateFrom: from, departmentId, sort };
  const includes = (candidate: SearchType) => type === 'all' || type === candidate;

  const [documents, users, departments, templates, workflows, workforce] = await Promise.all([
    includes('documents') && actor.capabilities.includes('documents.read')
      ? database.document.findMany({ where: documentWhere, select: documentSearchSelect, orderBy: documentOrder, take: 20 })
      : [],
    includes('users')
      ? searchUserDirectory(database, actor, query, { dateFrom: from, departmentId })
      : [],
    includes('departments')
      ? searchDepartments(database, actor, query, { departmentId })
      : [],
    includes('templates')
      ? searchTemplates(database, actor, query, sharedOptions)
      : [],
    includes('workflows')
      ? searchWorkflows(database, actor, query, sharedOptions)
      : [],
    includes('workforce')
      ? searchWorkforceRequests(database, actor, query, sharedOptions)
      : [],
  ]);

  const documentIds = documents.map(({ id }) => id);
  const [indexSummaries, matchedIndexes] = documentIds.length ? await Promise.all([
    database.documentSearchIndex.findMany({
      where: { documentId: { in: documentIds } },
      select: { documentId: true, sourceType: true, sourceFileName: true, status: true, indexedAt: true },
    }),
    searchIn === 'title' ? Promise.resolve([]) : database.documentSearchIndex.findMany({
      where: {
        documentId: { in: documentIds },
        status: DocumentIndexStatus.READY,
        extractedText: { contains: query, mode: 'insensitive' },
      },
      select: { documentId: true, sourceType: true, sourceFileName: true, status: true, indexedAt: true },
    }),
  ]) : [[], []];
  const statusPriority = [
    DocumentIndexStatus.READY,
    DocumentIndexStatus.PENDING,
    DocumentIndexStatus.OCR_REQUIRED,
    DocumentIndexStatus.FAILED,
    DocumentIndexStatus.UNSUPPORTED,
    DocumentIndexStatus.EMPTY,
  ];

  const result = {
    documents: documents.map((document) => {
      const indexes = indexSummaries.filter((index) => index.documentId === document.id);
      const matching = matchedIndexes.filter((index) => index.documentId === document.id);
      const aggregateStatus = statusPriority.find((candidate) => indexes.some(({ status: value }) => value === candidate)) ?? null;
      const indexedAt = indexes
        .map((index) => index.indexedAt)
        .filter((value): value is Date => Boolean(value))
        .sort((left, right) => right.getTime() - left.getTime())[0] ?? null;
      return {
        ...document,
        tags: parseTags(document.tags),
        matchedInUploadedFile: matching.length > 0,
        matchedInAttachment: matching.some(({ sourceType }) => sourceType === 'ATTACHMENT'),
        matchedFileNames: matching.flatMap(({ sourceFileName }) => sourceFileName ? [sourceFileName] : []),
        searchIndexStatus: aggregateStatus,
        indexedFileName: indexes.find(({ sourceType }) => sourceType === 'PRIMARY')?.sourceFileName ?? null,
        indexedAt,
      };
    }),
    users,
    departments,
    templates,
    workflows,
    workforce,
    total: documents.length + users.length + departments.length + templates.length + workflows.length + workforce.length,
  };
  return result;
}
