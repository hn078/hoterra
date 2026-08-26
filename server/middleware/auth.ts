import { Request, Response, NextFunction } from 'express';
import jwt, { type JwtPayload, type SignOptions } from 'jsonwebtoken';
import { Role } from '@prisma/client';
import { runtimeConfig } from '../config';
import { prisma } from '../db';
import { resolveEffectiveCapabilities, type Capability } from '../modules/access-control';

export interface AuthUser {
  id: string;
  tenantId: string;
  email: string;
  role: Role;
  firstName: string;
  lastName: string;
  jobTitle?: string | null;
  departmentId?: string | null;
  customRoleId?: string | null;
  capabilities: Capability[];
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

type TokenClaims = JwtPayload & { tenantId?: string; version?: number };

export function signToken(
  user: AuthUser,
  tokenVersion: number,
  expiresIn: SignOptions['expiresIn'] = runtimeConfig.jwtExpiresIn as SignOptions['expiresIn'],
): string {
  return jwt.sign(
    { tenantId: user.tenantId, version: tokenVersion },
    runtimeConfig.jwtSecret,
    {
      algorithm: 'HS256',
      expiresIn,
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

    const currentUser = await prisma.user.findUnique({
      where: { id: claims.sub },
      include: { customRole: { select: { permissions: true, isActive: true } } },
    });
    if (!currentUser?.isActive || claims.version !== currentUser.tokenVersion) {
      return res.status(401).json({ error: 'Account is no longer active' });
    }
    req.user = {
      id: currentUser.id,
      tenantId: currentUser.tenantId,
      email: currentUser.email,
      role: currentUser.role,
      firstName: currentUser.firstName,
      lastName: currentUser.lastName,
      jobTitle: currentUser.jobTitle,
      departmentId: currentUser.departmentId,
      customRoleId: currentUser.customRoleId,
      capabilities: resolveEffectiveCapabilities(currentUser.role, currentUser.customRole),
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
