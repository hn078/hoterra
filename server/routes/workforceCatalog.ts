import { Router, type Response } from 'express';
import { prisma } from '../db';
import { asyncHandler } from '../lib/asyncHandler';
import { authMiddleware } from '../middleware/auth';
import {
  approveVendor,
  createWorkforcePosition,
  createWorkforceVendor,
  disableWorkforceRate,
  disableWorkforceVendor,
  rejectVendor,
  updateWorkforcePosition,
  updateWorkforceRate,
  updateWorkforceVendor,
  upsertWorkforceRate,
  VendorApprovalError,
  WorkforceCatalogError,
} from '../modules/workforce';
import { routeParam } from '../utils';
import { workforceNotificationOptions as notificationOptions } from './workforceHttp';

const router = Router();

function sendVendorApprovalError(res: Response, error: VendorApprovalError) {
  if (error.code === 'NOT_FOUND') return res.status(404).json({ error: 'Vendor not found' });
  if (error.code === 'FORBIDDEN') return res.status(403).json({ error: 'Not the current vendor approver' });
  if (error.code === 'COMMENT_REQUIRED') return res.status(400).json({ error: 'A rejection reason is required' });
  if (error.code === 'CONFLICT') return res.status(409).json({ error: 'Vendor approval state changed; reload and try again' });
  return res.status(400).json({ error: 'Vendor is not pending approval' });
}

function sendCatalogError(res: Response, error: WorkforceCatalogError) {
  if (error.code === 'NOT_FOUND') return res.status(404).json({ error: 'Catalog record not found' });
  if (error.code === 'FORBIDDEN') return res.status(403).json({ error: 'Procurement catalog permission required' });
  if (error.code === 'DUPLICATE') return res.status(409).json({ error: 'A catalog record with this name already exists' });
  if (error.code === 'INVALID_REFERENCE') return res.status(400).json({ error: 'Selected department, vendor, or position is invalid or inactive' });
  return res.status(400).json({ error: 'Invalid catalog values' });
}

router.post('/positions', authMiddleware, asyncHandler(async (req, res) => {
  try {
    res.status(201).json(await createWorkforcePosition(prisma, req.user!, req.body));
  } catch (error) {
    if (!(error instanceof WorkforceCatalogError)) throw error;
    return sendCatalogError(res, error);
  }
}));

router.patch('/positions/:id', authMiddleware, asyncHandler(async (req, res) => {
  try {
    res.json(await updateWorkforcePosition(prisma, req.user!, routeParam(req.params.id), req.body));
  } catch (error) {
    if (!(error instanceof WorkforceCatalogError)) throw error;
    return sendCatalogError(res, error);
  }
}));

router.post('/vendors', authMiddleware, asyncHandler(async (req, res) => {
  try {
    const result = await createWorkforceVendor(prisma, req.user!, req.body, notificationOptions());
    res.status(201).json(result.vendor);
  } catch (error) {
    if (!(error instanceof WorkforceCatalogError)) throw error;
    return sendCatalogError(res, error);
  }
}));

router.patch('/vendors/:id', authMiddleware, asyncHandler(async (req, res) => {
  try {
    const result = await updateWorkforceVendor(prisma, req.user!, routeParam(req.params.id), req.body, notificationOptions());
    res.json(result.vendor);
  } catch (error) {
    if (!(error instanceof WorkforceCatalogError)) throw error;
    return sendCatalogError(res, error);
  }
}));

router.delete('/vendors/:id', authMiddleware, asyncHandler(async (req, res) => {
  try {
    res.json(await disableWorkforceVendor(prisma, req.user!, routeParam(req.params.id)));
  } catch (error) {
    if (!(error instanceof WorkforceCatalogError)) throw error;
    return sendCatalogError(res, error);
  }
}));

router.post('/vendors/:id/approve', authMiddleware, asyncHandler(async (req, res) => {
  const id = routeParam(req.params.id);
  try {
    const result = await approveVendor(prisma, req.user!, id, { comment: req.body.comment }, notificationOptions());
    res.json(result.vendor);
  } catch (error) {
    if (!(error instanceof VendorApprovalError)) throw error;
    return sendVendorApprovalError(res, error);
  }
}));

router.post('/vendors/:id/reject', authMiddleware, asyncHandler(async (req, res) => {
  const id = routeParam(req.params.id);
  try {
    res.json(await rejectVendor(prisma, req.user!, id, { reason: req.body.reason }));
  } catch (error) {
    if (!(error instanceof VendorApprovalError)) throw error;
    return sendVendorApprovalError(res, error);
  }
}));

router.post('/rates', authMiddleware, asyncHandler(async (req, res) => {
  try {
    res.status(201).json(await upsertWorkforceRate(prisma, req.user!, req.body));
  } catch (error) {
    if (!(error instanceof WorkforceCatalogError)) throw error;
    return sendCatalogError(res, error);
  }
}));

router.patch('/rates/:id', authMiddleware, asyncHandler(async (req, res) => {
  try {
    res.json(await updateWorkforceRate(prisma, req.user!, routeParam(req.params.id), req.body));
  } catch (error) {
    if (!(error instanceof WorkforceCatalogError)) throw error;
    return sendCatalogError(res, error);
  }
}));

router.delete('/rates/:id', authMiddleware, asyncHandler(async (req, res) => {
  try {
    res.json(await disableWorkforceRate(prisma, req.user!, routeParam(req.params.id)));
  } catch (error) {
    if (!(error instanceof WorkforceCatalogError)) throw error;
    return sendCatalogError(res, error);
  }
}));

export default router;
