/** Tenant settings document defaults and safe merge policy. */
export const DEFAULT_EXTENDED_CONFIG = {
  security: {
    passwordPolicy: 'Strong',
    minPasswordLength: 12,
    sessionTimeoutMinutes: 30,
    enable2FA: false,
    ipRestrictions: [] as string[],
    allowUserRegistration: false,
  },
  signatures: {
    requirePin: true,
    hashAlgorithm: 'SHA-256',
    requireWitness: false,
    autoTimestamp: true,
  },
  numbering: {
    autoGenerate: true,
    prefixPattern: '{DEPT}-{CAT}',
    separator: '-',
    padding: 3,
    resetYearly: false,
  },
  storage: {
    totalGb: 1024,
    maxFileSizeMb: 50,
    allowedTypes: ['pdf', 'docx', 'xlsx', 'pptx'],
    backupFrequency: 'Daily',
    backupRetentionDays: 30,
    lastBackup: new Date().toISOString(),
  },
  email: {
    smtpHost: 'smtp.hoterra.az',
    smtpPort: 587,
    fromAddress: 'noreply@hoterra.az',
    fromName: 'HOTERRA HDMS',
    useTls: true,
    enabled: false,
  },
  integrations: {
    operaPms: { enabled: false, endpoint: '', apiKey: '' },
    microsoft365: { enabled: false, tenantId: '', clientId: '' },
    activeDirectory: { enabled: false, ldapUrl: '', baseDn: '' },
  },
  backup: {
    enabled: true,
    schedule: '0 2 * * *',
    retentionDays: 30,
    includeAttachments: true,
    lastBackup: new Date().toISOString(),
    lastBackupStatus: 'success',
  },
  system: {
    maintenanceMode: false,
    enableRecaptcha: false,
    cacheEnabled: true,
    searchIndexVersion: 1,
    lastCacheClear: null as string | null,
    lastReindex: null as string | null,
  },
  license: {
    tier: 'Enterprise',
    validUntil: '2025-12-31',
    seats: 200,
    organizationId: 'HOTERRA-ENT-2025',
  },
};

export type ExtendedConfig = typeof DEFAULT_EXTENDED_CONFIG;

export function parseExtendedConfig(raw: string | null | undefined): ExtendedConfig {
  try {
    const parsed = JSON.parse(raw || '{}');
    const patch = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    return deepMerge(DEFAULT_EXTENDED_CONFIG, patch);
  } catch {
    return deepClone(DEFAULT_EXTENDED_CONFIG);
  }
}

function deepMerge<T extends Record<string, unknown>>(base: T, patch: Record<string, unknown>): T {
  const out = deepClone(base) as Record<string, unknown>;
  for (const key of Object.keys(patch)) {
    const bv = base[key];
    const pv = patch[key];
    if (pv && typeof pv === 'object' && !Array.isArray(pv) && bv && typeof bv === 'object' && !Array.isArray(bv)) {
      out[key] = deepMerge(bv as Record<string, unknown>, pv as Record<string, unknown>);
    } else if (pv !== undefined) {
      out[key] = pv;
    }
  }
  return out as T;
}

function deepClone<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => deepClone(item)) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, deepClone(item)])
    ) as T;
  }
  return value;
}
