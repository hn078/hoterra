import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import { prisma } from '../db';
import { authMiddleware, canViewDocument } from '../middleware/auth';
import { asyncHandler } from '../lib/asyncHandler';
import { resolveUploadPath } from '../lib/uploads';
import { routeParam } from '../utils';

const router = Router();

function sendPrivateFile(res: import('express').Response, filePath: string, downloadName?: string | null, inline = false) {
  const absolutePath = resolveUploadPath(filePath);
  if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
    return res.status(404).json({ error: 'File not found' });
  }
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (inline) {
    res.type(path.extname(absolutePath));
    res.setHeader('Content-Disposition', 'inline');
    return res.sendFile(absolutePath);
  }
  return res.download(absolutePath, downloadName || path.basename(absolutePath));
}

router.get('/documents/:id', authMiddleware, asyncHandler(async (req, res) => {
  const document = await prisma.document.findUnique({ where: { id: routeParam(req.params.id) } });
  if (!document?.filePath || !canViewDocument(req.user!, document)) {
    return res.status(404).json({ error: 'File not found' });
  }
  return sendPrivateFile(res, document.filePath, document.fileName);
}));

router.get('/documents/:id/attachments/:attachmentId', authMiddleware, asyncHandler(async (req, res) => {
  const documentId = routeParam(req.params.id);
  const attachmentId = routeParam(req.params.attachmentId);
  const [document, attachment] = await Promise.all([
    prisma.document.findUnique({ where: { id: documentId } }),
    prisma.documentAttachment.findUnique({ where: { id: attachmentId } }),
  ]);
  if (!document || !attachment || attachment.documentId !== documentId || !canViewDocument(req.user!, document)) {
    return res.status(404).json({ error: 'File not found' });
  }
  return sendPrivateFile(res, attachment.filePath, attachment.fileName);
}));

router.get('/signatures/:id', authMiddleware, asyncHandler(async (req, res) => {
  const signature = await prisma.signature.findUnique({
    where: { id: routeParam(req.params.id) },
    include: { document: { select: { departmentId: true } } },
  });
  if (!signature?.imagePath || !canViewDocument(req.user!, signature.document)) {
    return res.status(404).json({ error: 'Signature not found' });
  }
  return sendPrivateFile(res, signature.imagePath, null, true);
}));

router.get('/users/:id/signature', authMiddleware, asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: routeParam(req.params.id) } });
  if (!user?.signatureImage) return res.status(404).json({ error: 'Signature not found' });
  return sendPrivateFile(res, user.signatureImage, null, true);
}));

export default router;
