import { Prisma, Role, WorkforceRateUnit } from '@prisma/client';
import type * as DatabaseModule from '../../../db';
import type { AuthUser } from '../../../middleware/auth';
import { resolveEffectiveCapabilities } from '../../access-control';
import { createWorkforceRequestInTransaction } from './manageWorkforceRequestPlanning';
import type { WorkforceNotificationOptions } from './workforceNotificationOutbox';

type WorkforceDatabase = typeof DatabaseModule.prisma;

export type GeneratedRecurringRequest = {
  requestId: string;
  code: string;
  departmentId: string;
  approvalSteps: string;
  currentStepIndex: number;
};

export type RecurringGenerationResult = {
  created: GeneratedRecurringRequest[];
  skipped: Array<{ templateId: string; reason: string }>;
};

function tenantDateParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const value = (type: 'year' | 'month' | 'day') => Number(parts.find((part) => part.type === type)?.value);
  return { year: value('year'), month: value('month'), day: value('day') };
}

function tenantDateKey(date: Date, timeZone: string) {
  const { year, month, day } = tenantDateParts(date, timeZone);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function tenantWeekday(date: Date, timeZone: string) {
  const name = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(date);
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(name);
}

function nextOccurrence(now: Date, timeZone: string, minLeadHours: number) {
  const { year, month, day } = tenantDateParts(now, timeZone);
  const result = new Date(Date.UTC(year, month - 1, day + 7));
  while ((result.getTime() - now.getTime()) / 3_600_000 < minLeadHours) {
    result.setUTCDate(result.getUTCDate() + 7);
  }
  return result;
}

function authUserFromCreator(creator: any): AuthUser {
  return {
    id: creator.id,
    tenantId: creator.tenantId,
    email: creator.email,
    role: creator.role,
    firstName: creator.firstName,
    lastName: creator.lastName,
    departmentId: creator.departmentId,
    customRoleId: creator.customRoleId,
    capabilities: resolveEffectiveCapabilities(creator.role, creator.customRole),
  };
}

/** Generates the current tenant's due recurring requests exactly once per tenant-local day. */
export async function generateRecurringWorkforceRequests(
  database: WorkforceDatabase,
  notificationOptions: WorkforceNotificationOptions,
  now = new Date(),
): Promise<RecurringGenerationResult> {
  const systemSettings = await database.systemSettings.findFirst({ select: { timezone: true } });
  const timeZone = systemSettings?.timezone || 'Asia/Baku';
  const dayOfWeek = tenantWeekday(now, timeZone);
  const templateIds = (await database.workforceRequestTemplate.findMany({
    where: { isActive: true, isRecurring: true, dayOfWeek },
    select: { id: true },
  })).map((template) => template.id);

  const result: RecurringGenerationResult = { created: [], skipped: [] };
  for (const templateId of templateIds) {
    try {
      const generated = await database.$transaction(async (transaction) => {
        await transaction.$executeRaw(
          Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`workforce-recurring:${templateId}`}))`
        );
        const template = await transaction.workforceRequestTemplate.findUnique({ where: { id: templateId } });
        if (!template?.isActive || !template.isRecurring || template.dayOfWeek !== dayOfWeek) return null;
        if (template.lastGeneratedAt && tenantDateKey(template.lastGeneratedAt, timeZone) === tenantDateKey(now, timeZone)) return null;
        if (!template.departmentId || !template.positionId) throw new Error('Template department and position are required');

        const settings = await transaction.workforceSettings.findFirst()
          ?? await transaction.workforceSettings.create({ data: {} });
        const creator = await transaction.user.findFirst({
          where: { role: Role.HOD, departmentId: template.departmentId, isActive: true },
          include: { customRole: { select: { permissions: true, isActive: true } } },
          orderBy: { createdAt: 'asc' },
        });
        if (!creator) throw new Error('No active department HOD exists for the recurring request');

        const workDate = nextOccurrence(now, timeZone, settings.minLeadHours);
        const created = await createWorkforceRequestInTransaction(
          transaction,
          authUserFromCreator(creator),
          {
            departmentId: template.departmentId,
            workDate: workDate.toISOString(),
            endDate: workDate.toISOString(),
            hotelName: template.hotelName || settings.hotelName,
            comment: template.comment
              ? `${template.comment} (auto from template: ${template.name})`
              : `Auto-generated from recurring template: ${template.name}`,
            items: [{
              positionId: template.positionId,
              rateUnit: WorkforceRateUnit.HOURLY,
              quantity: template.quantity,
              hours: settings.estimatedHoursPerShift,
            }],
          },
          { now, eventDetails: `Recurring template "${template.name}"`, notification: notificationOptions },
        );
        await transaction.workforceRequestTemplate.update({
          where: { id: template.id },
          data: { lastGeneratedAt: now },
        });
        return created;
      });
      if (generated) result.created.push(generated);
      else result.skipped.push({ templateId, reason: 'Already generated or no longer due' });
    } catch (error) {
      result.skipped.push({
        templateId,
        reason: error instanceof Error ? error.message.slice(0, 300) : 'Generation failed',
      });
    }
  }
  return result;
}
