import { Router } from 'express';
import { prisma } from '../db';
import { asyncHandler } from '../lib/asyncHandler';
import { authMiddleware } from '../middleware/auth';
import { requireCapability } from '../modules/access-control';
import {
  createWorkforceInvoice,
  listWorkforceInvoices,
  markWorkforceInvoicePaid,
  matchWorkforceInvoice,
  WorkforcePayrollError,
} from '../modules/workforce';
import { routeParam } from '../utils';

const router = Router();

router.use('/payroll', authMiddleware, requireCapability('workforce.invoice.manage'));

router.get(
  '/payroll',
  asyncHandler(async (req, res) => {
    try {
      res.json(await listWorkforceInvoices(prisma, req.user!, req.query.status));
    } catch (error) {
      if (error instanceof WorkforcePayrollError && error.code === 'INVALID_INPUT') {
        return res.status(400).json({ error: 'Invalid invoice status filter' });
      }
      throw error;
    }
  }),
);

router.post(
  '/payroll/invoices',
  asyncHandler(async (req, res) => {
    try {
      const invoice = await createWorkforceInvoice(prisma, req.user!, req.body);
      res.status(201).json(invoice);
    } catch (error) {
      if (!(error instanceof WorkforcePayrollError)) throw error;
      if (error.code === 'NOT_FOUND') return res.status(404).json({ error: 'Request not found' });
      if (error.code === 'FORBIDDEN') return res.status(403).json({ error: 'Payroll permission required' });
      const messages: Partial<Record<typeof error.code, string>> = {
        INVALID_INPUT: 'A valid request, invoice number, non-negative hours, amount and invoice date are required',
        INVALID_STATE: 'Payroll invoices can only be created for completed requests',
        INVALID_VENDOR: 'Selected vendor is not assigned to this request',
        VENDOR_REQUIRED: 'vendorId is required for multi-vendor requests',
        NO_VENDOR: 'No vendor is assigned to this request',
        DUPLICATE_INVOICE: 'This invoice number already exists for the selected vendor',
      };
      return res.status(400).json({ error: messages[error.code] || 'Invoice could not be created' });
    }
  }),
);

router.post(
  '/payroll/invoices/:id/match',
  asyncHandler(async (req, res) => {
    try {
      res.json(await matchWorkforceInvoice(prisma, req.user!, routeParam(req.params.id)));
    } catch (error) {
      if (!(error instanceof WorkforcePayrollError)) throw error;
      if (error.code === 'NOT_FOUND') return res.status(404).json({ error: 'Invoice not found' });
      if (error.code === 'FORBIDDEN') return res.status(403).json({ error: 'Payroll permission required' });
      if (error.code === 'ACTUALS_REQUIRED') return res.status(400).json({ error: 'Request has no confirmed actual hours/cost yet' });
      if (error.code === 'CONFLICT') return res.status(409).json({ error: 'Invoice changed; refresh and retry' });
      return res.status(400).json({ error: 'Only an unpaid invoice for a completed request can be matched' });
    }
  }),
);

router.post(
  '/payroll/invoices/:id/paid',
  asyncHandler(async (req, res) => {
    try {
      res.json(await markWorkforceInvoicePaid(prisma, req.user!, routeParam(req.params.id)));
    } catch (error) {
      if (!(error instanceof WorkforcePayrollError)) throw error;
      if (error.code === 'NOT_FOUND') return res.status(404).json({ error: 'Invoice not found' });
      if (error.code === 'FORBIDDEN') return res.status(403).json({ error: 'Payroll permission required' });
      if (error.code === 'CONFLICT') return res.status(409).json({ error: 'Invoice changed; refresh and retry' });
      if (error.code === 'MATCH_REQUIRED') return res.status(400).json({ error: 'Invoice must pass matching before it can be marked paid' });
      return res.status(400).json({ error: 'Invoice cannot be marked paid' });
    }
  }),
);

export default router;
