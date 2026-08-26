export const SignatureRole = {
  HOD: 'HOD',
  FINANCE_DIRECTOR: 'FINANCE_DIRECTOR',
  GENERAL_MANAGER: 'GENERAL_MANAGER',
} as const;

export type SignatureRole = (typeof SignatureRole)[keyof typeof SignatureRole];
export type SignatureDocumentStatus =
  | 'DRAFT'
  | 'IN_REVIEW'
  | 'SIGNED_HOD'
  | 'SIGNED_FINANCE'
  | 'SIGNED_GM'
  | 'PUBLISHED'
  | 'NEEDS_REVIEW';

export interface SignaturePlacement {
  id: string;
  role: SignatureRole;
  label: string;
  page: number | 'all';
  x: number;
  y: number;
  width: number;
  height: number;
}

export function parseSignaturePlacements(raw: string | null | undefined): SignaturePlacement[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function serializeSignaturePlacements(placements: SignaturePlacement[]): string {
  return JSON.stringify(placements);
}

export function expectedSignerRole(status: string): SignatureRole | null {
  const map: Record<string, SignatureRole> = {
    IN_REVIEW: SignatureRole.HOD,
    SIGNED_HOD: SignatureRole.FINANCE_DIRECTOR,
    SIGNED_FINANCE: SignatureRole.GENERAL_MANAGER,
    SIGNED_GM: SignatureRole.GENERAL_MANAGER,
  };
  return map[status] ?? null;
}

export const PENDING_APPROVAL_STATUSES: readonly string[] = [
  'IN_REVIEW',
  'SIGNED_HOD',
  'SIGNED_FINANCE',
  'SIGNED_GM',
];

export function statusAfterApproval(status: string): SignatureDocumentStatus | null {
  const flow: Record<string, SignatureDocumentStatus> = {
    DRAFT: 'IN_REVIEW',
    IN_REVIEW: 'SIGNED_HOD',
    SIGNED_HOD: 'SIGNED_FINANCE',
    SIGNED_FINANCE: 'SIGNED_GM',
    SIGNED_GM: 'PUBLISHED',
    NEEDS_REVIEW: 'IN_REVIEW',
  };
  return flow[status] ?? null;
}

export function canUserActOnApproval(userRole: string, status: string): boolean {
  const expected = expectedSignerRole(status);
  if (!expected) return false;
  return userRole === expected;
}

export const DEFAULT_SIGNATURE_PLACEMENTS: SignaturePlacement[] = [
  {
    id: 'placement-hod',
    role: SignatureRole.HOD,
    label: 'HOD Signature',
    page: 'all',
    x: 8,
    y: 86,
    width: 24,
    height: 9,
  },
  {
    id: 'placement-finance',
    role: SignatureRole.FINANCE_DIRECTOR,
    label: 'Finance Director',
    page: 'all',
    x: 38,
    y: 86,
    width: 24,
    height: 9,
  },
  {
    id: 'placement-gm',
    role: SignatureRole.GENERAL_MANAGER,
    label: 'General Manager',
    page: 'all',
    x: 68,
    y: 86,
    width: 24,
    height: 9,
  },
];
