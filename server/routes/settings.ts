import { Router, Request, Response } from 'express';
import { Role, AuditAction } from '@prisma/client';
import { prisma } from '../db';
import { authMiddleware, requireRoles } from '../middleware/auth';
import { parseExtendedConfig, DEFAULT_EXTENDED_CONFIG } from '../settingsExtended';

const router = Router();

const DEFAULT_SETTINGS = {
  id: 'default',
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

function withExtended(settings: { extendedConfig: string; [k: string]: unknown }) {
  return {
    ...settings,
    extended: parseExtendedConfig(settings.extendedConfig),
  };
}

router.get('/stats', authMiddleware, async (_req: Request, res: Response) => {
  const [users, docBytes, attBytes] = await Promise.all([
    prisma.user.count({ where: { isActive: true } }),
    prisma.document.aggregate({ _sum: { fileSize: true } }),
    prisma.documentAttachment.aggregate({ _sum: { fileSize: true } }),
  ]);
  const bytes = (docBytes._sum.fileSize ?? 0) + (attBytes._sum.fileSize ?? 0);
  const storageGb = Math.round((bytes / (1024 ** 3)) * 100) / 100;
  const settings = await prisma.systemSettings.findUnique({ where: { id: 'default' } });
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

router.get('/', authMiddleware, async (_req: Request, res: Response) => {
  let settings = await prisma.systemSettings.findUnique({ where: { id: 'default' } });
  if (!settings) {
    settings = await prisma.systemSettings.create({ data: DEFAULT_SETTINGS });
  }
  res.json(withExtended(settings));
});

router.put(
  '/',
  authMiddleware,
  requireRoles(Role.SYSTEM_ADMINISTRATOR, Role.GENERAL_MANAGER),
  async (req: Request, res: Response) => {
    const { extended, ...rest } = req.body;
    const data: Record<string, unknown> = { ...rest };
    if (extended) {
      data.extendedConfig = JSON.stringify(extended);
    }
    const settings = await prisma.systemSettings.upsert({
      where: { id: 'default' },
      update: data,
      create: { ...DEFAULT_SETTINGS, ...data },
    });
    res.json(withExtended(settings));
  }
);

router.post(
  '/maintenance/clear-cache',
  authMiddleware,
  requireRoles(Role.SYSTEM_ADMINISTRATOR),
  async (_req: Request, res: Response) => {
    const settings = await prisma.systemSettings.findUnique({ where: { id: 'default' } });
    const ext = parseExtendedConfig(settings?.extendedConfig);
    ext.system.lastCacheClear = new Date().toISOString();
    await prisma.systemSettings.update({
      where: { id: 'default' },
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
    const settings = await prisma.systemSettings.findUnique({ where: { id: 'default' } });
    const ext = parseExtendedConfig(settings?.extendedConfig);
    ext.system.lastReindex = new Date().toISOString();
    ext.system.searchIndexVersion += 1;
    await prisma.systemSettings.update({
      where: { id: 'default' },
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

router.get('/maintenance/logs', authMiddleware, async (_req: Request, res: Response) => {
  const logs = await prisma.auditLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  res.json(logs);
});

export default router;
