import { Router } from 'express';
import { runtimeConfig } from '../config';
import { prisma } from '../db';
import { asyncHandler } from '../lib/asyncHandler';
import { appUrl } from '../lib/mail';
import { authMiddleware } from '../middleware/auth';
import { requireCapability } from '../modules/access-control';
import {
  confirmAndDispatchWorkforceRequest,
  decideVendorCorrectionReview,
  DecideVendorCorrectionReviewError,
  draftVendorCorrection,
  DraftVendorCorrectionError,
  dispatchWorkforceRequestToVendors,
  finalizeWorkforceVendors,
  FinalizeWorkforceVendorsError,
  submitVendorCorrectionReview,
  SubmitVendorCorrectionReviewError,
  WorkforceVendorDispatchError,
} from '../modules/workforce';
import { routeParam } from '../utils';
import { workforceRequestDetailForViewer as requestDetailForViewer } from './workforceHttp';

const router = Router();
router.use(authMiddleware, requireCapability('workforce.read'));

router.post('/requests/:id/procurement-confirm', authMiddleware, asyncHandler(async (req, res) => {
  const id = routeParam(req.params.id);
  try {
    await confirmAndDispatchWorkforceRequest(prisma, req.user!, id, {
      portalBaseUrl: appUrl(''),
      emailDeliveryEnabled: runtimeConfig.emailDeliveryEnabled,
    });
    res.json(await requestDetailForViewer(req, id));
  } catch (error) {
    if (!(error instanceof WorkforceVendorDispatchError)) throw error;
    if (error.code === 'MISSING_VENDOR_EMAIL') return res.status(422).json({ error: `${error.detail} vendor must have a valid contact email before dispatch` });
    if (error.code === 'NO_VENDOR' || error.code === 'INVALID_VENDOR') return res.status(422).json({ error: 'The selected vendor assignment is missing or inactive' });
    if (error.code === 'FORBIDDEN') return res.status(403).json({ error: 'Procurement Head confirmation required' });
    if (error.code === 'NOT_FOUND') return res.status(404).json({ error: 'Request not found' });
    if (error.code === 'CONFLICT') return res.status(409).json({ error: 'Request state changed; reload and try again' });
    return res.status(400).json({ error: 'Request is not awaiting Procurement confirmation' });
  }
}));

router.post('/requests/:id/items/:itemId/vendor-correction', authMiddleware, asyncHandler(async (req, res) => {
  const id = routeParam(req.params.id);
  const itemId = routeParam(req.params.itemId);
  try {
    await draftVendorCorrection(prisma, req.user!, id, itemId, req.body);
    res.json(await requestDetailForViewer(req, id));
  } catch (error) {
    if (!(error instanceof DraftVendorCorrectionError)) throw error;
    if (error.code === 'NOT_FOUND') return res.status(404).json({ error: 'Request not found' });
    if (error.code === 'ITEM_NOT_FOUND') return res.status(404).json({ error: 'Service line not found in this request' });
    if (error.code === 'FORBIDDEN') return res.status(403).json({ error: 'Procurement Workforce Manager permission required' });
    if (error.code === 'INVALID_STATE') return res.status(400).json({ error: 'Vendor correction is available only after vendor acceptance' });
    if (error.code === 'ACTUALS_RECORDED') return res.status(400).json({ error: 'Vendor cannot be changed after service actuals or confirmations are recorded' });
    if (error.code === 'INVALID_COMMENT') return res.status(400).json({ error: 'A correction comment of at least 5 characters is required' });
    if (error.code === 'RATE_REQUIRED') return res.status(400).json({ error: 'Alternative vendor offer is required' });
    if (error.code === 'INVALID_RATE') return res.status(400).json({ error: 'The selected vendor has no active approved offer for this service and unit' });
    if (error.code === 'SAME_VENDOR') return res.status(400).json({ error: 'Select a different vendor' });
    if (error.code === 'INVOICE_EXISTS') return res.status(400).json({ error: 'This vendor already has an invoice for the request; reverse the invoice before correction' });
    return res.status(400).json({ error: 'Vendor corrections are already under Finance Director/General Manager review' });
  }
}));

router.post('/requests/:id/vendor-correction-review/submit', authMiddleware, asyncHandler(async (req, res) => {
  const id = routeParam(req.params.id);
  try {
    await submitVendorCorrectionReview(prisma, req.user!, id);
    res.json(await requestDetailForViewer(req, id));
  } catch (error) {
    if (!(error instanceof SubmitVendorCorrectionReviewError)) throw error;
    if (error.code === 'NOT_FOUND') return res.status(404).json({ error: 'Request not found' });
    if (error.code === 'FORBIDDEN') return res.status(403).json({ error: 'Procurement Workforce Manager permission required' });
    if (error.code === 'INVALID_STATE') return res.status(400).json({ error: 'Vendor corrections can only be submitted for an accepted request' });
    if (error.code === 'EMPTY_DRAFT') return res.status(400).json({ error: 'Add at least one vendor correction before sending for review' });
    return res.status(409).json({ error: 'Vendor correction review changed; reload and try again' });
  }
}));

router.post('/requests/:id/vendor-correction-review/:reviewId/decision', authMiddleware, asyncHandler(async (req, res) => {
  const id = routeParam(req.params.id);
  const reviewId = routeParam(req.params.reviewId);
  try {
    await decideVendorCorrectionReview(prisma, req.user!, id, reviewId, req.body);
    return res.json(await requestDetailForViewer(req, id));
  } catch (error) {
    if (!(error instanceof DecideVendorCorrectionReviewError)) throw error;
    if (error.code === 'NOT_FOUND') return res.status(404).json({ error: 'Request not found' });
    if (error.code === 'REVIEW_NOT_FOUND') return res.status(404).json({ error: 'Vendor correction review not found' });
    if (error.code === 'FORBIDDEN') return res.status(403).json({ error: 'You are not the current reviewer for these vendor corrections' });
    if (error.code === 'COMMENT_REQUIRED') return res.status(400).json({ error: 'A return comment is required' });
    if (error.code === 'INVALID_STATE') return res.status(400).json({ error: 'The request is not in a vendor-reviewable state' });
    return res.status(409).json({ error: 'Vendor correction review changed; reload and try again' });
  }
}));

router.post('/requests/:id/vendors-ready-for-execution', authMiddleware, asyncHandler(async (req, res) => {
  const id = routeParam(req.params.id);
  try {
    await finalizeWorkforceVendors(prisma, req.user!, id);
    res.json(await requestDetailForViewer(req, id));
  } catch (error) {
    if (!(error instanceof FinalizeWorkforceVendorsError)) throw error;
    if (error.code === 'NOT_FOUND') return res.status(404).json({ error: 'Request not found' });
    if (error.code === 'FORBIDDEN') return res.status(403).json({ error: 'Procurement Workforce Manager permission required' });
    if (error.code === 'INVALID_STATE') return res.status(400).json({ error: 'Vendors can be marked ready only after vendor acceptance' });
    if (error.code === 'ACTUALS_RECORDED') return res.status(400).json({ error: 'Vendors cannot be finalized after service actuals or confirmations are recorded' });
    if (error.code === 'ACTIVE_REVIEW') return res.status(400).json({ error: 'Complete or remove the active vendor correction review before marking vendors ready' });
    return res.status(409).json({ error: 'Request state changed; reload and try again' });
  }
}));

router.post('/requests/:id/resend-vendor', authMiddleware, asyncHandler(async (req, res) => {
  const id = routeParam(req.params.id);
  try {
    await dispatchWorkforceRequestToVendors(prisma, req.user!, id, {
      resend: true,
      portalBaseUrl: appUrl(''),
      emailDeliveryEnabled: runtimeConfig.emailDeliveryEnabled,
    });
    res.json(await requestDetailForViewer(req, id));
  } catch (error) {
    if (!(error instanceof WorkforceVendorDispatchError)) throw error;
    if (error.code === 'NOT_FOUND') return res.status(404).json({ error: 'Request not found' });
    if (error.code === 'FORBIDDEN') return res.status(403).json({ error: 'Procurement permission required' });
    if (error.code === 'INVALID_STATE') return res.status(400).json({ error: 'Request must be in Sent to Vendor status' });
    if (error.code === 'MISSING_VENDOR_EMAIL') return res.status(422).json({ error: `${error.detail} vendor must have a valid contact email before dispatch` });
    return res.status(400).json({ error: 'The selected vendor assignment is missing or inactive' });
  }
}));

export default router;
