import {
  Prisma,
  Role,
  WorkforceRequestStatus,
} from '@prisma/client';
import type { AuthUser } from '../../../middleware/auth';
import { canDecideCurrentWorkforceStep } from './manageWorkforceRequestDecision';

export interface ApprovalStep {
  role: Role;
  label: string;
  approverUserId?: string;
  approverDepartmentId?: string;
}

const DEFAULT_APPROVAL_STEPS: ApprovalStep[] = [
  { role: Role.HOD, label: 'Head of Department' },
  { role: Role.HOD, label: 'Human Resources — Head of Department' },
  { role: Role.FINANCE_DIRECTOR, label: 'Finance Director' },
  { role: Role.GENERAL_MANAGER, label: 'General Manager' },
];

export const POSITION_CATALOG = [
  'Room Attendant',
  'Public Area Attendant',
  'Steward',
  'Waiter/Waitress',
  'Banquet Waiter',
  'Bartender',
  'Cook',
  'Kitchen Helper',
  'Bellman',
  'Porter',
  'Houseman',
  'Laundry Attendant',
  'Technician',
  'Security Officer',
  'Receptionist',
  'Concierge',
  'Spa Therapist',
  'Lifeguard',
  'Driver',
];

export const requestInclude = {
  department: true,
  position: true,
  vendor: true,
  acceptedVendor: true,
  vendorRate: { include: { vendor: true, position: true } },
  createdBy: {
    select: { id: true, firstName: true, lastName: true, email: true, role: true },
  },
  events: { orderBy: { createdAt: 'desc' as const } },
  invites: {
    include: { vendor: true },
    orderBy: { sentAt: 'desc' as const },
  },
  invoices: {
    include: { vendor: true },
    orderBy: { createdAt: 'desc' as const },
  },
  evaluations: {
    include: { vendor: true },
    orderBy: { createdAt: 'desc' as const },
  },
  items: {
    include: { position: true, vendor: true, vendorRate: { include: { vendor: true, position: true } } },
    orderBy: { createdAt: 'asc' as const },
  },
  vendorCorrectionReviews: {
    include: {
      corrections: {
        include: { item: { include: { position: true } } },
        orderBy: { createdAt: 'asc' as const },
      },
    },
    orderBy: { createdAt: 'desc' as const },
  },
} satisfies Prisma.WorkforceRequestInclude;

export type WorkforceRequestFull = Prisma.WorkforceRequestGetPayload<{
  include: typeof requestInclude;
}>;

export function parseApprovalSteps(raw: string): ApprovalStep[] {
  try {
    const parsed = JSON.parse(raw) as ApprovalStep[];
    if (!Array.isArray(parsed)) return DEFAULT_APPROVAL_STEPS;
    return parsed.filter((s) => s && s.role && s.label);
  } catch {
    return DEFAULT_APPROVAL_STEPS;
  }
}

function parseVendorIds(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as string[];
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch {
    return [];
  }
}

export function parseHotels(raw: string | null | undefined): string[] {
  try {
    const parsed = JSON.parse(raw || '["HOTERRA"]') as string[];
    return Array.isArray(parsed) && parsed.length ? parsed.filter(Boolean) : ['HOTERRA'];
  } catch {
    return ['HOTERRA'];
  }
}

export function canApproveCurrentStep(
  user: AuthUser,
  request: {
    status: WorkforceRequestStatus;
    departmentId: string;
    currentStepIndex: number;
    approvalSteps: string;
  }
): boolean {
  return canDecideCurrentWorkforceStep(user, request);
}

export function formatRequest(req: {
  id: string;
  code: string;
  hotelName: string;
  departmentId: string;
  department: WorkforceRequestFull['department'];
  positionId: string;
  position: WorkforceRequestFull['position'];
  vendorRateId: string | null;
  vendorRate: WorkforceRequestFull['vendorRate'];
  rateUnit: WorkforceRequestFull['rateUnit'];
  unitRate: number | null;
  rateCurrency: string | null;
  workDate: Date;
  endDate: Date;
  shift: WorkforceRequestFull['shift'];
  startTime: string | null;
  endTime: string | null;
  quantity: number;
  comment: string | null;
  vendorMode: WorkforceRequestFull['vendorMode'];
  vendorId: string | null;
  vendor: WorkforceRequestFull['vendor'];
  acceptedVendorId: string | null;
  acceptedVendor: WorkforceRequestFull['acceptedVendor'];
  broadcastVendorIds: string;
  status: WorkforceRequestFull['status'];
  currentStepIndex: number;
  approvalSteps: string;
  needsExtraApproval: boolean;
  isUrgentOverride: boolean;
  estimatedCost: number | null;
  createdBy: WorkforceRequestFull['createdBy'];
  actualQuantity: number | null;
  actualHours: number | null;
  actualCost: number | null;
  hodConfirmedAt: Date | null;
  hodConfirmedById: string | null;
  financeConfirmedAt: Date | null;
  financeConfirmedById: string | null;
  createdAt: Date;
  updatedAt: Date;
  events: WorkforceRequestFull['events'];
  invites?: WorkforceRequestFull['invites'];
  invoices?: WorkforceRequestFull['invoices'];
  evaluations?: WorkforceRequestFull['evaluations'];
  items?: WorkforceRequestFull['items'];
  vendorCorrectionReviews?: WorkforceRequestFull['vendorCorrectionReviews'];
}) {
  return {
    id: req.id,
    code: req.code,
    hotelName: req.hotelName,
    departmentId: req.departmentId,
    department: req.department,
    positionId: req.positionId,
    position: req.position,
    vendorRateId: req.vendorRateId,
    vendorRate: req.vendorRate,
    rateUnit: req.rateUnit,
    unitRate: req.unitRate,
    rateCurrency: req.rateCurrency,
    workDate: req.workDate.toISOString(),
    endDate: req.endDate.toISOString(),
    shift: req.shift,
    startTime: req.startTime,
    endTime: req.endTime,
    quantity: req.quantity,
    comment: req.comment,
    vendorMode: req.vendorMode,
    vendorId: req.vendorId,
    vendor: req.vendor,
    acceptedVendorId: req.acceptedVendorId,
    acceptedVendor: req.acceptedVendor,
    broadcastVendorIds: parseVendorIds(req.broadcastVendorIds),
    status: req.status,
    currentStepIndex: req.currentStepIndex,
    approvalSteps: parseApprovalSteps(req.approvalSteps),
    needsExtraApproval: req.needsExtraApproval,
    isUrgentOverride: req.isUrgentOverride,
    estimatedCost: req.estimatedCost,
    createdBy: req.createdBy,
    actualQuantity: req.actualQuantity,
    actualHours: req.actualHours,
    actualCost: req.actualCost,
    hodConfirmedAt: req.hodConfirmedAt?.toISOString() ?? null,
    hodConfirmedById: req.hodConfirmedById,
    financeConfirmedAt: req.financeConfirmedAt?.toISOString() ?? null,
    financeConfirmedById: req.financeConfirmedById,
    createdAt: req.createdAt.toISOString(),
    updatedAt: req.updatedAt.toISOString(),
    events: req.events.map((e) => ({
      id: e.id,
      action: e.action,
      details: e.details,
      userId: e.userId,
      userName: e.userName,
      createdAt: e.createdAt.toISOString(),
    })),
    invites: (req.invites || []).map((i) => ({
      id: i.id,
      vendorId: i.vendorId,
      vendor: i.vendor,
      status: i.status,
      sentAt: i.sentAt.toISOString(),
      respondedAt: i.respondedAt?.toISOString() ?? null,
      expiresAt: i.expiresAt.toISOString(),
    })),
    invoices: (req.invoices || []).map((inv) => ({
      id: inv.id,
      vendorId: inv.vendorId,
      vendor: inv.vendor,
      invoiceNumber: inv.invoiceNumber,
      invoiceHours: inv.invoiceHours,
      invoiceAmount: inv.invoiceAmount,
      invoiceDate: inv.invoiceDate.toISOString(),
      status: inv.status,
      matchedAt: inv.matchedAt?.toISOString() ?? null,
      notes: inv.notes,
      createdAt: inv.createdAt.toISOString(),
    })),
    items: (req.items || []).map((item) => ({
      ...item,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    })),
    evaluations: (req.evaluations || []).map((evaluation) => ({
      ...evaluation,
      createdAt: evaluation.createdAt.toISOString(),
    })),
    vendorCorrectionReviews: (req.vendorCorrectionReviews || []).map((review) => ({
      ...review,
      submittedAt: review.submittedAt?.toISOString() ?? null,
      fdApprovedAt: review.fdApprovedAt?.toISOString() ?? null,
      gmApprovedAt: review.gmApprovedAt?.toISOString() ?? null,
      returnedAt: review.returnedAt?.toISOString() ?? null,
      appliedAt: review.appliedAt?.toISOString() ?? null,
      createdAt: review.createdAt.toISOString(),
      updatedAt: review.updatedAt.toISOString(),
      corrections: review.corrections.map((correction) => ({
        ...correction,
        createdAt: correction.createdAt.toISOString(),
        updatedAt: correction.updatedAt.toISOString(),
      })),
    })),
  };
}

export type WorkforceRequestInclude = typeof requestInclude;
