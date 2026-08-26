import { Router, Request, Response } from 'express';
import { prisma } from '../db';
import { authMiddleware } from '../middleware/auth';
import { requireCapability } from '../modules/access-control';
import {
  listMaintenanceLogs,
  runSettingsMaintenance,
  SecuritySettingsError,
  updateSecuritySettings,
} from '../modules/settings';
import { asyncHandler } from '../lib/asyncHandler';
import {
  queueDocumentSearchReindex,
  readDocumentIndexHealth,
  retryFailedDocumentIndexes,
  runCurrentTenantDocumentIndexingBatch,
  runManagedDocumentIndexBatch,
} from '../modules/documents';

const router = Router();

function securityError(error: SecuritySettingsError, res: Response) {
  return error.code === 'FORBIDDEN'
    ? res.status(403).json({ error: 'Forbidden' })
    : res.status(400).json({ error: 'Invalid security settings' });
}

router.put('/security', authMiddleware, requireCapability('settings.manage.security'), asyncHandler(async (req: Request, res: Response) => {
  try {
    res.json(await updateSecuritySettings(prisma, req.tenant!, req.user!, req.body));
  } catch (error) {
    if (!(error instanceof SecuritySettingsError)) throw error;
    return securityError(error, res);
  }
}));

router.post('/maintenance/clear-cache', authMiddleware, requireCapability('settings.manage.security'), asyncHandler(async (req: Request, res: Response) => {
  res.json(await runSettingsMaintenance(prisma, req.tenant!, req.user!, 'clear-cache'));
}));

router.post('/maintenance/reindex', authMiddleware, requireCapability('settings.manage.security'), asyncHandler(async (req: Request, res: Response) => {
  const queued = await queueDocumentSearchReindex(prisma, req.user!);
  const processed = await runCurrentTenantDocumentIndexingBatch();
  const maintenance = await runSettingsMaintenance(prisma, req.tenant!, req.user!, 'reindex');
  const health = await readDocumentIndexHealth(prisma, req.user!);
  const remaining = health.pending + health.missing;
  res.json({ ...maintenance, queued, processed, remaining, status: remaining > 0 ? 'RUNNING' : 'UP_TO_DATE' });
}));

router.get('/maintenance/search-index', authMiddleware, requireCapability('settings.manage.security'), asyncHandler(async (req: Request, res: Response) => {
  res.json(await readDocumentIndexHealth(prisma, req.user!));
}));

router.post('/maintenance/search-index/retry-failed', authMiddleware, requireCapability('settings.manage.security'), asyncHandler(async (req: Request, res: Response) => {
  const queued = await retryFailedDocumentIndexes(prisma, req.user!);
  const processed = await runCurrentTenantDocumentIndexingBatch();
  const health = await readDocumentIndexHealth(prisma, req.user!);
  const remaining = health.pending + health.missing;
  res.json({ ok: true, queued, processed, remaining, status: remaining > 0 ? 'RUNNING' : 'UP_TO_DATE' });
}));

router.post('/maintenance/search-index/run', authMiddleware, requireCapability('settings.manage.security'), asyncHandler(async (req: Request, res: Response) => {
  const processed = await runManagedDocumentIndexBatch(prisma, req.user!, runCurrentTenantDocumentIndexingBatch);
  res.json({ ok: true, processed });
}));

router.get('/maintenance/logs', authMiddleware, requireCapability('settings.manage.security'), asyncHandler(async (req: Request, res: Response) => {
  res.json(await listMaintenanceLogs(prisma, req.user!));
}));

export default router;
