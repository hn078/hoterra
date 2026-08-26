import { Prisma, Role, WorkforceRequestStatus } from '@prisma/client';
import type * as DatabaseModule from '../../../db';
import type { AuthUser } from '../../../middleware/auth';
import {
  canApproveCurrentStep,
  formatRequest,
  requestInclude,
} from './workforceRequestSerialization';
import { canViewWorkforceRequest } from './requestVisibility';
import {
  canConfirmProcurementSelection,
  canManageProcurementWorkforce,
} from './procurementAccess';
import { canReviewVendorCorrection } from './decideVendorCorrectionReview';

type WorkforceDatabase = typeof DatabaseModule.prisma;

const HOTEL_WIDE_ROLES: Role[] = [
  Role.GENERAL_MANAGER,
  Role.FINANCE_DIRECTOR,
];

const VENDOR_DETAILS_VISIBLE_STATUSES: WorkforceRequestStatus[] = [
  WorkforceRequestStatus.VENDORS_FULLY_APPROVED,
  WorkforceRequestStatus.IN_SERVICE,
  WorkforceRequestStatus.AWAITING_EVALUATION,
  WorkforceRequestStatus.COMPLETED,
];

const INTERNAL_RESPONSE_FIELDS = new Set([
  'tenantId',
  'token',
  'portalPath',
  'filePath',
  'imagePath',
  'passwordHash',
]);

export type WorkforceRequestReadErrorCode = 'FORBIDDEN' | 'NOT_FOUND' | 'INVALID_QUERY';

export class WorkforceRequestReadError extends Error {
  constructor(public readonly code: WorkforceRequestReadErrorCode) {
    super(code);
    this.name = 'WorkforceRequestReadError';
  }
}

function assertReadCapability(actor: AuthUser) {
  if (!actor.capabilities.includes('workforce.read')) throw new WorkforceRequestReadError('FORBIDDEN');
}

function parseStatus(value: unknown) {
  if (value == null || value === '') return undefined;
  const status = String(value) as WorkforceRequestStatus;
  if (!Object.values(WorkforceRequestStatus).includes(status)) throw new WorkforceRequestReadError('INVALID_QUERY');
  return status;
}

function canSeeVendorDetails(actor: AuthUser, status: WorkforceRequestStatus, procurementViewer: boolean) {
  return HOTEL_WIDE_ROLES.includes(actor.role) || procurementViewer || VENDOR_DETAILS_VISIBLE_STATUSES.includes(status);
}

function sanitizeInvite(invite: Record<string, unknown>) {
  const { token: _token, portalPath: _portalPath, ...safe } = invite;
  return safe;
}

/** Keep persistence and credential fields out of the public workforce API contract. */
function stripInternalResponseFields(value: unknown): unknown {
  if (value == null || typeof value !== 'object' || value instanceof Date) return value;
  if (Array.isArray(value)) return value.map(stripInternalResponseFields);

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !INTERNAL_RESPONSE_FIELDS.has(key))
      .map(([key, nested]) => [key, stripInternalResponseFields(nested)])
  );
}

function serializeForActor(request: any, actor: AuthUser, procurementViewer: boolean) {
  const formatted: any = stripInternalResponseFields(formatRequest(request));
  formatted.invites = (formatted.invites || []).map(sanitizeInvite);
  if (canSeeVendorDetails(actor, request.status, procurementViewer)) return formatted;

  return {
    ...formatted,
    vendorId: null,
    vendor: null,
    acceptedVendorId: null,
    acceptedVendor: null,
    vendorRateId: null,
    vendorRate: null,
    unitRate: null,
    invites: [],
    invoices: [],
    evaluations: [],
    items: formatted.items.map((item: Record<string, unknown>) => ({
      ...item,
      vendorId: null,
      vendor: null,
      vendorRateId: null,
      vendorRate: null,
      unitRate: null,
    })),
    vendorCorrectionReviews: [],
    events: formatted.events.map((event: Record<string, unknown>) =>
      /vendor|offer/i.test(String(event.details || ''))
        ? { ...event, details: 'Vendor details will be available after Procurement confirms all vendors.' }
        : event
    ),
  };
}

function visibilityContext(actor: AuthUser, request: any, procurementViewer: boolean) {
  return {
    isProcurementViewer: procurementViewer,
    isCurrentApprover: canApproveCurrentStep(actor, request),
    hasParticipated: request.events.some((event: { action: string; userId: string | null }) =>
      event.userId === actor.id && ['APPROVED', 'REJECTED'].includes(event.action)
    ),
  };
}

export async function listWorkforceRequests(
  database: WorkforceDatabase,
  actor: AuthUser,
  query: Record<string, unknown>,
) {
  assertReadCapability(actor);
  const status = parseStatus(query.status);
  const departmentId = query.departmentId ? String(query.departmentId) : undefined;
  const mine = query.mine === '1';
  const pendingMine = query.pendingMine === '1';
  const procurementViewer = await canManageProcurementWorkforce(database, actor);
  const hotelWide = HOTEL_WIDE_ROLES.includes(actor.role) || procurementViewer;

  const where: Record<string, unknown> = {
    ...(status ? { status } : {}),
    ...(mine ? { createdById: actor.id } : {}),
  };
  if (hotelWide && departmentId) where.departmentId = departmentId;
  if (!hotelWide) {
    where.OR = [
      { createdById: actor.id },
      ...(actor.departmentId ? [{ departmentId: actor.departmentId }] : []),
      { events: { some: { userId: actor.id, action: { in: ['APPROVED', 'REJECTED'] } } } },
      { status: { in: [WorkforceRequestStatus.PENDING, WorkforceRequestStatus.AWAITING_EXTRA_APPROVAL] } },
    ];
  }

  let requests = await database.workforceRequest.findMany({
    where,
    include: {
      department: true,
      position: true,
      vendor: true,
      acceptedVendor: true,
      vendorRate: { include: { vendor: true, position: true } },
      createdBy: { select: { id: true, firstName: true, lastName: true, email: true, role: true } },
      events: { orderBy: { createdAt: 'desc' }, take: 20 },
      items: {
        include: { position: true, vendor: true, vendorRate: { include: { vendor: true, position: true } } },
        orderBy: { createdAt: 'asc' },
      },
      vendorCorrectionReviews: {
        where: { status: { in: ['DRAFT', 'PENDING_FD', 'PENDING_GM'] } },
        include: { corrections: { include: { item: { include: { position: true } } }, orderBy: { createdAt: 'asc' } } },
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 500,
  });

  requests = requests.filter((request) =>
    canViewWorkforceRequest(actor, request, visibilityContext(actor, request, procurementViewer))
  );
  if (pendingMine) requests = requests.filter((request) => canApproveCurrentStep(actor, request));

  const counts = new Map<string, number>();
  for (const request of requests) counts.set(request.status, (counts.get(request.status) || 0) + 1);

  return {
    data: requests.map((request) => {
      const review = request.vendorCorrectionReviews[0];
      return {
        ...serializeForActor(request, actor, procurementViewer),
        vendorCorrectionReviewStatus: review?.status || null,
        vendorCorrectionReviewCount: review?.corrections.length || 0,
        canReviewVendorCorrectionReview: Boolean(review && canReviewVendorCorrection(actor.role, review.status)),
      };
    }),
    counts: Object.fromEntries(counts),
  };
}

export async function searchWorkforceRequests(
  database: WorkforceDatabase,
  actor: AuthUser,
  queryValue: string,
  options?: { dateFrom?: Date; departmentId?: string; sort?: 'relevance' | 'date' | 'name' },
) {
  if (!actor.capabilities.includes('workforce.read')) return [];
  const query = queryValue.trim().slice(0, 200);
  if (!query) return [];

  const [procurementManager, procurementConfirmer] = await Promise.all([
    canManageProcurementWorkforce(database, actor),
    canConfirmProcurementSelection(database, actor),
  ]);
  const procurementViewer = procurementManager || procurementConfirmer;
  const hotelWide = HOTEL_WIDE_ROLES.includes(actor.role) || procurementViewer;
  const vendorFields: Prisma.WorkforceRequestWhereInput[] = [
    { vendor: { is: { name: { contains: query, mode: 'insensitive' } } } },
    { acceptedVendor: { is: { name: { contains: query, mode: 'insensitive' } } } },
    { items: { some: { vendor: { is: { name: { contains: query, mode: 'insensitive' } } } } } },
  ];
  const searchableVendorFields: Prisma.WorkforceRequestWhereInput = hotelWide
    ? { OR: vendorFields }
    : { AND: [{ status: { in: VENDOR_DETAILS_VISIBLE_STATUSES } }, { OR: vendorFields }] };

  const requests = await database.workforceRequest.findMany({
    where: {
      AND: [
        {
          OR: [
            { code: { contains: query, mode: 'insensitive' } },
            { department: { is: { name: { contains: query, mode: 'insensitive' } } } },
            { position: { is: { name: { contains: query, mode: 'insensitive' } } } },
            { items: { some: { position: { is: { name: { contains: query, mode: 'insensitive' } } } } } },
            searchableVendorFields,
          ],
        },
        ...(options?.departmentId ? [{ departmentId: options.departmentId }] : []),
        ...(options?.dateFrom ? [{ updatedAt: { gte: options.dateFrom } }] : []),
      ],
    },
    select: {
      id: true,
      code: true,
      status: true,
      departmentId: true,
      currentStepIndex: true,
      approvalSteps: true,
      createdById: true,
      workDate: true,
      endDate: true,
      quantity: true,
      createdAt: true,
      updatedAt: true,
      department: { select: { id: true, name: true, color: true } },
      position: { select: { id: true, name: true } },
      vendor: { select: { id: true, name: true } },
      acceptedVendor: { select: { id: true, name: true } },
      items: {
        select: {
          quantity: true,
          position: { select: { id: true, name: true } },
          vendor: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'asc' },
      },
      events: {
        where: { userId: actor.id, action: { in: ['APPROVED', 'REJECTED'] } },
        select: { action: true, userId: true },
        take: 1,
      },
    },
    orderBy: options?.sort === 'name' ? { code: 'asc' } : { updatedAt: 'desc' },
    take: 50,
  });

  return requests
    .filter((request) => canViewWorkforceRequest(actor, request, visibilityContext(actor, request, procurementViewer)))
    .slice(0, 10)
    .map((request) => {
      const canSeeVendors = canSeeVendorDetails(actor, request.status, procurementViewer);
      const vendorNames = canSeeVendors
        ? Array.from(new Set([
            request.vendor?.name,
            request.acceptedVendor?.name,
            ...request.items.map((item) => item.vendor?.name),
          ].filter((name): name is string => Boolean(name))))
        : [];
      const services = Array.from(new Set([
        request.position.name,
        ...request.items.map((item) => item.position.name),
      ]));
      const quantity = request.items.length
        ? request.items.reduce((total, item) => total + item.quantity, 0)
        : request.quantity;
      return {
        id: request.id,
        code: request.code,
        status: request.status,
        department: request.department,
        services,
        vendorNames,
        quantity,
        workDate: request.workDate,
        endDate: request.endDate,
        updatedAt: request.updatedAt,
      };
    });
}

export async function getWorkforceRequestDetail(
  database: WorkforceDatabase,
  actor: AuthUser,
  requestId: string,
) {
  assertReadCapability(actor);
  const [request, procurementManager, procurementConfirmer] = await Promise.all([
    database.workforceRequest.findUnique({ where: { id: requestId }, include: requestInclude }),
    canManageProcurementWorkforce(database, actor),
    canConfirmProcurementSelection(database, actor),
  ]);
  if (!request) throw new WorkforceRequestReadError('NOT_FOUND');
  const procurementViewer = procurementManager || procurementConfirmer;
  if (!canViewWorkforceRequest(actor, request, visibilityContext(actor, request, procurementViewer))) {
    throw new WorkforceRequestReadError('NOT_FOUND');
  }

  const activeCorrectionReview = request.vendorCorrectionReviews.find((review) =>
    ['DRAFT', 'PENDING_FD', 'PENDING_GM'].includes(review.status)
  );
  return {
    ...serializeForActor(request, actor, procurementViewer),
    canApprove: canApproveCurrentStep(actor, request),
    canManage: actor.capabilities.includes('workforce.vendor.manage'),
    canConfirmProcurement: request.status === WorkforceRequestStatus.PROCUREMENT_REVIEW && procurementConfirmer,
    canCorrectVendors: procurementManager,
    canSubmitVendorCorrectionReview: Boolean(procurementManager && activeCorrectionReview?.status === 'DRAFT'),
    canReviewVendorCorrectionReview: Boolean(activeCorrectionReview && canReviewVendorCorrection(actor.role, activeCorrectionReview.status)),
    canMarkVendorsFullyApproved: Boolean(
      procurementManager &&
      (request.status === WorkforceRequestStatus.VENDOR_ACCEPTED || request.status === WorkforceRequestStatus.IN_SERVICE) &&
      request.actualQuantity == null &&
      !activeCorrectionReview
    ),
  };
}
