import { Router, Request, Response } from 'express';
import { prisma } from '../db';
import { authMiddleware } from '../middleware/auth';
import { routeParam } from '../utils';
import {
  deleteTenantUpload,
  InvalidUploadError,
  saveBase64Upload,
  UploadTooLargeError,
} from '../lib/uploads';
import { sendTenantPrivateFile } from '../lib/privateFiles';
import {
  addDocumentComment,
  getDocumentCommentAttachment,
  listDocumentComments,
  moderateDocumentComment,
  DocumentCommentError,
  getDocumentDetail,
  indexDocumentAttachmentFile,
  indexDocumentPrimaryFile,
  uploadDocumentFile,
  DocumentUploadError,
} from '../modules/documents';
import { requireCapability } from '../modules/access-control';

const router = Router();

router.get('/:id/comments', authMiddleware, requireCapability('documents.read'), async (req: Request, res: Response) => {
  const id = routeParam(req.params.id);
  try {
    res.json(await listDocumentComments(prisma, req.user!, id));
  } catch (error) {
    if (error instanceof DocumentCommentError && error.code === 'NOT_FOUND') return res.status(404).json({ error: 'Document not found' });
    throw error;
  }
});

router.post('/:id/comments', authMiddleware, requireCapability('documents.read'), async (req: Request, res: Response) => {
  const id = routeParam(req.params.id);
  const { text, attachedDocumentId, file } = req.body as {
    text?: string;
    attachedDocumentId?: string;
    file?: { fileName: string; fileType?: string; data: string };
  };
  let savedFile: ReturnType<typeof saveBase64Upload> | undefined;
  if (file) {
    if (!file.fileName || !file.data) return res.status(400).json({ error: 'fileName and data are required for file upload' });
    try {
      savedFile = saveBase64Upload(file.fileName, file.data, file.fileType, 'comments');
    } catch (error) {
      if (error instanceof UploadTooLargeError || error instanceof InvalidUploadError) return res.status(400).json({ error: error.message });
      throw error;
    }
  }

  try {
    const comment = await addDocumentComment(prisma, req.user!, id, { text, attachedDocumentId, file: savedFile });
    res.status(201).json(comment);
  } catch (error) {
    if (savedFile) {
      try { deleteTenantUpload(savedFile.filePath, 'comments'); } catch { /* preserve original error */ }
    }
    if (!(error instanceof DocumentCommentError)) throw error;
    if (error.code === 'INVALID_INPUT') return res.status(400).json({ error: 'Provide comment text, a document, or one file attachment' });
    if (error.code === 'NOT_FOUND') return res.status(404).json({ error: 'Document not found' });
    if (error.code === 'FORBIDDEN') return res.status(403).json({ error: 'Attached document not found or not accessible' });
  }
});

router.get('/:id/comments/:commentId/attachment', authMiddleware, requireCapability('documents.read'), async (req: Request, res: Response) => {
  const documentId = routeParam(req.params.id);
  const commentId = routeParam(req.params.commentId);
  try {
    const attachment = await getDocumentCommentAttachment(prisma, req.user!, documentId, commentId);
    return sendTenantPrivateFile(res, attachment.filePath, attachment.fileName);
  } catch (error) {
    if (error instanceof DocumentCommentError && error.code === 'NOT_FOUND') return res.status(404).json({ error: 'Attachment not found' });
    throw error;
  }
});

router.patch('/:id/comments/:commentId', authMiddleware, requireCapability('documents.read'), async (req: Request, res: Response) => {
  const documentId = routeParam(req.params.id);
  const commentId = routeParam(req.params.commentId);
  try {
    res.json(await moderateDocumentComment(prisma, req.user!, documentId, commentId, String(req.body.status)));
  } catch (error) {
    if (!(error instanceof DocumentCommentError)) throw error;
    if (error.code === 'INVALID_INPUT') return res.status(400).json({ error: 'Invalid comment status' });
    if (error.code === 'NOT_FOUND') return res.status(404).json({ error: 'Comment not found' });
    if (error.code === 'FORBIDDEN') return res.status(403).json({ error: 'Forbidden' });
  }
});

router.post('/:id/upload', authMiddleware, requireCapability('documents.read', 'documents.update'), async (req: Request, res: Response) => {
  const id = routeParam(req.params.id);
  const { fileName, fileType, data, isAttachment } = req.body;
  if (!fileName || !data) return res.status(400).json({ error: 'fileName and data required' });
  try {
    const result = await uploadDocumentFile(
      prisma,
      req.user!,
      id,
      { isAttachment: Boolean(isAttachment) },
      {
        save: () => saveBase64Upload(String(fileName), String(data), fileType, 'documents'),
        remove: (filePath) => deleteTenantUpload(filePath, 'documents'),
      },
    );
    if (result.kind === 'attachment') {
      const { attachment } = result;
      let searchIndex: { status: string; indexedAt: Date | null; errorCode: string | null } | null = null;
      try {
        const indexed = await indexDocumentAttachmentFile(prisma, id, attachment.id);
        if (indexed) searchIndex = {
          status: indexed.status,
          indexedAt: indexed.indexedAt,
          errorCode: indexed.errorCode,
        };
      } catch (indexError) {
        console.error('Document attachment search indexing failed after upload', {
          documentId: id,
          attachmentId: attachment.id,
          error: indexError instanceof Error ? indexError.name : 'UnknownError',
        });
      }
      return res.status(201).json({
        id: attachment.id,
        documentId: attachment.documentId,
        fileName: attachment.fileName,
        fileSize: attachment.fileSize,
        fileType: attachment.fileType,
        createdAt: attachment.createdAt,
        canDownload: true,
        downloadUrl: `/files/documents/${id}/attachments/${attachment.id}`,
        searchIndex,
      });
    }
    try {
      await indexDocumentPrimaryFile(prisma, id);
    } catch (indexError) {
      // The primary upload is already committed. Indexing is recoverable and
      // must not turn a valid upload into an apparent failure/retry.
      console.error('Document search indexing failed after upload', {
        documentId: id,
        error: indexError instanceof Error ? indexError.name : 'UnknownError',
      });
    }
    res.json(await getDocumentDetail(prisma, req.user!, id));
  } catch (error) {
    if (error instanceof UploadTooLargeError || error instanceof InvalidUploadError) return res.status(400).json({ error: error.message });
    if (!(error instanceof DocumentUploadError)) throw error;
    if (error.code === 'INVALID_INPUT') return res.status(400).json({ error: 'Invalid file upload' });
    if (error.code === 'NOT_FOUND') return res.status(404).json({ error: 'Document not found' });
    if (error.code === 'FORBIDDEN') return res.status(403).json({ error: 'Forbidden' });
    if (error.code === 'LOCKED') return res.status(409).json({ error: 'Document files cannot be changed after review starts' });
    if (error.code === 'CONFLICT') return res.status(409).json({ error: 'Document changed; reload and try again' });
  }
});

export default router;
