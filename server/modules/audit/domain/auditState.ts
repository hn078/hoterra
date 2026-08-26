const SENSITIVE_KEY = /(?:password|pin|secret|token|credential|api[-_]?key|signatureimage|(?:file|storage)path|hash)$/i;
const MAX_DEPTH = 8;
const MAX_ARRAY_ITEMS = 200;
const MAX_STATE_BYTES = 32_000;

function normalized(value: unknown, depth: number): unknown {
  if (depth > MAX_DEPTH) throw new Error('Audit state exceeds the maximum depth');
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Audit state contains a non-finite number');
    return value;
  }
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) {
    if (value.length > MAX_ARRAY_ITEMS) throw new Error('Audit state array is too large');
    return value.map((item) => normalized(item, depth + 1));
  }
  if (!value || typeof value !== 'object') return String(value);

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([key, item]) => item !== undefined && !SENSITIVE_KEY.test(key))
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => [key, normalized(item, depth + 1)] as const);
  return Object.fromEntries(entries);
}

/**
 * Produces bounded deterministic JSON for hash-protected before/after evidence.
 * Secret-bearing key names are omitted defensively even when a caller supplies
 * a wider persistence object by mistake.
 */
export function serializeAuditState(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const serialized = JSON.stringify(normalized(value, 0));
  if (Buffer.byteLength(serialized, 'utf8') > MAX_STATE_BYTES) {
    throw new Error('Audit state exceeds the maximum serialized size');
  }
  return serialized;
}

/** Stable non-reversible fingerprint for large/sensitive business payloads omitted from snapshots. */
export function auditStateDigest(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  return createHash('sha256').update(value, 'utf8').digest('hex');
}
import { createHash } from 'node:crypto';
