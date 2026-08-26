import { Router, Request, Response } from 'express';
import { prisma } from '../db';
import { authMiddleware } from '../middleware/auth';
import { routeParam } from '../utils';
import {
  archiveDocument,
  archiveDocuments,
  createDocumentVersion,
  getDocumentDetail,
  restoreDocument,
  DocumentLifecycleError,
} from '../modules/documents';
import { requireCapability } from '../modules/access-control';

const router = Router();

router.post('/bulk/archive', authMiddleware, requireCapability('documents.read', 'documents.archive'), async (req: Request, res: Response) => {
  const { ids, reason } = req.body as { ids: string[]; reason?: string };
  try {
    const count = await archiveDocuments(prisma, req.user!, ids || [], reason);
    res.json({ ok: true, count });
  } catch (error) {
    if (!(error instanceof DocumentLifecycleError)) throw error;
    if (error.code === 'INVALID_INPUT') return res.status(400).json({ error: 'Provide 1 to 100 unique document ids' });
    if (error.code === 'NOT_FOUND') return res.status(404).json({ error: 'One or more documents were not found' });
    if (error.code === 'FORBIDDEN') return res.status(403).json({ error: 'Forbidden' });
    if (error.code === 'INVALID_STATE') return res.status(400).json({ error: 'One or more documents are already archived' });
    if (error.code === 'CONFLICT') return res.status(409).json({ error: 'Document state changed; reload and try again' });
  }
});

router.post('/:id/restore', authMiddleware, requireCapability('documents.read', 'documents.restore'), async (req: Request, res: Response) => {
  const id = routeParam(req.params.id);
  try {
    await restoreDocument(prisma, req.user!, id);
    res.json(await getDocumentDetail(prisma, req.user!, id));
  } catch (error) {
    if (!(error instanceof DocumentLifecycleError)) throw error;
    if (error.code === 'NOT_FOUND') return res.status(404).json({ error: 'Document not found' });
    if (error.code === 'FORBIDDEN') return res.status(403).json({ error: 'Forbidden' });
    if (error.code === 'INVALID_STATE') return res.status(400).json({ error: 'Document is not archived' });
    if (error.code === 'CONFLICT') return res.status(409).json({ error: 'Document state changed; reload and try again' });
  }
});

router.post('/:id/archive', authMiddleware, requireCapability('documents.read', 'documents.archive'), async (req: Request, res: Response) => {
  const id = routeParam(req.params.id);
  try {
    await archiveDocument(prisma, req.user!, id, req.body.reason);
    res.json(await getDocumentDetail(prisma, req.user!, id));
  } catch (error) {
    if (!(error instanceof DocumentLifecycleError)) throw error;
    if (error.code === 'NOT_FOUND') return res.status(404).json({ error: 'Document not found' });
    if (error.code === 'FORBIDDEN') return res.status(403).json({ error: 'Forbidden' });
    if (error.code === 'INVALID_STATE') return res.status(400).json({ error: 'Document is already archived' });
    if (error.code === 'CONFLICT') return res.status(409).json({ error: 'Document state changed; reload and try again' });
  }
});

router.post('/:id/version', authMiddleware, requireCapability('documents.read', 'documents.update'), async (req: Request, res: Response) => {
  const id = routeParam(req.params.id);
  const { version, changeNote } = req.body;
  try {
    await createDocumentVersion(prisma, req.user!, id, { version, changeNote });
    res.json(await getDocumentDetail(prisma, req.user!, id));
  } catch (error) {
    if (!(error instanceof DocumentLifecycleError)) throw error;
    if (error.code === 'NOT_FOUND') return res.status(404).json({ error: 'Document not found' });
    if (error.code === 'FORBIDDEN') return res.status(403).json({ error: 'Forbidden' });
    if (error.code === 'INVALID_VERSION') {
      return res.status(400).json({ error: 'Version must be greater than the current numeric version, for example 1.1' });
    }
    if (error.code === 'CONFLICT') return res.status(409).json({ error: 'A newer document version already exists' });
  }
});

export default router;
