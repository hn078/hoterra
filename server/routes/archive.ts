import { Router, Request, Response } from 'express';
import { prisma } from '../db';
import { asyncHandler } from '../lib/asyncHandler';
import { authMiddleware } from '../middleware/auth';
import { requireCapability } from '../modules/access-control';
import {
  ArchiveReadError,
  listArchive,
  listRetentionPolicies,
  requestDisposition,
  reviewDisposition,
  saveRetentionPolicy,
  setLegalHold,
  updateDocumentRetention,
  RecordsLifecycleError,
} from '../modules/archive';
import { deleteTenantUpload } from '../lib/uploads';
import { routeParam } from '../utils';

const router = Router();
router.get('/', authMiddleware, requireCapability('documents.archive'), asyncHandler(async (req: Request, res: Response) => {
  try { res.json(await listArchive(prisma, req.user!, req.query)); }
  catch (error) {
    if (!(error instanceof ArchiveReadError)) throw error;
    return error.code === 'FORBIDDEN' ? res.status(403).json({ error: 'Forbidden' }) : res.status(400).json({ error: error.detail || 'Invalid archive query' });
  }
}));

function recordsError(res: Response, error: unknown) {
  if (!(error instanceof RecordsLifecycleError)) throw error;
  if (error.code === 'NOT_FOUND') return res.status(404).json({ error: 'Record not found' });
  if (error.code === 'FORBIDDEN') return res.status(403).json({ error: 'Forbidden' });
  if (error.code === 'CONFLICT') return res.status(409).json({ error: 'A disposition review is already pending' });
  if (error.code === 'SELF_REVIEW') return res.status(409).json({ error: 'The requester cannot approve their own disposition request' });
  if (error.code === 'LEGAL_HOLD') return res.status(409).json({ error: 'Document is on legal hold' });
  if (error.code === 'RETENTION_ACTIVE') return res.status(409).json({ error: 'The retention period has not expired' });
  return res.status(400).json({ error: error.detail || 'Invalid records management operation' });
}

router.get('/retention-policies', authMiddleware, requireCapability('documents.archive'), asyncHandler(async (req: Request, res: Response) => {
  try { res.json(await listRetentionPolicies(prisma, req.user!)); } catch (error) { recordsError(res, error); }
}));

router.post('/retention-policies', authMiddleware, requireCapability('records.manage'), asyncHandler(async (req: Request, res: Response) => {
  try { res.status(201).json(await saveRetentionPolicy(prisma, req.user!, req.body)); } catch (error) { recordsError(res, error); }
}));

router.patch('/retention-policies/:id', authMiddleware, requireCapability('records.manage'), asyncHandler(async (req: Request, res: Response) => {
  try { res.json(await saveRetentionPolicy(prisma, req.user!, req.body, routeParam(req.params.id))); } catch (error) { recordsError(res, error); }
}));

router.patch('/documents/:id/retention', authMiddleware, requireCapability('records.manage'), asyncHandler(async (req: Request, res: Response) => {
  try { res.json(await updateDocumentRetention(prisma, req.user!, routeParam(req.params.id), req.body)); } catch (error) { recordsError(res, error); }
}));

router.post('/documents/:id/legal-hold', authMiddleware, requireCapability('records.manage'), asyncHandler(async (req: Request, res: Response) => {
  try { res.json(await setLegalHold(prisma, req.user!, routeParam(req.params.id), req.body)); } catch (error) { recordsError(res, error); }
}));

router.post('/documents/:id/disposition', authMiddleware, requireCapability('records.disposition.request'), asyncHandler(async (req: Request, res: Response) => {
  try { res.status(201).json(await requestDisposition(prisma, req.user!, routeParam(req.params.id), req.body)); } catch (error) { recordsError(res, error); }
}));

router.post('/dispositions/:id/review', authMiddleware, requireCapability('records.disposition.approve'), asyncHandler(async (req: Request, res: Response) => {
  try {
    res.json(await reviewDisposition(prisma, req.user!, routeParam(req.params.id), req.body, {
      remove: (filePath, subdir) => deleteTenantUpload(filePath, subdir),
    }));
  } catch (error) { recordsError(res, error); }
}));
export default router;
