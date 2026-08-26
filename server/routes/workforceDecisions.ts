import { Router } from 'express';
import { Role } from '@prisma/client';
import { prisma } from '../db';
import { asyncHandler } from '../lib/asyncHandler';
import { authMiddleware, requireRoles } from '../middleware/auth';
import { requireCapability } from '../modules/access-control';
import {
  approveWorkforceRequest,
  ApproveWorkforceRequestError,
  financeReturnWorkforceRequestToHod,
  rejectWorkforceRequest,
  returnWorkforceRequestForRevision,
  WorkforceRequestDecisionError,
} from '../modules/workforce';
import { routeParam } from '../utils';
import {
  workforceNotificationOptions as notificationOptions,
  workforceRequestDetailForViewer as requestDetailForViewer,
} from './workforceHttp';

const router = Router();
router.use(authMiddleware, requireCapability('workforce.read'));

router.post('/requests/:id/approve', authMiddleware, asyncHandler(async (req, res) => {
  const id = routeParam(req.params.id);
  try {
    await approveWorkforceRequest(prisma, req.user!, id, notificationOptions());
    res.json(await requestDetailForViewer(req, id));
  } catch (error) {
    if (!(error instanceof ApproveWorkforceRequestError)) throw error;
    if (error.code === 'NOT_FOUND') return res.status(404).json({ error: 'Request not found' });
    if (error.code === 'FORBIDDEN') return res.status(403).json({ error: 'You cannot approve this step' });
    if (error.code === 'NO_ITEMS') return res.status(400).json({ error: 'Request has no service items' });
    if (error.code === 'NO_ELIGIBLE_RATE') return res.status(400).json({ error: `No eligible approved vendor offer found for ${error.detail || 'selected service'}` });
    return res.status(409).json({ error: 'Request state changed; reload and try again' });
  }
}));

router.post(
  '/requests/:id/return-for-revision',
  authMiddleware,
  requireRoles(Role.FINANCE_DIRECTOR, Role.GENERAL_MANAGER),
  asyncHandler(async (req, res) => {
    const id = routeParam(req.params.id);
    try {
      await returnWorkforceRequestForRevision(prisma, req.user!, id, req.body);
      res.json(await requestDetailForViewer(req, id));
    } catch (error) {
      if (!(error instanceof WorkforceRequestDecisionError)) throw error;
      if (error.code === 'NOT_FOUND') return res.status(404).json({ error: 'Request not found' });
      if (error.code === 'FORBIDDEN') return res.status(403).json({ error: 'You cannot return this request at the current step' });
      if (error.code === 'COMMENT_REQUIRED') return res.status(400).json({ error: 'A revision comment is required' });
      return res.status(409).json({ error: 'Request state changed; reload and try again' });
    }
  }),
);

router.post(
  '/requests/:id/finance-return-to-hod',
  authMiddleware,
  requireRoles(Role.FINANCE_DIRECTOR),
  asyncHandler(async (req, res) => {
    const id = routeParam(req.params.id);
    try {
      await financeReturnWorkforceRequestToHod(prisma, req.user!, id, req.body);
      res.json(await requestDetailForViewer(req, id));
    } catch (error) {
      if (!(error instanceof WorkforceRequestDecisionError)) throw error;
      if (error.code === 'NOT_FOUND') return res.status(404).json({ error: 'Request not found' });
      if (error.code === 'FORBIDDEN') return res.status(403).json({ error: 'Finance Director permission required' });
      if (error.code === 'INVALID_STATE') return res.status(400).json({ error: 'Only fully approved vendor requests can be returned to HOD' });
      if (error.code === 'END_DATE_PASSED') return res.status(400).json({ error: 'The request can no longer be returned because its end date has passed' });
      if (error.code === 'COMMENT_REQUIRED') return res.status(400).json({ error: 'A revision comment is required' });
      return res.status(409).json({ error: 'Request state changed; reload and try again' });
    }
  }),
);

router.post('/requests/:id/reject', authMiddleware, asyncHandler(async (req, res) => {
  const id = routeParam(req.params.id);
  try {
    await rejectWorkforceRequest(prisma, req.user!, id, req.body);
    res.json(await requestDetailForViewer(req, id));
  } catch (error) {
    if (!(error instanceof WorkforceRequestDecisionError)) throw error;
    if (error.code === 'NOT_FOUND') return res.status(404).json({ error: 'Request not found' });
    if (error.code === 'FORBIDDEN') return res.status(403).json({ error: 'You cannot reject this step' });
    return res.status(409).json({ error: 'Request state changed; reload and try again' });
  }
}));

export default router;
