import { Router, Request, Response } from 'express';
import { prisma } from '../db';
import { authMiddleware } from '../middleware/auth';
import { routeParam } from '../utils';
import { createDocument, getDocumentDetail, updateDocument, DocumentContentError } from '../modules/documents';
import { requireCapability } from '../modules/access-control';

const router = Router();

router.post('/', authMiddleware, requireCapability('documents.read', 'documents.create'), async (req: Request, res: Response) => {
  try {
    const { document } = await createDocument(prisma, req.user!, req.body);
    res.status(201).json(await getDocumentDetail(prisma, req.user!, document.id));
  } catch (error) {
    if (!(error instanceof DocumentContentError)) throw error;
    if (error.code === 'INVALID_INPUT') return res.status(400).json({ error: 'Valid title, category and department are required' });
    if (error.code === 'INVALID_DEPARTMENT') return res.status(400).json({ error: 'Invalid department' });
    if (error.code === 'INVALID_REFERENCE') return res.status(400).json({ error: 'Invalid template or workflow' });
    if (error.code === 'INVALID_DATE') return res.status(400).json({ error: 'Invalid document date' });
    if (error.code === 'INVALID_VERSION') return res.status(400).json({ error: 'Invalid document version' });
    if (error.code === 'FORBIDDEN') return res.status(403).json({ error: 'You cannot create or assign this document' });
    if (error.code === 'CONFLICT') return res.status(409).json({ error: 'Document code already exists' });
  }
});

router.patch('/:id', authMiddleware, requireCapability('documents.read', 'documents.update'), async (req: Request, res: Response) => {
  const id = routeParam(req.params.id);
  try {
    await updateDocument(prisma, req.user!, id, req.body);
    res.json(await getDocumentDetail(prisma, req.user!, id));
  } catch (error) {
    if (!(error instanceof DocumentContentError)) throw error;
    if (error.code === 'NOT_FOUND') return res.status(404).json({ error: 'Document not found' });
    if (error.code === 'FORBIDDEN') return res.status(403).json({ error: 'Forbidden' });
    if (error.code === 'LOCKED') return res.status(400).json({ error: 'Document is locked after signing' });
    if (error.code === 'INVALID_TRANSITION') return res.status(400).json({ error: 'Invalid document status transition' });
    if (error.code === 'INVALID_DATE') return res.status(400).json({ error: 'Invalid document date' });
    if (error.code === 'INVALID_INPUT') return res.status(400).json({ error: 'Invalid document data' });
    if (error.code === 'INVALID_VERSION') return res.status(400).json({ error: 'Use Create Version to change the document version' });
    if (error.code === 'CONFLICT') return res.status(409).json({ error: 'Document changed; reload and try again' });
  }
});

export default router;
