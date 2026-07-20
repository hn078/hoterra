import type { DocumentStatus, Role, Signature } from '@/types';
import type { SignaturePlacement } from '@/types';

export function parseSignaturePlacements(raw: string | SignaturePlacement[] | null | undefined): SignaturePlacement[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function uploadUrl(path: string | null | undefined): string {
  if (!path) return '';
  if (path.startsWith('http') || path.startsWith('data:')) return path;
  const apiBase =
    typeof window !== 'undefined' && window.__HOTERRA_API__
      ? window.__HOTERRA_API__
      : 'http://localhost:3001/api';
  const origin = apiBase.replace(/\/api\/?$/, '');
  return `${origin}${path.startsWith('/') ? path : `/${path}`}`;
}

export function expectedSignerRole(status: DocumentStatus): Role | null {
  const map: Partial<Record<DocumentStatus, Role>> = {
    IN_REVIEW: 'HOD',
    SIGNED_HOD: 'FINANCE_DIRECTOR',
    SIGNED_FINANCE: 'GENERAL_MANAGER',
    SIGNED_GM: 'GENERAL_MANAGER',
  };
  return map[status] ?? null;
}

export const PENDING_APPROVAL_STATUSES: DocumentStatus[] = [
  'IN_REVIEW',
  'SIGNED_HOD',
  'SIGNED_FINANCE',
  'SIGNED_GM',
];

export function canUserActOnApproval(
  user: { role: Role } | null | undefined,
  status: DocumentStatus
): boolean {
  if (!user) return false;
  const expected = expectedSignerRole(status);
  if (!expected) return false;
  return user.role === expected || user.role === 'SYSTEM_ADMINISTRATOR';
}

export function hasUserSignedAtCurrentStep(
  doc: { status: DocumentStatus; signatures?: Signature[] },
  user: { role: Role } | null | undefined
): boolean {
  if (!user || !canUserActOnApproval(user, doc.status)) return false;
  const expected = expectedSignerRole(doc.status)!;
  return (doc.signatures ?? []).some((s) => s.user?.role === expected);
}

export function signatureForPlacement(
  signatures: Signature[] | undefined,
  placementId: string
): Signature | undefined {
  return signatures?.find((s) => s.placementId === placementId);
}

export function pagesForPlacement(pageCount: number, page: SignaturePlacement['page']): number[] {
  if (page === 'all') {
    return Array.from({ length: Math.max(1, pageCount) }, (_, i) => i + 1);
  }
  return [Math.min(Math.max(1, page), Math.max(1, pageCount))];
}

export function createPlacementId(role: Role): string {
  return `placement-${role.toLowerCase()}-${Date.now()}`;
}

export const SIGNATURE_ROLES: { role: Role; label: string }[] = [
  { role: 'HOD', label: 'Head of Department' },
  { role: 'FINANCE_DIRECTOR', label: 'Finance Director' },
  { role: 'GENERAL_MANAGER', label: 'General Manager' },
];
