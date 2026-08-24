import { Router, Request, Response } from 'express';
import {
  AuditAction,
  Role,
  WorkforceRequestStatus,
  WorkforceShift,
  WorkforceVendorMode,
  WorkforceRateUnit,
  VendorApprovalStatus,
  WorkforceEvaluationPhase,
} from '@prisma/client';
import { prisma } from '../db';
import { authMiddleware, requireRoles } from '../middleware/auth';
import { asyncHandler } from '../lib/asyncHandler';
import { routeParam } from '../utils';
import {
  addEvent,
  appendGmIfMissing,
  canApproveCurrentStep,
  canCreateRequest,
  canManageCatalog,
  estimateCost,
  ensureRequiredApprovalSteps,
  formatRequest,
  getWorkforceSettings,
  hoursUntil,
  isPrivilegedApprover,
  isShift,
  isVendorMode,
  loadRequest,
  monthSpend,
  nextRequestCode,
  notifyApprovers,
  parseApprovalSteps,
  parseHotels,
  POSITION_CATALOG,
  resolveApprovalSteps,
  serializeApprovalSteps,
  type ApprovalStep,
} from '../lib/workforce';
import { dispatchToVendors } from '../lib/workforceVendor';
import { matchInvoice } from '../lib/workforcePayroll';
import { listOutbox } from '../lib/mail';
import { runRecurringTemplates } from '../lib/workforceRecurring';
import { buildWorkforceReport } from '../lib/workforceReport';

const router = Router();

const MANAGE_ROLES = [
  Role.SYSTEM_ADMINISTRATOR,
  Role.GENERAL_MANAGER,
  Role.HOD,
  Role.FINANCE_DIRECTOR,
] as const;

const VENDOR_APPROVAL_STEPS: ApprovalStep[] = [
  { role: Role.FINANCE_DIRECTOR, label: 'Finance Director' },
  { role: Role.GENERAL_MANAGER, label: 'General Manager' },
];

const VENDOR_DETAILS_VISIBLE_STATUSES: WorkforceRequestStatus[] = [
  WorkforceRequestStatus.VENDORS_FULLY_APPROVED,
  WorkforceRequestStatus.IN_SERVICE,
  WorkforceRequestStatus.AWAITING_EVALUATION,
  WorkforceRequestStatus.COMPLETED,
];

function actorName(req: Request) {
  return `${req.user!.firstName} ${req.user!.lastName}`;
}

function hodDepartmentId(req: Request) {
  return req.user!.role === Role.HOD ? req.user!.departmentId || '__unassigned_hod__' : undefined;
}

function canViewWorkforceRequest(
  req: Request,
  request: {
    departmentId: string;
    status: WorkforceRequestStatus;
    currentStepIndex: number;
    approvalSteps: string;
    events?: Array<{ action: string; userId: string | null }>;
  }
) {
  return req.user!.role !== Role.HOD ||
    req.user!.departmentId === request.departmentId ||
    canApproveCurrentStep(req.user!, request) ||
    request.events?.some((event) =>
      event.userId === req.user!.id && ['APPROVED', 'REJECTED'].includes(event.action)
    ) === true;
}

function canApproveVendorCorrectionReview(role: Role, status: string) {
  if (role === Role.SYSTEM_ADMINISTRATOR) return status === 'PENDING_FD' || status === 'PENDING_GM';
  if (status === 'PENDING_FD') return role === Role.FINANCE_DIRECTOR;
  return status === 'PENDING_GM' && role === Role.GENERAL_MANAGER;
}

function vendorDetailsAreVisible(user: NonNullable<Request['user']>, status: WorkforceRequestStatus) {
  if (user.role !== Role.HOD) return true;
  return VENDOR_DETAILS_VISIBLE_STATUSES.includes(status);
}

function formatWorkforceRequestForViewer(request: Parameters<typeof formatRequest>[0], user: NonNullable<Request['user']>) {
  const formatted = formatRequest(request);
  if (vendorDetailsAreVisible(user, request.status)) return formatted;
  return {
    ...formatted,
    vendorId: null,
    vendor: null,
    acceptedVendorId: null,
    acceptedVendor: null,
    vendorRateId: null,
    vendorRate: null,
    unitRate: null,
    items: formatted.items.map((item) => ({
      ...item,
      vendorId: null,
      vendor: null,
      vendorRateId: null,
      vendorRate: null,
      unitRate: null,
    })),
    vendorCorrectionReviews: [],
    events: formatted.events.map((event) =>
      /vendor|offer/i.test(event.details || '')
        ? { ...event, details: 'Vendor details will be available after Procurement confirms all vendors.' }
        : event
    ),
  };
}

function endDateHasNotPassed(endDate: Date) {
  const endOfDay = new Date(endDate);
  endOfDay.setHours(23, 59, 59, 999);
  return endOfDay.getTime() >= Date.now();
}

function currencyAmount(value: unknown) {
  return Math.round(Number(value) * 100) / 100;
}

function inclusiveDays(start: Date, end: Date) {
  return Math.max(1, Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1);
}

function catalogCost(quantity: number, rate: { price: number; unit: WorkforceRateUnit }, start: Date, end: Date, hoursPerDay: number) {
  const days = inclusiveDays(start, end);
  return currencyAmount(quantity * rate.price * days * (rate.unit === WorkforceRateUnit.HOURLY ? hoursPerDay : 1));
}

async function notifyProcurement(request: { id: string; code: string; vendor?: { name: string } | null; unitRate?: number | null; rateCurrency?: string | null; items?: Array<{ vendor?: { name: string } | null; estimatedCost?: number | null }> }) {
  const users = await prisma.user.findMany({
    where: { isActive: true, department: { code: 'PR' }, role: { in: [Role.HOD, Role.GENERAL_MANAGER, Role.SYSTEM_ADMINISTRATOR] } },
    select: { id: true },
  });
  if (users.length) {
    const selectedVendors = [...new Set((request.items || []).map((item) => item.vendor?.name).filter(Boolean))];
    const selectionSummary = selectedVendors.length ? `${request.items?.length || 0} service line(s) from ${selectedVendors.join(', ')}` : `${request.vendor?.name || 'vendor'} at ${request.unitRate?.toFixed(2) || '—'} ${request.rateCurrency || 'AZN'}`;
    await prisma.notification.createMany({
      data: users.map((user) => ({ userId: user.id, title: 'Procurement confirmation required', message: `${request.code}: system selected ${selectionSummary}`, type: 'workforce', link: `/workforce/${request.id}` })),
    });
  }
}

async function notifyLowVendorRatingThreshold(vendorId: string, vendorName: string, requestId: string) {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const lowRatingCount = await prisma.workforceQualityEvaluation.count({
    where: { vendorId, overallScore: { lte: 3 }, createdByRole: Role.HOD, createdAt: { gte: since } },
  });
  if (lowRatingCount < 5) return;

  const vendor = await prisma.vendor.findUnique({ where: { id: vendorId }, select: { lowRatingAlertedAt: true } });
  if (vendor?.lowRatingAlertedAt && vendor.lowRatingAlertedAt >= since) return;

  const recipients = await prisma.user.findMany({
    where: {
      isActive: true,
      OR: [
        { role: Role.FINANCE_DIRECTOR },
        { role: Role.GENERAL_MANAGER },
        { department: { code: 'PR' }, OR: [{ role: Role.HOD }, { customRole: { name: { contains: 'Procurement', mode: 'insensitive' } } }] },
      ],
    },
    select: { id: true },
  });
  if (recipients.length) {
    await prisma.notification.createMany({
      data: recipients.map(({ id }) => ({
        userId: id,
        title: 'Alternative vendor required',
        message: `${vendorName} received ${lowRatingCount} HOD ratings of 3 or below in the last 30 days. Service dissatisfaction was reported and an alternative vendor is required.`,
        type: 'workforce',
        link: `/workforce/${requestId}`,
      })),
    });
  }
  await prisma.vendor.update({ where: { id: vendorId }, data: { replacementRequested: true, lowRatingAlertedAt: new Date() } });
}

async function notifyVendorApprovers(vendor: { id: string; name: string; approvalSteps: string; currentStepIndex: number }) {
  const step = parseApprovalSteps(vendor.approvalSteps)[vendor.currentStepIndex];
  if (!step) return;

  const settings = await getWorkforceSettings();
  const users = await prisma.user.findMany({
    where: { isActive: true, role: step.role },
    select: { id: true, email: true, firstName: true },
  });
  const { appUrl, queueEmail } = await import('../lib/mail');
  const link = '/workforce?tab=catalog';

  await Promise.all(users.map(async (user) => {
    if (settings.notifyPush !== false) {
      await prisma.notification.create({
        data: {
          userId: user.id,
          title: 'Vendor approval required',
          message: `${vendor.name} needs your approval (${step.label})`,
          type: 'workforce',
          link,
        },
      });
    }
    if (settings.notifyEmail !== false && user.email) {
      await queueEmail({
        toEmail: user.email,
        subject: `[HOTERRA] Vendor approval needed: ${vendor.name}`,
        body: `Hi ${user.firstName},\n\n${vendor.name} needs your approval (${step.label}).\n\nOpen: ${appUrl(link)}\n`,
        entityType: 'Vendor',
        entityId: vendor.id,
      });
    }
  }));
}

async function canConfirmProcurement(userId: string, role: Role) {
  if (role === Role.SYSTEM_ADMINISTRATOR || role === Role.GENERAL_MANAGER) return true;
  const user = await prisma.user.findUnique({ where: { id: userId }, include: { department: true } });
  if (user?.department?.code === 'PR' && user.role === Role.HOD) return true;
  return canManageProcurementCatalog(userId, role);
}

async function updateEndedRequests() {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  await prisma.workforceRequest.updateMany({
    where: { endDate: { lt: startOfToday }, status: { in: [WorkforceRequestStatus.VENDOR_ACCEPTED, WorkforceRequestStatus.VENDORS_FULLY_APPROVED, WorkforceRequestStatus.IN_SERVICE] } },
    data: { status: WorkforceRequestStatus.AWAITING_EVALUATION },
  });
}

async function canManageProcurementCatalog(userId: string, role: Role) {
  if (role === Role.SYSTEM_ADMINISTRATOR || role === Role.GENERAL_MANAGER) return true;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { department: true, customRole: true },
  });
  if (user?.department?.code !== 'PR' || !user.customRole) return false;
  const permissions = user.customRole.permissions as Record<string, boolean[]>;
  const row = permissions['Casual Workforce'];
  return Boolean(row?.[0] || row?.[1] || row?.[3] || row?.[4] || row?.[6]);
}

async function requireCatalogManager(req: Request, res: Response) {
  if (await canManageProcurementCatalog(req.user!.id, req.user!.role)) return true;
  res.status(403).json({ error: 'Procurement catalog permission required' });
  return false;
}

function canApproveVendor(user: NonNullable<Request['user']>, vendor: { approvalSteps: string; currentStepIndex: number }) {
  if (user.role === Role.SYSTEM_ADMINISTRATOR) return true;
  const step = parseApprovalSteps(vendor.approvalSteps)[vendor.currentStepIndex];
  return Boolean(step && step.role === user.role);
}

// ── Catalog & settings ──────────────────────────────────────────────

router.get(
  '/meta',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const isProcurementUser = Boolean(await prisma.department.findFirst({
      where: { id: req.user!.departmentId || '__unassigned_hod__', code: 'PR' },
      select: { id: true },
    }));
    const canSeeVendorCatalog = isProcurementUser || ([
      Role.SYSTEM_ADMINISTRATOR,
      Role.GENERAL_MANAGER,
      Role.FINANCE_DIRECTOR,
    ] as Role[]).includes(req.user!.role);
    const [positions, vendors, catalogRates, settings, routes, budgets, templates, approvers] = await Promise.all([
      prisma.workforcePosition.findMany({ orderBy: { name: 'asc' } }),
      prisma.vendor.findMany({ include: { approvalEvents: { orderBy: { signedAt: 'desc' } }, serviceRates: { include: { position: true } } }, orderBy: { name: 'asc' } }),
      prisma.vendorServiceRate.findMany({
        where: { isActive: true, vendor: { isActive: true, approvalStatus: VendorApprovalStatus.APPROVED } },
        include: { vendor: true, position: true },
        orderBy: [{ position: { name: 'asc' } }, { vendor: { name: 'asc' } }],
      }),
      getWorkforceSettings(),
      prisma.workforceApprovalRoute.findMany({
        include: { department: true },
        orderBy: { name: 'asc' },
      }),
      prisma.departmentCasualBudget.findMany({
        include: { department: true },
        orderBy: [{ year: 'desc' }, { month: 'desc' }],
      }),
      prisma.workforceRequestTemplate.findMany({
        include: { department: true, position: true },
        orderBy: { name: 'asc' },
      }),
      prisma.user.findMany({
        where: { isActive: true, role: { in: [Role.HOD, Role.FINANCE_DIRECTOR, Role.GENERAL_MANAGER, Role.SUPERVISOR, Role.SYSTEM_ADMINISTRATOR] } },
        select: { id: true, firstName: true, lastName: true, email: true, role: true, departmentId: true, department: { select: { name: true, code: true } } },
        orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      }),
    ]);

    const visibleCatalogRates = !canSeeVendorCatalog
      ? [...catalogRates.reduce((lowest, rate) => {
          const key = `${rate.positionId}:${rate.unit}`;
          const current = lowest.get(key);
          if (!current || rate.price < current.price) lowest.set(key, rate);
          return lowest;
        }, new Map<string, (typeof catalogRates)[number]>()).values()].map((rate) => ({
          ...rate,
          vendorId: '',
          vendor: { ...rate.vendor, id: '', name: 'Approved vendor', contactEmail: null, phone: null },
        }))
      : catalogRates;

    res.json({
      positions,
      vendors: canSeeVendorCatalog ? vendors : [],
      catalogRates: visibleCatalogRates,
      settings: {
        ...settings,
        hotels: settings.hotels,
      },
      routes: await Promise.all(routes.map(async (r) => ({
        ...r,
        steps: await ensureRequiredApprovalSteps(parseApprovalSteps(r.steps)),
      }))),
      budgets,
      templates,
      approvers,
      defaultPositions: POSITION_CATALOG,
      approvalRoles: [
        Role.HOD,
        Role.FINANCE_DIRECTOR,
        Role.GENERAL_MANAGER,
        Role.SUPERVISOR,
        Role.SYSTEM_ADMINISTRATOR,
      ],
    });
  })
);

router.patch(
  '/settings',
  authMiddleware,
  requireRoles(Role.SYSTEM_ADMINISTRATOR, Role.GENERAL_MANAGER),
  asyncHandler(async (req, res) => {
    const {
      hotelName,
      hotels,
      minLeadHours,
      estimatedHourlyRate,
      estimatedHoursPerShift,
      notifyEmail,
      notifyPush,
      payrollTolerancePct,
    } = req.body;

    let hotelsJson: string | undefined;
    if (hotels !== undefined) {
      const list = Array.isArray(hotels) ? hotels.map(String).filter(Boolean) : parseHotels(String(hotels));
      hotelsJson = JSON.stringify(list.length ? list : ['HOTERRA']);
    }

    const settingsData = {
        ...(hotelName !== undefined && { hotelName: String(hotelName) }),
        ...(hotelsJson !== undefined && {
          hotelsJson,
          hotelName: JSON.parse(hotelsJson)[0] || 'HOTERRA',
        }),
        ...(minLeadHours !== undefined && { minLeadHours: Number(minLeadHours) }),
        ...(estimatedHourlyRate !== undefined && { estimatedHourlyRate: Number(estimatedHourlyRate) }),
        ...(estimatedHoursPerShift !== undefined && {
          estimatedHoursPerShift: Number(estimatedHoursPerShift),
        }),
        ...(notifyEmail !== undefined && { notifyEmail: Boolean(notifyEmail) }),
        ...(notifyPush !== undefined && { notifyPush: Boolean(notifyPush) }),
        ...(payrollTolerancePct !== undefined && {
          payrollTolerancePct: Number(payrollTolerancePct),
        }),
    };
    const existingSettings = await prisma.workforceSettings.findFirst();
    const settings = existingSettings
      ? await prisma.workforceSettings.update({ where: { id: existingSettings.id }, data: settingsData })
      : await prisma.workforceSettings.create({ data: {
        hotelName: hotelName ? String(hotelName) : 'HOTERRA',
        hotelsJson: hotelsJson || '["HOTERRA"]',
        minLeadHours: minLeadHours != null ? Number(minLeadHours) : 24,
        estimatedHourlyRate: estimatedHourlyRate != null ? Number(estimatedHourlyRate) : 15,
        estimatedHoursPerShift:
          estimatedHoursPerShift != null ? Number(estimatedHoursPerShift) : 8,
      } });
    const full = await getWorkforceSettings();
    res.json(full);
  })
);

router.post(
  '/positions',
  authMiddleware,
  asyncHandler(async (req, res) => {
    if (!(await requireCatalogManager(req, res))) return;
    const name = String(req.body.name || '').trim();
    const departmentId = String(req.body.departmentId || '');
    if (!name || !departmentId) return res.status(400).json({ error: 'Position name and department are required' });
    const position = await prisma.workforcePosition.create({ data: { name, departmentId } });
    res.status(201).json(position);
  })
);

router.patch(
  '/positions/:id',
  authMiddleware,
  asyncHandler(async (req, res) => {
    if (!(await requireCatalogManager(req, res))) return;
    const id = routeParam(req.params.id);
    const data: { name?: string; isActive?: boolean; departmentId?: string | null } = {};
    if (req.body.name !== undefined) data.name = String(req.body.name).trim();
    if (req.body.isActive !== undefined) data.isActive = Boolean(req.body.isActive);
    if (req.body.departmentId !== undefined) data.departmentId = req.body.departmentId ? String(req.body.departmentId) : null;
    const position = await prisma.workforcePosition.update({ where: { id }, data });
    res.json(position);
  })
);

router.post(
  '/vendors',
  authMiddleware,
  asyncHandler(async (req, res) => {
    if (!(await requireCatalogManager(req, res))) return;
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Vendor name is required' });
    const vendor = await prisma.vendor.create({
      data: {
        name,
        contactEmail: req.body.contactEmail || null,
        phone: req.body.phone || null,
        insuranceNotes: req.body.insuranceNotes || null,
        isApproved: false,
        approvalStatus: VendorApprovalStatus.PENDING_APPROVAL,
        approvalSteps: serializeApprovalSteps(VENDOR_APPROVAL_STEPS),
        submittedById: req.user!.id,
        submittedAt: new Date(),
        approvalEvents: { create: { action: 'SUBMITTED', userId: req.user!.id, userName: actorName(req), comment: 'Submitted by Procurement' } },
      },
      include: { approvalEvents: true, serviceRates: { include: { position: true } } },
    });
    await notifyVendorApprovers(vendor).catch((error) => console.error('Failed to notify vendor approvers', error));
    res.status(201).json(vendor);
  })
);

router.patch(
  '/vendors/:id',
  authMiddleware,
  asyncHandler(async (req, res) => {
    if (!(await requireCatalogManager(req, res))) return;
    const id = routeParam(req.params.id);
    const vendor = await prisma.vendor.update({
      where: { id },
      data: {
        ...(req.body.name !== undefined && { name: String(req.body.name).trim() }),
        ...(req.body.contactEmail !== undefined && { contactEmail: req.body.contactEmail || null }),
        ...(req.body.phone !== undefined && { phone: req.body.phone || null }),
        ...(req.body.insuranceNotes !== undefined && { insuranceNotes: req.body.insuranceNotes || null }),
        ...(req.body.replacementRequested !== undefined && { replacementRequested: Boolean(req.body.replacementRequested) }),
        ...(req.body.isActive !== undefined && { isActive: Boolean(req.body.isActive) }),
      },
    });
    res.json(vendor);
  })
);

router.delete('/vendors/:id', authMiddleware, asyncHandler(async (req, res) => {
  if (!(await requireCatalogManager(req, res))) return;
  const id = routeParam(req.params.id);
  await prisma.vendor.update({ where: { id }, data: { isActive: false } });
  res.json({ ok: true });
}));

router.post('/vendors/:id/approve', authMiddleware, asyncHandler(async (req, res) => {
  const id = routeParam(req.params.id);
  const vendor = await prisma.vendor.findUnique({ where: { id } });
  if (!vendor) return res.status(404).json({ error: 'Vendor not found' });
  if (vendor.approvalStatus !== VendorApprovalStatus.PENDING_APPROVAL) return res.status(400).json({ error: 'Vendor is not pending approval' });
  if (!canApproveVendor(req.user!, vendor)) return res.status(403).json({ error: 'Not the current vendor approver' });
  const steps = parseApprovalSteps(vendor.approvalSteps);
  const step = steps[vendor.currentStepIndex];
  const isLast = vendor.currentStepIndex >= steps.length - 1;
  const updated = await prisma.vendor.update({
    where: { id },
    data: {
      currentStepIndex: isLast ? vendor.currentStepIndex : vendor.currentStepIndex + 1,
      approvalStatus: isLast ? VendorApprovalStatus.APPROVED : VendorApprovalStatus.PENDING_APPROVAL,
      isApproved: isLast,
      approvedAt: isLast ? new Date() : null,
      approvalEvents: { create: { action: isLast ? 'APPROVED' : 'STEP_APPROVED', stepIndex: vendor.currentStepIndex, role: req.user!.role, userId: req.user!.id, userName: actorName(req), comment: req.body.comment || step?.label } },
    },
    include: { approvalEvents: { orderBy: { signedAt: 'desc' } }, serviceRates: { include: { position: true } } },
  });
  if (!isLast) await notifyVendorApprovers(updated).catch((error) => console.error('Failed to notify vendor approvers', error));
  res.json(updated);
}));

router.post('/vendors/:id/reject', authMiddleware, asyncHandler(async (req, res) => {
  const id = routeParam(req.params.id);
  const vendor = await prisma.vendor.findUnique({ where: { id } });
  if (!vendor) return res.status(404).json({ error: 'Vendor not found' });
  if (!canApproveVendor(req.user!, vendor)) return res.status(403).json({ error: 'Not the current vendor approver' });
  const reason = String(req.body.reason || '').trim();
  const updated = await prisma.vendor.update({
    where: { id },
    data: { approvalStatus: VendorApprovalStatus.REJECTED, isApproved: false, rejectionReason: reason || null, approvalEvents: { create: { action: 'REJECTED', stepIndex: vendor.currentStepIndex, role: req.user!.role, userId: req.user!.id, userName: actorName(req), comment: reason || null } } },
  });
  res.json(updated);
}));

router.post('/rates', authMiddleware, asyncHandler(async (req, res) => {
  if (!(await requireCatalogManager(req, res))) return;
  const { vendorId, positionId, unit } = req.body;
  const price = currencyAmount(req.body.price);
  if (!vendorId || !positionId || !Object.values(WorkforceRateUnit).includes(unit) || !Number.isFinite(price) || price < 0) return res.status(400).json({ error: 'vendorId, positionId, unit and valid price required' });
  const rate = await prisma.vendorServiceRate.upsert({
    where: { vendorId_positionId_unit: { vendorId, positionId, unit } },
    update: { price, currency: req.body.currency || 'AZN', uom: req.body.uom || 'Each', requirements: req.body.requirements || null, isActive: true },
    create: { vendorId, positionId, unit, price, currency: req.body.currency || 'AZN', uom: req.body.uom || 'Each', requirements: req.body.requirements || null },
    include: { vendor: true, position: true },
  });
  res.status(201).json(rate);
}));

router.patch('/rates/:id', authMiddleware, asyncHandler(async (req, res) => {
  if (!(await requireCatalogManager(req, res))) return;
  const rate = await prisma.vendorServiceRate.update({ where: { id: routeParam(req.params.id) }, data: { ...(req.body.price !== undefined && { price: currencyAmount(req.body.price) }), ...(req.body.requirements !== undefined && { requirements: req.body.requirements || null }), ...(req.body.isActive !== undefined && { isActive: Boolean(req.body.isActive) }) }, include: { vendor: true, position: true } });
  res.json(rate);
}));

router.delete('/rates/:id', authMiddleware, asyncHandler(async (req, res) => {
  if (!(await requireCatalogManager(req, res))) return;
  await prisma.vendorServiceRate.update({ where: { id: routeParam(req.params.id) }, data: { isActive: false } });
  res.json({ ok: true });
}));

router.put(
  '/routes/:departmentId',
  authMiddleware,
  requireRoles(Role.SYSTEM_ADMINISTRATOR, Role.GENERAL_MANAGER),
  asyncHandler(async (req, res) => {
    const departmentId = routeParam(req.params.departmentId);
    const dept = await prisma.department.findUnique({ where: { id: departmentId } });
    if (!dept) return res.status(404).json({ error: 'Department not found' });

    const submittedSteps = (req.body.steps as ApprovalStep[]) || [];
    if (!Array.isArray(submittedSteps) || submittedSteps.length === 0) {
      return res.status(400).json({ error: 'At least one approval step is required' });
    }
    for (const step of submittedSteps) {
      if (!step || !Object.values(Role).includes(step.role) || !String(step.label || '').trim()) {
        return res.status(400).json({ error: 'Each approval step needs a valid role and approver' });
      }
      if (step.approverUserId) {
        const approver = await prisma.user.findUnique({ where: { id: step.approverUserId }, select: { isActive: true, role: true } });
        if (!approver?.isActive || approver.role !== step.role) return res.status(400).json({ error: 'Selected approver is not active or does not match the selected role' });
      }
      if (step.approverDepartmentId && step.role !== Role.HOD) {
        return res.status(400).json({ error: 'A department approver can only be a Head of Department step' });
      }
    }
    const steps = await ensureRequiredApprovalSteps(submittedSteps);

    const route = await prisma.workforceApprovalRoute.upsert({
      where: { departmentId },
      update: {
        name: req.body.name || `${dept.name} Casual Staff Route`,
        steps: serializeApprovalSteps(steps),
      },
      create: {
        departmentId,
        name: req.body.name || `${dept.name} Casual Staff Route`,
        steps: serializeApprovalSteps(steps),
      },
      include: { department: true },
    });

    res.json({ ...route, steps: parseApprovalSteps(route.steps) });
  })
);

router.put(
  '/budgets',
  authMiddleware,
  requireRoles(Role.SYSTEM_ADMINISTRATOR, Role.GENERAL_MANAGER, Role.FINANCE_DIRECTOR),
  asyncHandler(async (req, res) => {
    const departmentId = String(req.body.departmentId || '');
    const year = Number(req.body.year);
    const month = Number(req.body.month);
    const budgetAmount = Number(req.body.budgetAmount);
    if (!departmentId || !year || !month || !Number.isFinite(budgetAmount)) {
      return res.status(400).json({ error: 'departmentId, year, month, budgetAmount required' });
    }

    const budget = await prisma.departmentCasualBudget.upsert({
      where: { departmentId_year_month: { departmentId, year, month } },
      update: { budgetAmount },
      create: { departmentId, year, month, budgetAmount },
      include: { department: true },
    });
    res.json(budget);
  })
);

router.post(
  '/templates',
  authMiddleware,
  requireRoles(...MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Template name is required' });
    const template = await prisma.workforceRequestTemplate.create({
      data: {
        name,
        departmentId: req.body.departmentId || null,
        positionId: req.body.positionId || null,
        shift: isShift(req.body.shift) ? req.body.shift : WorkforceShift.MORNING,
        quantity: Math.max(1, Number(req.body.quantity) || 1),
        comment: req.body.comment || null,
        dayOfWeek: req.body.dayOfWeek != null ? Number(req.body.dayOfWeek) : null,
        vendorMode: isVendorMode(req.body.vendorMode)
          ? req.body.vendorMode
          : WorkforceVendorMode.DIRECT,
        vendorId: req.body.vendorId || null,
        isRecurring: Boolean(req.body.isRecurring),
        hotelName: req.body.hotelName || null,
      },
      include: { department: true, position: true },
    });
    res.status(201).json(template);
  })
);

router.patch(
  '/templates/:id',
  authMiddleware,
  requireRoles(...MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const id = routeParam(req.params.id);
    const template = await prisma.workforceRequestTemplate.update({
      where: { id },
      data: {
        ...(req.body.name !== undefined && { name: String(req.body.name).trim() }),
        ...(req.body.isActive !== undefined && { isActive: Boolean(req.body.isActive) }),
        ...(req.body.isRecurring !== undefined && { isRecurring: Boolean(req.body.isRecurring) }),
        ...(req.body.dayOfWeek !== undefined && {
          dayOfWeek: req.body.dayOfWeek == null ? null : Number(req.body.dayOfWeek),
        }),
        ...(req.body.quantity !== undefined && { quantity: Math.max(1, Number(req.body.quantity)) }),
        ...(req.body.comment !== undefined && { comment: req.body.comment || null }),
        ...(req.body.hotelName !== undefined && { hotelName: req.body.hotelName || null }),
      },
      include: { department: true, position: true },
    });
    res.json(template);
  })
);

router.delete(
  '/templates/:id',
  authMiddleware,
  requireRoles(...MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    await prisma.workforceRequestTemplate.delete({ where: { id: routeParam(req.params.id) } });
    res.json({ ok: true });
  })
);

// ── Reports ─────────────────────────────────────────────────────────

router.get(
  '/reports',
  authMiddleware,
  requireRoles(Role.SYSTEM_ADMINISTRATOR, Role.GENERAL_MANAGER, Role.FINANCE_DIRECTOR, Role.HOD),
  asyncHandler(async (req, res) => {
    const year = Number(req.query.year) || new Date().getFullYear();
    const month = Number(req.query.month) || new Date().getMonth() + 1;
    res.json(await buildWorkforceReport(year, month, hodDepartmentId(req)));
  })
);

// ── Requests ────────────────────────────────────────────────────────

router.get(
  '/requests',
  authMiddleware,
  asyncHandler(async (req, res) => {
    await updateEndedRequests();
    const status = req.query.status ? String(req.query.status) : undefined;
    const departmentId = req.query.departmentId ? String(req.query.departmentId) : undefined;
    const mine = req.query.mine === '1';
    const pendingMine = req.query.pendingMine === '1';

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    const scopedDepartmentId = hodDepartmentId(req);
    if (!scopedDepartmentId && departmentId) where.departmentId = departmentId;
    if (mine) where.createdById = req.user!.id;

    const participatedRequestIds = scopedDepartmentId
      ? new Set((await prisma.workforceRequestEvent.findMany({
          where: { userId: req.user!.id, action: { in: ['APPROVED', 'REJECTED'] } },
          select: { requestId: true },
        })).map((event) => event.requestId))
      : new Set<string>();

    let requests = await prisma.workforceRequest.findMany({
      where,
      include: {
        department: true,
        position: true,
        vendor: true,
        acceptedVendor: true,
        vendorRate: { include: { vendor: true, position: true } },
        createdBy: {
          select: { id: true, firstName: true, lastName: true, email: true, role: true },
        },
        events: { orderBy: { createdAt: 'desc' }, take: 5 },
        items: {
          include: { position: true, vendor: true, vendorRate: { include: { vendor: true, position: true } } },
          orderBy: { createdAt: 'asc' },
        },
        vendorCorrectionReviews: {
          where: { status: { in: ['DRAFT', 'PENDING_FD', 'PENDING_GM'] } },
          include: {
            corrections: {
              include: { item: { include: { position: true } } },
              orderBy: { createdAt: 'asc' },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (scopedDepartmentId) {
      requests = requests.filter((request) =>
        request.departmentId === scopedDepartmentId ||
        participatedRequestIds.has(request.id) ||
        canApproveCurrentStep(req.user!, {
          status: request.status,
          departmentId: request.departmentId,
          currentStepIndex: request.currentStepIndex,
          approvalSteps: request.approvalSteps,
        })
      );
    }

    if (pendingMine) {
      requests = requests.filter((r) =>
        canApproveCurrentStep(req.user!, {
          status: r.status,
          departmentId: r.departmentId,
          currentStepIndex: r.currentStepIndex,
          approvalSteps: r.approvalSteps,
        })
      );
    }

    const counts = new Map<string, number>();
    for (const request of requests) counts.set(request.status, (counts.get(request.status) || 0) + 1);

    res.json({
      data: requests.map((r) => {
        const review = r.vendorCorrectionReviews[0];
        return {
          ...formatWorkforceRequestForViewer(r, req.user!),
          vendorCorrectionReviewStatus: review?.status || null,
          vendorCorrectionReviewCount: review?.corrections.length || 0,
          canReviewVendorCorrectionReview: Boolean(
            review && canApproveVendorCorrectionReview(req.user!.role, review.status)
          ),
        };
      }),
      counts: Object.fromEntries(counts),
    });
  })
);

router.get(
  '/requests/:id',
  authMiddleware,
  asyncHandler(async (req, res) => {
    await updateEndedRequests();
    const request = await loadRequest(routeParam(req.params.id));
    if (!request) return res.status(404).json({ error: 'Request not found' });
    if (!canViewWorkforceRequest(req, request)) {
      return res.status(404).json({ error: 'Request not found' });
    }
    const canCorrectVendors = await canManageProcurementCatalog(req.user!.id, req.user!.role);
    const canConfirmProcurementSelection = await canConfirmProcurement(req.user!.id, req.user!.role);
    const activeCorrectionReview = request.vendorCorrectionReviews.find((review) =>
      ['DRAFT', 'PENDING_FD', 'PENDING_GM'].includes(review.status)
    );
    res.json({
      ...formatWorkforceRequestForViewer(request, req.user!),
      canApprove: canApproveCurrentStep(req.user!, request),
      canManage: canManageCatalog(req.user!.role),
      canConfirmProcurement: request.status === WorkforceRequestStatus.PROCUREMENT_REVIEW && canConfirmProcurementSelection,
      canCorrectVendors,
      canSubmitVendorCorrectionReview: Boolean(canCorrectVendors && activeCorrectionReview?.status === 'DRAFT'),
      canReviewVendorCorrectionReview: Boolean(
        activeCorrectionReview && canApproveVendorCorrectionReview(req.user!.role, activeCorrectionReview.status)
      ),
      canMarkVendorsFullyApproved: Boolean(
        canCorrectVendors &&
        (request.status === WorkforceRequestStatus.VENDOR_ACCEPTED || request.status === WorkforceRequestStatus.IN_SERVICE) &&
        request.actualQuantity == null &&
        !activeCorrectionReview
      ),
    });
  })
);

router.post(
  '/requests',
  authMiddleware,
  asyncHandler(async (req, res) => {
    if (!canCreateRequest(req.user!.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const {
      departmentId,
      items: requestedItems,
      positionId,
      rateUnit,
      workDate,
      endDate: requestedEndDate,
      shift,
      startTime,
      endTime,
      quantity,
      comment,
      vendorMode,
      vendorId,
      broadcastVendorIds,
      isUrgentOverride,
      hotelName,
    } = req.body;

    const rawItems = Array.isArray(requestedItems) && requestedItems.length
      ? requestedItems
      : positionId && rateUnit && quantity
        ? [{ positionId, rateUnit, quantity, hours: req.body.hours }]
        : [];
    if (!departmentId || !workDate || !requestedEndDate || rawItems.length === 0) {
      return res.status(400).json({ error: 'departmentId, workDate, endDate and at least one service item are required' });
    }

    if (req.user!.role !== Role.SYSTEM_ADMINISTRATOR && req.user!.role !== Role.GENERAL_MANAGER) {
      if (req.user!.role !== Role.HOD || req.user!.departmentId !== departmentId) {
        return res.status(403).json({ error: 'Only the HOD can create a request for their own department' });
      }
    }

    const date = new Date(workDate);
    const periodEnd = new Date(requestedEndDate);
    if (Number.isNaN(date.getTime()) || Number.isNaN(periodEnd.getTime()) || periodEnd < date) {
      return res.status(400).json({ error: 'Invalid work period' });
    }

    const mode = WorkforceVendorMode.DIRECT;

    const settings = await getWorkforceSettings();
    const leadHours = hoursUntil(date);
    const urgent = Boolean(isUrgentOverride);

    if (leadHours < settings.minLeadHours && !urgent) {
      return res.status(400).json({
        error: `Orders less than ${settings.minLeadHours} hours ahead require urgent override permission`,
      });
    }
    if (urgent && !canManageCatalog(req.user!.role) && !isPrivilegedApprover(req.user!.role)) {
      return res.status(403).json({ error: 'Urgent override requires HOD or higher' });
    }

    let steps = await resolveApprovalSteps(departmentId);
    if (!steps.some((step) => step.role === Role.FINANCE_DIRECTOR)) steps.push({ role: Role.FINANCE_DIRECTOR, label: 'Finance Director' });
    steps = steps.filter((step) => step.role !== Role.GENERAL_MANAGER);
    steps.push({ role: Role.GENERAL_MANAGER, label: 'General Manager — Request confirmation' });
    steps = await ensureRequiredApprovalSteps(steps);
    const departmentPositions = await prisma.workforcePosition.findMany({
      where: { departmentId, isActive: true },
      select: { id: true, name: true },
    });
    const allowedPositionIds = new Set(departmentPositions.map((position) => position.id));
    const normalizedItems = [] as Array<{ positionId: string; rateUnit: WorkforceRateUnit; quantity: number; hours: number | null; estimatedCost: number }>;
    for (const rawItem of rawItems) {
      const itemPositionId = String(rawItem.positionId || '');
      const itemUnit = rawItem.rateUnit as WorkforceRateUnit;
      const itemQuantity = Number(rawItem.quantity);
      const itemHours = itemUnit === WorkforceRateUnit.HOURLY ? Number(rawItem.hours) : null;
      if (!allowedPositionIds.has(itemPositionId)) return res.status(400).json({ error: 'Every service must belong to the selected department' });
      if (!Object.values(WorkforceRateUnit).includes(itemUnit) || !Number.isInteger(itemQuantity) || itemQuantity < 1) return res.status(400).json({ error: 'Each service needs a valid unit and quantity' });
      if (itemUnit === WorkforceRateUnit.HOURLY && (!Number.isFinite(itemHours) || Number(itemHours) <= 0)) return res.status(400).json({ error: 'Hourly services require working hours' });
      const indicativeRate = await prisma.vendorServiceRate.findFirst({
        where: { positionId: itemPositionId, unit: itemUnit, isActive: true, vendor: { isActive: true, isApproved: true, approvalStatus: VendorApprovalStatus.APPROVED, replacementRequested: false } },
        orderBy: { price: 'asc' },
      });
      if (!indicativeRate) return res.status(400).json({ error: 'No approved vendor offer exists for one of the selected services' });
      normalizedItems.push({ positionId: itemPositionId, rateUnit: itemUnit, quantity: itemQuantity, hours: itemHours, estimatedCost: catalogCost(itemQuantity, indicativeRate, date, periodEnd, itemHours || settings.estimatedHoursPerShift) });
    }
    const cost = currencyAmount(normalizedItems.reduce((sum, item) => sum + item.estimatedCost, 0));
    const qty = normalizedItems.reduce((sum, item) => sum + item.quantity, 0);
    const firstItem = normalizedItems[0];
    const spend = await monthSpend(departmentId, date);
    const budget = await prisma.departmentCasualBudget.findUnique({
      where: {
        departmentId_year_month: {
          departmentId,
          year: date.getFullYear(),
          month: date.getMonth() + 1,
        },
      },
    });

    let needsExtra = false;
    if (budget && spend + cost > budget.budgetAmount) {
      needsExtra = true;
      steps = appendGmIfMissing(steps);
    }
    if (urgent) {
      needsExtra = true;
      steps = appendGmIfMissing(steps);
    }

    const code = await nextRequestCode();
    const status = needsExtra
      ? WorkforceRequestStatus.AWAITING_EXTRA_APPROVAL
      : WorkforceRequestStatus.PENDING;

    const created = await prisma.workforceRequest.create({
      data: {
        code,
        hotelName: hotelName || settings.hotelName,
        departmentId,
        positionId: firstItem.positionId,
        vendorRateId: null,
        rateUnit: firstItem.rateUnit,
        unitRate: null,
        rateCurrency: null,
        workDate: date,
        endDate: periodEnd,
        shift: WorkforceShift.CUSTOM,
        startTime: null,
        endTime: null,
        quantity: qty,
        comment: comment || null,
        vendorMode: mode,
        vendorId: null,
        broadcastVendorIds: '[]',
        status,
        currentStepIndex: 0,
        approvalSteps: serializeApprovalSteps(steps),
        needsExtraApproval: needsExtra,
        isUrgentOverride: urgent,
        estimatedCost: cost,
        createdById: req.user!.id,
        items: {
          create: normalizedItems.map((item) => ({
            positionId: item.positionId,
            rateUnit: item.rateUnit,
            quantity: item.quantity,
            hours: item.hours,
            estimatedCost: item.estimatedCost,
          })),
        },
      },
    });

    await addEvent(
      created.id,
      'CREATED',
      req.user!,
      needsExtra
        ? 'Created with extra approval (budget or urgency)'
        : 'Request created'
    );

    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        userName: actorName(req),
        action: AuditAction.CREATE,
        entityType: 'WorkforceRequest',
        entityId: created.id,
        details: `Created casual workforce request ${code}`,
      },
    });

    const full = await loadRequest(created.id);
    await notifyApprovers(full!);

    res.status(201).json(formatRequest(full!));
  })
);

router.post(
  '/requests/:id/approve',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const id = routeParam(req.params.id);
    const request = await loadRequest(id);
    if (!request) return res.status(404).json({ error: 'Request not found' });

    if (!canApproveCurrentStep(req.user!, request)) {
      const latestEvent = request.events[0];
      if (latestEvent?.action === 'APPROVED' && latestEvent.userId === req.user!.id) {
        return res.json(formatWorkforceRequestForViewer(request, req.user!));
      }
      return res.status(403).json({ error: 'You cannot approve this step' });
    }

    const steps = parseApprovalSteps(request.approvalSteps);
    const step = steps[request.currentStepIndex];
    const isLast = request.currentStepIndex >= steps.length - 1;

    if (isLast) {
      const settings = await getWorkforceSettings();
      const selectedItems = [] as Array<{ itemId: string; rate: { id: string; vendorId: string; price: number; currency: string; unit: WorkforceRateUnit; vendor: { name: string } }; cost: number }>;
      for (const item of request.items) {
        const lowestRate = await prisma.vendorServiceRate.findFirst({
          where: { positionId: item.positionId, unit: item.rateUnit, isActive: true, vendor: { isActive: true, isApproved: true, approvalStatus: VendorApprovalStatus.APPROVED, replacementRequested: false } },
          include: { vendor: true },
          orderBy: [{ price: 'asc' }, { vendor: { name: 'asc' } }],
        });
        if (!lowestRate) return res.status(400).json({ error: `No eligible approved vendor offer found for ${item.position.name}` });
        selectedItems.push({ itemId: item.id, rate: lowestRate, cost: catalogCost(item.quantity, lowestRate, request.workDate, request.endDate, item.hours || settings.estimatedHoursPerShift) });
      }
      if (!selectedItems.length) return res.status(400).json({ error: 'Request has no service items' });
      const finalCost = currencyAmount(selectedItems.reduce((sum, item) => sum + item.cost, 0));
      await prisma.$transaction(selectedItems.map((item) => prisma.workforceRequestItem.update({
        where: { id: item.itemId },
        data: { vendorId: item.rate!.vendorId, vendorRateId: item.rate!.id, unitRate: item.rate!.price, rateCurrency: item.rate!.currency, estimatedCost: item.cost },
      })));
      const firstSelection = selectedItems[0];
      const vendorNames = [...new Set(selectedItems.map((item) => item.rate!.vendor.name))];
      const updated = await prisma.workforceRequest.update({
        where: { id },
        data: {
          status: WorkforceRequestStatus.PROCUREMENT_REVIEW,
          currentStepIndex: request.currentStepIndex,
          vendorId: firstSelection.rate!.vendorId,
          vendorRateId: firstSelection.rate!.id,
          unitRate: firstSelection.rate!.price,
          rateCurrency: firstSelection.rate!.currency,
          estimatedCost: finalCost,
        },
      });
      await addEvent(
        id,
        'GM_CONFIRMED_AUTO_SELECTED',
        req.user!,
        `${step?.label || 'GM'} confirmed request; system selected the lowest approved offer for ${selectedItems.length} service line(s): ${vendorNames.join(', ')}`
      );
      await prisma.auditLog.create({
        data: {
          userId: req.user!.id,
          userName: actorName(req),
          action: AuditAction.APPROVE,
          entityType: 'WorkforceRequest',
          entityId: id,
          details: `GM confirmed ${request.code}; auto-selected ${vendorNames.join(', ')}`,
        },
      });

      // Notify creator
      await prisma.notification.create({
      data: {
        userId: request.createdById,
        title: 'Casual staff request confirmed',
        message: `${request.code}: GM confirmed the request. Vendor details will be available after Procurement confirms all vendors.`,
        type: 'workforce',
        link: `/workforce/${id}`,
      },
      });

      const full = await loadRequest(updated.id);
      await notifyProcurement(full!);
      return res.json(formatRequest(full!));
    }

    const nextIndex = request.currentStepIndex + 1;
    const updated = await prisma.workforceRequest.update({
      where: { id },
      data: {
        status: WorkforceRequestStatus.PENDING,
        currentStepIndex: nextIndex,
        needsExtraApproval: false,
      },
    });

    await addEvent(id, 'APPROVED', req.user!, `${step?.label || 'Approver'} approved step`);
    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        userName: actorName(req),
        action: AuditAction.APPROVE,
        entityType: 'WorkforceRequest',
        entityId: id,
        details: `Approved step for ${request.code}`,
      },
    });

    const full = await loadRequest(updated.id);
    await notifyApprovers(full!);
    res.json(formatRequest(full!));
  })
);

router.post(
  '/requests/:id/return-for-revision',
  authMiddleware,
  requireRoles(Role.FINANCE_DIRECTOR, Role.GENERAL_MANAGER),
  asyncHandler(async (req, res) => {
    const id = routeParam(req.params.id);
    const request = await loadRequest(id);
    if (!request) return res.status(404).json({ error: 'Request not found' });
    if (!canApproveCurrentStep(req.user!, request)) return res.status(403).json({ error: 'You cannot return this request at the current step' });
    const comment = String(req.body.comment || '').trim();
    if (!comment) return res.status(400).json({ error: 'A revision comment is required' });

    await prisma.workforceRequest.update({
      where: { id },
      data: { status: WorkforceRequestStatus.RETURNED_FOR_REVISION, currentStepIndex: 0 },
    });
    await addEvent(id, 'RETURNED_FOR_REVISION', req.user!, comment);
    await prisma.auditLog.create({
      data: { userId: req.user!.id, userName: actorName(req), action: AuditAction.UPDATE, entityType: 'WorkforceRequest', entityId: id, details: `Returned ${request.code} to HOD for revision: ${comment}` },
    });
    await prisma.notification.create({
      data: { userId: request.createdById, title: 'Casual staff request returned for revision', message: `${request.code} was returned by ${actorName(req)}: ${comment}`, type: 'workforce', link: `/workforce/${id}` },
    });
    const full = await loadRequest(id);
    res.json(formatRequest(full!));
  })
);

router.post(
  '/requests/:id/finance-return-to-hod',
  authMiddleware,
  requireRoles(Role.FINANCE_DIRECTOR, Role.SYSTEM_ADMINISTRATOR),
  asyncHandler(async (req, res) => {
    const id = routeParam(req.params.id);
    const request = await loadRequest(id);
    if (!request) return res.status(404).json({ error: 'Request not found' });
    if (request.status !== WorkforceRequestStatus.VENDORS_FULLY_APPROVED) {
      return res.status(400).json({ error: 'Only fully approved vendor requests can be returned to HOD' });
    }
    if (!endDateHasNotPassed(request.endDate)) {
      return res.status(400).json({ error: 'The request can no longer be returned because its end date has passed' });
    }
    const comment = String(req.body.comment || '').trim();
    if (comment.length < 3) return res.status(400).json({ error: 'A revision comment is required' });

    await prisma.$transaction(async (tx) => {
      await tx.workforceRequest.update({
        where: { id },
        data: { status: WorkforceRequestStatus.RETURNED_FOR_REVISION, currentStepIndex: 0 },
      });
      await tx.workforceRequestEvent.create({
        data: {
          requestId: id,
          action: 'FINANCE_DIRECTOR_RETURNED_TO_HOD',
          details: `Finance Director returned the fully approved request to HOD for revision: ${comment}`,
          userId: req.user!.id,
          userName: actorName(req),
        },
      });
      await tx.auditLog.create({
        data: { userId: req.user!.id, userName: actorName(req), action: AuditAction.UPDATE, entityType: 'WorkforceRequest', entityId: id, details: `Finance Director returned ${request.code} to HOD for revision: ${comment}` },
      });
    });
    await prisma.notification.create({
      data: { userId: request.createdById, title: 'Request returned by Finance Director', message: `${request.code} was returned to HOD for revision: ${comment}`, type: 'workforce', link: `/workforce/${id}` },
    });
    const full = await loadRequest(id);
    res.json(formatRequest(full!));
  })
);

router.post(
  '/requests/:id/resubmit',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const id = routeParam(req.params.id);
    const request = await loadRequest(id);
    if (!request) return res.status(404).json({ error: 'Request not found' });
    if (request.status !== WorkforceRequestStatus.RETURNED_FOR_REVISION) return res.status(400).json({ error: 'Request is not awaiting revision' });
    const isDepartmentHod = req.user!.role === Role.HOD && req.user!.departmentId === request.departmentId;
    if (!isDepartmentHod && !isPrivilegedApprover(req.user!.role)) return res.status(403).json({ error: 'Department HOD permission required' });

    const workDate = new Date(req.body.workDate || request.workDate);
    const endDate = new Date(req.body.endDate || request.endDate);
    if (Number.isNaN(workDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate < workDate) return res.status(400).json({ error: 'Valid work period is required' });
    const rawItems = Array.isArray(req.body.items) && req.body.items.length
      ? req.body.items
      : request.items.map((item) => ({
          positionId: item.positionId,
          rateUnit: item.rateUnit,
          quantity: item.quantity,
          hours: item.hours,
        }));
    if (!rawItems.length) return res.status(400).json({ error: 'At least one service item is required' });

    const settings = await getWorkforceSettings();
    const leadHours = hoursUntil(workDate);
    if (leadHours < settings.minLeadHours && !request.isUrgentOverride) {
      return res.status(400).json({ error: `Orders less than ${settings.minLeadHours} hours ahead require urgent override permission` });
    }
    const positions = await prisma.workforcePosition.findMany({
      where: { departmentId: request.departmentId, isActive: true },
      select: { id: true },
    });
    const allowedPositionIds = new Set(positions.map((position) => position.id));
    const normalizedItems = [] as Array<{ positionId: string; rateUnit: WorkforceRateUnit; quantity: number; hours: number | null; estimatedCost: number }>;
    for (const rawItem of rawItems) {
      const positionId = String(rawItem.positionId || '');
      const rateUnit = rawItem.rateUnit as WorkforceRateUnit;
      const quantity = Number(rawItem.quantity);
      const hours = rateUnit === WorkforceRateUnit.HOURLY ? Number(rawItem.hours) : null;
      if (!allowedPositionIds.has(positionId)) return res.status(400).json({ error: 'Every service must belong to the request department' });
      if (!Object.values(WorkforceRateUnit).includes(rateUnit) || !Number.isInteger(quantity) || quantity < 1) return res.status(400).json({ error: 'Each service needs a valid unit and quantity' });
      if (rateUnit === WorkforceRateUnit.HOURLY && (!Number.isFinite(hours) || Number(hours) <= 0)) return res.status(400).json({ error: 'Hourly services require working hours' });
      const lowestRate = await prisma.vendorServiceRate.findFirst({
        where: { positionId, unit: rateUnit, isActive: true, vendor: { isActive: true, isApproved: true, approvalStatus: VendorApprovalStatus.APPROVED, replacementRequested: false } },
        orderBy: { price: 'asc' },
      });
      if (!lowestRate) return res.status(400).json({ error: 'No eligible approved vendor offer found for one of the selected services' });
      normalizedItems.push({
        positionId,
        rateUnit,
        quantity,
        hours,
        estimatedCost: catalogCost(quantity, lowestRate, workDate, endDate, hours || settings.estimatedHoursPerShift),
      });
    }

    const estimatedCost = currencyAmount(normalizedItems.reduce((total, item) => total + item.estimatedCost, 0));
    const quantity = normalizedItems.reduce((total, item) => total + item.quantity, 0);
    const firstItem = normalizedItems[0];
    let steps = await resolveApprovalSteps(request.departmentId);
    if (!steps.some((step) => step.role === Role.FINANCE_DIRECTOR)) steps.push({ role: Role.FINANCE_DIRECTOR, label: 'Finance Director' });
    steps = steps.filter((step) => step.role !== Role.GENERAL_MANAGER);
    steps.push({ role: Role.GENERAL_MANAGER, label: 'General Manager — Request confirmation' });
    steps = await ensureRequiredApprovalSteps(steps);
    const spend = await monthSpend(request.departmentId, workDate);
    const budget = await prisma.departmentCasualBudget.findUnique({
      where: { departmentId_year_month: { departmentId: request.departmentId, year: workDate.getFullYear(), month: workDate.getMonth() + 1 } },
    });
    const needsExtraApproval = Boolean(
      request.isUrgentOverride ||
      (budget && Math.max(0, spend - (request.actualCost ?? request.estimatedCost ?? 0)) + estimatedCost > budget.budgetAmount)
    );
    if (needsExtraApproval) steps = appendGmIfMissing(steps);

    await prisma.$transaction(async (tx) => {
      await tx.workforceRequestItem.deleteMany({ where: { requestId: id } });
      await tx.workforceRequest.update({
        where: { id },
        data: {
          positionId: firstItem.positionId,
          rateUnit: firstItem.rateUnit,
          workDate,
          endDate,
          quantity,
          comment: req.body.comment === undefined ? request.comment : String(req.body.comment || '') || null,
          status: needsExtraApproval ? WorkforceRequestStatus.AWAITING_EXTRA_APPROVAL : WorkforceRequestStatus.PENDING,
          currentStepIndex: 0,
          approvalSteps: serializeApprovalSteps(steps),
          needsExtraApproval,
          estimatedCost,
          vendorId: null,
          acceptedVendorId: null,
          vendorRateId: null,
          unitRate: null,
          rateCurrency: null,
          items: { create: normalizedItems.map((item) => ({ ...item, rateCurrency: 'AZN' })) },
        },
      });
    });
    await addEvent(id, 'RESUBMITTED', req.user!, String(req.body.revisionComment || 'Request revised and resubmitted'));
    const full = await loadRequest(id);
    await notifyApprovers(full!);
    res.json(formatRequest(full!));
  })
);

router.post(
  '/requests/:id/reject',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const id = routeParam(req.params.id);
    const request = await loadRequest(id);
    if (!request) return res.status(404).json({ error: 'Request not found' });

    if (!canApproveCurrentStep(req.user!, request)) {
      return res.status(403).json({ error: 'You cannot reject this step' });
    }

    const reason = req.body.reason ? String(req.body.reason) : undefined;
    await prisma.workforceRequest.update({
      where: { id },
      data: { status: WorkforceRequestStatus.REJECTED },
    });
    await addEvent(id, 'REJECTED', req.user!, reason || 'Request rejected');
    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        userName: actorName(req),
        action: AuditAction.REJECT,
        entityType: 'WorkforceRequest',
        entityId: id,
        details: `Rejected ${request.code}${reason ? `: ${reason}` : ''}`,
      },
    });

    await prisma.notification.create({
      data: {
        userId: request.createdById,
        title: 'Casual staff request rejected',
        message: `${request.code} was rejected${reason ? `: ${reason}` : ''}`,
        type: 'workforce',
        link: `/workforce/${id}`,
      },
    });

    const full = await loadRequest(id);
    res.json(formatRequest(full!));
  })
);

router.post(
  '/requests/:id/procurement-confirm',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const id = routeParam(req.params.id);
    const request = await loadRequest(id);
    if (!request) return res.status(404).json({ error: 'Request not found' });
    if (request.status !== WorkforceRequestStatus.PROCUREMENT_REVIEW) return res.status(400).json({ error: 'Request is not awaiting Procurement confirmation' });
    if (!(await canConfirmProcurement(req.user!.id, req.user!.role))) return res.status(403).json({ error: 'Procurement Head confirmation required' });
    await prisma.workforceRequest.update({ where: { id }, data: { status: WorkforceRequestStatus.SENT_TO_VENDOR } });
    await addEvent(id, 'PROCUREMENT_CONFIRMED', req.user!, `Confirmed system selection: ${request.vendor?.name || 'vendor'} at ${request.unitRate?.toFixed(2) || '—'} ${request.rateCurrency || 'AZN'}`);
    await dispatchToVendors(id);
    const full = await loadRequest(id);
    res.json(formatRequest(full!));
  })
);

router.post(
  '/requests/:id/items/:itemId/vendor-correction',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const id = routeParam(req.params.id);
    const itemId = routeParam(req.params.itemId);
    const request = await loadRequest(id);
    if (!request) return res.status(404).json({ error: 'Request not found' });
    if (!(await canManageProcurementCatalog(req.user!.id, req.user!.role))) {
      return res.status(403).json({ error: 'Procurement Workforce Manager permission required' });
    }
    if (request.status !== WorkforceRequestStatus.VENDOR_ACCEPTED && request.status !== WorkforceRequestStatus.IN_SERVICE) {
      return res.status(400).json({ error: 'Vendor correction is available only after vendor acceptance' });
    }
    if (request.actualQuantity != null || request.hodConfirmedAt || request.financeConfirmedAt) {
      return res.status(400).json({ error: 'Vendor cannot be changed after service actuals or confirmations are recorded' });
    }

    const comment = String(req.body.comment || '').trim();
    const vendorRateId = String(req.body.vendorRateId || '');
    if (comment.length < 5) return res.status(400).json({ error: 'A correction comment of at least 5 characters is required' });
    if (!vendorRateId) return res.status(400).json({ error: 'Alternative vendor offer is required' });

    const item = request.items.find((entry) => entry.id === itemId);
    if (!item) return res.status(404).json({ error: 'Service line not found in this request' });

    const rate = await prisma.vendorServiceRate.findFirst({
      where: {
        id: vendorRateId,
        positionId: item.positionId,
        unit: item.rateUnit,
        isActive: true,
        vendor: {
          isActive: true,
          isApproved: true,
          approvalStatus: VendorApprovalStatus.APPROVED,
          replacementRequested: false,
        },
      },
      include: { vendor: true },
    });
    if (!rate) return res.status(400).json({ error: 'The selected vendor has no active approved offer for this service and unit' });
    if (rate.vendorId === item.vendorId) return res.status(400).json({ error: 'Select a different vendor' });

    if (item.vendorId && request.invoices.some((invoice) => invoice.vendorId === item.vendorId)) {
      return res.status(400).json({ error: 'This vendor already has an invoice for the request; reverse the invoice before correction' });
    }

    const pendingReview = request.vendorCorrectionReviews.find((review) =>
      ['PENDING_FD', 'PENDING_GM'].includes(review.status)
    );
    if (pendingReview) return res.status(400).json({ error: 'Vendor corrections are already under Finance Director/General Manager review' });

    const settings = await getWorkforceSettings();
    const newCost = catalogCost(
      item.quantity,
      rate,
      request.workDate,
      request.endDate,
      item.hours || settings.estimatedHoursPerShift
    );
    const oldVendorName = item.vendor?.name || item.vendorRate?.vendor.name || 'Unassigned vendor';
    const oldCost = item.estimatedCost || 0;
    let draftId = request.vendorCorrectionReviews.find((review) => review.status === 'DRAFT')?.id;
    if (!draftId) {
      const draft = await prisma.workforceVendorCorrectionReview.create({
        data: { requestId: id, status: 'DRAFT' },
        select: { id: true },
      });
      draftId = draft.id;
    }

    await prisma.$transaction(async (tx) => {
      await tx.workforceVendorCorrection.upsert({
        where: { reviewId_itemId: { reviewId: draftId, itemId } },
        create: {
          reviewId: draftId,
          itemId,
          originalVendorId: item.vendorId,
          originalVendorName: oldVendorName,
          originalRateId: item.vendorRateId,
          originalUnitRate: item.unitRate,
          originalCost: oldCost,
          proposedVendorId: rate.vendorId,
          proposedVendorName: rate.vendor.name,
          proposedRateId: rate.id,
          proposedUnitRate: rate.price,
          proposedCurrency: rate.currency,
          proposedCost: newCost,
          comment,
        },
        update: {
          proposedVendorId: rate.vendorId,
          proposedVendorName: rate.vendor.name,
          proposedRateId: rate.id,
          proposedUnitRate: rate.price,
          proposedCurrency: rate.currency,
          proposedCost: newCost,
          comment,
        },
      });
      await tx.workforceRequestEvent.create({
        data: {
          requestId: id,
          action: 'VENDOR_CORRECTION_DRAFTED',
          details: `${item.position.name} (${item.rateUnit}) proposed from ${oldVendorName} to ${rate.vendor.name}. Proposed cost: ${newCost.toFixed(2)} ${rate.currency}. Procurement comment: ${comment}`,
          userId: req.user!.id,
          userName: actorName(req),
        },
      });
    });

    const full = await loadRequest(id);
    res.json({ ...formatRequest(full!), canCorrectVendors: true, canSubmitVendorCorrectionReview: true });
  })
);

router.post(
  '/requests/:id/vendor-correction-review/submit',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const id = routeParam(req.params.id);
    const request = await loadRequest(id);
    if (!request) return res.status(404).json({ error: 'Request not found' });
    if (!(await canManageProcurementCatalog(req.user!.id, req.user!.role))) {
      return res.status(403).json({ error: 'Procurement Workforce Manager permission required' });
    }
    const review = request.vendorCorrectionReviews.find((entry) => entry.status === 'DRAFT');
    if (!review || review.corrections.length === 0) return res.status(400).json({ error: 'Add at least one vendor correction before sending for review' });

    await prisma.$transaction(async (tx) => {
      await tx.workforceVendorCorrectionReview.update({
        where: { id: review.id },
        data: {
          status: 'PENDING_FD',
          submittedById: req.user!.id,
          submittedByName: actorName(req),
          submittedAt: new Date(),
          returnComment: null,
          returnedAt: null,
          returnedById: null,
          returnedByName: null,
        },
      });
      await tx.workforceRequestEvent.create({
        data: {
          requestId: id,
          action: 'VENDOR_CORRECTIONS_SENT_FOR_REVIEW',
          details: `${review.corrections.length} vendor correction(s) submitted by Procurement for Finance Director and General Manager approval`,
          userId: req.user!.id,
          userName: actorName(req),
        },
      });
    });

    const financeUsers = await prisma.user.findMany({
      where: { isActive: true, role: Role.FINANCE_DIRECTOR },
      select: { id: true },
    });
    if (financeUsers.length) {
      await prisma.notification.createMany({
        data: financeUsers.map((user) => ({
          userId: user.id,
          title: 'Vendor correction review required',
          message: `${request.code}: Procurement submitted ${review.corrections.length} vendor change(s) for Finance approval.`,
          type: 'workforce',
          link: `/workforce/${id}`,
        })),
      });
    }
    const full = await loadRequest(id);
    res.json({ ...formatRequest(full!), canCorrectVendors: true });
  })
);

router.post(
  '/requests/:id/vendor-correction-review/:reviewId/decision',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const id = routeParam(req.params.id);
    const reviewId = routeParam(req.params.reviewId);
    const request = await loadRequest(id);
    if (!request) return res.status(404).json({ error: 'Request not found' });
    const review = request.vendorCorrectionReviews.find((entry) => entry.id === reviewId);
    if (!review) return res.status(404).json({ error: 'Vendor correction review not found' });
    if (!canApproveVendorCorrectionReview(req.user!.role, review.status)) {
      return res.status(403).json({ error: 'You are not the current reviewer for these vendor corrections' });
    }
    const decision = req.body.decision === 'return' ? 'return' : 'approve';
    const comment = String(req.body.comment || '').trim();
    if (decision === 'return' && comment.length < 3) return res.status(400).json({ error: 'A return comment is required' });

    if (decision === 'return') {
      await prisma.$transaction(async (tx) => {
        await tx.workforceVendorCorrectionReview.update({
          where: { id: review.id },
          data: {
            status: 'DRAFT',
            returnComment: comment,
            returnedAt: new Date(),
            returnedById: req.user!.id,
            returnedByName: actorName(req),
          },
        });
        await tx.workforceRequestEvent.create({
          data: {
            requestId: id,
            action: 'VENDOR_CORRECTIONS_RETURNED',
            details: `${review.status === 'PENDING_FD' ? 'Finance Director' : 'General Manager'} returned vendor corrections to Procurement: ${comment}`,
            userId: req.user!.id,
            userName: actorName(req),
          },
        });
      });
      const procurementUsers = await prisma.user.findMany({
        where: { isActive: true, department: { code: 'PR' } },
        select: { id: true },
      });
      if (procurementUsers.length) await prisma.notification.createMany({
        data: procurementUsers.map((user) => ({ userId: user.id, title: 'Vendor corrections returned', message: `${request.code}: ${comment}`, type: 'workforce', link: `/workforce/${id}` })),
      });
      const full = await loadRequest(id);
      return res.json({ ...formatRequest(full!), canCorrectVendors: true, canSubmitVendorCorrectionReview: true });
    }

    if (review.status === 'PENDING_FD') {
      await prisma.$transaction(async (tx) => {
        await tx.workforceVendorCorrectionReview.update({
          where: { id: review.id },
          data: {
            status: 'PENDING_GM',
            fdApprovedById: req.user!.id,
            fdApprovedByName: actorName(req),
            fdApprovedAt: new Date(),
            fdComment: comment || null,
          },
        });
        await tx.workforceRequestEvent.create({
          data: { requestId: id, action: 'VENDOR_CORRECTIONS_FINANCE_DIRECTOR_APPROVED', details: `Finance Director approved ${review.corrections.length} vendor correction(s)${comment ? `: ${comment}` : ''}`, userId: req.user!.id, userName: actorName(req) },
        });
      });
      const gmUsers = await prisma.user.findMany({ where: { isActive: true, role: Role.GENERAL_MANAGER }, select: { id: true } });
      if (gmUsers.length) await prisma.notification.createMany({
        data: gmUsers.map((user) => ({ userId: user.id, title: 'Vendor correction review required', message: `${request.code}: Finance approved vendor corrections; GM approval is required.`, type: 'workforce', link: `/workforce/${id}` })),
      });
      const full = await loadRequest(id);
      return res.json({ ...formatRequest(full!) });
    }

    await prisma.$transaction(async (tx) => {
      for (const correction of review.corrections) {
        await tx.workforceRequestItem.update({
          where: { id: correction.itemId },
          data: {
            vendorId: correction.proposedVendorId,
            vendorRateId: correction.proposedRateId,
            unitRate: correction.proposedUnitRate,
            rateCurrency: correction.proposedCurrency,
            estimatedCost: correction.proposedCost,
          },
        });
      }
      const updatedItems = await tx.workforceRequestItem.findMany({ where: { requestId: id }, orderBy: { createdAt: 'asc' } });
      const firstItem = updatedItems[0];
      const totalCost = currencyAmount(updatedItems.reduce((sum, item) => sum + (item.estimatedCost || 0), 0));
      await tx.workforceRequest.update({
        where: { id },
        data: {
          vendorId: firstItem?.vendorId || null,
          acceptedVendorId: firstItem?.vendorId || null,
          vendorRateId: firstItem?.vendorRateId || null,
          unitRate: firstItem?.unitRate ?? null,
          rateCurrency: firstItem?.rateCurrency || 'AZN',
          estimatedCost: totalCost,
          status: WorkforceRequestStatus.VENDORS_FULLY_APPROVED,
        },
      });
      for (const oldVendorId of new Set(review.corrections.map((correction) => correction.originalVendorId).filter(Boolean))) {
        const stillUsed = updatedItems.some((item) => item.vendorId === oldVendorId);
        if (!stillUsed) {
          await tx.vendorInvite.updateMany({
            where: { requestId: id, vendorId: oldVendorId!, status: { in: ['PENDING', 'ACCEPTED'] } },
            data: { status: 'REASSIGNED', respondedAt: new Date() },
          });
        }
      }
      await tx.workforceVendorCorrectionReview.update({
        where: { id: review.id },
        data: {
          status: 'APPROVED',
          gmApprovedById: req.user!.id,
          gmApprovedByName: actorName(req),
          gmApprovedAt: new Date(),
          gmComment: comment || null,
          appliedAt: new Date(),
        },
      });
      await tx.workforceRequestEvent.create({
        data: {
          requestId: id,
          action: 'VENDOR_CORRECTIONS_FULLY_APPROVED',
          details: `Finance Director and General Manager approved ${review.corrections.length} vendor correction(s). Approved vendors and prices were applied; request is ready for execution.${comment ? ` General Manager comment: ${comment}` : ''}`,
          userId: req.user!.id,
          userName: actorName(req),
        },
      });
      await tx.auditLog.create({
        data: { userId: req.user!.id, userName: actorName(req), action: AuditAction.APPROVE, entityType: 'WorkforceVendorCorrectionReview', entityId: review.id, details: `${request.code}: Finance Director and General Manager approved vendor correction review` },
      });
    });

    const recipients = await prisma.user.findMany({
      where: { isActive: true, OR: [{ id: request.createdById }, { departmentId: request.departmentId, role: Role.HOD }] },
      select: { id: true },
    });
    if (recipients.length) await prisma.notification.createMany({
      data: [...new Set(recipients.map((recipient) => recipient.id))].map((userId) => ({
        userId,
        title: 'Vendors fully approved — ready for execution',
        message: `${request.code}: Finance Director and General Manager approved the vendor changes. Vendors are fully approved and the request can proceed to execution.`,
        type: 'workforce',
        link: `/workforce/${id}`,
      })),
    });
    const full = await loadRequest(id);
    res.json({ ...formatRequest(full!) });
  })
);

router.post(
  '/requests/:id/vendors-ready-for-execution',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const id = routeParam(req.params.id);
    const request = await loadRequest(id);
    if (!request) return res.status(404).json({ error: 'Request not found' });
    if (!(await canManageProcurementCatalog(req.user!.id, req.user!.role))) {
      return res.status(403).json({ error: 'Procurement Workforce Manager permission required' });
    }
    if (request.status !== WorkforceRequestStatus.VENDOR_ACCEPTED && request.status !== WorkforceRequestStatus.IN_SERVICE) {
      return res.status(400).json({ error: 'Vendors can be marked ready only after vendor acceptance' });
    }
    if (request.actualQuantity != null || request.hodConfirmedAt || request.financeConfirmedAt) {
      return res.status(400).json({ error: 'Vendors cannot be finalized after service actuals or confirmations are recorded' });
    }
    if (request.vendorCorrectionReviews.some((review) => ['DRAFT', 'PENDING_FD', 'PENDING_GM'].includes(review.status))) {
      return res.status(400).json({ error: 'Complete or remove the active vendor correction review before marking vendors ready' });
    }

    await prisma.$transaction(async (tx) => {
      await tx.workforceRequest.update({ where: { id }, data: { status: WorkforceRequestStatus.VENDORS_FULLY_APPROVED } });
      await tx.workforceRequestEvent.create({
        data: {
          requestId: id,
          action: 'VENDORS_FULLY_APPROVED',
          details: 'Procurement confirmed that all accepted vendors are fully approved. Request is ready for execution.',
          userId: req.user!.id,
          userName: actorName(req),
        },
      });
      await tx.auditLog.create({
        data: { userId: req.user!.id, userName: actorName(req), action: AuditAction.APPROVE, entityType: 'WorkforceRequest', entityId: id, details: `${request.code}: Vendors fully approved and ready for execution` },
      });
    });
    const recipients = await prisma.user.findMany({
      where: { isActive: true, OR: [{ id: request.createdById }, { departmentId: request.departmentId, role: Role.HOD }] },
      select: { id: true },
    });
    if (recipients.length) await prisma.notification.createMany({
      data: [...new Set(recipients.map((recipient) => recipient.id))].map((userId) => ({
        userId,
        title: 'Vendors fully approved — ready for execution',
        message: `${request.code}: Procurement confirmed all vendors. Vendor names are now available and the request can proceed to execution.`,
        type: 'workforce',
        link: `/workforce/${id}`,
      })),
    });
    const full = await loadRequest(id);
    res.json({ ...formatRequest(full!) });
  })
);

router.post(
  '/requests/:id/evaluations',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const id = routeParam(req.params.id);
    const request = await loadRequest(id);
    if (!request) return res.status(404).json({ error: 'Request not found' });
    const isDepartmentHod = req.user!.role === Role.HOD && req.user!.departmentId === request.departmentId;
    if (!isDepartmentHod && !isPrivilegedApprover(req.user!.role)) return res.status(403).json({ error: 'Department HOD permission required' });
    if (request.status !== WorkforceRequestStatus.VENDOR_ACCEPTED && request.status !== WorkforceRequestStatus.VENDORS_FULLY_APPROVED && request.status !== WorkforceRequestStatus.IN_SERVICE && request.status !== WorkforceRequestStatus.AWAITING_EVALUATION) return res.status(400).json({ error: 'Evaluation is available only after the vendor accepts the order' });
    const vendorId = request.acceptedVendorId || request.vendorId;
    if (!vendorId) return res.status(400).json({ error: 'Request has no selected vendor' });
    const phase = req.body.phase === 'FINAL' ? WorkforceEvaluationPhase.FINAL : WorkforceEvaluationPhase.ONGOING;
    const overallScore = Number(req.body.overallScore);
    if (!Number.isInteger(overallScore) || overallScore < 1 || overallScore > 5) return res.status(400).json({ error: 'Overall score must be an integer from 1 to 5' });
    if (phase === WorkforceEvaluationPhase.FINAL && request.endDate.getTime() > Date.now() && !isPrivilegedApprover(req.user!.role)) return res.status(400).json({ error: 'Final evaluation becomes available after the order end date' });
    const replacementRecommended = Boolean(req.body.replacementRecommended);
    const evaluation = await prisma.workforceQualityEvaluation.create({
      data: { requestId: id, vendorId, phase, overallScore, notes: req.body.notes || null, replacementRecommended, createdById: req.user!.id, createdByName: actorName(req), createdByRole: req.user!.role },
    });
    if (replacementRecommended) await prisma.vendor.update({ where: { id: vendorId }, data: { replacementRequested: true } });
    if (isDepartmentHod && overallScore <= 3) {
      await notifyLowVendorRatingThreshold(vendorId, request.acceptedVendor?.name || request.vendor?.name || 'Vendor', id);
    }
    await prisma.workforceRequest.update({ where: { id }, data: { status: phase === WorkforceEvaluationPhase.FINAL ? WorkforceRequestStatus.COMPLETED : WorkforceRequestStatus.IN_SERVICE } });
    await addEvent(id, phase === WorkforceEvaluationPhase.FINAL ? 'FINAL_EVALUATION' : 'QUALITY_EVALUATION', req.user!, `Overall score ${overallScore}/5${replacementRecommended ? '; replacement requested' : ''}`);
    res.status(201).json(evaluation);
  })
);

router.post(
  '/requests/:id/request-replacement',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const id = routeParam(req.params.id);
    const request = await loadRequest(id);
    if (!request) return res.status(404).json({ error: 'Request not found' });
    const isDepartmentHod = req.user!.role === Role.HOD && req.user!.departmentId === request.departmentId;
    const isProcurement = await canConfirmProcurement(req.user!.id, req.user!.role);
    if (!isDepartmentHod && !isProcurement && !isPrivilegedApprover(req.user!.role)) return res.status(403).json({ error: 'Department HOD or Procurement permission required' });
    const vendorId = request.acceptedVendorId || request.vendorId;
    if (!vendorId) return res.status(400).json({ error: 'Request has no vendor' });
    await prisma.vendor.update({ where: { id: vendorId }, data: { replacementRequested: true } });
    await addEvent(id, 'VENDOR_REPLACEMENT_REQUESTED', req.user!, req.body.reason || 'Exclude this vendor from the next automatic selection');
    res.json({ ok: true });
  })
);

router.post(
  '/requests/:id/vendor-accept',
  authMiddleware,
  requireRoles(...MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const id = routeParam(req.params.id);
    const request = await loadRequest(id);
    if (!request) return res.status(404).json({ error: 'Request not found' });
    if (request.status !== WorkforceRequestStatus.SENT_TO_VENDOR) {
      return res.status(400).json({ error: 'Request is not awaiting vendor acceptance' });
    }

    let acceptedVendorId = request.vendorId;
    if (request.vendorMode === WorkforceVendorMode.BROADCAST) {
      acceptedVendorId = req.body.vendorId || null;
      if (!acceptedVendorId) {
        return res.status(400).json({ error: 'vendorId required for broadcast acceptance' });
      }
      const allowed = JSON.parse(request.broadcastVendorIds || '[]') as string[];
      if (!allowed.includes(acceptedVendorId)) {
        return res.status(400).json({ error: 'Vendor was not invited to this broadcast' });
      }
    }
    if (!acceptedVendorId) {
      return res.status(400).json({ error: 'No vendor assigned' });
    }

    await prisma.workforceRequest.update({
      where: { id },
      data: {
        status: request.workDate.getTime() <= Date.now() ? WorkforceRequestStatus.IN_SERVICE : WorkforceRequestStatus.VENDOR_ACCEPTED,
        acceptedVendorId,
      },
    });
    await addEvent(id, 'VENDOR_ACCEPTED', req.user!, 'Vendor accepted the order');

    const full = await loadRequest(id);
    res.json(formatRequest(full!));
  })
);

router.post(
  '/requests/:id/vendor-decline',
  authMiddleware,
  requireRoles(...MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const id = routeParam(req.params.id);
    const request = await loadRequest(id);
    if (!request) return res.status(404).json({ error: 'Request not found' });
    if (request.status !== WorkforceRequestStatus.SENT_TO_VENDOR) {
      return res.status(400).json({ error: 'Request is not awaiting vendor response' });
    }

    await prisma.workforceRequest.update({
      where: { id },
      data: { status: WorkforceRequestStatus.VENDOR_DECLINED },
    });
    await addEvent(id, 'VENDOR_DECLINED', req.user!, req.body.reason || 'Vendor declined');

    const full = await loadRequest(id);
    res.json(formatRequest(full!));
  })
);

router.post(
  '/requests/:id/completion',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const id = routeParam(req.params.id);
    const request = await loadRequest(id);
    if (!request) return res.status(404).json({ error: 'Request not found' });
    if (request.status !== WorkforceRequestStatus.VENDOR_ACCEPTED && request.status !== WorkforceRequestStatus.VENDORS_FULLY_APPROVED) {
      return res.status(400).json({ error: 'Request must be vendor-accepted before completion' });
    }

    const actualQuantity = Math.max(0, Number(req.body.actualQuantity));
    const actualHours = Math.max(0, Number(req.body.actualHours));
    const actualCost = Math.max(0, Number(req.body.actualCost));
    if (![actualQuantity, actualHours, actualCost].every(Number.isFinite)) {
      return res.status(400).json({ error: 'actualQuantity, actualHours, actualCost required' });
    }

    await prisma.workforceRequest.update({
      where: { id },
      data: { actualQuantity, actualHours, actualCost },
    });
    await addEvent(
      id,
      'COMPLETION_SUBMITTED',
      req.user!,
      `Actuals: ${actualQuantity} staff, ${actualHours}h, $${actualCost}`
    );

    const full = await loadRequest(id);
    res.json(formatRequest(full!));
  })
);

router.post(
  '/requests/:id/confirm-hod',
  authMiddleware,
  requireRoles(Role.HOD, Role.GENERAL_MANAGER, Role.SYSTEM_ADMINISTRATOR),
  asyncHandler(async (req, res) => {
    const id = routeParam(req.params.id);
    const request = await loadRequest(id);
    if (!request) return res.status(404).json({ error: 'Request not found' });
    if (request.actualQuantity == null) {
      return res.status(400).json({ error: 'Submit actuals before HOD confirmation' });
    }
    if (
      req.user!.role === Role.HOD &&
      req.user!.departmentId &&
      req.user!.departmentId !== request.departmentId
    ) {
      return res.status(403).json({ error: 'HOD can only confirm own department requests' });
    }

    await prisma.workforceRequest.update({
      where: { id },
      data: {
        hodConfirmedAt: new Date(),
        hodConfirmedById: req.user!.id,
      },
    });
    await addEvent(id, 'HOD_CONFIRMED', req.user!, 'HOD confirmed service delivery');

    const full = await loadRequest(id);
    res.json(formatRequest(full!));
  })
);

router.post(
  '/requests/:id/confirm-finance',
  authMiddleware,
  requireRoles(Role.FINANCE_DIRECTOR, Role.GENERAL_MANAGER, Role.SYSTEM_ADMINISTRATOR),
  asyncHandler(async (req, res) => {
    const id = routeParam(req.params.id);
    const request = await loadRequest(id);
    if (!request) return res.status(404).json({ error: 'Request not found' });
    if (!request.hodConfirmedAt) {
      return res.status(400).json({ error: 'HOD confirmation required before Finance' });
    }
    if (request.actualQuantity == null) {
      return res.status(400).json({ error: 'Actuals required' });
    }

    await prisma.workforceRequest.update({
      where: { id },
      data: {
        financeConfirmedAt: new Date(),
        financeConfirmedById: req.user!.id,
        status: WorkforceRequestStatus.COMPLETED,
      },
    });
    await addEvent(id, 'FINANCE_CONFIRMED', req.user!, 'Finance confirmed — request completed');
    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        userName: actorName(req),
        action: AuditAction.APPROVE,
        entityType: 'WorkforceRequest',
        entityId: id,
        details: `Completed ${request.code} (Finance confirmed)`,
      },
    });

    const full = await loadRequest(id);
    res.json(formatRequest(full!));
  })
);

router.post(
  '/requests/:id/cancel',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const id = routeParam(req.params.id);
    const request = await loadRequest(id);
    if (!request) return res.status(404).json({ error: 'Request not found' });

    const isOwner = request.createdById === req.user!.id;
    const financeCanCancel =
      req.user!.role === Role.FINANCE_DIRECTOR &&
      request.status === WorkforceRequestStatus.VENDORS_FULLY_APPROVED &&
      endDateHasNotPassed(request.endDate);
    if (!isOwner && !isPrivilegedApprover(req.user!.role) && !financeCanCancel) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const terminal = new Set<WorkforceRequestStatus>([
      WorkforceRequestStatus.COMPLETED,
      WorkforceRequestStatus.CANCELLED,
      WorkforceRequestStatus.REJECTED,
    ]);
    if (terminal.has(request.status)) {
      return res.status(400).json({ error: 'Request cannot be cancelled' });
    }

    await prisma.workforceRequest.update({
      where: { id },
      data: { status: WorkforceRequestStatus.CANCELLED },
    });
    await addEvent(id, 'CANCELLED', req.user!, req.body.reason || 'Cancelled');
    if (financeCanCancel) {
      await prisma.notification.create({
        data: {
          userId: request.createdById,
          title: 'Fully approved request cancelled by Finance Director',
          message: `${request.code} was cancelled by Finance Director${req.body.reason ? `: ${req.body.reason}` : ''}`,
          type: 'workforce',
          link: `/workforce/${id}`,
        },
      });
    }

    const full = await loadRequest(id);
    res.json(formatRequest(full!));
  })
);

router.post(
  '/requests/:id/resend-vendor',
  authMiddleware,
  requireRoles(...MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const id = routeParam(req.params.id);
    const request = await loadRequest(id);
    if (!request) return res.status(404).json({ error: 'Request not found' });
    if (request.status !== WorkforceRequestStatus.SENT_TO_VENDOR) {
      return res.status(400).json({ error: 'Request must be in Sent to Vendor status' });
    }
    await dispatchToVendors(id);
    const full = await loadRequest(id);
    res.json(formatRequest(full!));
  })
);

// ── Payroll ─────────────────────────────────────────────────────────

router.get(
  '/payroll',
  authMiddleware,
  requireRoles(Role.SYSTEM_ADMINISTRATOR, Role.GENERAL_MANAGER, Role.FINANCE_DIRECTOR),
  asyncHandler(async (req, res) => {
    const status = req.query.status ? String(req.query.status) : undefined;
    const invoices = await prisma.vendorInvoice.findMany({
      where: status ? { status } : undefined,
      include: {
        vendor: true,
        request: {
          include: { department: true, position: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(invoices);
  })
);

router.post(
  '/payroll/invoices',
  authMiddleware,
  requireRoles(Role.FINANCE_DIRECTOR, Role.GENERAL_MANAGER, Role.SYSTEM_ADMINISTRATOR),
  asyncHandler(async (req, res) => {
    const requestId = String(req.body.requestId || '');
    const invoiceNumber = String(req.body.invoiceNumber || '').trim();
    const invoiceHours = Number(req.body.invoiceHours);
    const invoiceAmount = Number(req.body.invoiceAmount);
    if (!requestId || !invoiceNumber || !Number.isFinite(invoiceHours) || !Number.isFinite(invoiceAmount)) {
      return res.status(400).json({ error: 'requestId, invoiceNumber, invoiceHours, invoiceAmount required' });
    }

    const request = await loadRequest(requestId);
    if (!request) return res.status(404).json({ error: 'Request not found' });
    if (request.status !== WorkforceRequestStatus.COMPLETED) {
      return res.status(400).json({ error: 'Payroll invoices only for completed requests' });
    }
    const vendorId = request.acceptedVendorId || request.vendorId;
    if (!vendorId) return res.status(400).json({ error: 'No vendor on request' });

    const invoice = await prisma.vendorInvoice.create({
      data: {
        requestId,
        vendorId,
        invoiceNumber,
        invoiceHours,
        invoiceAmount,
        invoiceDate: req.body.invoiceDate ? new Date(req.body.invoiceDate) : new Date(),
      },
      include: { vendor: true, request: true },
    });

    await addEvent(
      requestId,
      'INVOICE_RECEIVED',
      req.user!,
      `Invoice ${invoiceNumber}: ${invoiceHours}h / $${invoiceAmount}`
    );

    res.status(201).json(invoice);
  })
);

router.post(
  '/payroll/invoices/:id/match',
  authMiddleware,
  requireRoles(Role.FINANCE_DIRECTOR, Role.GENERAL_MANAGER, Role.SYSTEM_ADMINISTRATOR),
  asyncHandler(async (req, res) => {
    const result = await matchInvoice(routeParam(req.params.id));
    if ('error' in result) return res.status(400).json({ error: result.error });
    res.json(result);
  })
);

router.post(
  '/payroll/invoices/:id/paid',
  authMiddleware,
  requireRoles(Role.FINANCE_DIRECTOR, Role.GENERAL_MANAGER, Role.SYSTEM_ADMINISTRATOR),
  asyncHandler(async (req, res) => {
    const invoice = await prisma.vendorInvoice.update({
      where: { id: routeParam(req.params.id) },
      data: { status: 'PAID', matchedAt: new Date() },
      include: { vendor: true, request: true },
    });
    await addEvent(invoice.requestId, 'INVOICE_PAID', req.user!, `Invoice ${invoice.invoiceNumber} marked paid`);
    res.json(invoice);
  })
);

// ── Reports CSV / outbox / recurring ─────────────────────────────────

router.get(
  '/reports/export.csv',
  authMiddleware,
  requireRoles(Role.SYSTEM_ADMINISTRATOR, Role.GENERAL_MANAGER, Role.FINANCE_DIRECTOR, Role.HOD),
  asyncHandler(async (req, res) => {
    const year = Number(req.query.year) || new Date().getFullYear();
    const month = Number(req.query.month) || new Date().getMonth() + 1;
    const report = await buildWorkforceReport(year, month, hodDepartmentId(req));

    const header = [
      'code',
      'department',
      'vendor',
      'period',
      'services',
      'quantity',
      'hours',
      'committedAmountAZN',
      'invoicedAmountAZN',
      'paidAmountAZN',
      'amountPayableAZN',
      'paymentStatus',
      'status',
    ];
    const lines = [header.join(',')];
    for (const row of report.paymentDetails) {
      lines.push(
        [
          row.requestCode,
          csvEscape(row.department),
          csvEscape(row.vendor),
          csvEscape(row.period),
          csvEscape(row.services),
          row.quantity,
          row.hours,
          row.committedAmount,
          row.invoicedAmount,
          row.paidAmount,
          row.amountPayable,
          row.paymentStatus,
          row.status,
        ].join(',')
      );
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="workforce-${year}-${String(month).padStart(2, '0')}.csv"`
    );
    res.send(lines.join('\n'));
  })
);

router.get(
  '/outbox',
  authMiddleware,
  requireRoles(Role.SYSTEM_ADMINISTRATOR),
  asyncHandler(async (_req, res) => {
    res.json(await listOutbox(100));
  })
);

router.post(
  '/recurring/run',
  authMiddleware,
  requireRoles(Role.SYSTEM_ADMINISTRATOR, Role.GENERAL_MANAGER),
  asyncHandler(async (_req, res) => {
    const created = await runRecurringTemplates();
    res.json({ created });
  })
);

function csvEscape(value: string) {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export default router;
