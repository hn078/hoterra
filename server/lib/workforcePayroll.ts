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
      request: true,
      vendor: true,
    },
  });
  if (!invoice) return { error: 'Invoice not found' as const };
  if (invoice.request.actualHours == null || invoice.request.actualCost == null) {
    return { error: 'Request has no actual hours/cost yet' as const };
  }

  const hoursOk = withinTolerance(
    invoice.request.actualHours,
    invoice.invoiceHours,
    settings.payrollTolerancePct
  );
  const amountOk = withinTolerance(
    invoice.request.actualCost,
    invoice.invoiceAmount,
    settings.payrollTolerancePct
  );

  const status = hoursOk && amountOk ? 'MATCHED' : 'MISMATCH';
  const notes = [
    `Hours: actual ${invoice.request.actualHours} vs invoice ${invoice.invoiceHours}`,
    `Amount: actual $${invoice.request.actualCost} vs invoice $${invoice.invoiceAmount}`,
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
