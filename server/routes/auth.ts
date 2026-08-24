import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { AuditAction } from '@prisma/client';
import { prisma } from '../db';
import { authMiddleware, signToken } from '../middleware/auth';
import { runtimeConfig } from '../config';
import { createRateLimiter } from '../middleware/security';

const router = Router();
const DUMMY_PASSWORD_HASH = bcrypt.hashSync('hoterra-invalid-password', 12);
const loginLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: runtimeConfig.loginRateLimitMax,
  key: (req) => `${req.ip}:${req.tenant?.id || 'no-tenant'}:${String(req.body?.email || '').trim().toLowerCase()}`,
});

router.post('/login', loginLimiter, async (req: Request, res: Response) => {
  const { email, password } = req.body;

  if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }
  if (email.length > 254 || password.length > 256) {
    return res.status(400).json({ error: 'Invalid credentials' });
  }
  const normalizedEmail = email.trim().toLowerCase();

  const user = await prisma.user.findFirst({
    where: { email: normalizedEmail },
    include: { department: true, customRole: true },
  });

  const valid = await bcrypt.compare(password, user?.passwordHash || DUMMY_PASSWORD_HASH);
  if (!user?.isActive || !valid) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      userName: `${user.firstName} ${user.lastName}`,
      action: AuditAction.LOGIN,
      ipAddress: req.ip,
      device: req.headers['user-agent']?.slice(0, 200),
    },
  });

  const token = signToken({
    id: user.id,
    tenantId: req.tenant!.id,
    email: user.email,
    role: user.role,
    firstName: user.firstName,
    lastName: user.lastName,
    departmentId: user.departmentId,
  });

  res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      customRole: user.customRole,
      signatureImage: user.signatureImage,
      department: user.department,
    },
  });
});

router.get('/me', authMiddleware, async (req: Request, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    include: { department: true, customRole: true },
  });

  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  res.json({
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    customRole: user.customRole,
    signatureImage: user.signatureImage,
    department: user.department,
  });
});

router.post('/logout', authMiddleware, async (req: Request, res: Response) => {
  await prisma.auditLog.create({
    data: {
      userId: req.user!.id,
      userName: `${req.user!.firstName} ${req.user!.lastName}`,
      action: AuditAction.LOGOUT,
      ipAddress: req.ip,
    },
  });
  res.json({ success: true });
});

export default router;
