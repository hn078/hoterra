import type * as DatabaseModule from '../../../db';
import type { AuthUser } from '../../../middleware/auth';
import { parseExtendedConfig } from '../domain/extendedConfig';
import type { TenantContext } from '../../../lib/tenantContext';
import {
  BUSINESS_EXTENDED_SECTIONS,
  DEFAULT_SETTINGS,
  TENANT_BASE_DOMAIN,
} from './settingsDefaults';

type SettingsDatabase = typeof DatabaseModule.prisma;

function publicExtendedConfig(raw: string | null | undefined, includeSecurity: boolean) {
  const extended = parseExtendedConfig(raw) as unknown as Record<string, unknown>;
  if (includeSecurity) {
    const security = extended.security as Record<string, unknown>;
    return {
      ...extended,
      security: { ...security, enable2FA: false, ipRestrictions: [] },
    };
  }
  return Object.fromEntries(BUSINESS_EXTENDED_SECTIONS.map((section) => [section, extended[section]]));
}

export function toSettingsDto(
  stored: Record<string, any> | null,
  tenant: TenantContext,
  actor: AuthUser,
) {
  const settings = { ...DEFAULT_SETTINGS, ...(stored ?? {}) };
  return {
    tenantId: tenant.id,
    tenantName: tenant.name,
    tenantSlug: tenant.slug,
    tenantUrl: `https://${tenant.slug}.${TENANT_BASE_DOMAIN}`,
    companyName: settings.companyName,
    companyAddress: settings.companyAddress,
    timezone: settings.timezone,
    dateFormat: settings.dateFormat,
    timeFormat: settings.timeFormat,
    systemLanguage: settings.systemLanguage,
    enableVersioning: settings.enableVersioning,
    mandatoryReviewDate: settings.mandatoryReviewDate,
    requireDescription: settings.requireDescription,
    allowDownload: settings.allowDownload,
    autoLogoutMinutes: settings.autoLogoutMinutes,
    recordsPerPage: settings.recordsPerPage,
    enable2FA: false,
    allowComments: settings.allowComments,
    showTooltips: settings.showTooltips,
    defaultStartPage: settings.defaultStartPage,
    defaultDocSort: settings.defaultDocSort,
    defaultDocStatus: settings.defaultDocStatus,
    notifyEmail: settings.notifyEmail,
    notifyPush: settings.notifyPush,
    notifyInApp: settings.notifyInApp,
    loginLogoPath: settings.loginLogoPath,
    loginBackgroundPath: settings.loginBackgroundPath,
    extended: publicExtendedConfig(
      settings.extendedConfig,
      actor.capabilities.includes('settings.manage.security'),
    ),
  };
}

export async function readSettings(database: SettingsDatabase, tenant: TenantContext, actor: AuthUser) {
  if (!actor.capabilities.includes('settings.read')) throw new SettingsReadError('FORBIDDEN');
  const settings = await database.systemSettings.findFirst();
  return toSettingsDto(settings, tenant, actor);
}

export async function readSettingsStats(database: SettingsDatabase, actor: AuthUser) {
  if (!actor.capabilities.includes('settings.read')) throw new SettingsReadError('FORBIDDEN');
  const [users, docBytes, attBytes, settings] = await Promise.all([
    database.user.count({ where: { isActive: true } }),
    database.document.aggregate({ _sum: { fileSize: true } }),
    database.documentAttachment.aggregate({ _sum: { fileSize: true } }),
    database.systemSettings.findFirst({ select: { extendedConfig: true } }),
  ]);
  const bytes = (docBytes._sum.fileSize ?? 0) + (attBytes._sum.fileSize ?? 0);
  const storageGb = Math.round((bytes / (1024 ** 3)) * 100) / 100;
  const ext = parseExtendedConfig(settings?.extendedConfig);
  const storageTotalGb = Math.max(1, ext.storage.totalGb);
  return {
    systemVersion: 'v1.0.7',
    storageGb,
    storageTotalGb,
    storagePercent: Math.round((storageGb / storageTotalGb) * 1000) / 10,
    activeUsers: users,
    licenseSeats: ext.license.seats,
    uptime: '99.9%',
    licenseTier: ext.license.tier,
    licenseValidUntil: ext.license.validUntil,
  };
}

export class SettingsReadError extends Error {
  constructor(public readonly code: 'FORBIDDEN') {
    super(code);
    this.name = 'SettingsReadError';
  }
}
