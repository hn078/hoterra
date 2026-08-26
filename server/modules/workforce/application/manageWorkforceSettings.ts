import { AuditAction, Prisma } from '@prisma/client';
import type * as DatabaseModule from '../../../db';
import type { AuthUser } from '../../../middleware/auth';
import { serializeWorkforceSettingsAuditState } from './workforceAuditState';

type WorkforceDatabase = typeof DatabaseModule.prisma;

export type WorkforceSettingsErrorCode = 'FORBIDDEN' | 'INVALID_INPUT';

export class WorkforceSettingsError extends Error {
  constructor(public readonly code: WorkforceSettingsErrorCode) {
    super(code);
    this.name = 'WorkforceSettingsError';
  }
}

function parseFiniteNumber(value: unknown, minimum: number, maximum: number, integer = false) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < minimum || number > maximum || (integer && !Number.isInteger(number))) {
    throw new WorkforceSettingsError('INVALID_INPUT');
  }
  return number;
}

function normalizeHotels(value: unknown): string[] {
  if (!Array.isArray(value)) throw new WorkforceSettingsError('INVALID_INPUT');
  const hotels = [...new Set(value.map((hotel) => String(hotel).trim()).filter(Boolean))];
  if (!hotels.length || hotels.length > 20 || hotels.some((hotel) => hotel.length > 100)) {
    throw new WorkforceSettingsError('INVALID_INPUT');
  }
  return hotels;
}

function assertBoolean(value: unknown) {
  if (typeof value !== 'boolean') throw new WorkforceSettingsError('INVALID_INPUT');
  return value;
}

export async function updateWorkforceSettings(
  database: WorkforceDatabase,
  actor: AuthUser,
  input: {
    hotelName?: unknown;
    hotels?: unknown;
    minLeadHours?: unknown;
    estimatedHourlyRate?: unknown;
    estimatedHoursPerShift?: unknown;
    notifyEmail?: unknown;
    notifyPush?: unknown;
    payrollTolerancePct?: unknown;
  },
) {
  if (!actor.capabilities.includes('workforce.settings.manage')) {
    throw new WorkforceSettingsError('FORBIDDEN');
  }
  const data: {
    hotelName?: string;
    hotelsJson?: string;
    minLeadHours?: number;
    estimatedHourlyRate?: number;
    estimatedHoursPerShift?: number;
    notifyEmail?: boolean;
    notifyPush?: boolean;
    payrollTolerancePct?: number;
  } = {};
  if (input.hotels !== undefined) {
    const hotels = normalizeHotels(input.hotels);
    data.hotelsJson = JSON.stringify(hotels);
    data.hotelName = hotels[0];
  } else if (input.hotelName !== undefined) {
    const name = String(input.hotelName).trim();
    if (!name || name.length > 100) throw new WorkforceSettingsError('INVALID_INPUT');
    data.hotelName = name;
  }
  if (input.minLeadHours !== undefined) data.minLeadHours = parseFiniteNumber(input.minLeadHours, 0, 720, true);
  if (input.estimatedHourlyRate !== undefined) data.estimatedHourlyRate = parseFiniteNumber(input.estimatedHourlyRate, 0, 1_000_000);
  if (input.estimatedHoursPerShift !== undefined) data.estimatedHoursPerShift = parseFiniteNumber(input.estimatedHoursPerShift, 0.25, 24);
  if (input.payrollTolerancePct !== undefined) data.payrollTolerancePct = parseFiniteNumber(input.payrollTolerancePct, 0, 100);
  if (input.notifyEmail !== undefined) data.notifyEmail = assertBoolean(input.notifyEmail);
  if (input.notifyPush !== undefined) data.notifyPush = assertBoolean(input.notifyPush);
  if (!Object.keys(data).length) throw new WorkforceSettingsError('INVALID_INPUT');

  return database.$transaction(async (transaction) => {
    await transaction.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`workforce-settings:${actor.tenantId}`}, 0))`);
    const existing = await transaction.workforceSettings.findFirst();
    const settings = existing
      ? await transaction.workforceSettings.update({ where: { id: existing.id }, data })
      : await transaction.workforceSettings.create({ data });
    const name = `${actor.firstName} ${actor.lastName}`;
    await transaction.auditLog.create({
      data: {
        userId: actor.id,
        userName: name,
        action: AuditAction.UPDATE,
        entityType: 'WorkforceSettings',
        entityId: settings.id,
        details: `Updated workforce settings: ${Object.keys(data).join(', ')}`,
        outcome: 'SUCCESS',
        reason: 'Authorized Workforce administrator changed operational configuration',
        beforeState: serializeWorkforceSettingsAuditState(existing),
        afterState: serializeWorkforceSettingsAuditState(settings),
      },
    });
    let hotels: string[] = ['HOTERRA'];
    try {
      const parsed = JSON.parse(settings.hotelsJson);
      if (Array.isArray(parsed) && parsed.length) hotels = parsed.map(String);
    } catch {
      // Preserve a safe response if legacy settings contain invalid JSON.
    }
    return { ...settings, hotels };
  });
}
