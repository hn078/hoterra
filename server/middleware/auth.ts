import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { Role } from '@prisma/client';

export interface AuthUser {
  id: string;
  email: string;
  role: Role;
  firstName: string;
  lastName: string;
  departmentId?: string | null;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

const JWT_SECRET = process.env.JWT_SECRET || 'hoterra-dev-secret';

export function signToken(user: AuthUser): string {
  return jwt.sign(user, JWT_SECRET, { expiresIn: '8h' });
}

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const token = header.slice(7);
    req.user = jwt.verify(token, JWT_SECRET) as AuthUser;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

export function requireRoles(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  };
}

const VIEW_ALL_ROLES: Role[] = [
  Role.GENERAL_MANAGER,
  Role.SYSTEM_ADMINISTRATOR,
  Role.FINANCE_DIRECTOR,
];

const MANAGE_DOC_ROLES: Role[] = [
  Role.SUPERVISOR,
  Role.HOD,
  Role.GENERAL_MANAGER,
  Role.SYSTEM_ADMINISTRATOR,
];

export function canViewAllDocuments(role: Role): boolean {
  return VIEW_ALL_ROLES.includes(role);
}

export function canViewDocument(user: AuthUser, document: { departmentId: string }): boolean {
  if (canViewAllDocuments(user.role)) return true;
  return document.departmentId === user.departmentId;
}

export function canManageDocuments(role: Role): boolean {
  return MANAGE_DOC_ROLES.includes(role);
}
