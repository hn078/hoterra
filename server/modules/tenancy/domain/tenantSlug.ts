const TENANT_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export function normalizePublicTenantSlug(value: unknown): string | null {
  const slug = String(value ?? '').trim().toLowerCase();
  return TENANT_SLUG_PATTERN.test(slug) ? slug : null;
}
