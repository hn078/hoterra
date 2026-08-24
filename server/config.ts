const DEVELOPMENT_SECRETS = new Set([
  'hoterra-dev-secret',
  'hoterra-hdms-dev-secret-change-in-production',
  'change-me',
]);

export const isProduction = process.env.NODE_ENV === 'production';

function integerEnv(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`);
  }
  return value;
}

export const runtimeConfig = {
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  tenantBaseDomain: (process.env.TENANT_BASE_DOMAIN || 'hoterra.net').toLowerCase(),
  jwtSecret: process.env.JWT_SECRET || 'hoterra-dev-secret',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
  requestBodyLimit: process.env.REQUEST_BODY_LIMIT || '15mb',
  globalRateLimitMax: integerEnv('GLOBAL_RATE_LIMIT_MAX', 600, 10, 100_000),
  loginRateLimitMax: integerEnv('LOGIN_RATE_LIMIT_MAX', 10, 3, 1_000),
  emailDeliveryEnabled: process.env.EMAIL_DELIVERY_ENABLED === 'true',
};

export function allowedOrigins(): string[] {
  return [runtimeConfig.frontendUrl, ...(process.env.CORS_ORIGINS || '').split(',')]
    .map((value) => value.trim().replace(/\/$/, ''))
    .filter(Boolean);
}

export function isAllowedOrigin(origin: string): boolean {
  const normalized = origin.replace(/\/$/, '').toLowerCase();
  if (allowedOrigins().some((allowed) => allowed.toLowerCase() === normalized)) return true;

  try {
    const url = new URL(normalized);
    if (!isProduction && ['localhost', '127.0.0.1'].includes(url.hostname)) return true;
    return url.protocol === 'https:' &&
      url.hostname.endsWith(`.${runtimeConfig.tenantBaseDomain}`) &&
      url.hostname.slice(0, -(runtimeConfig.tenantBaseDomain.length + 1)).match(/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/) !== null;
  } catch {
    return false;
  }
}

export function validateRuntimeConfig(): void {
  const databaseUrl = process.env.DATABASE_URL || '';
  if (!databaseUrl) throw new Error('DATABASE_URL is required');

  if (isProduction) {
    if (!databaseUrl.startsWith('postgresql://') && !databaseUrl.startsWith('postgres://')) {
      throw new Error('Production DATABASE_URL must use PostgreSQL');
    }
    if (runtimeConfig.jwtSecret.length < 32 || DEVELOPMENT_SECRETS.has(runtimeConfig.jwtSecret)) {
      throw new Error('JWT_SECRET must be a unique production secret with at least 32 characters');
    }
    if (!runtimeConfig.frontendUrl.startsWith('https://')) {
      throw new Error('FRONTEND_URL must use HTTPS in production');
    }
    if (!process.env.HOTERRA_UPLOADS_DIR?.trim() && !process.env.RAILWAY_VOLUME_MOUNT_PATH?.trim()) {
      throw new Error('Production requires persistent upload storage');
    }
    if (/hoterra_dev_password|password@|change-me/i.test(databaseUrl)) {
      throw new Error('DATABASE_URL contains a development or placeholder password');
    }
    if (runtimeConfig.emailDeliveryEnabled) {
      for (const name of ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASSWORD', 'SMTP_FROM']) {
        if (!process.env[name]?.trim()) throw new Error(`${name} is required when EMAIL_DELIVERY_ENABLED=true`);
      }
    }
  }
}
