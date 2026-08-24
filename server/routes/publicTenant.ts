import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import { systemPrisma } from '../db';
import { asyncHandler } from '../lib/asyncHandler';
import { resolveUploadPath } from '../lib/uploads';

const router = Router();
const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

async function publicTenant(slugValue: unknown) {
  const slug = String(slugValue ?? '').trim().toLowerCase();
  if (!SLUG_PATTERN.test(slug)) return null;
  return systemPrisma.tenant.findFirst({
    where: { slug, isActive: true },
    select: {
      id: true,
      name: true,
      slug: true,
      systemSettings: {
        select: {
          companyName: true,
          loginLogoPath: true,
          loginBackgroundPath: true,
        },
      },
    },
  });
}

router.get('/tenants/:slug/branding', asyncHandler(async (req, res) => {
  const tenant = await publicTenant(req.params.slug);
  if (!tenant) return res.status(404).json({ error: 'Hotel workspace not found' });

  const base = `/public/tenants/${encodeURIComponent(tenant.slug)}/branding`;
  const logoVersion = tenant.systemSettings?.loginLogoPath
    ? encodeURIComponent(path.basename(tenant.systemSettings.loginLogoPath))
    : null;
  const backgroundVersion = tenant.systemSettings?.loginBackgroundPath
    ? encodeURIComponent(path.basename(tenant.systemSettings.loginBackgroundPath))
    : null;
  return res.json({
    tenantName: tenant.name,
    companyName: tenant.systemSettings?.companyName || tenant.name,
    logoUrl: logoVersion ? `${base}/logo?v=${logoVersion}` : null,
    backgroundUrl: backgroundVersion ? `${base}/background?v=${backgroundVersion}` : null,
  });
}));

router.get('/tenants/:slug/branding/:asset', asyncHandler(async (req, res) => {
  const asset = String(req.params.asset);
  if (asset !== 'logo' && asset !== 'background') {
    return res.status(404).json({ error: 'Branding asset not found' });
  }

  const tenant = await publicTenant(req.params.slug);
  if (!tenant) return res.status(404).json({ error: 'Hotel workspace not found' });
  const storedPath = asset === 'logo'
    ? tenant.systemSettings?.loginLogoPath
    : tenant.systemSettings?.loginBackgroundPath;
  const expectedPrefix = `/uploads/${tenant.id}/branding/`;
  if (!storedPath || !storedPath.startsWith(expectedPrefix)) {
    return res.status(404).json({ error: 'Branding asset not found' });
  }

  const absolutePath = resolveUploadPath(storedPath);
  if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
    return res.status(404).json({ error: 'Branding asset not found' });
  }

  res.setHeader('Cache-Control', 'public, max-age=300, must-revalidate');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.type(path.extname(absolutePath));
  res.setHeader('Content-Disposition', 'inline');
  return res.sendFile(absolutePath);
}));

export default router;
