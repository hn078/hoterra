import { Router } from 'express';
import { prisma } from '../db';
import { asyncHandler } from '../lib/asyncHandler';
import { authMiddleware } from '../middleware/auth';
import { requireCapability } from '../modules/access-control';
import {
  createWorkforceRequest,
  getWorkforceRequestDetail,
  listWorkforceRequests,
  reviseAndResubmitWorkforceRequest,
  WorkforceRequestPlanningError,
  WorkforceRequestReadError,
} from '../modules/workforce';
import { routeParam } from '../utils';
import {
  workforceNotificationOptions as notificationOptions,
  workforceRequestDetailForViewer as requestDetailForViewer,
} from './workforceHttp';

const router = Router();

router.get('/requests', authMiddleware, requireCapability('workforce.read'), asyncHandler(async (req, res) => {
  try {
    res.json(await listWorkforceRequests(prisma, req.user!, req.query));
  } catch (error) {
    if (!(error instanceof WorkforceRequestReadError)) throw error;
    if (error.code === 'FORBIDDEN') return res.status(403).json({ error: 'Workforce access required' });
    return res.status(400).json({ error: 'Invalid workforce request filter' });
  }
}));

router.get('/requests/:id', authMiddleware, requireCapability('workforce.read'), asyncHandler(async (req, res) => {
  try {
    res.json(await getWorkforceRequestDetail(prisma, req.user!, routeParam(req.params.id)));
  } catch (error) {
    if (!(error instanceof WorkforceRequestReadError)) throw error;
    if (error.code === 'FORBIDDEN') return res.status(403).json({ error: 'Workforce access required' });
    return res.status(404).json({ error: 'Request not found' });
  }
}));

router.post('/requests', authMiddleware, requireCapability('workforce.request.create'), asyncHandler(async (req, res) => {
  try {
    const result = await createWorkforceRequest(prisma, req.user!, req.body, notificationOptions());
    res.status(201).json(await requestDetailForViewer(req, result.requestId));
  } catch (error) {
    if (!(error instanceof WorkforceRequestPlanningError)) throw error;
    if (error.code === 'FORBIDDEN') return res.status(403).json({ error: 'You can create requests only for your own department' });
    if (error.code === 'LEAD_TIME') return res.status(400).json({ error: `Orders less than ${error.detail} hours ahead require urgent override permission` });
    if (error.code === 'INVALID_PERIOD') return res.status(400).json({ error: 'A valid work period of no more than 366 days is required' });
    if (error.code === 'INVALID_SERVICE') return res.status(400).json({ error: 'Every service must belong to the department and have a valid unit, quantity, and hours' });
    if (error.code === 'NO_ELIGIBLE_RATE') return res.status(400).json({ error: `No eligible approved vendor offer exists for ${error.detail || 'a selected service'}` });
    if (error.code === 'HR_REQUIRED') return res.status(409).json({ error: 'Human Resources department must be configured before requests can be submitted' });
    return res.status(400).json({ error: 'Invalid workforce request data' });
  }
}));

router.post('/requests/:id/resubmit', authMiddleware, requireCapability('workforce.request.create'), asyncHandler(async (req, res) => {
  const id = routeParam(req.params.id);
  try {
    await reviseAndResubmitWorkforceRequest(prisma, req.user!, id, req.body, notificationOptions());
    res.json(await requestDetailForViewer(req, id));
  } catch (error) {
    if (!(error instanceof WorkforceRequestPlanningError)) throw error;
    if (error.code === 'NOT_FOUND') return res.status(404).json({ error: 'Request not found' });
    if (error.code === 'FORBIDDEN') return res.status(403).json({ error: 'Department HOD permission required' });
    if (error.code === 'INVALID_STATE') return res.status(400).json({ error: 'Request is not awaiting revision' });
    if (error.code === 'INVOICE_EXISTS') return res.status(409).json({ error: 'A request with invoices cannot be revised' });
    if (error.code === 'LEAD_TIME') return res.status(400).json({ error: `Orders less than ${error.detail} hours ahead require urgent override permission` });
    if (error.code === 'INVALID_PERIOD') return res.status(400).json({ error: 'A valid work period of no more than 366 days is required' });
    if (error.code === 'INVALID_SERVICE') return res.status(400).json({ error: 'Every service must belong to the department and have a valid unit, quantity, and hours' });
    if (error.code === 'NO_ELIGIBLE_RATE') return res.status(400).json({ error: `No eligible approved vendor offer exists for ${error.detail || 'a selected service'}` });
    if (error.code === 'HR_REQUIRED') return res.status(409).json({ error: 'Human Resources department must be configured before requests can be submitted' });
    return res.status(409).json({ error: 'Request state changed; reload and try again' });
  }
}));

export default router;
