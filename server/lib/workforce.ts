import {
  Prisma,
  Role,
  WorkforceRequestStatus,
  WorkforceShift,
  WorkforceVendorMode,
} from '@prisma/client';
import { prisma } from '../db';
import type { AuthUser } from '../middleware/auth';

export interface ApprovalStep {
  role: Role;
  label: string;
}

export const DEFAULT_APPROVAL_STEPS: ApprovalStep[] = [
  { role: Role.HOD, label: 'Head of Department' },
  { role: Role.FINANCE_DIRECTOR, label: 'Financial Controller' },
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

const requestInclude = {
  department: true,
  position: true,
  vendor: true,
  acceptedVendor: true,
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

export function serializeApprovalSteps(steps: ApprovalStep[]): string {
  return JSON.stringify(steps);
}

export function parseVendorIds(raw: string): string[] {
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

export async function getWorkforceSettings() {
  const row = await prisma.workforceSettings.upsert({
    where: { id: 'default' },
    update: {},
    create: { id: 'default' },
  });
  return {
    ...row,
    hotels: parseHotels(row.hotelsJson),
  };
}

export async function resolveApprovalSteps(departmentId: string): Promise<ApprovalStep[]> {
  const route = await prisma.workforceApprovalRoute.findUnique({
    where: { departmentId },
  });
  if (!route) return [...DEFAULT_APPROVAL_STEPS];
  const steps = parseApprovalSteps(route.steps);
  return steps.length > 0 ? steps : [...DEFAULT_APPROVAL_STEPS];
}

export function estimateCost(
  quantity: number,
  settings: { estimatedHourlyRate: number; estimatedHoursPerShift: number },
  startTime?: string | null,
  endTime?: string | null
): number {
  let hours = settings.estimatedHoursPerShift;
  if (startTime && endTime) {
    const [sh, sm] = startTime.split(':').map(Number);
    const [eh, em] = endTime.split(':').map(Number);
    if ([sh, sm, eh, em].every((n) => Number.isFinite(n))) {
      const diff = eh + em / 60 - (sh + sm / 60);
      if (diff > 0) hours = diff;
    }
  }
  return Math.round(quantity * hours * settings.estimatedHourlyRate * 100) / 100;
}

export async function monthSpend(departmentId: string, workDate: Date): Promise<number> {
  const year = workDate.getFullYear();
  const month = workDate.getMonth();
  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 0, 23, 59, 59, 999);

  const rows = await prisma.workforceRequest.findMany({
    where: {
      departmentId,
      workDate: { gte: start, lte: end },
      status: {
        notIn: [
          WorkforceRequestStatus.REJECTED,
          WorkforceRequestStatus.CANCELLED,
          WorkforceRequestStatus.VENDOR_DECLINED,
        ],
      },
    },
    select: { estimatedCost: true, actualCost: true },
  });

  return rows.reduce((sum, r) => sum + (r.actualCost ?? r.estimatedCost ?? 0), 0);
}

export function hoursUntil(workDate: Date): number {
  return (workDate.getTime() - Date.now()) / (1000 * 60 * 60);
}

export function canManageCatalog(role: Role): boolean {
  return (
    role === Role.SYSTEM_ADMINISTRATOR ||
    role === Role.GENERAL_MANAGER ||
    role === Role.HOD ||
    role === Role.FINANCE_DIRECTOR
  );
}

export function canCreateRequest(role: Role): boolean {
  return (
    role === Role.SYSTEM_ADMINISTRATOR ||
    role === Role.GENERAL_MANAGER ||
    role === Role.HOD ||
    role === Role.SUPERVISOR ||
    role === Role.FINANCE_DIRECTOR
  );
}

export function isPrivilegedApprover(role: Role): boolean {
  return role === Role.SYSTEM_ADMINISTRATOR || role === Role.GENERAL_MANAGER;
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
  if (
    request.status !== WorkforceRequestStatus.PENDING &&
    request.status !== WorkforceRequestStatus.AWAITING_EXTRA_APPROVAL
  ) {
    return false;
  }
  if (isPrivilegedApprover(user.role)) return true;

  const steps = parseApprovalSteps(request.approvalSteps);
  const step = steps[request.currentStepIndex];
  if (!step) return false;
  if (user.role !== step.role) return false;
  if (step.role === Role.HOD) {
    return !user.departmentId || user.departmentId === request.departmentId;
  }
  return true;
}

export async function notifyApprovers(
  request: { id: string; code: string; departmentId: string; approvalSteps: string; currentStepIndex: number },
  link = `/workforce/${request.id}`
) {
  const steps = parseApprovalSteps(request.approvalSteps);
  const step = steps[request.currentStepIndex];
  if (!step) return;

  const settings = await getWorkforceSettings();
  const { appUrl, queueEmail } = await import('./mail');

  const users = await prisma.user.findMany({
    where: {
      isActive: true,
      role: step.role === Role.HOD
        ? { in: [Role.HOD, Role.GENERAL_MANAGER, Role.SYSTEM_ADMINISTRATOR] }
        : { in: [step.role, Role.GENERAL_MANAGER, Role.SYSTEM_ADMINISTRATOR] },
      ...(step.role === Role.HOD
        ? { OR: [{ departmentId: request.departmentId }, { role: { in: [Role.GENERAL_MANAGER, Role.SYSTEM_ADMINISTRATOR] } }] }
        : {}),
    },
    select: { id: true, email: true, firstName: true },
  });

  const fullLink = appUrl(link);

  await Promise.all(
    users.map(async (u) => {
      if (settings.notifyPush !== false) {
        await prisma.notification.create({
          data: {
            userId: u.id,
            title: 'Casual staff approval required',
            message: `Request ${request.code} needs your approval (${step.label})`,
            type: 'workforce',
            link,
          },
        });
      }
      if (settings.notifyEmail !== false && u.email) {
        await queueEmail({
          toEmail: u.email,
          subject: `[HOTERRA] Approval needed: ${request.code}`,
          body: `Hi ${u.firstName},\n\nRequest ${request.code} needs your approval (${step.label}).\n\nOpen: ${fullLink}\n`,
          entityType: 'WorkforceRequest',
          entityId: request.id,
        });
      }
    })
  );
}

export async function addEvent(
  requestId: string,
  action: string,
  user: AuthUser | null,
  details?: string
) {
  await prisma.workforceRequestEvent.create({
    data: {
      requestId,
      action,
      details,
      userId: user?.id,
      userName: user ? `${user.firstName} ${user.lastName}` : undefined,
    },
  });
}

export async function nextRequestCode(): Promise<string> {
  const count = await prisma.workforceRequest.count();
  return `CWR-${String(count + 1).padStart(5, '0')}`;
}

export function formatRequest(req: {
  id: string;
  code: string;
  hotelName: string;
  departmentId: string;
  department: WorkforceRequestFull['department'];
  positionId: string;
  position: WorkforceRequestFull['position'];
  workDate: Date;
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
}) {
  return {
    id: req.id,
    code: req.code,
    hotelName: req.hotelName,
    departmentId: req.departmentId,
    department: req.department,
    positionId: req.positionId,
    position: req.position,
    workDate: req.workDate.toISOString(),
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
      token: i.token,
      vendorId: i.vendorId,
      vendor: i.vendor,
      status: i.status,
      sentAt: i.sentAt.toISOString(),
      respondedAt: i.respondedAt?.toISOString() ?? null,
      expiresAt: i.expiresAt.toISOString(),
      portalPath: `/vendor/order/${i.token}`,
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
  };
}

export async function loadRequest(id: string) {
  return prisma.workforceRequest.findUnique({
    where: { id },
    include: requestInclude,
  });
}

export { requestInclude };

export function isShift(value: unknown): value is WorkforceShift {
  return typeof value === 'string' && Object.values(WorkforceShift).includes(value as WorkforceShift);
}

export function isVendorMode(value: unknown): value is WorkforceVendorMode {
  return (
    typeof value === 'string' &&
    Object.values(WorkforceVendorMode).includes(value as WorkforceVendorMode)
  );
}

export function appendGmIfMissing(steps: ApprovalStep[]): ApprovalStep[] {
  if (steps.some((s) => s.role === Role.GENERAL_MANAGER)) return steps;
  return [...steps, { role: Role.GENERAL_MANAGER, label: 'GM / COO (Extra Approval)' }];
}
