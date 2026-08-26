import path from 'node:path';
import type * as DatabaseModule from '../../../db';
import { normalizePublicTenantSlug } from '../domain/tenantSlug';

type TenantRegistryDatabase = typeof DatabaseModule.systemPrisma;
export type PublicBrandingAsset = 'logo' | 'background';

const publicTenantSelect = {
  id: true,
  name: true,
  slug: true,
} as const;

const publicSettingsSelect = {
  companyName: true,
  loginLogoPath: true,
  loginBackgroundPath: true,
} as const;

async function findPublicTenant(database: TenantRegistryDatabase, slugValue: unknown) {
  const slug = normalizePublicTenantSlug(slugValue);
  if (!slug) return null;
  const tenant = await database.tenant.findFirst({
    where: { slug, isActive: true },
    select: publicTenantSelect,
  });
  if (!tenant) return null;

  // The registry lookup is intentionally system-scoped. SystemSettings is RLS
  // protected, so switch only this transaction to the already resolved active
  // tenant before reading the public branding fields.
  const systemSettings = await database.$transaction(async (transaction) => {
    await transaction.$executeRaw`SELECT set_config('hoterra.tenant_id', ${tenant.id}, true)`;
    return transaction.systemSettings.findUnique({
      where: { tenantId: tenant.id },
      select: publicSettingsSelect,
    });
  });
  return { ...tenant, systemSettings };
}

export async function readPublicTenantBranding(
  database: TenantRegistryDatabase,
  slugValue: unknown,
) {
  const tenant = await findPublicTenant(database, slugValue);
  if (!tenant) return null;
  const base = `/public/tenants/${encodeURIComponent(tenant.slug)}/branding`;
  const logoVersion = tenant.systemSettings?.loginLogoPath
    ? encodeURIComponent(path.basename(tenant.systemSettings.loginLogoPath))
    : null;
  const backgroundVersion = tenant.systemSettings?.loginBackgroundPath
    ? encodeURIComponent(path.basename(tenant.systemSettings.loginBackgroundPath))
    : null;
  return {
    tenantName: tenant.name,
    companyName: tenant.systemSettings?.companyName || tenant.name,
    logoUrl: logoVersion ? `${base}/logo?v=${logoVersion}` : null,
    backgroundUrl: backgroundVersion ? `${base}/background?v=${backgroundVersion}` : null,
  };
}

export async function readPublicBrandingAsset(
  database: TenantRegistryDatabase,
  slugValue: unknown,
  asset: PublicBrandingAsset,
) {
  const tenant = await findPublicTenant(database, slugValue);
  if (!tenant) return null;
  const storedPath = asset === 'logo'
    ? tenant.systemSettings?.loginLogoPath
    : tenant.systemSettings?.loginBackgroundPath;
  const expectedPrefix = `/uploads/${tenant.id}/branding/`;
  return storedPath?.startsWith(expectedPrefix) ? { storedPath } : null;
}
