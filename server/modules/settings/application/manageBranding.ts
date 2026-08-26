import { AuditAction } from '@prisma/client';
import type * as DatabaseModule from '../../../db';
import type { AuthUser } from '../../../middleware/auth';
import { DEFAULT_SETTINGS } from './settingsDefaults';

type SettingsDatabase = typeof DatabaseModule.prisma;
export type BrandingAsset = 'logo' | 'background';

export interface BrandingStorage {
  save(fileName: string, data: string): { filePath: string };
  remove(filePath: string): void;
}

export class BrandingSettingsError extends Error {
  constructor(public readonly code: 'FORBIDDEN' | 'INVALID_ASSET' | 'INVALID_INPUT') {
    super(code);
    this.name = 'BrandingSettingsError';
  }
}

function brandingField(asset: BrandingAsset) {
  return asset === 'logo' ? 'loginLogoPath' : 'loginBackgroundPath';
}

export function parseBrandingAsset(value: unknown): BrandingAsset {
  if (value !== 'logo' && value !== 'background') throw new BrandingSettingsError('INVALID_ASSET');
  return value;
}

export async function replaceBrandingAsset(
  database: SettingsDatabase,
  actor: AuthUser,
  asset: BrandingAsset,
  input: { fileName?: unknown; data?: unknown },
  storage: BrandingStorage,
) {
  if (!actor.capabilities.includes('settings.manage.business')) throw new BrandingSettingsError('FORBIDDEN');
  const fileName = String(input.fileName ?? '').trim();
  const data = String(input.data ?? '');
  if (!fileName || !data) throw new BrandingSettingsError('INVALID_INPUT');
  const saved = storage.save(fileName, data);
  const field = brandingField(asset);
  let previousPath: string | null = null;
  try {
    const settings = await database.$transaction(async (transaction) => {
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`settings:branding:${actor.tenantId}:${asset}`}))`;
      const current = await transaction.systemSettings.findFirst();
      previousPath = current?.[field] ?? null;
      const updated = current
        ? await transaction.systemSettings.update({ where: { id: current.id }, data: { [field]: saved.filePath } })
        : await transaction.systemSettings.create({ data: { ...DEFAULT_SETTINGS, [field]: saved.filePath } });
      await transaction.auditLog.create({
        data: {
          userId: actor.id,
          userName: `${actor.firstName} ${actor.lastName}`,
          action: AuditAction.UPDATE,
          entityType: 'TenantBranding',
          entityId: updated.id,
          details: `${asset === 'logo' ? 'Login logo' : 'Login background'} updated`,
        },
      });
      return updated;
    });
    if (previousPath && previousPath !== saved.filePath) {
      try { storage.remove(previousPath); } catch { /* database already references the new asset */ }
    }
    return { loginLogoPath: settings.loginLogoPath, loginBackgroundPath: settings.loginBackgroundPath };
  } catch (error) {
    try { storage.remove(saved.filePath); } catch { /* preserve the database error */ }
    throw error;
  }
}

export async function resetBrandingAsset(
  database: SettingsDatabase,
  actor: AuthUser,
  asset: BrandingAsset,
  storage: BrandingStorage,
) {
  if (!actor.capabilities.includes('settings.manage.business')) throw new BrandingSettingsError('FORBIDDEN');
  const field = brandingField(asset);
  let previousPath: string | null = null;
  const settings = await database.$transaction(async (transaction) => {
    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`settings:branding:${actor.tenantId}:${asset}`}))`;
    const current = await transaction.systemSettings.findFirst();
    if (!current) return null;
    previousPath = current[field];
    if (!previousPath) return current;
    const updated = await transaction.systemSettings.update({ where: { id: current.id }, data: { [field]: null } });
    await transaction.auditLog.create({
      data: {
        userId: actor.id,
        userName: `${actor.firstName} ${actor.lastName}`,
        action: AuditAction.UPDATE,
        entityType: 'TenantBranding',
        entityId: updated.id,
        details: `${asset === 'logo' ? 'Login logo' : 'Login background'} reset to default`,
      },
    });
    return updated;
  });
  if (previousPath) {
    try { storage.remove(previousPath); } catch { /* the reset is already committed */ }
  }
  return {
    loginLogoPath: settings?.loginLogoPath ?? null,
    loginBackgroundPath: settings?.loginBackgroundPath ?? null,
  };
}
