import { Router } from 'express';
import { Role } from '@prisma/client';
import { prisma } from '../db';
import { authMiddleware, requireRoles } from '../middleware/auth';
import { requireCapability } from '../modules/access-control';
import { asyncHandler } from '../lib/asyncHandler';
import { routeParam } from '../utils';
import {
  cancelWorkforceRequest,
  CancelWorkforceRequestError,
  confirmWorkforceActualsByFinance,
  confirmWorkforceActualsByHod,
  evaluateWorkforceVendor,
  requestWorkforceVendorReplacement,
  submitWorkforceActuals,
  WorkforceActualsError,
  WorkforceEvaluationError,
} from '../modules/workforce';
import { workforceRequestDetailForViewer as requestDetailForViewer } from './workforceHttp';

const router = Router();
router.use(authMiddleware, requireCapability('workforce.read'));

router.post(
  '/requests/:id/evaluations',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const id = routeParam(req.params.id);
    try {
      res.status(201).json(await evaluateWorkforceVendor(prisma, req.user!, id, req.body));
    } catch (error) {
      if (!(error instanceof WorkforceEvaluationError)) throw error;
      if (error.code === 'NOT_FOUND') return res.status(404).json({ error: 'Request not found' });
      if (error.code === 'FORBIDDEN') return res.status(403).json({ error: 'Department HOD permission required' });
      if (error.code === 'INVALID_STATE') return res.status(400).json({ error: 'Evaluation is available only after the vendor accepts the order' });
      if (error.code === 'INVALID_SCORE') return res.status(400).json({ error: 'Overall score must be an integer from 1 to 5' });
      if (error.code === 'VENDOR_REQUIRED') return res.status(400).json({ error: 'Select the vendor to evaluate' });
      if (error.code === 'INVALID_VENDOR') return res.status(400).json({ error: 'Selected vendor is not assigned to this request' });
      if (error.code === 'FINAL_TOO_EARLY') return res.status(400).json({ error: 'Final evaluation becomes available after the order end date' });
      return res.status(400).json({ error: 'Invalid evaluation' });
    }
  })
);

router.post(
  '/requests/:id/request-replacement',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const id = routeParam(req.params.id);
    try {
      res.json(await requestWorkforceVendorReplacement(prisma, req.user!, id, req.body));
    } catch (error) {
      if (!(error instanceof WorkforceEvaluationError)) throw error;
      if (error.code === 'NOT_FOUND') return res.status(404).json({ error: 'Request not found' });
      if (error.code === 'FORBIDDEN') return res.status(403).json({ error: 'Department HOD or Procurement permission required' });
      if (error.code === 'VENDOR_REQUIRED') return res.status(400).json({ error: 'Select the vendor to replace' });
      if (error.code === 'INVALID_VENDOR') return res.status(400).json({ error: 'Selected vendor is not assigned to this request' });
      if (error.code === 'REASON_REQUIRED') return res.status(400).json({ error: 'A replacement reason is required' });
      return res.status(400).json({ error: 'Invalid vendor replacement request' });
    }
  })
);

router.post(
  '/requests/:id/completion',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const id = routeParam(req.params.id);
    try {
      await submitWorkforceActuals(prisma, req.user!, id, req.body);
      res.json(await requestDetailForViewer(req, id));
    } catch (error) {
      if (!(error instanceof WorkforceActualsError)) throw error;
      if (error.code === 'NOT_FOUND') return res.status(404).json({ error: 'Request not found' });
      if (error.code === 'FORBIDDEN') return res.status(403).json({ error: 'Department HOD or Procurement permission required' });
      if (error.code === 'INVALID_STATE') return res.status(400).json({ error: 'Request must be accepted or in service before actuals are submitted' });
      if (error.code === 'INVALID_ACTUALS') return res.status(400).json({ error: 'Valid actualQuantity, actualHours and actualCost are required' });
      if (error.code === 'ACTUALS_LOCKED') return res.status(400).json({ error: 'Actuals cannot be changed after HOD or Finance confirmation' });
      return res.status(409).json({ error: 'Request state changed; reload and try again' });
    }
  })
);

router.post(
  '/requests/:id/confirm-hod',
  authMiddleware,
  requireRoles(Role.HOD),
  asyncHandler(async (req, res) => {
    const id = routeParam(req.params.id);
    try {
      await confirmWorkforceActualsByHod(prisma, req.user!, id);
      res.json(await requestDetailForViewer(req, id));
    } catch (error) {
      if (!(error instanceof WorkforceActualsError)) throw error;
      if (error.code === 'NOT_FOUND') return res.status(404).json({ error: 'Request not found' });
      if (error.code === 'FORBIDDEN') return res.status(403).json({ error: 'HOD can only confirm own department requests' });
      if (error.code === 'ACTUALS_REQUIRED') return res.status(400).json({ error: 'Submit actuals before HOD confirmation' });
      if (error.code === 'INVALID_STATE') return res.status(400).json({ error: 'Request is not ready for HOD confirmation' });
      return res.status(409).json({ error: 'Request state changed; reload and try again' });
    }
  })
);

router.post(
  '/requests/:id/confirm-finance',
  authMiddleware,
  requireRoles(Role.FINANCE_DIRECTOR),
  asyncHandler(async (req, res) => {
    const id = routeParam(req.params.id);
    try {
      await confirmWorkforceActualsByFinance(prisma, req.user!, id);
      res.json(await requestDetailForViewer(req, id));
    } catch (error) {
      if (!(error instanceof WorkforceActualsError)) throw error;
      if (error.code === 'NOT_FOUND') return res.status(404).json({ error: 'Request not found' });
      if (error.code === 'FORBIDDEN') return res.status(403).json({ error: 'Finance Director permission required' });
      if (error.code === 'HOD_CONFIRMATION_REQUIRED') return res.status(400).json({ error: 'HOD confirmation required before Finance' });
      if (error.code === 'ACTUALS_REQUIRED') return res.status(400).json({ error: 'Actuals required' });
      if (error.code === 'INVALID_STATE') return res.status(400).json({ error: 'Request is not ready for Finance confirmation' });
      return res.status(409).json({ error: 'Request state changed; reload and try again' });
    }
  })
);

router.post(
  '/requests/:id/cancel',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const id = routeParam(req.params.id);
    try {
      await cancelWorkforceRequest(prisma, req.user!, id, req.body);
      res.json(await requestDetailForViewer(req, id));
    } catch (error) {
      if (!(error instanceof CancelWorkforceRequestError)) throw error;
      if (error.code === 'NOT_FOUND') return res.status(404).json({ error: 'Request not found' });
      if (error.code === 'FORBIDDEN') return res.status(403).json({ error: 'You cannot cancel this request at its current stage' });
      if (error.code === 'INVALID_STATE') return res.status(400).json({ error: 'Request cannot be cancelled' });
      if (error.code === 'END_DATE_PASSED') return res.status(400).json({ error: 'The request cannot be cancelled because its end date has passed' });
      if (error.code === 'COMMENT_REQUIRED') return res.status(400).json({ error: 'A cancellation reason is required' });
      if (error.code === 'INVOICE_EXISTS') return res.status(400).json({ error: 'Request cannot be cancelled while invoices exist' });
      return res.status(409).json({ error: 'Request state changed; reload and try again' });
    }
  })
);

export default router;
