import { Router, Request, Response } from 'express';
import { Role, AuditAction } from '@prisma/client';
import { prisma, systemPrisma } from '../db';
import { authMiddleware, requireRoles } from '../middleware/auth';
import { parseExtendedConfig, DEFAULT_EXTENDED_CONFIG } from '../settingsExtended';
import {
  deleteTenantUpload,
  InvalidUploadError,
  saveBase64ImageUpload,
  UploadTooLargeError,
} from '../lib/uploads';

const router = Router();

const DEFAULT_SETTINGS = {
  companyName: 'HOTERRA Hotels & Resorts',
  companyAddress: 'Baku, Azerbaijan',
  timezone: 'Asia/Baku',
  dateFormat: 'DD MMM YYYY',
  timeFormat: '24h',
  systemLanguage: 'en',
  enableVersioning: true,
  mandatoryReviewDate: true,
  requireDescription: false,
  allowDownload: true,
  autoLogoutMinutes: 30,
  recordsPerPage: 20,
  enable2FA: true,
  allowComments: true,
  showTooltips: true,
  defaultStartPage: 'dashboard',
  defaultDocSort: 'updated_desc',
  defaultDocStatus: 'DRAFT',
  notifyEmail: true,
  notifyPush: true,
  notifyInApp: true,
  extendedConfig: JSON.stringify(DEFAULT_EXTENDED_CONFIG),
};

const TENANT_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const RESERVED_TENANT_SLUGS = new Set(['www', 'app', 'api', 'backend', 'admin', 'mail', 'support']);
const TENANT_BASE_DOMAIN = process.env.TENANT_BASE_DOMAIN || 'hoterra.net';

function withExtended(
  settings: { extendedConfig: string; [k: string]: unknown },
  tenant: { id: string; name: string; slug: string }
) {
  return {
    ...settings,
    extended: parseExtendedConfig(settings.extendedConfig),
    tenantId: tenant.id,
    tenantName: tenant.name,
    tenantSlug: tenant.slug,
    tenantUrl: `https://${tenant.slug}.${TENANT_BASE_DOMAIN}`,
  };
}

router.get('/stats', authMiddleware, requireRoles(Role.SYSTEM_ADMINISTRATOR, Role.GENERAL_MANAGER), async (_req: Request, res: Response) => {
  const [users, docBytes, attBytes] = await Promise.all([
    prisma.user.count({ where: { isActive: true } }),
    prisma.document.aggregate({ _sum: { fileSize: true } }),
    prisma.documentAttachment.aggregate({ _sum: { fileSize: true } }),
  ]);
  const bytes = (docBytes._sum.fileSize ?? 0) + (attBytes._sum.fileSize ?? 0);
  const storageGb = Math.round((bytes / (1024 ** 3)) * 100) / 100;
  const settings = await prisma.systemSettings.findFirst();
  const ext = parseExtendedConfig(settings?.extendedConfig);

  res.json({
    systemVersion: 'v1.0.3',
    storageGb,
    storageTotalGb: ext.storage.totalGb,
    storagePercent: Math.round((storageGb / ext.storage.totalGb) * 1000) / 10,
    activeUsers: users,
    licenseSeats: ext.license.seats,
    uptime: '99.9%',
    licenseTier: ext.license.tier,
    licenseValidUntil: ext.license.validUntil,
  });
});

router.get('/tenant/slug-availability', authMiddleware, requireRoles(Role.SYSTEM_ADMINISTRATOR, Role.GENERAL_MANAGER), async (req: Request, res: Response) => {
  const slug = String(req.query.slug ?? '').trim().toLowerCase();
  if (!TENANT_SLUG_PATTERN.test(slug) || RESERVED_TENANT_SLUGS.has(slug)) {
    return res.json({ slug, available: false, reason: 'invalid' });
  }
  const existing = await systemPrisma.tenant.findUnique({ where: { slug } });
  return res.json({
    slug,
    available: !existing || existing.id === req.tenant!.id,
    reason: existing && existing.id !== req.tenant!.id ? 'taken' : null,
    url: `https://${slug}.${TENANT_BASE_DOMAIN}`,
  });
});

router.post(
  '/branding/:asset',
  authMiddleware,
  requireRoles(Role.SYSTEM_ADMINISTRATOR, Role.GENERAL_MANAGER),
  async (req: Request, res: Response) => {
    const asset = String(req.params.asset);
    if (asset !== 'logo' && asset !== 'background') {
      return res.status(404).json({ error: 'Branding asset not found' });
    }
    const fileName = String(req.body.fileName ?? '').trim();
    const data = String(req.body.data ?? '');
    if (!fileName || !data) return res.status(400).json({ error: 'fileName and data are required' });

    try {
      const saved = saveBase64ImageUpload(fileName, data, 'branding');
      const field = asset === 'logo' ? 'loginLogoPath' : 'loginBackgroundPath';
      const current = await prisma.systemSettings.findFirst();
      const previousPath = current?.[field] ?? null;
      const settings = current
        ? await prisma.systemSettings.update({ where: { id: current.id }, data: { [field]: saved.filePath } })
        : await prisma.systemSettings.create({ data: { ...DEFAULT_SETTINGS, [field]: saved.filePath } });

      try {
        deleteTenantUpload(previousPath, 'branding');
      } catch (error) {
        console.warn('[branding] Could not remove replaced asset', error);
      }
      await prisma.auditLog.create({
        data: {
          userId: req.user!.id,
          userName: `${req.user!.firstName} ${req.user!.lastName}`,
          action: AuditAction.UPDATE,
          entityType: 'TenantBranding',
          details: `${asset === 'logo' ? 'Login logo' : 'Login background'} updated`,
        },
      });
      return res.json({
        loginLogoPath: settings.loginLogoPath,
        loginBackgroundPath: settings.loginBackgroundPath,
      });
    } catch (error) {
      if (error instanceof InvalidUploadError || error instanceof UploadTooLargeError) {
        return res.status(400).json({ error: error.message });
      }
      throw error;
    }
  }
);

router.delete(
  '/branding/:asset',
  authMiddleware,
  requireRoles(Role.SYSTEM_ADMINISTRATOR, Role.GENERAL_MANAGER),
  async (req: Request, res: Response) => {
    const asset = String(req.params.asset);
    if (asset !== 'logo' && asset !== 'background') {
      return res.status(404).json({ error: 'Branding asset not found' });
    }
    const field = asset === 'logo' ? 'loginLogoPath' : 'loginBackgroundPath';
    const current = await prisma.systemSettings.findFirst();
    if (!current) return res.json({ loginLogoPath: null, loginBackgroundPath: null });
    const previousPath = current[field];
    const settings = await prisma.systemSettings.update({ where: { id: current.id }, data: { [field]: null } });
    try {
      deleteTenantUpload(previousPath, 'branding');
    } catch (error) {
      console.warn('[branding] Could not remove reset asset', error);
    }
    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        userName: `${req.user!.firstName} ${req.user!.lastName}`,
        action: AuditAction.UPDATE,
        entityType: 'TenantBranding',
        details: `${asset === 'logo' ? 'Login logo' : 'Login background'} reset to default`,
      },
    });
    return res.json({
      loginLogoPath: settings.loginLogoPath,
      loginBackgroundPath: settings.loginBackgroundPath,
    });
  }
);

router.get('/', authMiddleware, requireRoles(Role.SYSTEM_ADMINISTRATOR, Role.GENERAL_MANAGER), async (req: Request, res: Response) => {
  let settings = await prisma.systemSettings.findFirst();
  if (!settings) {
    settings = await prisma.systemSettings.create({ data: DEFAULT_SETTINGS });
  }
  res.json(withExtended(settings, req.tenant!));
});

router.put(
  '/',
  authMiddleware,
  requireRoles(Role.SYSTEM_ADMINISTRATOR, Role.GENERAL_MANAGER),
  async (req: Request, res: Response) => {
    const {
      extended,
      tenantSlug: requestedSlug,
      tenantName: requestedName,
      tenantUrl: _tenantUrl,
      tenantId: _tenantId,
      id: _id,
      extendedConfig: _extendedConfig,
      loginLogoPath: _loginLogoPath,
      loginBackgroundPath: _loginBackgroundPath,
      ...rest
    } = req.body;
    const tenantSlug = String(requestedSlug ?? req.tenant!.slug).trim().toLowerCase();
    const tenantName = String(requestedName ?? req.tenant!.name).trim();

    if (!TENANT_SLUG_PATTERN.test(tenantSlug) || RESERVED_TENANT_SLUGS.has(tenantSlug)) {
      return res.status(400).json({ error: 'Slug must contain only lowercase letters, numbers and single hyphens' });
    }
    if (!tenantName) return res.status(400).json({ error: 'Hotel name is required' });

    const duplicate = await systemPrisma.tenant.findFirst({
      where: { slug: tenantSlug, id: { not: req.tenant!.id } },
      select: { id: true },
    });
    if (duplicate) return res.status(409).json({ error: 'This hotel subdomain is already in use' });

    const data: Record<string, unknown> = { ...rest };
    if (extended) {
      data.extendedConfig = JSON.stringify(extended);
    }
    const result = await systemPrisma.$transaction(async (tx) => {
      const current = await tx.systemSettings.findFirst({ where: { tenantId: req.tenant!.id } });
      const settings = current
        ? await tx.systemSettings.update({ where: { id: current.id }, data })
        : await tx.systemSettings.create({ data: { ...DEFAULT_SETTINGS, ...data, tenantId: req.tenant!.id } });
      const tenant = await tx.tenant.update({
        where: { id: req.tenant!.id },
        data: { slug: tenantSlug, name: tenantName },
      });
      return { settings, tenant };
    });
    res.json(withExtended(result.settings, result.tenant));
  }
);

router.post(
  '/maintenance/clear-cache',
  authMiddleware,
  requireRoles(Role.SYSTEM_ADMINISTRATOR),
  async (_req: Request, res: Response) => {
    const settings = await prisma.systemSettings.findFirst();
    const ext = parseExtendedConfig(settings?.extendedConfig);
    ext.system.lastCacheClear = new Date().toISOString();
    await prisma.systemSettings.update({
      where: { id: settings!.id },
      data: { extendedConfig: JSON.stringify(ext) },
    });
    await prisma.auditLog.create({
      data: {
        userId: _req.user!.id,
        userName: `${_req.user!.firstName} ${_req.user!.lastName}`,
        action: AuditAction.UPDATE,
        entityType: 'System',
        details: 'System cache cleared',
      },
    });
    res.json({ ok: true, clearedAt: ext.system.lastCacheClear });
  }
);

router.post(
  '/maintenance/reindex',
  authMiddleware,
  requireRoles(Role.SYSTEM_ADMINISTRATOR),
  async (_req: Request, res: Response) => {
    const settings = await prisma.systemSettings.findFirst();
    const ext = parseExtendedConfig(settings?.extendedConfig);
    ext.system.lastReindex = new Date().toISOString();
    ext.system.searchIndexVersion += 1;
    await prisma.systemSettings.update({
      where: { id: settings!.id },
      data: { extendedConfig: JSON.stringify(ext) },
    });
    await prisma.auditLog.create({
      data: {
        userId: _req.user!.id,
        userName: `${_req.user!.firstName} ${_req.user!.lastName}`,
        action: AuditAction.UPDATE,
        entityType: 'System',
        details: 'Search index rebuilt',
      },
    });
    res.json({ ok: true, reindexedAt: ext.system.lastReindex, version: ext.system.searchIndexVersion });
  }
);

router.get('/maintenance/logs', authMiddleware, requireRoles(Role.SYSTEM_ADMINISTRATOR), async (_req: Request, res: Response) => {
  const logs = await prisma.auditLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  res.json(logs);
});

export default router;
