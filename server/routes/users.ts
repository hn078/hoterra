import fs from 'fs';
import path from 'path';
import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { Role } from '@prisma/client';
import { prisma } from '../db';
import { authMiddleware } from '../middleware/auth';
import { routeParam } from '../utils';
import { getUploadsDir, ensureDir } from '../lib/paths';

const router = Router();

function requireAdmin(role: Role) {
  return role === Role.SYSTEM_ADMINISTRATOR || role === Role.GENERAL_MANAGER;
}

router.get('/', authMiddleware, async (_req: Request, res: Response) => {
  const users = await prisma.user.findMany({
    where: { isActive: true },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      signatureImage: true,
      department: true,
      createdAt: true,
      _count: { select: { documents: true, signatures: true } },
    },
    orderBy: { lastName: 'asc' },
  });
  res.json(users);
});

router.post('/', authMiddleware, async (req: Request, res: Response) => {
  if (!requireAdmin(req.user!.role)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const { email, password, firstName, lastName, role, departmentId } = req.body;
  if (!email || !password || !firstName || !lastName || !role) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return res.status(400).json({ error: 'Email already exists' });

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      firstName,
      lastName,
      role,
      departmentId: departmentId || null,
    },
    include: { department: true },
  });

  res.status(201).json({
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    department: user.department,
    createdAt: user.createdAt,
  });
});

router.patch('/:id', authMiddleware, async (req: Request, res: Response) => {
  if (!requireAdmin(req.user!.role)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const id = routeParam(req.params.id);
  const { firstName, lastName, role, departmentId, isActive, password } = req.body;

  const data: Record<string, unknown> = {};
  if (firstName) data.firstName = firstName;
  if (lastName) data.lastName = lastName;
  if (role) data.role = role;
  if (departmentId !== undefined) data.departmentId = departmentId || null;
  if (isActive !== undefined) data.isActive = isActive;
  if (password) data.passwordHash = await bcrypt.hash(password, 10);

  const user = await prisma.user.update({
    where: { id },
    data,
    include: { department: true },
  });

  res.json({
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    department: user.department,
    createdAt: user.createdAt,
  });
});

router.get('/:id', authMiddleware, async (req: Request, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: routeParam(req.params.id) },
    include: {
      department: true,
      _count: { select: { documents: true, signatures: true, auditLogs: true } },
    },
  });
  if (!user) return res.status(404).json({ error: 'User not found' });

  const recentActivity = await prisma.auditLog.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });

  const recentDocs = await prisma.document.findMany({
    where: { authorId: user.id },
    orderBy: { updatedAt: 'desc' },
    take: 5,
    include: { department: true },
  });

  res.json({
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    signatureImage: user.signatureImage,
    department: user.department,
    createdAt: user.createdAt,
    counts: user._count,
    recentActivity,
    recentDocs,
  });
});

router.post('/:id/signature', authMiddleware, async (req: Request, res: Response) => {
  const id = routeParam(req.params.id);
  const isSelf = req.user!.id === id;
  if (!isSelf && !requireAdmin(req.user!.role)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const { fileName, data } = req.body as { fileName?: string; data?: string };
  if (!fileName || !data) {
    return res.status(400).json({ error: 'fileName and data required' });
  }

  const signaturesDir = path.join(getUploadsDir(), 'signatures');
  ensureDir(signaturesDir);

  const ext = path.extname(fileName).toLowerCase() || '.png';
  const allowed = ['.png', '.jpg', '.jpeg', '.webp', '.svg'];
  if (!allowed.includes(ext)) {
    return res.status(400).json({ error: 'Supported formats: PNG, JPG, WEBP, SVG' });
  }

  const storedName = `${id}${ext}`;
  const filePath = path.join(signaturesDir, storedName);
  const buffer = Buffer.from(data, 'base64');
  fs.writeFileSync(filePath, buffer);

  const user = await prisma.user.update({
    where: { id },
    data: { signatureImage: `/uploads/signatures/${storedName}` },
    include: { department: true },
  });

  res.json({
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    signatureImage: user.signatureImage,
    department: user.department,
  });
});

export default router;
