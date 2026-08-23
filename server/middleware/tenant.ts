import type { NextFunction, Request, Response } from 'express';
import { systemPrisma } from '../db';
import { runWithTenant, type TenantContext } from '../lib/tenantContext';

const DEFAULT_TENANT_SLUG = process.env.DEFAULT_TENANT_SLUG || 'hgi';
const BASE_DOMAIN = (process.env.TENANT_BASE_DOMAIN || 'hoterra.net').toLowerCase();
const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

declare global {
  namespace Express {
    interface Request {
      tenant?: TenantContext;
    }
  }
}

export function normalizeTenantSlug(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

function requestHost(req: Request): string {
  const forwarded = req.headers['x-forwarded-host'];
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded || req.headers.host || '';
  return String(raw).split(',')[0].trim().split(':')[0].toLowerCase();
}

export function resolveRequestedTenantSlug(req: Request): string {
  const headerSlug = normalizeTenantSlug(req.headers['x-tenant-slug']);
  if (headerSlug) return headerSlug;

  const host = requestHost(req);
  if (host.endsWith(`.${BASE_DOMAIN}`)) {
    const subdomain = host.slice(0, -(BASE_DOMAIN.length + 1));
    if (subdomain && !subdomain.includes('.') && !['www', 'app', 'api', 'backend'].includes(subdomain)) {
      return subdomain;
    }
  }

  return DEFAULT_TENANT_SLUG;
}

export async function tenantMiddleware(req: Request, res: Response, next: NextFunction) {
  const slug = resolveRequestedTenantSlug(req);
  if (!SLUG_PATTERN.test(slug)) {
    return res.status(400).json({ error: 'Invalid tenant slug', code: 'INVALID_TENANT' });
  }

  const tenant = await systemPrisma.tenant.findUnique({ where: { slug } });
  if (!tenant || !tenant.isActive) {
    return res.status(404).json({
      error: `Hotel workspace "${slug}" was not found`,
      code: 'TENANT_NOT_FOUND',
    });
  }

  const context: TenantContext = { id: tenant.id, slug: tenant.slug, name: tenant.name };
  req.tenant = context;
  return runWithTenant(context, next);
}

