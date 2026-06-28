import { DocumentStatus, Role } from '@prisma/client';

export interface SignaturePlacement {
  id: string;
  role: Role;
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

export function expectedSignerRole(status: DocumentStatus): Role | null {
  const map: Partial<Record<DocumentStatus, Role>> = {
    IN_REVIEW: Role.HOD,
    SIGNED_HOD: Role.FINANCE_DIRECTOR,
    SIGNED_FINANCE: Role.GENERAL_MANAGER,
    SIGNED_GM: Role.GENERAL_MANAGER,
  };
  return map[status] ?? null;
}

export const DEFAULT_SIGNATURE_PLACEMENTS: SignaturePlacement[] = [
  {
    id: 'placement-hod',
    role: Role.HOD,
    label: 'HOD Signature',
    page: 'all',
    x: 8,
    y: 86,
    width: 24,
    height: 9,
  },
  {
    id: 'placement-finance',
    role: Role.FINANCE_DIRECTOR,
    label: 'Finance Director',
    page: 'all',
    x: 38,
    y: 86,
    width: 24,
    height: 9,
  },
  {
    id: 'placement-gm',
    role: Role.GENERAL_MANAGER,
    label: 'General Manager',
    page: 'all',
    x: 68,
    y: 86,
    width: 24,
    height: 9,
  },
];
