import { Request, Response, NextFunction } from 'express';
import jwt, { type JwtPayload, type SignOptions } from 'jsonwebtoken';
import { Role } from '@prisma/client';
import { runtimeConfig } from '../config';
import { prisma } from '../db';

export interface AuthUser {
  id: string;
  tenantId: string;
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

type TokenClaims = JwtPayload & { tenantId?: string };

export function signToken(user: AuthUser): string {
  return jwt.sign(
    { tenantId: user.tenantId },
    runtimeConfig.jwtSecret,
    {
      algorithm: 'HS256',
      expiresIn: runtimeConfig.jwtExpiresIn as SignOptions['expiresIn'],
      issuer: 'hoterra-api',
      audience: 'hoterra-web',
      subject: user.id,
    }
  );
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const token = header.slice(7);
    const claims = jwt.verify(token, runtimeConfig.jwtSecret, {
      algorithms: ['HS256'],
      issuer: 'hoterra-api',
      audience: 'hoterra-web',
    }) as TokenClaims;
    if (!req.tenant || !claims.sub || claims.tenantId !== req.tenant.id) {
      return res.status(401).json({ error: 'Token is not valid for this hotel workspace' });
    }

    const currentUser = await prisma.user.findUnique({ where: { id: claims.sub } });
    if (!currentUser?.isActive) {
      return res.status(401).json({ error: 'Account is no longer active' });
    }
    req.user = {
      id: currentUser.id,
      tenantId: currentUser.tenantId,
      email: currentUser.email,
      role: currentUser.role,
      firstName: currentUser.firstName,
      lastName: currentUser.lastName,
      departmentId: currentUser.departmentId,
    };
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
