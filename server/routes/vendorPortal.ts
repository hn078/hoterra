import { Router } from 'express';
import { asyncHandler } from '../lib/asyncHandler';
import { routeParam } from '../utils';
import { prisma } from '../db';
import {
  getVendorPortalOrder,
  respondToVendorInvite,
  VendorPortalReadError,
} from '../modules/workforce';
import { createRateLimiter } from '../middleware/security';

const router = Router();
const vendorReadLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 120 });
const vendorResponseLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 30 });

router.get(
  '/order/:token', vendorReadLimiter,
  asyncHandler(async (req, res) => {
    try {
      return res.json(await getVendorPortalOrder(prisma, routeParam(req.params.token)));
    } catch (error) {
      if (!(error instanceof VendorPortalReadError)) throw error;
      return error.code === 'EXPIRED'
        ? res.status(410).json({ error: 'Order link expired' })
        : res.status(404).json({ error: 'Order not found' });
    }
  })
);

router.post(
  '/order/:token/accept', vendorResponseLimiter,
  asyncHandler(async (req, res) => {
    const result = await respondToVendorInvite(prisma, routeParam(req.params.token), 'accept');
    if ('error' in result) {
      return res.status(result.httpStatus ?? 400).json({ error: result.error });
    }
    res.json(result);
  })
);

router.post(
  '/order/:token/decline', vendorResponseLimiter,
  asyncHandler(async (req, res) => {
    const result = await respondToVendorInvite(
      prisma,
      routeParam(req.params.token),
      'decline',
      req.body?.reason
    );
    if ('error' in result) {
      return res.status(result.httpStatus ?? 400).json({ error: result.error });
    }
    res.json(result);
  })
);

export default router;
