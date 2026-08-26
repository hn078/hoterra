import { Router, type Response } from 'express';
import { Role } from '@prisma/client';
import { runtimeConfig } from '../config';
import { prisma } from '../db';
import { asyncHandler } from '../lib/asyncHandler';
import { authMiddleware, requireRoles } from '../middleware/auth';
import {
  getWorkforceRequestDetail,
  simulateVendorResponse,
  SimulateVendorResponseError,
} from '../modules/workforce';
import { routeParam } from '../utils';

const router = Router();

function sendSimulationError(res: Response, error: SimulateVendorResponseError) {
  if (error.code === 'FORBIDDEN') return res.status(403).json({ error: 'System Administrator permission required' });
  if (error.code === 'NOT_FOUND') return res.status(404).json({ error: 'Request not found' });
  if (error.code === 'INVALID_STATE') return res.status(400).json({ error: 'Request is not awaiting a vendor response' });
  if (error.code === 'VENDOR_REQUIRED') return res.status(400).json({ error: 'Select a vendor for this response' });
  if (error.code === 'INVALID_VENDOR') return res.status(400).json({ error: 'Vendor was not invited to this request' });
  if (error.code === 'NO_INVITE') return res.status(400).json({ error: 'No pending vendor invite exists' });
  return res.status(error.httpStatus || 400).json({ error: error.detail || 'Vendor response failed' });
}

function simulationHandler(action: 'accept' | 'decline') {
  return asyncHandler(async (req, res) => {
    const id = routeParam(req.params.id);
    try {
      await simulateVendorResponse(prisma, req.user!, id, action, req.body);
      res.json(await getWorkforceRequestDetail(prisma, req.user!, id));
    } catch (error) {
      if (!(error instanceof SimulateVendorResponseError)) throw error;
      return sendSimulationError(res, error);
    }
  });
}

// These impersonation endpoints must not exist in a production route table.
if (runtimeConfig.vendorSimulationEnabled) {
  router.post(
    '/requests/:id/vendor-accept',
    authMiddleware,
    requireRoles(Role.SYSTEM_ADMINISTRATOR),
    simulationHandler('accept'),
  );
  router.post(
    '/requests/:id/vendor-decline',
    authMiddleware,
    requireRoles(Role.SYSTEM_ADMINISTRATOR),
    simulationHandler('decline'),
  );
}

export default router;
