import { Router } from 'express';
import { Role } from '@prisma/client';
import { prisma } from '../db';
import { asyncHandler } from '../lib/asyncHandler';
import { authMiddleware, requireRoles } from '../middleware/auth';
import { requireCapability } from '../modules/access-control';
import {
  listWorkforceEmailOutbox,
  runWorkforceAutomation,
  WorkforceOutboxReadError,
} from '../modules/workforce';
import { workforceNotificationOptions } from './workforceHttp';

const router = Router();

router.get(
  '/outbox',
  authMiddleware,
  requireRoles(Role.SYSTEM_ADMINISTRATOR),
  asyncHandler(async (req, res) => {
    try {
      res.json(await listWorkforceEmailOutbox(prisma, req.user!, 100));
    } catch (error) {
      if (!(error instanceof WorkforceOutboxReadError)) throw error;
      return res.status(403).json({ error: 'System Administrator permission required' });
    }
  }),
);

router.post(
  '/recurring/run',
  authMiddleware,
  requireCapability('workforce.settings.manage'),
  asyncHandler(async (_req, res) => {
    const result = await runWorkforceAutomation(prisma, workforceNotificationOptions());
    res.json({
      created: result.created.map((request) => request.code),
      skipped: result.skipped,
    });
  }),
);

export default router;
