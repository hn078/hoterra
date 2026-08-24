import path from 'path';
import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { Role } from '@prisma/client';
import { prisma } from '../db';
import { authMiddleware } from '../middleware/auth';
import { routeParam } from '../utils';
import { InvalidUploadError, saveBase64Upload, UploadTooLargeError } from '../lib/uploads';

const router = Router();

function requireAdmin(role: Role) {
  return role === Role.SYSTEM_ADMINISTRATOR || role === Role.GENERAL_MANAGER;
}

function validEmail(value: string) {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function validPassword(value: string) {
  return value.length >= 12 && value.length <= 128;
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
      customRole: { select: { id: true, name: true, baseRole: true } },
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

  const { email, password, firstName, lastName, role, customRoleId, departmentId } = req.body;
  if (!email || !password || !firstName || !lastName || !role) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  if (!validEmail(normalizedEmail)) return res.status(400).json({ error: 'A valid email is required' });
  if (!validPassword(String(password))) return res.status(400).json({ error: 'Password must be 12–128 characters' });
  if (!Object.values(Role).includes(role)) return res.status(400).json({ error: 'Invalid role' });
  if (role === Role.SYSTEM_ADMINISTRATOR && req.user!.role !== Role.SYSTEM_ADMINISTRATOR) {
    return res.status(403).json({ error: 'Only a System Administrator can grant this role' });
  }
  const existing = await prisma.user.findFirst({ where: { email: normalizedEmail } });
  if (existing) return res.status(400).json({ error: 'Email already exists' });

  const customRole = customRoleId ? await prisma.customRole.findUnique({ where: { id: customRoleId } }) : null;
  if (customRoleId && !customRole) return res.status(400).json({ error: 'Custom role not found' });
  if (customRole?.baseRole === Role.SYSTEM_ADMINISTRATOR && req.user!.role !== Role.SYSTEM_ADMINISTRATOR) {
    return res.status(403).json({ error: 'Only a System Administrator can grant this role' });
  }
  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: {
      email: normalizedEmail,
      passwordHash,
      firstName,
      lastName,
      role: customRole?.baseRole ?? role,
      customRoleId: customRole?.id ?? null,
      departmentId: departmentId || null,
    },
    include: { department: true, customRole: true },
  });

  res.status(201).json({
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    customRole: user.customRole,
    department: user.department,
    createdAt: user.createdAt,
  });
});

router.patch('/:id', authMiddleware, async (req: Request, res: Response) => {
  if (!requireAdmin(req.user!.role)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const id = routeParam(req.params.id);
  const { firstName, lastName, role, customRoleId, departmentId, isActive, password } = req.body;

  if (role !== undefined && !Object.values(Role).includes(role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }
  if (role === Role.SYSTEM_ADMINISTRATOR && req.user!.role !== Role.SYSTEM_ADMINISTRATOR) {
    return res.status(403).json({ error: 'Only a System Administrator can grant this role' });
  }
  if (password !== undefined && !validPassword(String(password))) {
    return res.status(400).json({ error: 'Password must be 12–128 characters' });
  }
  if (req.user!.id === id && isActive === false) {
    return res.status(400).json({ error: 'You cannot deactivate your own account' });
  }

  const data: Record<string, unknown> = {};
  if (firstName) data.firstName = firstName;
  if (lastName) data.lastName = lastName;
  if (customRoleId !== undefined) {
    const customRole = customRoleId ? await prisma.customRole.findUnique({ where: { id: customRoleId } }) : null;
    if (customRoleId && !customRole) return res.status(400).json({ error: 'Custom role not found' });
    if (customRole?.baseRole === Role.SYSTEM_ADMINISTRATOR && req.user!.role !== Role.SYSTEM_ADMINISTRATOR) {
      return res.status(403).json({ error: 'Only a System Administrator can grant this role' });
    }
    data.customRoleId = customRole?.id ?? null;
    if (customRole) data.role = customRole.baseRole;
    else if (role) data.role = role;
  } else if (role) {
    data.role = role;
    data.customRoleId = null;
  }
  if (departmentId !== undefined) data.departmentId = departmentId || null;
  if (isActive !== undefined) data.isActive = isActive;
  if (password) data.passwordHash = await bcrypt.hash(password, 12);

  const user = await prisma.user.update({
    where: { id },
    data,
    include: { department: true, customRole: true },
  });

  res.json({
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    customRole: user.customRole,
    department: user.department,
    createdAt: user.createdAt,
  });
});

router.get('/:id', authMiddleware, async (req: Request, res: Response) => {
  const requestedId = routeParam(req.params.id);
  const user = await prisma.user.findUnique({
    where: { id: requestedId },
    include: {
      department: true,
      _count: { select: { documents: true, signatures: true, auditLogs: true } },
    },
  });
  if (!user) return res.status(404).json({ error: 'User not found' });
  const canViewProfile = req.user!.id === requestedId ||
    requireAdmin(req.user!.role) ||
    (req.user!.role === Role.HOD && req.user!.departmentId === user.departmentId);
  if (!canViewProfile) return res.status(403).json({ error: 'Forbidden' });

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

  const ext = path.extname(fileName).toLowerCase() || '.png';
  const allowed = ['.png', '.jpg', '.jpeg', '.webp'];
  if (!allowed.includes(ext)) {
    return res.status(400).json({ error: 'Supported formats: PNG, JPG, WEBP' });
  }

  let saved;
  try {
    saved = saveBase64Upload(fileName, data, ext.slice(1), 'signatures');
  } catch (error) {
    if (error instanceof UploadTooLargeError || error instanceof InvalidUploadError) {
      return res.status(400).json({ error: error.message });
    }
    throw error;
  }

  const user = await prisma.user.update({
    where: { id },
    data: { signatureImage: saved.filePath },
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
