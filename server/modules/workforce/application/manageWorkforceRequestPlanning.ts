import {
  AuditAction,
  Prisma,
  Role,
  VendorApprovalStatus,
  WorkforceRateUnit,
  WorkforceRequestStatus,
  WorkforceShift,
  WorkforceVendorMode,
} from '@prisma/client';
import type * as DatabaseModule from '../../../db';
import type { AuthUser } from '../../../middleware/auth';
import {
  queueRequestApprovalNotifications,
  type WorkforceNotificationOptions,
} from './workforceNotificationOutbox';
import { serializeWorkforceRequestAuditState } from './workforceAuditState';

type WorkforceDatabase = typeof DatabaseModule.prisma;
type Transaction = any;

type ApprovalStep = {
  role: Role;
  label: string;
  approverUserId?: string;
  approverDepartmentId?: string;
};

type NormalizedItem = {
  positionId: string;
  rateUnit: WorkforceRateUnit;
  quantity: number;
  hours: number | null;
  estimatedCost: number;
};

export type WorkforceRequestPlanningErrorCode =
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'INVALID_STATE'
  | 'INVALID_INPUT'
  | 'INVALID_PERIOD'
  | 'INVALID_SERVICE'
  | 'NO_ELIGIBLE_RATE'
  | 'LEAD_TIME'
  | 'HR_REQUIRED'
  | 'INVOICE_EXISTS'
  | 'CONFLICT';

export class WorkforceRequestPlanningError extends Error {
  constructor(
    public readonly code: WorkforceRequestPlanningErrorCode,
    public readonly detail?: string,
  ) {
    super(code);
    this.name = 'WorkforceRequestPlanningError';
  }
}

function actorName(actor: AuthUser) {
  return `${actor.firstName} ${actor.lastName}`;
}

function currency(value: number) {
  return Math.round(value * 100) / 100;
}

function inclusiveDays(start: Date, end: Date) {
  return Math.max(1, Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1);
}

function catalogCost(quantity: number, price: number, unit: WorkforceRateUnit, start: Date, end: Date, hoursPerDay: number) {
  return currency(quantity * price * inclusiveDays(start, end) * (unit === WorkforceRateUnit.HOURLY ? hoursPerDay : 1));
}

function parseDate(value: unknown) {
  const date = new Date(String(value || ''));
  if (Number.isNaN(date.getTime())) throw new WorkforceRequestPlanningError('INVALID_PERIOD');
  return date;
}

function parseApprovalSteps(value: string | null | undefined): ApprovalStep[] {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed)
      ? parsed.filter((step): step is ApprovalStep => Boolean(step?.role && step?.label))
      : [];
  } catch {
    return [];
  }
}

function canUseUrgentOverride(actor: AuthUser) {
  return ([Role.GENERAL_MANAGER, Role.FINANCE_DIRECTOR, Role.HOD] as Role[]).includes(actor.role);
}

function assertCreateScope(actor: AuthUser, departmentId: string) {
  if (!actor.capabilities.includes('workforce.request.create')) throw new WorkforceRequestPlanningError('FORBIDDEN');
  if (actor.role === Role.GENERAL_MANAGER) return;
  if (!actor.departmentId || actor.departmentId !== departmentId) throw new WorkforceRequestPlanningError('FORBIDDEN');
}

function requestItems(input: Record<string, unknown>, fallback: Array<Record<string, unknown>> = []) {
  if (Array.isArray(input.items) && input.items.length) return input.items as Array<Record<string, unknown>>;
  if (input.positionId && input.rateUnit && input.quantity) {
    return [{ positionId: input.positionId, rateUnit: input.rateUnit, quantity: input.quantity, hours: input.hours }];
  }
  return fallback;
}

async function getSettings(transaction: Transaction) {
  return await transaction.workforceSettings.findFirst()
    ?? await transaction.workforceSettings.create({ data: {} });
}

async function approvalSteps(transaction: Transaction, departmentId: string): Promise<ApprovalStep[]> {
  const [route, humanResources] = await Promise.all([
    transaction.workforceApprovalRoute.findUnique({ where: { departmentId } }),
    transaction.department.findFirst({
      where: { isActive: true, OR: [{ code: 'HR' }, { name: { equals: 'Human Resources', mode: 'insensitive' } }] },
      select: { id: true },
    }),
  ]);
  if (!humanResources) throw new WorkforceRequestPlanningError('HR_REQUIRED');

  const source = parseApprovalSteps(route?.steps);
  const requester = source.find((step) => step.role === Role.HOD && !/human resources/i.test(step.label));
  const finance = source.find((step) => step.role === Role.FINANCE_DIRECTOR);
  const generalManager = source.find((step) => step.role === Role.GENERAL_MANAGER);
  const custom = source.filter((step) =>
    step !== requester && step !== finance && step !== generalManager &&
    !(step.role === Role.HOD && (/human resources/i.test(step.label) || step.approverDepartmentId === humanResources.id))
  );

  return [
    { role: Role.HOD, label: requester?.label || 'Head of Department', approverDepartmentId: departmentId, ...(requester?.approverUserId ? { approverUserId: requester.approverUserId } : {}) },
    ...custom,
    { role: Role.HOD, label: 'Human Resources — Head of Department', approverDepartmentId: humanResources.id },
    { role: Role.FINANCE_DIRECTOR, label: finance?.label || 'Finance Director', ...(finance?.approverUserId ? { approverUserId: finance.approverUserId } : {}) },
    { role: Role.GENERAL_MANAGER, label: generalManager?.label || 'General Manager — Request confirmation', ...(generalManager?.approverUserId ? { approverUserId: generalManager.approverUserId } : {}) },
  ];
}

async function normalizeItems(
  transaction: Transaction,
  departmentId: string,
  rawItems: Array<Record<string, unknown>>,
  start: Date,
  end: Date,
  estimatedHoursPerShift: number,
): Promise<NormalizedItem[]> {
  if (!rawItems.length || rawItems.length > 100) throw new WorkforceRequestPlanningError('INVALID_INPUT');
  const positions = await transaction.workforcePosition.findMany({
    where: { departmentId, isActive: true },
    select: { id: true, name: true },
  });
  const allowed = new Map<string, string>(positions.map((position: { id: string; name: string }) => [position.id, position.name]));
  const result: NormalizedItem[] = [];

  for (const item of rawItems) {
    const positionId = String(item.positionId || '');
    const rateUnit = item.rateUnit as WorkforceRateUnit;
    const quantity = Number(item.quantity);
    const hours = rateUnit === WorkforceRateUnit.HOURLY ? Number(item.hours) : null;
    if (!allowed.has(positionId)) throw new WorkforceRequestPlanningError('INVALID_SERVICE');
    if (!Object.values(WorkforceRateUnit).includes(rateUnit) || !Number.isInteger(quantity) || quantity < 1 || quantity > 10_000) {
      throw new WorkforceRequestPlanningError('INVALID_SERVICE');
    }
    if (rateUnit === WorkforceRateUnit.HOURLY && (!Number.isFinite(hours) || Number(hours) <= 0 || Number(hours) > 24)) {
      throw new WorkforceRequestPlanningError('INVALID_SERVICE');
    }
    const lowestRate = await transaction.vendorServiceRate.findFirst({
      where: {
        positionId,
        unit: rateUnit,
        isActive: true,
        vendor: {
          isActive: true,
          isApproved: true,
          approvalStatus: VendorApprovalStatus.APPROVED,
          replacementRequested: false,
        },
      },
      orderBy: [{ price: 'asc' }, { id: 'asc' }],
    });
    if (!lowestRate) throw new WorkforceRequestPlanningError('NO_ELIGIBLE_RATE', allowed.get(positionId));
    result.push({
      positionId,
      rateUnit,
      quantity,
      hours,
      estimatedCost: catalogCost(quantity, lowestRate.price, rateUnit, start, end, hours || estimatedHoursPerShift),
    });
  }
  return result;
}

async function departmentMonthSpend(transaction: Transaction, departmentId: string, workDate: Date, excludeRequestId?: string) {
  const start = new Date(workDate.getFullYear(), workDate.getMonth(), 1);
  const end = new Date(workDate.getFullYear(), workDate.getMonth() + 1, 0, 23, 59, 59, 999);
  const rows = await transaction.workforceRequest.findMany({
    where: {
      departmentId,
      workDate: { gte: start, lte: end },
      ...(excludeRequestId ? { id: { not: excludeRequestId } } : {}),
      status: { notIn: [WorkforceRequestStatus.REJECTED, WorkforceRequestStatus.CANCELLED, WorkforceRequestStatus.VENDOR_DECLINED] },
    },
    select: { estimatedCost: true, actualCost: true },
  });
  return rows.reduce((total: number, row: { actualCost: number | null; estimatedCost: number | null }) => total + (row.actualCost ?? row.estimatedCost ?? 0), 0);
}

async function budgetExceeded(transaction: Transaction, departmentId: string, workDate: Date, cost: number, excludeRequestId?: string) {
  const [budget, spend] = await Promise.all([
    transaction.departmentCasualBudget.findUnique({
      where: { departmentId_year_month: { departmentId, year: workDate.getFullYear(), month: workDate.getMonth() + 1 } },
    }),
    departmentMonthSpend(transaction, departmentId, workDate, excludeRequestId),
  ]);
  return Boolean(budget && spend + cost > budget.budgetAmount);
}

async function nextRequestCode(transaction: Transaction) {
  const rows = await transaction.workforceRequest.findMany({ select: { code: true } });
  const maximum = rows.reduce((current: number, row: { code: string }) => {
    const match = /^CWR-(\d+)$/.exec(row.code);
    return match ? Math.max(current, Number(match[1])) : current;
  }, 0);
  return `CWR-${String(maximum + 1).padStart(5, '0')}`;
}

function validatePeriod(start: Date, end: Date) {
  if (end < start || inclusiveDays(start, end) > 366) throw new WorkforceRequestPlanningError('INVALID_PERIOD');
}

export async function createWorkforceRequestInTransaction(
  transaction: Transaction,
  actor: AuthUser,
  input: Record<string, unknown>,
  options: { now?: Date; eventDetails?: string; notification: WorkforceNotificationOptions },
) {
  const departmentId = String(input.departmentId || '');
  if (!departmentId) throw new WorkforceRequestPlanningError('INVALID_INPUT');
  assertCreateScope(actor, departmentId);
  const workDate = parseDate(input.workDate);
  const endDate = parseDate(input.endDate);
  validatePeriod(workDate, endDate);
  const urgent = input.isUrgentOverride === true;
  if (urgent && !canUseUrgentOverride(actor)) throw new WorkforceRequestPlanningError('FORBIDDEN');
  const rawItems = requestItems(input);
  const comment = input.comment == null ? null : String(input.comment).trim().slice(0, 2000) || null;
  const requestedHotelName = input.hotelName == null ? null : String(input.hotelName).trim().slice(0, 200);

  await transaction.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext('workforce-request-planning'))`);
  const department = await transaction.department.findFirst({ where: { id: departmentId, isActive: true }, select: { id: true } });
  if (!department) throw new WorkforceRequestPlanningError('INVALID_INPUT');
  const settings = await getSettings(transaction);
  const leadHours = (workDate.getTime() - (options.now || new Date()).getTime()) / 3_600_000;
  if (leadHours < settings.minLeadHours && !urgent) throw new WorkforceRequestPlanningError('LEAD_TIME', String(settings.minLeadHours));
  const items = await normalizeItems(transaction, departmentId, rawItems, workDate, endDate, settings.estimatedHoursPerShift);
  const estimatedCost = currency(items.reduce((total, item) => total + item.estimatedCost, 0));
  const needsExtraApproval = urgent || await budgetExceeded(transaction, departmentId, workDate, estimatedCost);
  const steps = await approvalSteps(transaction, departmentId);
  const code = await nextRequestCode(transaction);
  const first = items[0];
  const created = await transaction.workforceRequest.create({
    data: {
      code,
      hotelName: requestedHotelName || settings.hotelName,
      departmentId,
      positionId: first.positionId,
      rateUnit: first.rateUnit,
      workDate,
      endDate,
      shift: WorkforceShift.CUSTOM,
      quantity: items.reduce((total, item) => total + item.quantity, 0),
      comment,
      vendorMode: WorkforceVendorMode.DIRECT,
      broadcastVendorIds: '[]',
      status: needsExtraApproval ? WorkforceRequestStatus.AWAITING_EXTRA_APPROVAL : WorkforceRequestStatus.PENDING,
      currentStepIndex: 0,
      approvalSteps: JSON.stringify(steps),
      needsExtraApproval,
      isUrgentOverride: urgent,
      estimatedCost,
      createdById: actor.id,
      items: { create: items.map((item) => ({ ...item, rateCurrency: 'AZN' })) },
    },
    include: { items: true },
  });
  const details = options.eventDetails || (needsExtraApproval ? 'Created with extra approval (budget or urgency)' : 'Request created');
  await transaction.workforceRequestEvent.create({ data: { requestId: created.id, action: 'CREATED', details, userId: actor.id, userName: actorName(actor) } });
  await transaction.auditLog.create({ data: { userId: actor.id, userName: actorName(actor), action: AuditAction.CREATE, entityType: 'WorkforceRequest', entityId: created.id, details: `Created casual workforce request ${code}${options.eventDetails ? ` — ${options.eventDetails}` : ''}`, outcome: 'SUCCESS', reason: needsExtraApproval ? 'Request created with budget or urgency escalation' : 'Casual workforce need submitted for approval', afterState: serializeWorkforceRequestAuditState(created) } });
  await queueRequestApprovalNotifications(transaction, {
    id: created.id,
    code,
    departmentId,
    approvalSteps: JSON.stringify(steps),
    currentStepIndex: 0,
  }, options.notification);
  return { requestId: created.id, code, departmentId, approvalSteps: JSON.stringify(steps), currentStepIndex: 0 };
}

export async function createWorkforceRequest(
  database: WorkforceDatabase,
  actor: AuthUser,
  input: Record<string, unknown>,
  notificationOptions: WorkforceNotificationOptions,
) {
  return database.$transaction((transaction) =>
    createWorkforceRequestInTransaction(transaction, actor, input, { notification: notificationOptions })
  );
}

export async function reviseAndResubmitWorkforceRequest(
  database: WorkforceDatabase,
  actor: AuthUser,
  requestId: string,
  input: Record<string, unknown>,
  notificationOptions: WorkforceNotificationOptions,
) {
  return database.$transaction(async (transaction) => {
    await transaction.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`workforce-request:${requestId}`}))`);
    const request = await transaction.workforceRequest.findUnique({
      where: { id: requestId },
      include: { items: true, _count: { select: { invoices: true } } },
    });
    if (!request) throw new WorkforceRequestPlanningError('NOT_FOUND');
    if (request.status !== WorkforceRequestStatus.RETURNED_FOR_REVISION) throw new WorkforceRequestPlanningError('INVALID_STATE');
    const hotelWide = actor.role === Role.GENERAL_MANAGER;
    if (!hotelWide && (actor.role !== Role.HOD || actor.departmentId !== request.departmentId)) throw new WorkforceRequestPlanningError('FORBIDDEN');
    if (request._count.invoices) throw new WorkforceRequestPlanningError('INVOICE_EXISTS');

    const workDate = input.workDate == null ? request.workDate : parseDate(input.workDate);
    const endDate = input.endDate == null ? request.endDate : parseDate(input.endDate);
    validatePeriod(workDate, endDate);
    const settings = await getSettings(transaction);
    const leadHours = (workDate.getTime() - Date.now()) / 3_600_000;
    if (leadHours < settings.minLeadHours && !request.isUrgentOverride) throw new WorkforceRequestPlanningError('LEAD_TIME', String(settings.minLeadHours));
    const rawItems = requestItems(input, request.items.map((item: any) => ({ positionId: item.positionId, rateUnit: item.rateUnit, quantity: item.quantity, hours: item.hours })));
    const items = await normalizeItems(transaction, request.departmentId, rawItems, workDate, endDate, settings.estimatedHoursPerShift);
    const estimatedCost = currency(items.reduce((total, item) => total + item.estimatedCost, 0));
    const needsExtraApproval = request.isUrgentOverride || await budgetExceeded(transaction, request.departmentId, workDate, estimatedCost, requestId);
    const steps = await approvalSteps(transaction, request.departmentId);
    const first = items[0];
    const comment = input.comment === undefined ? request.comment : String(input.comment || '').trim().slice(0, 2000) || null;
    const revisionComment = String(input.revisionComment || 'Request revised and resubmitted').trim().slice(0, 2000);

    const updated = await transaction.workforceRequest.updateMany({
      where: { id: requestId, status: WorkforceRequestStatus.RETURNED_FOR_REVISION },
      data: {
        positionId: first.positionId,
        rateUnit: first.rateUnit,
        workDate,
        endDate,
        quantity: items.reduce((total, item) => total + item.quantity, 0),
        comment,
        status: needsExtraApproval ? WorkforceRequestStatus.AWAITING_EXTRA_APPROVAL : WorkforceRequestStatus.PENDING,
        currentStepIndex: 0,
        approvalSteps: JSON.stringify(steps),
        needsExtraApproval,
        estimatedCost,
        vendorId: null,
        acceptedVendorId: null,
        vendorRateId: null,
        unitRate: null,
        rateCurrency: null,
        broadcastVendorIds: '[]',
        actualQuantity: null,
        actualHours: null,
        actualCost: null,
        hodConfirmedAt: null,
        hodConfirmedById: null,
        financeConfirmedAt: null,
        financeConfirmedById: null,
      },
    });
    if (updated.count !== 1) throw new WorkforceRequestPlanningError('CONFLICT');
    await transaction.vendorInvite.updateMany({ where: { requestId, status: 'PENDING' }, data: { status: 'EXPIRED', respondedAt: new Date() } });
    await transaction.workforceVendorCorrectionReview.deleteMany({ where: { requestId } });
    await transaction.workforceRequestItem.deleteMany({ where: { requestId } });
    await transaction.workforceRequestItem.createMany({ data: items.map((item) => ({ ...item, requestId, rateCurrency: 'AZN' })) });
    const revised = await transaction.workforceRequest.findUniqueOrThrow({ where: { id: requestId }, include: { items: true } });
    await transaction.workforceRequestEvent.create({ data: { requestId, action: 'RESUBMITTED', details: revisionComment, userId: actor.id, userName: actorName(actor) } });
    await transaction.auditLog.create({ data: { userId: actor.id, userName: actorName(actor), action: AuditAction.SUBMIT, entityType: 'WorkforceRequest', entityId: requestId, details: `Revised and resubmitted ${request.code}`, outcome: 'SUCCESS', reason: 'Owning department revised and resubmitted the returned request', beforeState: serializeWorkforceRequestAuditState(request), afterState: serializeWorkforceRequestAuditState(revised) } });
    await queueRequestApprovalNotifications(transaction, {
      id: requestId,
      code: request.code,
      departmentId: request.departmentId,
      approvalSteps: JSON.stringify(steps),
      currentStepIndex: 0,
    }, notificationOptions);
    return { requestId };
  });
}
