import type * as DatabaseModule from '../../../db';
import { parseExtendedConfig } from '../domain/extendedConfig';

type SettingsDatabase = typeof DatabaseModule.prisma;

export type PasswordPolicyLevel = 'Basic' | 'Strong' | 'Enterprise';

export interface TenantPasswordPolicy {
  level: PasswordPolicyLevel;
  minLength: number;
  maxLength: number;
}

const POLICY_LEVELS = new Set<PasswordPolicyLevel>(['Basic', 'Strong', 'Enterprise']);

export async function getTenantPasswordPolicy(database: SettingsDatabase): Promise<TenantPasswordPolicy> {
  const settings = await database.systemSettings.findFirst({ select: { extendedConfig: true } });
  const security = parseExtendedConfig(settings?.extendedConfig).security;
  const configuredLevel = String(security.passwordPolicy || 'Strong') as PasswordPolicyLevel;
  const configuredMinimum = Number(security.minPasswordLength);
  return {
    level: POLICY_LEVELS.has(configuredLevel) ? configuredLevel : 'Strong',
    minLength: Number.isInteger(configuredMinimum)
      ? Math.max(8, Math.min(128, configuredMinimum))
      : 12,
    maxLength: 128,
  };
}

export function passwordPolicyViolation(password: string, policy: TenantPasswordPolicy): string | null {
  if (password.length < policy.minLength || password.length > policy.maxLength) {
    return `Password must be ${policy.minLength}–${policy.maxLength} characters`;
  }
  if (policy.level === 'Basic') return null;
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) {
    return 'Password must include uppercase, lowercase and numeric characters';
  }
  if (policy.level === 'Enterprise' && !/[^A-Za-z0-9]/.test(password)) {
    return 'Enterprise passwords must also include a special character';
  }
  return null;
}
