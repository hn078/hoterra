import { Router, Request, Response } from 'express';
import { prisma } from '../db';
import { asyncHandler } from '../lib/asyncHandler';
import { authMiddleware } from '../middleware/auth';
import { requireCapability } from '../modules/access-control';
import { getReport, recordReportExport, ReportReadError } from '../modules/reporting';
const router = Router();
function cell(value: unknown) {
  let text = String(value ?? '');
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
router.get('/export.csv', authMiddleware, requireCapability('reports.export'), asyncHandler(async (req: Request, res: Response) => {
  try {
    const report = await getReport(prisma, req.user!, req.query);
    await recordReportExport(prisma, req.user!, report);
    const rows: unknown[][] = [
      ['HOTERRA Document Analytics'], ['From', report.period.from.slice(0, 10)], ['To', report.period.to.slice(0, 10)], [],
      ['Metric', 'Value'], ...Object.entries(report.kpis), [],
      ['Department', 'Documents'], ...report.byDepartment.map((entry) => [entry.name, entry.count]), [],
      ['Category', 'Documents'], ...report.byCategory.map((entry) => [entry.category, entry.count]), [],
      ['Period', 'Created', 'Approval actions', 'Storage added GB'], ...report.trend.map((entry) => [entry.bucket, entry.created, entry.approvalActions, entry.storageGb]),
    ];
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="document-analytics-${report.period.from.slice(0, 10)}-${report.period.to.slice(0, 10)}.csv"`);
    res.send(`\uFEFF${rows.map((row) => row.map(cell).join(',')).join('\r\n')}`);
  } catch (error) {
    if (!(error instanceof ReportReadError)) throw error;
    return error.code === 'FORBIDDEN' ? res.status(403).json({ error: 'Forbidden' }) : res.status(400).json({ error: error.detail || 'Invalid report query' });
  }
}));
export default router;
