import { Router } from 'express';
import { asyncHandler } from '../lib/asyncHandler';
import { routeParam } from '../utils';
import { getInviteByToken, respondVendorInvite } from '../lib/workforceVendor';

const router = Router();

router.get(
  '/order/:token',
  asyncHandler(async (req, res) => {
    const invite = await getInviteByToken(routeParam(req.params.token));
    if (!invite) return res.status(404).json({ error: 'Order not found' });

    const expired = invite.expiresAt.getTime() < Date.now();
    res.json({
      token: invite.token,
      inviteStatus: expired && invite.status === 'PENDING' ? 'EXPIRED' : invite.status,
      expiresAt: invite.expiresAt.toISOString(),
      vendor: {
        id: invite.vendor.id,
        name: invite.vendor.name,
      },
      order: {
        code: invite.request.code,
        hotelName: invite.request.hotelName,
        department: invite.request.department.name,
        position: invite.request.position.name,
        workDate: invite.request.workDate.toISOString(),
        shift: invite.request.shift,
        startTime: invite.request.startTime,
        endTime: invite.request.endTime,
        quantity: invite.request.quantity,
        comment: invite.request.comment,
        status: invite.request.status,
      },
      canRespond: invite.status === 'PENDING' && !expired && invite.request.status === 'SENT_TO_VENDOR',
    });
  })
);

router.post(
  '/order/:token/accept',
  asyncHandler(async (req, res) => {
    const result = await respondVendorInvite(routeParam(req.params.token), 'accept');
    if ('error' in result) {
      return res.status(result.httpStatus ?? 400).json({ error: result.error });
    }
    res.json(result);
  })
);

router.post(
  '/order/:token/decline',
  asyncHandler(async (req, res) => {
    const result = await respondVendorInvite(
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
