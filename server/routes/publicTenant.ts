import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import { systemPrisma } from '../db';
import { asyncHandler } from '../lib/asyncHandler';
import { resolveUploadPath } from '../lib/uploads';
import {
  readPublicBrandingAsset,
  readPublicTenantBranding,
  type PublicBrandingAsset,
} from '../modules/tenancy';

const router = Router();

router.get('/tenants/:slug/branding', asyncHandler(async (req, res) => {
  const branding = await readPublicTenantBranding(systemPrisma, req.params.slug);
  if (!branding) return res.status(404).json({ error: 'Hotel workspace not found' });
  return res.json(branding);
}));

router.get('/tenants/:slug/branding/:asset', asyncHandler(async (req, res) => {
  const asset = String(req.params.asset);
  if (asset !== 'logo' && asset !== 'background') {
    return res.status(404).json({ error: 'Branding asset not found' });
  }

  const brandingAsset = await readPublicBrandingAsset(
    systemPrisma,
    req.params.slug,
    asset as PublicBrandingAsset,
  );
  if (!brandingAsset) {
    return res.status(404).json({ error: 'Branding asset not found' });
  }

  const absolutePath = resolveUploadPath(brandingAsset.storedPath);
  if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
    return res.status(404).json({ error: 'Branding asset not found' });
  }

  res.setHeader('Cache-Control', 'public, max-age=300, must-revalidate');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // Branding images are intentionally public and are embedded by tenant
  // subdomains while the API is hosted on a separate Railway domain.
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.type(path.extname(absolutePath));
  res.setHeader('Content-Disposition', 'inline');
  return res.sendFile(absolutePath);
}));

export default router;
