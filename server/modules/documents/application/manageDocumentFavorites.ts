import { Prisma } from '@prisma/client';
import type * as DatabaseModule from '../../../db';
import type { AuthUser } from '../../../middleware/auth';
import { canFavoriteDocument, canReadDocument, documentReadScope } from '../domain/documentPolicy';
type DocumentDatabase = typeof DatabaseModule.prisma;

export class DocumentFavoriteError extends Error {
  constructor(public readonly code: 'FORBIDDEN' | 'NOT_FOUND') {
    super(code);
    this.name = 'DocumentFavoriteError';
  }
}

const favoriteDocumentSelect = {
  id: true,
  tenantId: true,
  title: true,
  code: true,
  version: true,
  description: true,
  status: true,
  category: true,
  language: true,
  tags: true,
  departmentId: true,
  department: { select: { id: true, name: true, code: true, color: true } },
  authorId: true,
  author: { select: { id: true, firstName: true, lastName: true } },
  owner: { select: { id: true, firstName: true, lastName: true } },
  nextReviewDate: true,
  effectiveDate: true,
  isLocked: true,
  priority: true,
  allowDownload: true,
  allowComments: true,
  createdAt: true,
  updatedAt: true,
} as const;

function ensureRead(actor: AuthUser) {
  if (!actor.capabilities.includes('documents.read')) throw new DocumentFavoriteError('FORBIDDEN');
}

function tags(value: string) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((tag): tag is string => typeof tag === 'string') : [];
  } catch { return []; }
}

export async function listFavoriteDocumentIds(database: DocumentDatabase, actor: AuthUser) {
  ensureRead(actor);
  const favorites = await database.userFavorite.findMany({
    where: { userId: actor.id, document: { is: documentReadScope(actor) as Prisma.DocumentWhereInput } },
    select: { documentId: true },
    orderBy: { createdAt: 'desc' },
    take: 1000,
  });
  return favorites.map(({ documentId }) => documentId);
}

export async function listFavoriteDocuments(database: DocumentDatabase, actor: AuthUser) {
  ensureRead(actor);
  const favorites = await database.userFavorite.findMany({
    where: { userId: actor.id, document: { is: documentReadScope(actor) as Prisma.DocumentWhereInput } },
    select: { document: { select: favoriteDocumentSelect } },
    orderBy: { createdAt: 'desc' },
    take: 500,
  });
  return favorites.map(({ document }) => {
    const { tenantId: _tenantId, ...safe } = document;
    return { ...safe, tags: tags(document.tags) };
  });
}

export async function addDocumentFavorite(database: DocumentDatabase, actor: AuthUser, documentId: string) {
  ensureRead(actor);
  const document = await database.document.findUnique({ where: { id: documentId } });
  if (!document || !canFavoriteDocument(actor, document)) throw new DocumentFavoriteError('NOT_FOUND');
  await database.userFavorite.upsert({
    where: { userId_documentId: { userId: actor.id, documentId } }, update: {},
    create: { userId: actor.id, documentId },
  });
  return { ok: true };
}

export async function removeDocumentFavorite(database: DocumentDatabase, actor: AuthUser, documentId: string) {
  ensureRead(actor);
  await database.userFavorite.deleteMany({ where: { userId: actor.id, documentId } });
  return { ok: true };
}

export async function isDocumentFavorite(database: DocumentDatabase, actor: AuthUser, documentId: string) {
  ensureRead(actor);
  const document = await database.document.findUnique({ where: { id: documentId } });
  if (!document || !canReadDocument(actor, document)) return { isFavorite: false };
  const favorite = await database.userFavorite.findUnique({ where: { userId_documentId: { userId: actor.id, documentId } }, select: { id: true } });
  return { isFavorite: Boolean(favorite) };
}
