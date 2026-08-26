import { WorkforceRateUnit, WorkforceRequestStatus } from '@prisma/client';
import type * as DatabaseModule from '../../../db';
import { calculateWorkforceLineCost, inclusiveWorkforceDays } from '../domain/workforcePricing';

type WorkforceDatabase = typeof DatabaseModule.prisma;

const INACTIVE_STATUSES = new Set<WorkforceRequestStatus>([
  WorkforceRequestStatus.REJECTED,
  WorkforceRequestStatus.CANCELLED,
  WorkforceRequestStatus.VENDOR_DECLINED,
]);

const PAYMENT_RELEVANT_STATUSES = new Set<WorkforceRequestStatus>([
  WorkforceRequestStatus.VENDOR_ACCEPTED,
  WorkforceRequestStatus.VENDORS_FULLY_APPROVED,
  WorkforceRequestStatus.IN_SERVICE,
  WorkforceRequestStatus.AWAITING_EVALUATION,
  WorkforceRequestStatus.COMPLETED,
]);

const VENDOR_DETAILS_VISIBLE_STATUSES = new Set<WorkforceRequestStatus>([
  WorkforceRequestStatus.VENDORS_FULLY_APPROVED,
  WorkforceRequestStatus.IN_SERVICE,
  WorkforceRequestStatus.AWAITING_EVALUATION,
  WorkforceRequestStatus.COMPLETED,
]);

const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const roundHours = (value: number) => Math.round((value + Number.EPSILON) * 10) / 10;

function estimatedItemHours(
  unit: WorkforceRateUnit,
  quantity: number,
  enteredHours: number | null,
  days: number,
  defaultHours: number
) {
  const hoursPerWorker =
    unit === WorkforceRateUnit.DAILY_9
      ? 9
      : unit === WorkforceRateUnit.DAILY_12
        ? 12
        : enteredHours || defaultHours;
  return quantity * hoursPerWorker * days;
}

type Aggregate = {
  name: string;
  requestIds: Set<string>;
  serviceLines: number;
  quantity: number;
  hours: number;
  committedCost: number;
  invoicedAmount: number;
  paidAmount: number;
  amountPayable: number;
};

function createAggregate(name: string): Aggregate {
  return {
    name,
    requestIds: new Set(),
    serviceLines: 0,
    quantity: 0,
    hours: 0,
    committedCost: 0,
    invoicedAmount: 0,
    paidAmount: 0,
    amountPayable: 0,
  };
}

function serializeAggregate(value: Aggregate, totalCost: number) {
  return {
    name: value.name,
    requests: value.requestIds.size,
    serviceLines: value.serviceLines,
    quantity: value.quantity,
    hours: roundHours(value.hours),
    cost: roundMoney(value.committedCost),
    committedCost: roundMoney(value.committedCost),
    invoicedAmount: roundMoney(value.invoicedAmount),
    paidAmount: roundMoney(value.paidAmount),
    amountPayable: roundMoney(value.amountPayable),
    averageCostPerWorker: roundMoney(value.quantity ? value.committedCost / value.quantity : 0),
    sharePct: roundMoney(totalCost ? (value.committedCost / totalCost) * 100 : 0),
  };
}

export async function buildWorkforceReport(
  database: WorkforceDatabase,
  year: number,
  month: number,
  options: { departmentId?: string; hideUnconfirmedVendors?: boolean } = {},
) {
  const { departmentId, hideUnconfirmedVendors = false } = options;
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0, 23, 59, 59, 999);

  const [requests, budgets, settings] = await Promise.all([
    database.workforceRequest.findMany({
      where: {
        workDate: { gte: start, lte: end },
        ...(departmentId && { departmentId }),
      },
      include: {
        department: true,
        position: true,
        vendor: true,
        acceptedVendor: true,
        items: {
          include: {
            position: true,
            vendor: true,
            vendorRate: { include: { vendor: true } },
          },
        },
        invoices: { include: { vendor: true } },
      },
      orderBy: { workDate: 'asc' },
    }),
    database.departmentCasualBudget.findMany({
      where: { year, month, ...(departmentId && { departmentId }) },
      include: { department: true },
    }),
    database.workforceSettings.findFirst(),
  ]);

  const defaultHours = settings?.estimatedHoursPerShift ?? 8;
  const active = requests.filter((request) => !INACTIVE_STATUSES.has(request.status));
  const completed = requests.filter((request) => request.status === WorkforceRequestStatus.COMPLETED);
  const byDepartment = new Map<string, Aggregate>();
  const byVendor = new Map<string, Aggregate>();
  const byPosition = new Map<string, Aggregate>();
  const byUnit = new Map<string, Aggregate>();
  const byHotel = new Map<string, Aggregate>();
  const paymentDetails: Array<{
    requestId: string;
    requestCode: string;
    department: string;
    vendor: string;
    period: string;
    status: WorkforceRequestStatus;
    services: string;
    quantity: number;
    hours: number;
    committedAmount: number;
    invoicedAmount: number;
    paidAmount: number;
    amountPayable: number;
    paymentStatus: string;
  }> = [];

  let totalCost = 0;
  let totalHours = 0;
  let totalHeadcount = 0;
  let totalInvoiced = 0;
  let totalPaid = 0;
  let totalPayable = 0;
  let missingVendorLines = 0;
  let missingRateLines = 0;
  let uninvoicedRequests = 0;
  let overInvoiced = 0;
  let multiVendorRequests = 0;

  for (const request of active) {
    const days = inclusiveWorkforceDays(request.workDate, request.endDate);
    const sourceItems = request.items.length
      ? request.items
      : [
          {
            id: `${request.id}:legacy`,
            positionId: request.positionId,
            position: request.position,
            rateUnit: request.rateUnit ?? WorkforceRateUnit.HOURLY,
            quantity: request.actualQuantity ?? request.quantity,
            hours: null,
            unitRate: request.unitRate,
            estimatedCost: request.estimatedCost,
            vendorId: request.acceptedVendorId || request.vendorId,
            vendor: request.acceptedVendor || request.vendor,
            vendorRate: null,
          },
        ];

    const rawEstimated = sourceItems.reduce((sum, item) => sum + (item.estimatedCost ?? 0), 0);
    const actualCostFactor =
      request.actualCost != null && rawEstimated > 0 ? request.actualCost / rawEstimated : 1;
    const itemHours = sourceItems.map((item) =>
      estimatedItemHours(item.rateUnit, item.quantity, item.hours, days, defaultHours)
    );
    const rawHours = itemHours.reduce((sum, hours) => sum + hours, 0);
    const actualHoursFactor =
      request.actualHours != null && rawHours > 0 ? request.actualHours / rawHours : 1;

    const requestVendorGroups = new Map<
      string,
      {
        vendorId: string;
        vendor: string;
        services: Set<string>;
        quantity: number;
        hours: number;
        committedAmount: number;
        visible: boolean;
      }
    >();

    sourceItems.forEach((item, index) => {
      const vendor = item.vendor || item.vendorRate?.vendor || request.acceptedVendor || request.vendor;
      const vendorId = vendor?.id || 'unassigned';
      const vendorVisible = !hideUnconfirmedVendors || VENDOR_DETAILS_VISIBLE_STATUSES.has(request.status);
      const vendorName = vendorVisible ? vendor?.name || 'Vendor not assigned' : 'Pending Procurement confirmation';
      const estimatedCost =
        item.estimatedCost ??
        (item.unitRate != null
          ? calculateWorkforceLineCost({
              quantity: item.quantity,
              unitRate: item.unitRate,
              rateUnit: item.rateUnit,
              start: request.workDate,
              end: request.endDate,
              hoursPerDay: item.rateUnit === WorkforceRateUnit.HOURLY
                ? (item.hours || defaultHours)
                : null,
            })
          : 0);
      const committedCost = estimatedCost * actualCostFactor;
      const hours = itemHours[index] * actualHoursFactor;
      const quantity = item.quantity;

      totalCost += committedCost;
      totalHours += hours;
      totalHeadcount += quantity;
      if (PAYMENT_RELEVANT_STATUSES.has(request.status) && !vendor) missingVendorLines += 1;
      if (item.unitRate == null) missingRateLines += 1;

      const department = byDepartment.get(request.departmentId) || createAggregate(request.department.name);
      department.requestIds.add(request.id);
      department.serviceLines += 1;
      department.quantity += quantity;
      department.hours += hours;
      department.committedCost += committedCost;
      byDepartment.set(request.departmentId, department);

      const position = byPosition.get(item.positionId) || createAggregate(item.position.name);
      position.requestIds.add(request.id);
      position.serviceLines += 1;
      position.quantity += quantity;
      position.hours += hours;
      position.committedCost += committedCost;
      byPosition.set(item.positionId, position);

      const unit = byUnit.get(item.rateUnit) || createAggregate(item.rateUnit);
      unit.requestIds.add(request.id);
      unit.serviceLines += 1;
      unit.quantity += quantity;
      unit.hours += hours;
      unit.committedCost += committedCost;
      byUnit.set(item.rateUnit, unit);

      const hotel = byHotel.get(request.hotelName) || createAggregate(request.hotelName);
      hotel.requestIds.add(request.id);
      hotel.serviceLines += 1;
      hotel.quantity += quantity;
      hotel.hours += hours;
      hotel.committedCost += committedCost;
      byHotel.set(request.hotelName, hotel);

      const group = requestVendorGroups.get(vendorId) || {
        vendorId,
        vendor: vendorName,
        services: new Set<string>(),
        quantity: 0,
        hours: 0,
        committedAmount: 0,
        visible: vendorVisible,
      };
      group.services.add(item.position.name);
      group.quantity += quantity;
      group.hours += hours;
      group.committedAmount += committedCost;
      requestVendorGroups.set(vendorId, group);
    });

    if ([...requestVendorGroups.keys()].filter((id) => id !== 'unassigned').length > 1) {
      multiVendorRequests += 1;
    }

    if (PAYMENT_RELEVANT_STATUSES.has(request.status) && request.invoices.length === 0) {
      uninvoicedRequests += 1;
    }

    for (const group of requestVendorGroups.values()) {
      const invoices = request.invoices.filter((invoice) => invoice.vendorId === group.vendorId);
      const invoicedAmount = invoices.reduce((sum, invoice) => sum + invoice.invoiceAmount, 0);
      const paidAmount = invoices
        .filter((invoice) => invoice.status.toUpperCase() === 'PAID')
        .reduce((sum, invoice) => sum + invoice.invoiceAmount, 0);
      const amountPayable = PAYMENT_RELEVANT_STATUSES.has(request.status)
        ? Math.max(group.committedAmount, invoicedAmount) - paidAmount
        : 0;
      if (invoicedAmount > group.committedAmount + 0.01) overInvoiced += 1;

      let paymentStatus = 'NOT_INVOICED';
      if (invoicedAmount > group.committedAmount + 0.01) paymentStatus = 'OVER_INVOICED';
      else if (paidAmount >= group.committedAmount - 0.01 && group.committedAmount > 0) paymentStatus = 'PAID';
      else if (invoicedAmount > 0 && invoicedAmount < group.committedAmount - 0.01) paymentStatus = 'PARTIALLY_INVOICED';
      else if (invoicedAmount > 0) paymentStatus = 'PENDING_PAYMENT';

      totalInvoiced += invoicedAmount;
      totalPaid += paidAmount;
      totalPayable += amountPayable;

      if (group.visible) {
        const vendor = byVendor.get(group.vendorId) || createAggregate(group.vendor);
        vendor.requestIds.add(request.id);
        vendor.serviceLines += group.services.size;
        vendor.quantity += group.quantity;
        vendor.hours += group.hours;
        vendor.committedCost += group.committedAmount;
        vendor.invoicedAmount += invoicedAmount;
        vendor.paidAmount += paidAmount;
        vendor.amountPayable += amountPayable;
        byVendor.set(group.vendorId, vendor);
      }

      const department = byDepartment.get(request.departmentId)!;
      department.invoicedAmount += invoicedAmount;
      department.paidAmount += paidAmount;
      department.amountPayable += amountPayable;

      paymentDetails.push({
        requestId: request.id,
        requestCode: request.code,
        department: request.department.name,
        vendor: group.vendor,
        period: `${request.workDate.toISOString().slice(0, 10)} – ${request.endDate.toISOString().slice(0, 10)}`,
        status: request.status,
        services: [...group.services].sort().join(', '),
        quantity: group.quantity,
        hours: roundHours(group.hours),
        committedAmount: roundMoney(group.committedAmount),
        invoicedAmount: roundMoney(invoicedAmount),
        paidAmount: roundMoney(paidAmount),
        amountPayable: roundMoney(amountPayable),
        paymentStatus,
      });
    }
  }

  const statusMap = new Map<string, { status: string; requests: number; requestedCost: number; quantity: number }>();
  for (const request of requests) {
    const row = statusMap.get(request.status) || {
      status: request.status,
      requests: 0,
      requestedCost: 0,
      quantity: 0,
    };
    row.requests += 1;
    row.requestedCost += request.estimatedCost ?? 0;
    row.quantity += request.quantity;
    statusMap.set(request.status, row);
  }

  const serializedDepartments = [...byDepartment.values()]
    .map((value) => serializeAggregate(value, totalCost))
    .sort((a, b) => b.committedCost - a.committedCost);
  const serializedVendors = [...byVendor.values()]
    .map((value) => serializeAggregate(value, totalCost))
    .sort((a, b) => b.amountPayable - a.amountPayable);

  const budgetMap = new Map(budgets.map((budget) => [budget.departmentId, budget]));
  const budgetDepartmentIds = new Set([...budgetMap.keys(), ...byDepartment.keys()]);
  const budgetVsActual = [...budgetDepartmentIds]
    .map((departmentId) => {
      const budget = budgetMap.get(departmentId);
      const actual = byDepartment.get(departmentId);
      const budgetAmount = budget?.budgetAmount ?? 0;
      const actualAmount = actual?.committedCost ?? 0;
      return {
        departmentId,
        department: budget?.department.name || actual?.name || 'Unknown',
        budget: roundMoney(budgetAmount),
        actual: roundMoney(actualAmount),
        variance: roundMoney(budgetAmount - actualAmount),
        utilizationPct: roundMoney(budgetAmount ? (actualAmount / budgetAmount) * 100 : 0),
        budgetConfigured: Boolean(budget),
      };
    })
    .sort((a, b) => b.actual - a.actual);

  const alerts: Array<{ severity: 'info' | 'warning' | 'critical'; title: string; detail: string; count: number }> = [];
  if (uninvoicedRequests) alerts.push({ severity: 'warning', title: 'Orders awaiting invoice', detail: 'Accepted or completed requests have no vendor invoice yet.', count: uninvoicedRequests });
  if (missingVendorLines) alerts.push({ severity: 'critical', title: 'Service lines without vendor', detail: 'These active service lines cannot be assigned for payment.', count: missingVendorLines });
  if (missingRateLines) alerts.push({ severity: 'warning', title: 'Service lines without locked rate', detail: 'The amount exists, but a unit rate was not stored on the service line.', count: missingRateLines });
  if (overInvoiced) alerts.push({ severity: 'critical', title: 'Invoice exceeds commitment', detail: 'Review the invoice before payment approval.', count: overInvoiced });
  if (multiVendorRequests) alerts.push({ severity: 'info', title: 'Multi-vendor requests', detail: 'Payment is split by the vendor selected for each service line.', count: multiVendorRequests });
  if (!budgets.length && active.length) alerts.push({ severity: 'warning', title: 'Department budgets not configured', detail: 'Budget variance cannot be evaluated until monthly budgets are entered.', count: byDepartment.size });

  return {
    year,
    month,
    currency: 'AZN',
    summary: {
      totalRequests: requests.length,
      activeRequests: active.length,
      completedRequests: completed.length,
      rejectedRequests: requests.filter((request) => INACTIVE_STATUSES.has(request.status)).length,
      totalCost: roundMoney(totalCost),
      committedCost: roundMoney(totalCost),
      invoicedAmount: roundMoney(totalInvoiced),
      paidAmount: roundMoney(totalPaid),
      amountPayable: roundMoney(totalPayable),
      totalHours: roundHours(totalHours),
      totalHeadcount,
      averageCostPerWorker: roundMoney(totalHeadcount ? totalCost / totalHeadcount : 0),
      averageHourlyCost: roundMoney(totalHours ? totalCost / totalHours : 0),
    },
    byDepartment: serializedDepartments,
    byVendor: serializedVendors,
    byPosition: [...byPosition.values()]
      .map((value) => serializeAggregate(value, totalCost))
      .sort((a, b) => b.committedCost - a.committedCost),
    byUnit: [...byUnit.values()]
      .map((value) => serializeAggregate(value, totalCost))
      .sort((a, b) => b.committedCost - a.committedCost),
    byHotel: [...byHotel.values()]
      .map((value) => serializeAggregate(value, totalCost))
      .sort((a, b) => b.committedCost - a.committedCost),
    byStatus: [...statusMap.values()]
      .map((value) => ({ ...value, requestedCost: roundMoney(value.requestedCost) }))
      .sort((a, b) => b.requests - a.requests),
    budgetVsActual,
    paymentDetails: paymentDetails.sort((a, b) => b.amountPayable - a.amountPayable),
    audit: {
      missingVendorLines,
      missingRateLines,
      uninvoicedRequests,
      overInvoiced,
      multiVendorRequests,
      alerts,
    },
  };
}
