import { Router } from 'express';
import { prisma } from '../db';
import { authMiddleware } from '../middleware/auth';
import { asyncHandler } from '../lib/asyncHandler';
import { sendTenantPrivateFile } from '../lib/privateFiles';
import {
  DocumentFileError,
  getDocumentAttachmentFile,
  getDocumentSignatureEvidenceFile,
  getPrimaryDocumentFile,
} from '../modules/documents';
import { getOwnSignatureFile, OwnSignatureFileError } from '../modules/identity';
import { routeParam } from '../utils';

const router = Router();

router.get('/documents/:id', authMiddleware, asyncHandler(async (req, res) => {
  try {
    const file = await getPrimaryDocumentFile(prisma, req.user!, routeParam(req.params.id));
    return sendTenantPrivateFile(res, file.filePath, file.fileName, file.inline);
  } catch (error) {
    if (error instanceof DocumentFileError) return res.status(404).json({ error: 'File not found' });
    throw error;
  }
}));

router.get('/documents/:id/attachments/:attachmentId', authMiddleware, asyncHandler(async (req, res) => {
  const documentId = routeParam(req.params.id);
  const attachmentId = routeParam(req.params.attachmentId);
  try {
    const file = await getDocumentAttachmentFile(prisma, req.user!, documentId, attachmentId);
    return sendTenantPrivateFile(res, file.filePath, file.fileName, file.inline);
  } catch (error) {
    if (error instanceof DocumentFileError) return res.status(404).json({ error: 'File not found' });
    throw error;
  }
}));

router.get('/signatures/:id', authMiddleware, asyncHandler(async (req, res) => {
  try {
    const file = await getDocumentSignatureEvidenceFile(prisma, req.user!, routeParam(req.params.id));
    return sendTenantPrivateFile(res, file.filePath, file.fileName, file.inline);
  } catch (error) {
    if (error instanceof DocumentFileError) return res.status(404).json({ error: 'Signature not found' });
    throw error;
  }
}));

router.get('/users/:id/signature', authMiddleware, asyncHandler(async (req, res) => {
  const userId = routeParam(req.params.id);
  try {
    const file = await getOwnSignatureFile(prisma, req.user!, userId);
    return sendTenantPrivateFile(res, file.filePath, file.fileName, file.inline);
  } catch (error) {
    if (error instanceof OwnSignatureFileError) return res.status(404).json({ error: 'Signature not found' });
    throw error;
  }
}));

export default router;
