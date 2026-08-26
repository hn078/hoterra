import { DEFAULT_EXTENDED_CONFIG } from '../domain/extendedConfig';

export const DEFAULT_SETTINGS = {
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
  enable2FA: false,
  allowComments: true,
  showTooltips: true,
  defaultStartPage: 'dashboard',
  defaultDocSort: 'updated_desc',
  defaultDocStatus: 'DRAFT',
  notifyEmail: true,
  notifyPush: true,
  notifyInApp: true,
  loginLogoPath: null as string | null,
  loginBackgroundPath: null as string | null,
  extendedConfig: JSON.stringify(DEFAULT_EXTENDED_CONFIG),
};

export const TENANT_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
export const RESERVED_TENANT_SLUGS = new Set(['www', 'app', 'api', 'backend', 'admin', 'mail', 'support']);
export const TENANT_BASE_DOMAIN = process.env.TENANT_BASE_DOMAIN || 'hoterra.net';

export const BUSINESS_EXTENDED_SECTIONS = ['signatures', 'numbering'] as const;
export const SECURITY_EXTENDED_SECTIONS = [
  'security',
  'storage',
  'email',
  'integrations',
  'backup',
  'system',
  'license',
] as const;
