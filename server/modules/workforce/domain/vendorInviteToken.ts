import { createHash, randomBytes } from 'node:crypto';

const RAW_TOKEN_PATTERN = /^[a-f0-9]{64}$/i;

export function createVendorInviteToken(): { raw: string; stored: string } {
  const raw = randomBytes(32).toString('hex');
  return { raw, stored: hashVendorInviteToken(raw) };
}

export function hashVendorInviteToken(rawToken: string): string {
  return createHash('sha256').update(rawToken, 'utf8').digest('hex');
}

export function vendorInviteTokenCandidates(rawToken: unknown): string[] {
  const clean = typeof rawToken === 'string' ? rawToken.trim() : '';
  if (!RAW_TOKEN_PATTERN.test(clean)) return [];
  // The raw value is retained only as a temporary lookup candidate for links
  // created before token hashing was introduced. New rows contain only hash.
  return [hashVendorInviteToken(clean), clean];
}
