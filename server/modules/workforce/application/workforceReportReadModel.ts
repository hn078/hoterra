import { AuditAction, Role } from '@prisma/client';
import type * as DatabaseModule from '../../../db';
import type { AuthUser } from '../../../middleware/auth';
import { buildWorkforceReport } from './buildWorkforceReport';

type WorkforceDatabase = typeof DatabaseModule.prisma;

export type WorkforceReportErrorCode = 'FORBIDDEN' | 'INVALID_PERIOD';

export class WorkforceReportError extends Error {
  constructor(public readonly code: WorkforceReportErrorCode) {
    super(code);
    this.name = 'WorkforceReportError';
  }
}

function period(input: { year?: unknown; month?: unknown }) {
  const now = new Date();
  const year = input.year == null || input.year === '' ? now.getFullYear() : Number(input.year);
  const month = input.month == null || input.month === '' ? now.getMonth() + 1 : Number(input.month);
  if (!Number.isInteger(year) || year < 2020 || year > 2100 || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new WorkforceReportError('INVALID_PERIOD');
  }
  return { year, month };
}

async function reportScope(database: WorkforceDatabase, actor: AuthUser) {
  const hotelWideRole = actor.role === Role.GENERAL_MANAGER || actor.role === Role.FINANCE_DIRECTOR;
  if (hotelWideRole) return { departmentId: undefined, hideUnconfirmedVendors: false };
  const user = await database.user.findUnique({
    where: { id: actor.id }, select: { department: { select: { code: true } } },
  });
  if (user?.department?.code === 'PR') return { departmentId: undefined, hideUnconfirmedVendors: false };
  return {
    departmentId: actor.departmentId || '__unassigned_department__',
    hideUnconfirmedVendors: true,
  };
}

export async function getWorkforceReport(
  database: WorkforceDatabase,
  actor: AuthUser,
  input: { year?: unknown; month?: unknown },
) {
  if (!actor.capabilities.includes('workforce.reports.read')) throw new WorkforceReportError('FORBIDDEN');
  const selectedPeriod = period(input);
  const scope = await reportScope(database, actor);
  return buildWorkforceReport(database, selectedPeriod.year, selectedPeriod.month, scope);
}

function csvEscape(value: unknown) {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export async function exportWorkforceReportCsv(
  database: WorkforceDatabase,
  actor: AuthUser,
  input: { year?: unknown; month?: unknown },
) {
  if (!actor.capabilities.includes('workforce.reports.export')) throw new WorkforceReportError('FORBIDDEN');
  const selectedPeriod = period(input);
  const scope = await reportScope(database, actor);
  const report = await buildWorkforceReport(database, selectedPeriod.year, selectedPeriod.month, scope);
  const rows: unknown[][] = [[
    'code', 'department', 'vendor', 'period', 'services', 'quantity', 'hours',
    'committedAmountAZN', 'invoicedAmountAZN', 'paidAmountAZN', 'amountPayableAZN',
    'paymentStatus', 'status',
  ]];
  for (const row of report.paymentDetails) {
    rows.push([
      row.requestCode, row.department, row.vendor, row.period, row.services, row.quantity,
      row.hours, row.committedAmount, row.invoicedAmount, row.paidAmount, row.amountPayable,
      row.paymentStatus, row.status,
    ]);
  }
  const fileName = `workforce-${selectedPeriod.year}-${String(selectedPeriod.month).padStart(2, '0')}.csv`;
  await database.auditLog.create({
    data: {
      userId: actor.id,
      userName: `${actor.firstName} ${actor.lastName}`,
      action: AuditAction.DOWNLOAD,
      entityType: 'WorkforceReport',
      details: `Exported ${fileName} (${report.paymentDetails.length} payment row(s))`,
    },
  });
  return { fileName, content: `\uFEFF${rows.map((row) => row.map(csvEscape).join(',')).join('\r\n')}` };
}
