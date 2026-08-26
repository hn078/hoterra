import { Router, Request, Response } from 'express';
import { prisma } from '../db';
import { asyncHandler } from '../lib/asyncHandler';
import { authMiddleware } from '../middleware/auth';
import { requireCapability } from '../modules/access-control';
import { getReport, ReportReadError } from '../modules/reporting';
const router = Router();
function reportError(error: unknown, res: Response) {
  if (!(error instanceof ReportReadError)) throw error;
  return error.code === 'FORBIDDEN' ? res.status(403).json({ error: 'Forbidden' }) : res.status(400).json({ error: error.detail || 'Invalid report query' });
}
router.get('/', authMiddleware, requireCapability('reports.read'), asyncHandler(async (req: Request, res: Response) => {
  try { res.json(await getReport(prisma, req.user!, req.query)); }
  catch (error) { return reportError(error, res); }
}));
export default router;
