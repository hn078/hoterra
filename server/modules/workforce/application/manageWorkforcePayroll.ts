import { AuditAction, Prisma, WorkforceRateUnit, WorkforceRequestStatus } from '@prisma/client';
import type * as DatabaseModule from '../../../db';
import type { AuthUser } from '../../../middleware/auth';
import { serializeWorkforceInvoiceAuditState } from './workforceAuditState';

type WorkforceDatabase = typeof DatabaseModule.prisma;
const INVOICE_STATUSES = new Set(['PENDING', 'MATCHED', 'MISMATCH', 'PAID']);

export type WorkforcePayrollErrorCode =
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'INVALID_INPUT'
  | 'INVALID_STATE'
  | 'INVALID_VENDOR'
  | 'VENDOR_REQUIRED'
  | 'NO_VENDOR'
  | 'DUPLICATE_INVOICE'
  | 'ACTUALS_REQUIRED'
  | 'MATCH_REQUIRED'
  | 'CONFLICT';

export class WorkforcePayrollError extends Error {
  constructor(public readonly code: WorkforcePayrollErrorCode) {
    super(code);
    this.name = 'WorkforcePayrollError';
  }
}

function assertPayrollAccess(actor: AuthUser) {
  if (!actor.capabilities.includes('workforce.invoice.manage')) throw new WorkforcePayrollError('FORBIDDEN');
}

function actorName(actor: AuthUser) {
  return `${actor.firstName} ${actor.lastName}`;
}

function roundTo(value: number, decimals: number) {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function withinPayrollTolerance(actual: number, invoice: number, tolerancePct: number) {
  if (actual === 0 && invoice === 0) return true;
  const base = Math.max(Math.abs(actual), Math.abs(invoice), 0.01);
  return (Math.abs(actual - invoice) / base) * 100 <= tolerancePct;
}

export async function listWorkforceInvoices(
  database: WorkforceDatabase,
  actor: AuthUser,
  status?: unknown,
) {
  assertPayrollAccess(actor);
  const normalizedStatus = status == null || status === '' ? undefined : String(status).toUpperCase();
  if (normalizedStatus && !INVOICE_STATUSES.has(normalizedStatus)) {
    throw new WorkforcePayrollError('INVALID_INPUT');
  }
  return database.vendorInvoice.findMany({
    where: normalizedStatus ? { status: normalizedStatus } : undefined,
    include: {
      vendor: true,
      request: { include: { department: true, position: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function createWorkforceInvoice(
  database: WorkforceDatabase,
  actor: AuthUser,
  input: {
    requestId?: unknown;
    vendorId?: unknown;
    invoiceNumber?: unknown;
    invoiceHours?: unknown;
    invoiceAmount?: unknown;
    invoiceDate?: unknown;
  },
) {
  assertPayrollAccess(actor);
  const requestId = String(input.requestId || '').trim();
  const requestedVendorId = String(input.vendorId || '').trim();
  const invoiceNumber = String(input.invoiceNumber || '').trim().slice(0, 100);
  const invoiceHours = Number(input.invoiceHours);
  const invoiceAmount = Number(input.invoiceAmount);
  const invoiceDate = input.invoiceDate ? new Date(String(input.invoiceDate)) : new Date();
  if (
    !requestId || !invoiceNumber || !Number.isFinite(invoiceHours) || invoiceHours < 0 ||
    !Number.isFinite(invoiceAmount) || invoiceAmount < 0 || Number.isNaN(invoiceDate.getTime())
  ) {
    throw new WorkforcePayrollError('INVALID_INPUT');
  }

  return database.$transaction(async (transaction) => {
    await transaction.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${requestId}, 0))`);
    const request = await transaction.workforceRequest.findUnique({
      where: { id: requestId },
      include: { items: { select: { vendorId: true } } },
    });
    if (!request) throw new WorkforcePayrollError('NOT_FOUND');
    if (request.status !== WorkforceRequestStatus.COMPLETED) {
      throw new WorkforcePayrollError('INVALID_STATE');
    }

    const requestVendorIds = new Set(
      request.items.map((item) => item.vendorId).filter((vendorId): vendorId is string => Boolean(vendorId)),
    );
    if (!requestVendorIds.size) {
      const legacyVendorId = request.acceptedVendorId || request.vendorId;
      if (legacyVendorId) requestVendorIds.add(legacyVendorId);
    }
    if (requestedVendorId && !requestVendorIds.has(requestedVendorId)) {
      throw new WorkforcePayrollError('INVALID_VENDOR');
    }
    if (!requestedVendorId && requestVendorIds.size > 1) {
      throw new WorkforcePayrollError('VENDOR_REQUIRED');
    }
    const vendorId = requestedVendorId || [...requestVendorIds][0];
    if (!vendorId) throw new WorkforcePayrollError('NO_VENDOR');

    const duplicateLockKey = `${vendorId}:${invoiceNumber.toLocaleLowerCase('en-US')}`;
    await transaction.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${duplicateLockKey}, 0))`);
    const duplicate = await transaction.vendorInvoice.findFirst({
      where: { vendorId, invoiceNumber: { equals: invoiceNumber, mode: 'insensitive' } },
      select: { id: true },
    });
    if (duplicate) throw new WorkforcePayrollError('DUPLICATE_INVOICE');

    const roundedHours = roundTo(invoiceHours, 2);
    const roundedAmount = roundTo(invoiceAmount, 2);
    const invoice = await transaction.vendorInvoice.create({
      data: { requestId, vendorId, invoiceNumber, invoiceHours: roundedHours, invoiceAmount: roundedAmount, invoiceDate },
      include: { vendor: true, request: true },
    });
    const name = actorName(actor);
    const details = `Invoice ${invoiceNumber}: ${roundedHours.toFixed(2)}h / ${roundedAmount.toFixed(2)} AZN`;
    await transaction.workforceRequestEvent.create({
      data: { requestId, action: 'INVOICE_RECEIVED', details, userId: actor.id, userName: name },
    });
    await transaction.auditLog.create({
      data: { userId: actor.id, userName: name, action: AuditAction.CREATE, entityType: 'VendorInvoice', entityId: invoice.id, details: `${request.code}: Vendor invoice recorded`, outcome: 'SUCCESS', reason: 'Authorized payroll actor recorded an invoice for a completed request and assigned vendor', afterState: serializeWorkforceInvoiceAuditState(invoice) },
    });
    return invoice;
  });
}

export async function matchWorkforceInvoice(
  database: WorkforceDatabase,
  actor: AuthUser,
  invoiceId: string,
) {
  assertPayrollAccess(actor);
  return database.$transaction(async (transaction) => {
    await transaction.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${invoiceId}, 0))`);
    const invoice = await transaction.vendorInvoice.findUnique({
      where: { id: invoiceId },
      include: { request: { include: { items: true } }, vendor: true },
    });
    if (!invoice) throw new WorkforcePayrollError('NOT_FOUND');
    if (invoice.status === 'PAID') throw new WorkforcePayrollError('INVALID_STATE');
    if (invoice.matchedAt && (invoice.status === 'MATCHED' || invoice.status === 'MISMATCH')) {
      return { invoice, status: invoice.status, alreadyProcessed: true };
    }
    if (invoice.request.status !== WorkforceRequestStatus.COMPLETED) {
      throw new WorkforcePayrollError('INVALID_STATE');
    }
    if (invoice.request.actualHours == null || invoice.request.actualCost == null) {
      throw new WorkforcePayrollError('ACTUALS_REQUIRED');
    }

    const settings = await transaction.workforceSettings.findFirst({
      select: { estimatedHoursPerShift: true, payrollTolerancePct: true },
    });
    const estimatedHoursPerShift = settings?.estimatedHoursPerShift ?? 8;
    const tolerancePct = settings?.payrollTolerancePct ?? 5;
    const days = Math.max(1, Math.floor((Date.UTC(
      invoice.request.endDate.getUTCFullYear(), invoice.request.endDate.getUTCMonth(), invoice.request.endDate.getUTCDate(),
    ) - Date.UTC(
      invoice.request.workDate.getUTCFullYear(), invoice.request.workDate.getUTCMonth(), invoice.request.workDate.getUTCDate(),
    )) / 86_400_000) + 1);
    const itemHours = (item: (typeof invoice.request.items)[number]) => {
      const perWorker = item.rateUnit === WorkforceRateUnit.DAILY_9 ? 9
        : item.rateUnit === WorkforceRateUnit.DAILY_12 ? 12
          : item.hours || estimatedHoursPerShift;
      return item.quantity * perWorker * days;
    };
    const allEstimatedCost = invoice.request.items.reduce((sum, item) => sum + (item.estimatedCost || 0), 0);
    const vendorItems = invoice.request.items.filter((item) => item.vendorId === invoice.vendorId);
    const vendorEstimatedCost = vendorItems.reduce((sum, item) => sum + (item.estimatedCost || 0), 0);
    const allEstimatedHours = invoice.request.items.reduce((sum, item) => sum + itemHours(item), 0);
    const vendorEstimatedHours = vendorItems.reduce((sum, item) => sum + itemHours(item), 0);
    const expectedHours = vendorItems.length && allEstimatedHours > 0
      ? invoice.request.actualHours * vendorEstimatedHours / allEstimatedHours
      : invoice.request.actualHours;
    const expectedCost = vendorItems.length && allEstimatedCost > 0
      ? invoice.request.actualCost * vendorEstimatedCost / allEstimatedCost
      : invoice.request.actualCost;
    const hoursOk = withinPayrollTolerance(expectedHours, invoice.invoiceHours, tolerancePct);
    const amountOk = withinPayrollTolerance(expectedCost, invoice.invoiceAmount, tolerancePct);
    const status = hoursOk && amountOk ? 'MATCHED' : 'MISMATCH';
    const notes = [
      `Hours: expected ${expectedHours.toFixed(2)} vs invoice ${invoice.invoiceHours.toFixed(2)}`,
      `Amount: expected ${expectedCost.toFixed(2)} AZN vs invoice ${invoice.invoiceAmount.toFixed(2)} AZN`,
      `Tolerance: ±${tolerancePct}%`,
    ].join('; ');
    const updated = await transaction.vendorInvoice.updateMany({
      where: { id: invoiceId, status: invoice.status, matchedAt: null },
      data: { status, matchedAt: new Date(), notes },
    });
    if (!updated.count) throw new WorkforcePayrollError('CONFLICT');
    const result = await transaction.vendorInvoice.findUniqueOrThrow({
      where: { id: invoiceId }, include: { request: true, vendor: true },
    });
    const name = actorName(actor);
    await transaction.workforceRequestEvent.create({
      data: { requestId: invoice.requestId, action: `INVOICE_${status}`, details: `${invoice.invoiceNumber}: ${notes}`, userId: actor.id, userName: name },
    });
    await transaction.auditLog.create({
      data: { userId: actor.id, userName: name, action: AuditAction.UPDATE, entityType: 'VendorInvoice', entityId: invoiceId, details: `${invoice.request.code}: invoice matching completed as ${status}`, outcome: 'SUCCESS', reason: `Invoice hours and amount were compared with actuals using the configured tolerance; result ${status}`, beforeState: serializeWorkforceInvoiceAuditState(invoice), afterState: serializeWorkforceInvoiceAuditState(result) },
    });
    return { invoice: result, status };
  });
}

export async function markWorkforceInvoicePaid(
  database: WorkforceDatabase,
  actor: AuthUser,
  invoiceId: string,
) {
  assertPayrollAccess(actor);
  return database.$transaction(async (transaction) => {
    await transaction.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${invoiceId}, 0))`);
    const invoice = await transaction.vendorInvoice.findUnique({
      where: { id: invoiceId }, include: { request: true, vendor: true },
    });
    if (!invoice) throw new WorkforcePayrollError('NOT_FOUND');
    if (invoice.status === 'PAID') return { invoice, status: invoice.status, alreadyProcessed: true };
    if (invoice.status !== 'MATCHED') throw new WorkforcePayrollError('MATCH_REQUIRED');
    const paidAt = new Date();
    const updated = await transaction.vendorInvoice.updateMany({
      where: { id: invoiceId, status: 'MATCHED' },
      data: { status: 'PAID', paidAt, paidById: actor.id },
    });
    if (!updated.count) throw new WorkforcePayrollError('CONFLICT');
    const result = await transaction.vendorInvoice.findUniqueOrThrow({
      where: { id: invoiceId }, include: { request: true, vendor: true },
    });
    const name = actorName(actor);
    const details = `Invoice ${invoice.invoiceNumber} marked paid: ${invoice.invoiceAmount.toFixed(2)} AZN`;
    await transaction.workforceRequestEvent.create({
      data: { requestId: invoice.requestId, action: 'INVOICE_PAID', details, userId: actor.id, userName: name },
    });
    await transaction.auditLog.create({
      data: { userId: actor.id, userName: name, action: AuditAction.UPDATE, entityType: 'VendorInvoice', entityId: invoiceId, details: `${invoice.request.code}: matched invoice marked paid`, outcome: 'SUCCESS', reason: 'Authorized payroll actor recorded payment of a previously matched invoice', beforeState: serializeWorkforceInvoiceAuditState(invoice), afterState: serializeWorkforceInvoiceAuditState(result) },
    });
    return { invoice: result, status: result.status };
  });
}
