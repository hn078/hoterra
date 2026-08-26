import { Router, Request, Response } from 'express';
import { prisma } from '../db';
import { authMiddleware, signToken } from '../middleware/auth';
import { runtimeConfig } from '../config';
import { createRateLimiter } from '../middleware/security';
import {
  authenticateAccount,
  AuthenticationError,
  getAuthenticatedAccount,
  revokeAccountTokens,
} from '../modules/authentication';

const router = Router();
const loginLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: runtimeConfig.loginRateLimitMax,
  key: (req) => `${req.ip}:${req.tenant?.id || 'no-tenant'}:${String(req.body?.email || '').trim().toLowerCase()}`,
});

router.post('/login', loginLimiter, async (req: Request, res: Response) => {
  try {
    const result = await authenticateAccount(prisma, req.body, {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return res.json({
      token: signToken(result.actor, result.tokenVersion, result.sessionLifetimeSeconds),
      user: result.user,
    });
  } catch (error) {
    if (!(error instanceof AuthenticationError)) throw error;
    if (error.code === 'INVALID_INPUT') return res.status(400).json({ error: 'Email and password required' });
    return res.status(401).json({ error: 'Invalid credentials' });
  }
});

router.get('/me', authMiddleware, async (req: Request, res: Response) => {
  try {
    return res.json(await getAuthenticatedAccount(prisma, req.user!));
  } catch (error) {
    if (error instanceof AuthenticationError) return res.status(404).json({ error: 'User not found' });
    throw error;
  }
});

router.post('/logout', authMiddleware, async (req: Request, res: Response) => {
  return res.json(await revokeAccountTokens(prisma, req.user!, req.ip));
});

export default router;
