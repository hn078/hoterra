import { Router, Request, Response } from 'express';
import { prisma, systemPrisma } from '../db';
import { authMiddleware } from '../middleware/auth';
import { requireCapability } from '../modules/access-control';
import {
  BrandingSettingsError,
  BusinessSettingsError,
  checkTenantSlugAvailability,
  parseBrandingAsset,
  replaceBrandingAsset,
  resetBrandingAsset,
  updateBusinessSettings,
} from '../modules/settings';
import { asyncHandler } from '../lib/asyncHandler';
import {
  deleteTenantUpload,
  InvalidUploadError,
  saveBase64ImageUpload,
  UploadTooLargeError,
} from '../lib/uploads';
const router = Router();

function businessError(error: BusinessSettingsError, res: Response) {
  if (error.code === 'FORBIDDEN') return res.status(403).json({ error: 'Forbidden' });
  if (error.code === 'SLUG_TAKEN') return res.status(409).json({ error: 'This hotel subdomain is already in use' });
  if (error.code === 'INVALID_SLUG') {
    return res.status(400).json({ error: 'Slug must contain only lowercase letters, numbers and single hyphens' });
  }
  return res.status(400).json({ error: error.detail || 'Invalid settings' });
}

function storage() {
  return {
    save: (fileName: string, data: string) => saveBase64ImageUpload(fileName, data, 'branding'),
    remove: (filePath: string) => deleteTenantUpload(filePath, 'branding'),
  };
}

router.get(
  '/tenant/slug-availability',
  authMiddleware,
  requireCapability('settings.manage.business'),
  asyncHandler(async (req: Request, res: Response) => {
    try {
      res.json(await checkTenantSlugAvailability(systemPrisma, req.tenant!, req.user!, req.query.slug));
    } catch (error) {
      if (!(error instanceof BusinessSettingsError)) throw error;
      return businessError(error, res);
    }
  }),
);

router.post(
  '/branding/:asset',
  authMiddleware,
  requireCapability('settings.manage.business'),
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const asset = parseBrandingAsset(req.params.asset);
      res.json(await replaceBrandingAsset(prisma, req.user!, asset, req.body, storage()));
    } catch (error) {
      if (error instanceof BrandingSettingsError) {
        if (error.code === 'INVALID_ASSET') return res.status(404).json({ error: 'Branding asset not found' });
        if (error.code === 'FORBIDDEN') return res.status(403).json({ error: 'Forbidden' });
        return res.status(400).json({ error: 'fileName and data are required' });
      }
      if (error instanceof InvalidUploadError || error instanceof UploadTooLargeError) {
        return res.status(400).json({ error: error.message });
      }
      throw error;
    }
  }),
);

router.delete(
  '/branding/:asset',
  authMiddleware,
  requireCapability('settings.manage.business'),
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const asset = parseBrandingAsset(req.params.asset);
      res.json(await resetBrandingAsset(prisma, req.user!, asset, storage()));
    } catch (error) {
      if (!(error instanceof BrandingSettingsError)) throw error;
      if (error.code === 'INVALID_ASSET') return res.status(404).json({ error: 'Branding asset not found' });
      return res.status(403).json({ error: 'Forbidden' });
    }
  }),
);

router.put(
  '/',
  authMiddleware,
  requireCapability('settings.manage.business'),
  asyncHandler(async (req: Request, res: Response) => {
    try {
      res.json(await updateBusinessSettings(systemPrisma, req.tenant!, req.user!, req.body));
    } catch (error) {
      if (!(error instanceof BusinessSettingsError)) throw error;
      return businessError(error, res);
    }
  }),
);

export default router;
