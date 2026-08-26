import { Router } from 'express';
import { prisma } from '../db';
import { asyncHandler } from '../lib/asyncHandler';
import { authMiddleware } from '../middleware/auth';
import { requireCapability } from '../modules/access-control';
import {
  exportWorkforceReportCsv,
  getWorkforceReport,
  WorkforceReportError,
} from '../modules/workforce';

const router = Router();

router.get(
  '/reports',
  authMiddleware,
  requireCapability('workforce.reports.read'),
  asyncHandler(async (req, res) => {
    try {
      res.json(await getWorkforceReport(prisma, req.user!, req.query));
    } catch (error) {
      if (!(error instanceof WorkforceReportError)) throw error;
      if (error.code === 'FORBIDDEN') return res.status(403).json({ error: 'Workforce report permission required' });
      return res.status(400).json({ error: 'Report year must be 2020–2100 and month must be 1–12' });
    }
  }),
);

router.get(
  '/reports/export.csv',
  authMiddleware,
  requireCapability('workforce.reports.export'),
  asyncHandler(async (req, res) => {
    try {
      const report = await exportWorkforceReportCsv(prisma, req.user!, req.query);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${report.fileName}"`);
      res.send(report.content);
    } catch (error) {
      if (!(error instanceof WorkforceReportError)) throw error;
      if (error.code === 'FORBIDDEN') return res.status(403).json({ error: 'Workforce report export permission required' });
      return res.status(400).json({ error: 'Report year must be 2020–2100 and month must be 1–12' });
    }
  }),
);

export default router;
