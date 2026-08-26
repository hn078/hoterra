import { Router, Request, Response } from 'express';
import { prisma } from '../db';
import { asyncHandler } from '../lib/asyncHandler';
import { authMiddleware } from '../middleware/auth';
import { requireCapability } from '../modules/access-control';
import { AuditReadError, exportAuditEvents, exportAuditEvidence } from '../modules/audit';

const router = Router();
router.get('/export/evidence', authMiddleware, requireCapability('audit.export'), asyncHandler(async (req: Request, res: Response) => {
  try {
    const evidence = await exportAuditEvidence(prisma, req.user!, req.query);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="audit-evidence.json"');
    res.send(JSON.stringify(evidence, null, 2));
  } catch (error) {
    if (!(error instanceof AuditReadError)) throw error;
    return error.code === 'FORBIDDEN' ? res.status(403).json({ error: 'Forbidden' }) : res.status(400).json({ error: error.detail || 'Invalid audit query' });
  }
}));

function csvCell(value: unknown) {
  let cell = value instanceof Date ? value.toISOString() : String(value ?? '');
  if (/^[=+\-@]/.test(cell)) cell = `'${cell}`;
  return `"${cell.replaceAll('"', '""')}"`;
}
router.get('/export', authMiddleware, requireCapability('audit.export'), asyncHandler(async (req: Request, res: Response) => {
  try {
    const rows = await exportAuditEvents(prisma, req.user!, req.query);
    const header = ['Date', 'User', 'Action', 'Outcome', 'Reason', 'Severity', 'Entity', 'Details', 'IP Address', 'Request ID', 'Structured Change'].map(csvCell).join(',');
    const body = rows.map((row) => [row.createdAt, row.userName, row.action, row.outcome, row.reason, row.severity, row.entityType, row.details, row.ipAddress, row.requestId, row.hasStructuredChange].map(csvCell).join(',')).join('\r\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="audit-log.csv"');
    res.send(`\uFEFF${header}\r\n${body}`);
  } catch (error) {
    if (!(error instanceof AuditReadError)) throw error;
    return error.code === 'FORBIDDEN' ? res.status(403).json({ error: 'Forbidden' }) : res.status(400).json({ error: error.detail || 'Invalid audit query' });
  }
}));
export default router;
