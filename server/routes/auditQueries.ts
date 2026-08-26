import { Router, Request, Response } from 'express';
import { prisma } from '../db';
import { asyncHandler } from '../lib/asyncHandler';
import { authMiddleware } from '../middleware/auth';
import { requireCapability } from '../modules/access-control';
import { AuditReadError, listAuditEvents, verifyAuditIntegrity } from '../modules/audit';

const router = Router();
router.post('/integrity', authMiddleware, requireCapability('audit.read'), asyncHandler(async (req: Request, res: Response) => {
  try { res.json(await verifyAuditIntegrity(prisma, req.user!)); }
  catch (error) {
    if (!(error instanceof AuditReadError)) throw error;
    return res.status(403).json({ error: 'Forbidden' });
  }
}));

router.get('/', authMiddleware, requireCapability('audit.read'), asyncHandler(async (req: Request, res: Response) => {
  try { res.json(await listAuditEvents(prisma, req.user!, req.query)); }
  catch (error) {
    if (!(error instanceof AuditReadError)) throw error;
    return error.code === 'FORBIDDEN' ? res.status(403).json({ error: 'Forbidden' }) : res.status(400).json({ error: error.detail || 'Invalid audit query' });
  }
}));
export default router;
