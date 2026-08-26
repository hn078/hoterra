import { AuditAction } from '@prisma/client';
import type * as DatabaseModule from '../../../db';
import type { AuthUser } from '../../../middleware/auth';
import type { TenantContext } from '../../../lib/tenantContext';
import { parseExtendedConfig } from '../domain/extendedConfig';
import { DEFAULT_SETTINGS, SECURITY_EXTENDED_SECTIONS } from './settingsDefaults';
import { toSettingsDto } from './settingsReadModel';
import { serializeAuditState } from '../../audit';

type SettingsDatabase = typeof DatabaseModule.prisma;

export class SecuritySettingsError extends Error {
  constructor(public readonly code: 'FORBIDDEN' | 'INVALID_INPUT') {
    super(code);
    this.name = 'SecuritySettingsError';
  }
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function validateTree(value: unknown, depth = 0): void {
  if (depth > 8) throw new SecuritySettingsError('INVALID_INPUT');
  if (value === null || ['string', 'boolean'].includes(typeof value)) return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new SecuritySettingsError('INVALID_INPUT');
    return;
  }
  if (Array.isArray(value)) {
    if (value.length > 100) throw new SecuritySettingsError('INVALID_INPUT');
    value.forEach((item) => validateTree(item, depth + 1));
    return;
  }
  if (!value || typeof value !== 'object') throw new SecuritySettingsError('INVALID_INPUT');
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (['__proto__', 'prototype', 'constructor'].includes(key)) throw new SecuritySettingsError('INVALID_INPUT');
    validateTree(item, depth + 1);
  }
}

function assertSecurityRanges(extended: Record<string, any>) {
  if (!['Basic', 'Strong', 'Enterprise'].includes(String(extended.security?.passwordPolicy))) {
    throw new SecuritySettingsError('INVALID_INPUT');
  }
  const minLength = Number(extended.security?.minPasswordLength);
  if (!Number.isInteger(minLength) || minLength < 8 || minLength > 128) throw new SecuritySettingsError('INVALID_INPUT');
  const timeout = Number(extended.security?.sessionTimeoutMinutes);
  if (!Number.isInteger(timeout) || timeout < 5 || timeout > 1440) throw new SecuritySettingsError('INVALID_INPUT');
  const totalGb = Number(extended.storage?.totalGb);
  const maxFileSizeMb = Number(extended.storage?.maxFileSizeMb);
  if (!Number.isFinite(totalGb) || totalGb <= 0 || totalGb > 1_000_000) throw new SecuritySettingsError('INVALID_INPUT');
  if (!Number.isFinite(maxFileSizeMb) || maxFileSizeMb <= 0 || maxFileSizeMb > 10_000) throw new SecuritySettingsError('INVALID_INPUT');
  const seats = Number(extended.license?.seats);
  if (!Number.isInteger(seats) || seats < 1 || seats > 1_000_000) throw new SecuritySettingsError('INVALID_INPUT');
}

function securityAuditState(extended: Record<string, any>) {
  const integrations = record(extended.integrations);
  return {
    security: {
      passwordPolicy: extended.security?.passwordPolicy,
      minPasswordLength: extended.security?.minPasswordLength,
      sessionTimeoutMinutes: extended.security?.sessionTimeoutMinutes,
      enable2FA: false,
      allowUserRegistration: extended.security?.allowUserRegistration,
    },
    storage: {
      totalGb: extended.storage?.totalGb,
      maxFileSizeMb: extended.storage?.maxFileSizeMb,
      allowedTypes: extended.storage?.allowedTypes,
      backupFrequency: extended.storage?.backupFrequency,
      backupRetentionDays: extended.storage?.backupRetentionDays,
    },
    email: {
      smtpHost: extended.email?.smtpHost,
      smtpPort: extended.email?.smtpPort,
      fromAddress: extended.email?.fromAddress,
      fromName: extended.email?.fromName,
      useTls: extended.email?.useTls,
      enabled: extended.email?.enabled,
    },
    integrations: Object.fromEntries(Object.entries(integrations).map(([name, value]) => [
      name,
      { enabled: record(value).enabled === true },
    ])),
    backup: {
      enabled: extended.backup?.enabled,
      schedule: extended.backup?.schedule,
      retentionDays: extended.backup?.retentionDays,
      includeAttachments: extended.backup?.includeAttachments,
    },
    system: {
      maintenanceMode: extended.system?.maintenanceMode,
      enableRecaptcha: extended.system?.enableRecaptcha,
      cacheEnabled: extended.system?.cacheEnabled,
      searchIndexVersion: extended.system?.searchIndexVersion,
      lastCacheClear: extended.system?.lastCacheClear,
      lastReindex: extended.system?.lastReindex,
    },
    license: {
      tier: extended.license?.tier,
      validUntil: extended.license?.validUntil,
      seats: extended.license?.seats,
    },
  };
}

export async function updateSecuritySettings(
  database: SettingsDatabase,
  tenant: TenantContext,
  actor: AuthUser,
  inputValue: unknown,
) {
  if (!actor.capabilities.includes('settings.manage.security')) throw new SecuritySettingsError('FORBIDDEN');
  const input = record(inputValue);
  const submitted = record(input.extended);
  validateTree(submitted);

  const settings = await database.$transaction(async (transaction) => {
    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`settings:tenant:${tenant.id}`}))`;
    const current = await transaction.systemSettings.findFirst();
    const extended = parseExtendedConfig(current?.extendedConfig) as unknown as Record<string, any>;
    const beforeState = securityAuditState(extended);
    const previousSystem = { ...record(extended.system) };
    const previousLicense = { ...record(extended.license) };
    for (const section of SECURITY_EXTENDED_SECTIONS) {
      if (submitted[section] === undefined) continue;
      extended[section] = { ...record(extended[section]), ...record(submitted[section]) };
    }
    extended.system = {
      ...extended.system,
      searchIndexVersion: previousSystem.searchIndexVersion,
      lastCacheClear: previousSystem.lastCacheClear,
      lastReindex: previousSystem.lastReindex,
    };
    extended.license = { ...extended.license, organizationId: previousLicense.organizationId };
    // These controls are intentionally fail-closed until their runtime providers exist.
    // Persisting an "enabled" flag without an authentication/network enforcement path
    // would give administrators a false security guarantee.
    extended.security = { ...extended.security, enable2FA: false, ipRestrictions: [] };
    assertSecurityRanges(extended);
    const serialized = JSON.stringify(extended);
    if (serialized.length > 128_000) throw new SecuritySettingsError('INVALID_INPUT');
    const data = {
      extendedConfig: serialized,
      enable2FA: false,
      autoLogoutMinutes: Number(extended.security.sessionTimeoutMinutes),
    };
    const updated = current
      ? await transaction.systemSettings.update({ where: { id: current.id }, data })
      : await transaction.systemSettings.create({ data: { ...DEFAULT_SETTINGS, ...data } });
    await transaction.auditLog.create({
      data: {
        userId: actor.id,
        userName: `${actor.firstName} ${actor.lastName}`,
        action: AuditAction.UPDATE,
        entityType: 'SystemSettings',
        entityId: updated.id,
        details: 'Updated tenant security and infrastructure settings',
        outcome: 'SUCCESS',
        reason: 'Tenant security configuration updated',
        beforeState: serializeAuditState(beforeState),
        afterState: serializeAuditState(securityAuditState(extended)),
      },
    });
    return updated;
  });
  return toSettingsDto(settings, tenant, actor);
}

export async function runSettingsMaintenance(
  database: SettingsDatabase,
  tenant: TenantContext,
  actor: AuthUser,
  operation: 'clear-cache' | 'reindex',
) {
  if (!actor.capabilities.includes('settings.manage.security')) throw new SecuritySettingsError('FORBIDDEN');
  return database.$transaction(async (transaction) => {
    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`settings:tenant:${tenant.id}`}))`;
    const current = await transaction.systemSettings.findFirst();
    const extended = parseExtendedConfig(current?.extendedConfig);
    const beforeState = securityAuditState(extended as unknown as Record<string, any>);
    const now = new Date().toISOString();
    if (operation === 'clear-cache') extended.system.lastCacheClear = now;
    else {
      extended.system.lastReindex = now;
      extended.system.searchIndexVersion += 1;
    }
    const updated = current
      ? await transaction.systemSettings.update({
          where: { id: current.id },
          data: { extendedConfig: JSON.stringify(extended) },
        })
      : await transaction.systemSettings.create({
          data: { ...DEFAULT_SETTINGS, extendedConfig: JSON.stringify(extended) },
        });
    await transaction.auditLog.create({
      data: {
        userId: actor.id,
        userName: `${actor.firstName} ${actor.lastName}`,
        action: AuditAction.UPDATE,
        entityType: 'System',
        entityId: updated.id,
        details: operation === 'clear-cache' ? 'System cache cleared' : 'Full search reindex queued',
        outcome: 'SUCCESS',
        reason: operation === 'clear-cache' ? 'Administrator requested cache clear' : 'Administrator requested search reindex',
        beforeState: serializeAuditState(beforeState),
        afterState: serializeAuditState(securityAuditState(extended as unknown as Record<string, any>)),
      },
    });
    return operation === 'clear-cache'
      ? { ok: true, clearedAt: now }
      : { ok: true, reindexedAt: now, version: extended.system.searchIndexVersion };
  });
}

export async function listMaintenanceLogs(database: SettingsDatabase, actor: AuthUser) {
  if (!actor.capabilities.includes('settings.manage.security')) throw new SecuritySettingsError('FORBIDDEN');
  return database.auditLog.findMany({
    select: {
      id: true,
      userId: true,
      userName: true,
      action: true,
      entityType: true,
      entityId: true,
      details: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
}
