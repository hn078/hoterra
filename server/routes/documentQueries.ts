import { Router, type Response } from 'express';
import { prisma } from '../db';
import { authMiddleware } from '../middleware/auth';
import { asyncHandler } from '../lib/asyncHandler';
import { routeParam } from '../utils';
import {
  DocumentReadError,
  exportDocumentsCsv,
  getDocumentDetail,
  listDocumentApprovals,
  listDocuments,
  listRelatedDocuments,
} from '../modules/documents';
import { requireCapability } from '../modules/access-control';

const router = Router();

function sendDocumentReadError(error: DocumentReadError, res: Response) {
  if (error.code === 'INVALID_INPUT') return res.status(400).json({ error: error.detail || 'Invalid document query' });
  if (error.code === 'FORBIDDEN') return res.status(403).json({ error: 'Forbidden' });
  if (error.code === 'EXPORT_TOO_LARGE') return res.status(413).json({ error: error.detail });
  return res.status(404).json({ error: 'Document not found' });
}

router.get('/', authMiddleware, requireCapability('documents.read'), asyncHandler(async (req, res) => {
  try {
    return res.json(await listDocuments(prisma, req.user!, req.query));
  } catch (error) {
    if (error instanceof DocumentReadError) return sendDocumentReadError(error, res);
    throw error;
  }
}));

router.get('/approvals', authMiddleware, requireCapability('approvals.read'), asyncHandler(async (req, res) => {
  try {
    return res.json(await listDocumentApprovals(prisma, req.user!, req.query));
  } catch (error) {
    if (error instanceof DocumentReadError) return sendDocumentReadError(error, res);
    throw error;
  }
}));

router.get('/export/csv', authMiddleware, requireCapability('documents.export'), asyncHandler(async (req, res) => {
  try {
    const csv = await exportDocumentsCsv(prisma, req.user!, req.query);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="documents.csv"');
    return res.send(csv);
  } catch (error) {
    if (error instanceof DocumentReadError) return sendDocumentReadError(error, res);
    throw error;
  }
}));

router.get('/:id', authMiddleware, requireCapability('documents.read'), asyncHandler(async (req, res) => {
  try {
    return res.json(await getDocumentDetail(prisma, req.user!, routeParam(req.params.id)));
  } catch (error) {
    if (error instanceof DocumentReadError) return sendDocumentReadError(error, res);
    throw error;
  }
}));

router.get('/:id/related', authMiddleware, requireCapability('documents.read'), asyncHandler(async (req, res) => {
  try {
    return res.json(await listRelatedDocuments(prisma, req.user!, routeParam(req.params.id)));
  } catch (error) {
    if (error instanceof DocumentReadError) return sendDocumentReadError(error, res);
    throw error;
  }
}));

export default router;
