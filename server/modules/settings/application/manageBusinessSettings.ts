import { AuditAction } from '@prisma/client';
import type * as DatabaseModule from '../../../db';
import type { AuthUser } from '../../../middleware/auth';
import type { TenantContext } from '../../../lib/tenantContext';
import { parseExtendedConfig } from '../domain/extendedConfig';
import {
  BUSINESS_EXTENDED_SECTIONS,
  DEFAULT_SETTINGS,
  RESERVED_TENANT_SLUGS,
  TENANT_BASE_DOMAIN,
  TENANT_SLUG_PATTERN,
} from './settingsDefaults';
import { toSettingsDto } from './settingsReadModel';

type SystemDatabase = typeof DatabaseModule.systemPrisma;
type TenantDatabase = typeof DatabaseModule.prisma;

export type BusinessSettingsErrorCode =
  | 'FORBIDDEN'
  | 'INVALID_INPUT'
  | 'INVALID_SLUG'
  | 'SLUG_TAKEN';

export class BusinessSettingsError extends Error {
  constructor(public readonly code: BusinessSettingsErrorCode, public readonly detail?: string) {
    super(code);
    this.name = 'BusinessSettingsError';
  }
}

const STRING_FIELDS = new Map<string, number>([
  ['companyName', 200],
  ['companyAddress', 500],
  ['timezone', 100],
  ['dateFormat', 40],
  ['timeFormat', 20],
  ['systemLanguage', 10],
  ['defaultStartPage', 100],
  ['defaultDocSort', 100],
  ['defaultDocStatus', 100],
]);
const BOOLEAN_FIELDS = [
  'enableVersioning',
  'mandatoryReviewDate',
  'requireDescription',
  'allowDownload',
  'allowComments',
  'showTooltips',
  'notifyEmail',
  'notifyPush',
  'notifyInApp',
] as const;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function assertSafeJson(value: unknown, depth = 0): void {
  if (depth > 8) throw new BusinessSettingsError('INVALID_INPUT', 'Settings are too deeply nested');
  if (value === null || ['string', 'boolean'].includes(typeof value)) return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new BusinessSettingsError('INVALID_INPUT');
    return;
  }
  if (Array.isArray(value)) {
    if (value.length > 100) throw new BusinessSettingsError('INVALID_INPUT', 'Too many setting values');
    value.forEach((item) => assertSafeJson(item, depth + 1));
    return;
  }
  if (!value || typeof value !== 'object') throw new BusinessSettingsError('INVALID_INPUT');
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (['__proto__', 'prototype', 'constructor'].includes(key)) throw new BusinessSettingsError('INVALID_INPUT');
    assertSafeJson(item, depth + 1);
  }
}

function businessData(input: Record<string, unknown>, currentExtendedConfig: string | null | undefined) {
  const data: Record<string, unknown> = {};
  for (const [field, maxLength] of STRING_FIELDS) {
    if (input[field] === undefined) continue;
    const value = String(input[field]).trim();
    if (!value || value.length > maxLength) throw new BusinessSettingsError('INVALID_INPUT', `${field} is invalid`);
    data[field] = value;
  }
  for (const field of BOOLEAN_FIELDS) {
    if (input[field] === undefined) continue;
    if (typeof input[field] !== 'boolean') throw new BusinessSettingsError('INVALID_INPUT', `${field} is invalid`);
    data[field] = input[field];
  }
  if (input.recordsPerPage !== undefined) {
    const value = Number(input.recordsPerPage);
    if (!Number.isInteger(value) || value < 10 || value > 200) {
      throw new BusinessSettingsError('INVALID_INPUT', 'recordsPerPage must be between 10 and 200');
    }
    data.recordsPerPage = value;
  }

  const submittedExtended = record(input.extended);
  if (Object.keys(submittedExtended).length) {
    const extended = parseExtendedConfig(currentExtendedConfig) as unknown as Record<string, unknown>;
    for (const section of BUSINESS_EXTENDED_SECTIONS) {
      if (submittedExtended[section] === undefined) continue;
      assertSafeJson(submittedExtended[section]);
      extended[section] = submittedExtended[section];
    }
    const serialized = JSON.stringify(extended);
    if (serialized.length > 128_000) throw new BusinessSettingsError('INVALID_INPUT', 'Settings payload is too large');
    data.extendedConfig = serialized;
  }
  return data;
}

function isUniqueConflict(error: unknown) {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'P2002');
}

export async function checkTenantSlugAvailability(
  database: SystemDatabase,
  tenant: TenantContext,
  actor: AuthUser,
  rawSlug: unknown,
) {
  if (!actor.capabilities.includes('settings.manage.business')) throw new BusinessSettingsError('FORBIDDEN');
  const slug = String(rawSlug ?? '').trim().toLowerCase();
  if (!TENANT_SLUG_PATTERN.test(slug) || RESERVED_TENANT_SLUGS.has(slug)) {
    return { slug, available: false, reason: 'invalid' as const, url: `https://${slug}.${TENANT_BASE_DOMAIN}` };
  }
  const existing = await database.tenant.findUnique({ where: { slug }, select: { id: true } });
  return {
    slug,
    available: !existing || existing.id === tenant.id,
    reason: existing && existing.id !== tenant.id ? 'taken' as const : null,
    url: `https://${slug}.${TENANT_BASE_DOMAIN}`,
  };
}

export async function updateBusinessSettings(
  database: TenantDatabase,
  tenant: TenantContext,
  actor: AuthUser,
  inputValue: unknown,
) {
  if (!actor.capabilities.includes('settings.manage.business')) throw new BusinessSettingsError('FORBIDDEN');
  const input = record(inputValue);
  const tenantSlug = String(input.tenantSlug ?? tenant.slug).trim().toLowerCase();
  const tenantName = String(input.tenantName ?? tenant.name).trim();
  if (!TENANT_SLUG_PATTERN.test(tenantSlug) || RESERVED_TENANT_SLUGS.has(tenantSlug)) {
    throw new BusinessSettingsError('INVALID_SLUG');
  }
  if (!tenantName || tenantName.length > 200) throw new BusinessSettingsError('INVALID_INPUT', 'Hotel name is required');

  try {
    const result = await database.$transaction(async (transaction) => {
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`settings:tenant:${tenant.id}`}))`;
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`settings:slug:${tenantSlug}`}))`;
      const duplicate = await transaction.tenant.findFirst({
        where: { slug: tenantSlug, id: { not: tenant.id } },
        select: { id: true },
      });
      if (duplicate) throw new BusinessSettingsError('SLUG_TAKEN');
      const current = await transaction.systemSettings.findFirst({ where: { tenantId: tenant.id } });
      const data = businessData(input, current?.extendedConfig);
      const settings = current
        ? await transaction.systemSettings.update({ where: { id: current.id }, data })
        : await transaction.systemSettings.create({ data: { ...DEFAULT_SETTINGS, ...data, tenantId: tenant.id } });
      const updatedTenant = await transaction.tenant.update({
        where: { id: tenant.id },
        data: { slug: tenantSlug, name: tenantName },
      });
      await transaction.auditLog.create({
        data: {
          tenantId: tenant.id,
          userId: actor.id,
          userName: `${actor.firstName} ${actor.lastName}`,
          action: AuditAction.UPDATE,
          entityType: 'SystemSettings',
          entityId: settings.id,
          details: `Updated tenant business settings${tenantSlug !== tenant.slug ? ' and subdomain' : ''}`,
        },
      });
      return { settings, tenant: updatedTenant };
    });
    return toSettingsDto(result.settings, result.tenant, actor);
  } catch (error) {
    if (isUniqueConflict(error)) throw new BusinessSettingsError('SLUG_TAKEN');
    throw error;
  }
}
