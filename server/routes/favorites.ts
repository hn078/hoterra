import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import { routeParam } from '../utils';
import { prisma } from '../db';
import { asyncHandler } from '../lib/asyncHandler';
import { requireCapability } from '../modules/access-control';
import {
  addDocumentFavorite,
  DocumentFavoriteError,
  isDocumentFavorite,
  listFavoriteDocumentIds,
  listFavoriteDocuments,
  removeDocumentFavorite,
} from '../modules/documents';

const router = Router();

function favoriteError(error: unknown, res: Response) {
  if (!(error instanceof DocumentFavoriteError)) throw error;
  return error.code === 'FORBIDDEN'
    ? res.status(403).json({ error: 'Forbidden' })
    : res.status(404).json({ error: 'Document not found' });
}

router.get('/', authMiddleware, requireCapability('documents.read'), asyncHandler(async (req: Request, res: Response) => {
  try { res.json(await listFavoriteDocumentIds(prisma, req.user!)); }
  catch (error) { return favoriteError(error, res); }
}));

router.get('/documents', authMiddleware, requireCapability('documents.read'), asyncHandler(async (req: Request, res: Response) => {
  try { res.json(await listFavoriteDocuments(prisma, req.user!)); }
  catch (error) { return favoriteError(error, res); }
}));

router.post('/:documentId', authMiddleware, requireCapability('documents.read'), asyncHandler(async (req: Request, res: Response) => {
  const documentId = routeParam(req.params.documentId);
  try { res.status(201).json(await addDocumentFavorite(prisma, req.user!, documentId)); }
  catch (error) { return favoriteError(error, res); }
}));

router.delete('/:documentId', authMiddleware, requireCapability('documents.read'), asyncHandler(async (req: Request, res: Response) => {
  const documentId = routeParam(req.params.documentId);
  try { res.json(await removeDocumentFavorite(prisma, req.user!, documentId)); }
  catch (error) { return favoriteError(error, res); }
}));

router.get('/check/:documentId', authMiddleware, requireCapability('documents.read'), asyncHandler(async (req: Request, res: Response) => {
  const documentId = routeParam(req.params.documentId);
  try { res.json(await isDocumentFavorite(prisma, req.user!, documentId)); }
  catch (error) { return favoriteError(error, res); }
}));

export default router;
