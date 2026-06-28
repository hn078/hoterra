import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { AuditAction } from '@prisma/client';
import { prisma } from '../db';
import { authMiddleware, signToken } from '../middleware/auth';

const router = Router();

router.post('/login', async (req: Request, res: Response) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    include: { department: true },
  });

  if (!user || !user.isActive) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
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
      department: user.department,
    },
  });
});

router.get('/me', authMiddleware, async (req: Request, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    include: { department: true },
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
