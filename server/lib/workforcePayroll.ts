import { WorkforceRateUnit } from '@prisma/client';
import { prisma } from '../db';
import { getWorkforceSettings } from './workforce';

export function withinTolerance(actual: number, invoice: number, tolerancePct: number) {
  if (actual === 0 && invoice === 0) return true;
  const base = Math.max(Math.abs(actual), Math.abs(invoice), 0.01);
  return (Math.abs(actual - invoice) / base) * 100 <= tolerancePct;
}

export async function matchInvoice(invoiceId: string) {
  const settings = await getWorkforceSettings();
  const invoice = await prisma.vendorInvoice.findUnique({
    where: { id: invoiceId },
    include: {
      request: { include: { items: true } },
      vendor: true,
    },
  });
  if (!invoice) return { error: 'Invoice not found' as const };
  if (invoice.request.actualHours == null || invoice.request.actualCost == null) {
    return { error: 'Request has no actual hours/cost yet' as const };
  }

  const days = Math.max(
    1,
    Math.floor((Date.UTC(
      invoice.request.endDate.getUTCFullYear(),
      invoice.request.endDate.getUTCMonth(),
      invoice.request.endDate.getUTCDate()
    ) - Date.UTC(
      invoice.request.workDate.getUTCFullYear(),
      invoice.request.workDate.getUTCMonth(),
      invoice.request.workDate.getUTCDate()
    )) / 86_400_000) + 1
  );
  const itemHours = (item: (typeof invoice.request.items)[number]) => {
    const perWorker = item.rateUnit === WorkforceRateUnit.DAILY_9
      ? 9
      : item.rateUnit === WorkforceRateUnit.DAILY_12
        ? 12
        : item.hours || settings.estimatedHoursPerShift;
    return item.quantity * perWorker * days;
  };
  const allEstimatedCost = invoice.request.items.reduce((sum, item) => sum + (item.estimatedCost || 0), 0);
  const vendorEstimatedCost = invoice.request.items
    .filter((item) => item.vendorId === invoice.vendorId)
    .reduce((sum, item) => sum + (item.estimatedCost || 0), 0);
  const allEstimatedHours = invoice.request.items.reduce((sum, item) => sum + itemHours(item), 0);
  const vendorEstimatedHours = invoice.request.items
    .filter((item) => item.vendorId === invoice.vendorId)
    .reduce((sum, item) => sum + itemHours(item), 0);
  const expectedHours = invoice.request.items.length && allEstimatedHours > 0
    ? invoice.request.actualHours * vendorEstimatedHours / allEstimatedHours
    : invoice.request.actualHours;
  const expectedCost = invoice.request.items.length && allEstimatedCost > 0
    ? invoice.request.actualCost * vendorEstimatedCost / allEstimatedCost
    : invoice.request.actualCost;

  const hoursOk = withinTolerance(
    expectedHours,
    invoice.invoiceHours,
    settings.payrollTolerancePct
  );
  const amountOk = withinTolerance(
    expectedCost,
    invoice.invoiceAmount,
    settings.payrollTolerancePct
  );

  const status = hoursOk && amountOk ? 'MATCHED' : 'MISMATCH';
  const notes = [
    `Hours: expected ${expectedHours.toFixed(2)} vs invoice ${invoice.invoiceHours}`,
    `Amount: expected ${expectedCost.toFixed(2)} AZN vs invoice ${invoice.invoiceAmount} AZN`,
    `Tolerance: ±${settings.payrollTolerancePct}%`,
  ].join('; ');

  const updated = await prisma.vendorInvoice.update({
    where: { id: invoiceId },
    data: {
      status,
      matchedAt: new Date(),
      notes,
    },
    include: { request: true, vendor: true },
  });

  return { invoice: updated, status };
}
