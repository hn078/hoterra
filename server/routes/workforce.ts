import { Router, Request, Response } from 'express';
import {
  AuditAction,
  Role,
  WorkforceRequestStatus,
  WorkforceShift,
  WorkforceVendorMode,
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

const router = Router();

const MANAGE_ROLES = [
  Role.SYSTEM_ADMINISTRATOR,
  Role.GENERAL_MANAGER,
  Role.HOD,
  Role.FINANCE_DIRECTOR,
] as const;

function actorName(req: Request) {
  return `${req.user!.firstName} ${req.user!.lastName}`;
}

// ── Catalog & settings ──────────────────────────────────────────────

router.get(
  '/meta',
  authMiddleware,
  asyncHandler(async (_req, res) => {
    const [positions, vendors, settings, routes, budgets, templates] = await Promise.all([
      prisma.workforcePosition.findMany({ orderBy: { name: 'asc' } }),
      prisma.vendor.findMany({ orderBy: { name: 'asc' } }),
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
    ]);

    res.json({
      positions,
      vendors,
      settings: {
        ...settings,
        hotels: settings.hotels,
      },
      routes: routes.map((r) => ({
        ...r,
        steps: parseApprovalSteps(r.steps),
      })),
      budgets,
      templates,
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

    const settings = await prisma.workforceSettings.upsert({
      where: { id: 'default' },
      update: {
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
      },
      create: {
        id: 'default',
        hotelName: hotelName ? String(hotelName) : 'HOTERRA',
        hotelsJson: hotelsJson || '["HOTERRA"]',
        minLeadHours: minLeadHours != null ? Number(minLeadHours) : 24,
        estimatedHourlyRate: estimatedHourlyRate != null ? Number(estimatedHourlyRate) : 15,
        estimatedHoursPerShift:
          estimatedHoursPerShift != null ? Number(estimatedHoursPerShift) : 8,
      },
    });
    const full = await getWorkforceSettings();
    res.json(full);
  })
);

router.post(
  '/positions',
  authMiddleware,
  requireRoles(...MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Position name is required' });
    const position = await prisma.workforcePosition.create({ data: { name } });
    res.status(201).json(position);
  })
);

router.patch(
  '/positions/:id',
  authMiddleware,
  requireRoles(...MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const id = routeParam(req.params.id);
    const data: { name?: string; isActive?: boolean } = {};
    if (req.body.name !== undefined) data.name = String(req.body.name).trim();
    if (req.body.isActive !== undefined) data.isActive = Boolean(req.body.isActive);
    const position = await prisma.workforcePosition.update({ where: { id }, data });
    res.json(position);
  })
);

router.post(
  '/vendors',
  authMiddleware,
  requireRoles(...MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Vendor name is required' });
    const vendor = await prisma.vendor.create({
      data: {
        name,
        contactEmail: req.body.contactEmail || null,
        phone: req.body.phone || null,
        isApproved: req.body.isApproved !== false,
      },
    });
    res.status(201).json(vendor);
  })
);

router.patch(
  '/vendors/:id',
  authMiddleware,
  requireRoles(...MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const id = routeParam(req.params.id);
    const vendor = await prisma.vendor.update({
      where: { id },
      data: {
        ...(req.body.name !== undefined && { name: String(req.body.name).trim() }),
        ...(req.body.contactEmail !== undefined && { contactEmail: req.body.contactEmail || null }),
        ...(req.body.phone !== undefined && { phone: req.body.phone || null }),
        ...(req.body.isApproved !== undefined && { isApproved: Boolean(req.body.isApproved) }),
        ...(req.body.isActive !== undefined && { isActive: Boolean(req.body.isActive) }),
      },
    });
    res.json(vendor);
  })
);

router.put(
  '/routes/:departmentId',
  authMiddleware,
  requireRoles(Role.SYSTEM_ADMINISTRATOR, Role.GENERAL_MANAGER),
  asyncHandler(async (req, res) => {
    const departmentId = routeParam(req.params.departmentId);
    const dept = await prisma.department.findUnique({ where: { id: departmentId } });
    if (!dept) return res.status(404).json({ error: 'Department not found' });

    const steps = (req.body.steps as ApprovalStep[]) || [];
    if (!Array.isArray(steps) || steps.length === 0) {
      return res.status(400).json({ error: 'At least one approval step is required' });
    }

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
  asyncHandler(async (req, res) => {
    const year = Number(req.query.year) || new Date().getFullYear();
    const month = Number(req.query.month) || new Date().getMonth() + 1;
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 0, 23, 59, 59, 999);

    const requests = await prisma.workforceRequest.findMany({
      where: { workDate: { gte: start, lte: end } },
      include: {
        department: true,
        position: true,
        vendor: true,
        acceptedVendor: true,
      },
    });

    const inactiveStatuses = new Set<WorkforceRequestStatus>([
      WorkforceRequestStatus.REJECTED,
      WorkforceRequestStatus.CANCELLED,
      WorkforceRequestStatus.VENDOR_DECLINED,
    ]);
    const completed = requests.filter((r) => r.status === WorkforceRequestStatus.COMPLETED);
    const active = requests.filter((r) => !inactiveStatuses.has(r.status));

    const byDepartment: Record<string, { name: string; requests: number; cost: number; hours: number }> =
      {};
    const byVendor: Record<string, { name: string; requests: number; cost: number }> = {};
    const byPosition: Record<string, { name: string; requests: number; quantity: number; cost: number }> =
      {};
    const byHotel: Record<string, { requests: number; cost: number; hours: number }> = {};

    let totalCost = 0;
    let totalHours = 0;
    let totalHeadcount = 0;

    for (const r of active) {
      const cost = r.actualCost ?? r.estimatedCost ?? 0;
      const hours = r.actualHours ?? 0;
      const qty = r.actualQuantity ?? r.quantity;
      totalCost += cost;
      totalHours += hours;
      totalHeadcount += qty;

      const d = byDepartment[r.departmentId] || {
        name: r.department.name,
        requests: 0,
        cost: 0,
        hours: 0,
      };
      d.requests += 1;
      d.cost += cost;
      d.hours += hours;
      byDepartment[r.departmentId] = d;

      const vendor = r.acceptedVendor || r.vendor;
      if (vendor) {
        const v = byVendor[vendor.id] || { name: vendor.name, requests: 0, cost: 0 };
        v.requests += 1;
        v.cost += cost;
        byVendor[vendor.id] = v;
      }

      const p = byPosition[r.positionId] || {
        name: r.position.name,
        requests: 0,
        quantity: 0,
        cost: 0,
      };
      p.requests += 1;
      p.quantity += qty;
      p.cost += cost;
      byPosition[r.positionId] = p;

      const h = byHotel[r.hotelName] || { requests: 0, cost: 0, hours: 0 };
      h.requests += 1;
      h.cost += cost;
      h.hours += hours;
      byHotel[r.hotelName] = h;
    }

    const budgets = await prisma.departmentCasualBudget.findMany({
      where: { year, month },
      include: { department: true },
    });

    const budgetVsActual = budgets.map((b) => ({
      departmentId: b.departmentId,
      department: b.department.name,
      budget: b.budgetAmount,
      actual: byDepartment[b.departmentId]?.cost ?? 0,
      variance: b.budgetAmount - (byDepartment[b.departmentId]?.cost ?? 0),
    }));

    res.json({
      year,
      month,
      summary: {
        totalRequests: requests.length,
        activeRequests: active.length,
        completedRequests: completed.length,
        totalCost,
        totalHours,
        totalHeadcount,
      },
      byDepartment: Object.values(byDepartment),
      byVendor: Object.values(byVendor),
      byPosition: Object.values(byPosition),
      byHotel: Object.entries(byHotel).map(([name, v]) => ({ name, ...v })),
      budgetVsActual,
    });
  })
);

// ── Requests ────────────────────────────────────────────────────────

router.get(
  '/requests',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const status = req.query.status ? String(req.query.status) : undefined;
    const departmentId = req.query.departmentId ? String(req.query.departmentId) : undefined;
    const mine = req.query.mine === '1';
    const pendingMine = req.query.pendingMine === '1';

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (departmentId) where.departmentId = departmentId;
    if (mine) where.createdById = req.user!.id;

    let requests = await prisma.workforceRequest.findMany({
      where,
      include: {
        department: true,
        position: true,
        vendor: true,
        acceptedVendor: true,
        createdBy: {
          select: { id: true, firstName: true, lastName: true, email: true, role: true },
        },
        events: { orderBy: { createdAt: 'desc' }, take: 5 },
      },
      orderBy: { createdAt: 'desc' },
    });

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

    const counts = await prisma.workforceRequest.groupBy({
      by: ['status'],
      _count: true,
    });

    res.json({
      data: requests.map((r) => formatRequest(r)),
      counts: Object.fromEntries(counts.map((c) => [c.status, c._count])),
    });
  })
);

router.get(
  '/requests/:id',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const request = await loadRequest(routeParam(req.params.id));
    if (!request) return res.status(404).json({ error: 'Request not found' });
    res.json({
      ...formatRequest(request),
      canApprove: canApproveCurrentStep(req.user!, request),
      canManage: canManageCatalog(req.user!.role),
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
      positionId,
      workDate,
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

    if (!departmentId || !positionId || !workDate || !quantity) {
      return res.status(400).json({ error: 'departmentId, positionId, workDate, quantity are required' });
    }

    const qty = Math.max(1, Number(quantity));
    const date = new Date(workDate);
    if (Number.isNaN(date.getTime())) {
      return res.status(400).json({ error: 'Invalid workDate' });
    }

    const mode = isVendorMode(vendorMode) ? vendorMode : WorkforceVendorMode.DIRECT;
    if (mode === WorkforceVendorMode.DIRECT && !vendorId) {
      return res.status(400).json({ error: 'vendorId is required for direct mode' });
    }
    if (mode === WorkforceVendorMode.BROADCAST) {
      const ids = Array.isArray(broadcastVendorIds) ? broadcastVendorIds : [];
      if (ids.length === 0) {
        return res.status(400).json({ error: 'Select at least one vendor for broadcast mode' });
      }
    }

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
    const cost = estimateCost(qty, settings, startTime, endTime);
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
        positionId,
        workDate: date,
        shift: isShift(shift) ? shift : WorkforceShift.MORNING,
        startTime: startTime || null,
        endTime: endTime || null,
        quantity: qty,
        comment: comment || null,
        vendorMode: mode,
        vendorId: mode === WorkforceVendorMode.DIRECT ? vendorId : null,
        broadcastVendorIds: JSON.stringify(
          mode === WorkforceVendorMode.BROADCAST ? broadcastVendorIds : []
        ),
        status,
        currentStepIndex: 0,
        approvalSteps: serializeApprovalSteps(steps),
        needsExtraApproval: needsExtra,
        isUrgentOverride: urgent,
        estimatedCost: cost,
        createdById: req.user!.id,
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
      return res.status(403).json({ error: 'You cannot approve this step' });
    }

    const steps = parseApprovalSteps(request.approvalSteps);
    const step = steps[request.currentStepIndex];
    const isLast = request.currentStepIndex >= steps.length - 1;

    if (isLast) {
      const updated = await prisma.workforceRequest.update({
        where: { id },
        data: {
          status: WorkforceRequestStatus.SENT_TO_VENDOR,
          currentStepIndex: request.currentStepIndex,
        },
      });
      await addEvent(
        id,
        'APPROVED',
        req.user!,
        `${step?.label || 'Approver'} approved — sent to vendor`
      );
      await prisma.auditLog.create({
        data: {
          userId: req.user!.id,
          userName: actorName(req),
          action: AuditAction.APPROVE,
          entityType: 'WorkforceRequest',
          entityId: id,
          details: `Fully approved ${request.code}; sent to vendor`,
        },
      });

      // Notify creator
      await prisma.notification.create({
        data: {
          userId: request.createdById,
          title: 'Casual staff request approved',
          message: `${request.code} was approved and sent to vendor`,
          type: 'workforce',
          link: `/workforce/${id}`,
        },
      });

      await dispatchToVendors(id);

      const full = await loadRequest(updated.id);
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
        status: WorkforceRequestStatus.VENDOR_ACCEPTED,
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
    if (request.status !== WorkforceRequestStatus.VENDOR_ACCEPTED) {
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
    if (!isOwner && !isPrivilegedApprover(req.user!.role)) {
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
  requireRoles(Role.FINANCE_DIRECTOR, Role.GENERAL_MANAGER, Role.SYSTEM_ADMINISTRATOR, Role.HOD),
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
  asyncHandler(async (req, res) => {
    const year = Number(req.query.year) || new Date().getFullYear();
    const month = Number(req.query.month) || new Date().getMonth() + 1;
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 0, 23, 59, 59, 999);

    const rows = await prisma.workforceRequest.findMany({
      where: { workDate: { gte: start, lte: end } },
      include: {
        department: true,
        position: true,
        vendor: true,
        acceptedVendor: true,
      },
      orderBy: { workDate: 'asc' },
    });

    const header = [
      'code',
      'hotel',
      'department',
      'position',
      'workDate',
      'shift',
      'quantity',
      'actualQuantity',
      'actualHours',
      'estimatedCost',
      'actualCost',
      'status',
      'vendor',
    ];
    const lines = [header.join(',')];
    for (const r of rows) {
      const vendor = r.acceptedVendor?.name || r.vendor?.name || '';
      lines.push(
        [
          r.code,
          csvEscape(r.hotelName),
          csvEscape(r.department.name),
          csvEscape(r.position.name),
          r.workDate.toISOString().slice(0, 10),
          r.shift,
          r.quantity,
          r.actualQuantity ?? '',
          r.actualHours ?? '',
          r.estimatedCost ?? '',
          r.actualCost ?? '',
          r.status,
          csvEscape(vendor),
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
  requireRoles(Role.SYSTEM_ADMINISTRATOR, Role.GENERAL_MANAGER),
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
