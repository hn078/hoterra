import type { NextFunction, Request, Response } from 'express';
import type { Capability } from '../domain/capability';

export function hasCapability(
  user: Express.Request['user'],
  capability: Capability,
): boolean {
  return Boolean(user?.capabilities.includes(capability));
}

export function requireCapability(...required: Capability[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !required.every((capability) => hasCapability(req.user, capability))) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  };
}

export function requireAnyCapability(...allowed: Capability[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !allowed.some((capability) => hasCapability(req.user, capability))) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  };
}
