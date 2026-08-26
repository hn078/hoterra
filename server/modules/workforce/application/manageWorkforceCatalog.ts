import { AuditAction, Prisma, Role, VendorApprovalStatus, WorkforceRateUnit } from '@prisma/client';
import type * as DatabaseModule from '../../../db';
import type { AuthUser } from '../../../middleware/auth';
import {
  queueVendorApprovalNotifications,
  type WorkforceNotificationOptions,
} from './workforceNotificationOutbox';
import { canManageProcurementWorkforce } from './procurementAccess';
import {
  serializeWorkforcePositionAuditState,
  serializeWorkforceRateAuditState,
  serializeWorkforceVendorAuditState,
} from './workforceAuditState';

type WorkforceDatabase = typeof DatabaseModule.prisma;

export type WorkforceCatalogErrorCode =
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'INVALID_INPUT'
  | 'DUPLICATE'
  | 'INVALID_REFERENCE';

export class WorkforceCatalogError extends Error {
  constructor(public readonly code: WorkforceCatalogErrorCode) {
    super(code);
    this.name = 'WorkforceCatalogError';
  }
}

const DEFAULT_VENDOR_APPROVAL_STEPS = JSON.stringify([
  { role: Role.FINANCE_DIRECTOR, label: 'Finance Director' },
  { role: Role.GENERAL_MANAGER, label: 'General Manager' },
]);

function actorName(actor: AuthUser) {
  return `${actor.firstName} ${actor.lastName}`;
}

async function assertCatalogAccess(database: WorkforceDatabase, actor: AuthUser) {
  if (!(await canManageProcurementWorkforce(database, actor))) {
    throw new WorkforceCatalogError('FORBIDDEN');
  }
}

function requiredText(value: unknown, maximum: number) {
  const text = String(value || '').trim();
  if (!text || text.length > maximum) throw new WorkforceCatalogError('INVALID_INPUT');
  return text;
}

function optionalText(value: unknown, maximum: number) {
  if (value == null || value === '') return null;
  const text = String(value).trim();
  if (text.length > maximum) throw new WorkforceCatalogError('INVALID_INPUT');
  return text || null;
}

function optionalBoolean(value: unknown) {
  if (typeof value !== 'boolean') throw new WorkforceCatalogError('INVALID_INPUT');
  return value;
}

function validEmail(value: string | null) {
  return !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function priceValue(value: unknown) {
  const price = Number(value);
  if (!Number.isFinite(price) || price < 0 || price > 1_000_000) {
    throw new WorkforceCatalogError('INVALID_INPUT');
  }
  return Math.round((price + Number.EPSILON) * 100) / 100;
}

export async function createWorkforcePosition(
  database: WorkforceDatabase,
  actor: AuthUser,
  input: { name?: unknown; departmentId?: unknown },
) {
  await assertCatalogAccess(database, actor);
  const name = requiredText(input.name, 120);
  const departmentId = requiredText(input.departmentId, 100);
  return database.$transaction(async (transaction) => {
    await transaction.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`workforce-position:${name.toLocaleLowerCase('en-US')}`}, 0))`);
    const department = await transaction.department.findFirst({ where: { id: departmentId, isActive: true }, select: { id: true } });
    if (!department) throw new WorkforceCatalogError('INVALID_REFERENCE');
    const duplicate = await transaction.workforcePosition.findFirst({
      where: { name: { equals: name, mode: 'insensitive' } }, select: { id: true },
    });
    if (duplicate) throw new WorkforceCatalogError('DUPLICATE');
    const position = await transaction.workforcePosition.create({ data: { name, departmentId } });
    await transaction.auditLog.create({
      data: { userId: actor.id, userName: actorName(actor), action: AuditAction.CREATE, entityType: 'WorkforcePosition', entityId: position.id, details: `Created workforce position ${name}`, outcome: 'SUCCESS', reason: 'Procurement added an active service position to the approved catalog', afterState: serializeWorkforcePositionAuditState(position) },
    });
    return position;
  });
}

export async function updateWorkforcePosition(
  database: WorkforceDatabase,
  actor: AuthUser,
  positionId: string,
  input: { name?: unknown; departmentId?: unknown; isActive?: unknown },
) {
  await assertCatalogAccess(database, actor);
  return database.$transaction(async (transaction) => {
    await transaction.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${positionId}, 0))`);
    const existing = await transaction.workforcePosition.findUnique({ where: { id: positionId } });
    if (!existing) throw new WorkforceCatalogError('NOT_FOUND');
    const data: { name?: string; departmentId?: string | null; isActive?: boolean } = {};
    if (input.name !== undefined) {
      data.name = requiredText(input.name, 120);
      const duplicate = await transaction.workforcePosition.findFirst({
        where: { id: { not: positionId }, name: { equals: data.name, mode: 'insensitive' } }, select: { id: true },
      });
      if (duplicate) throw new WorkforceCatalogError('DUPLICATE');
    }
    if (input.departmentId !== undefined) {
      if (input.departmentId === null || input.departmentId === '') data.departmentId = null;
      else {
        data.departmentId = requiredText(input.departmentId, 100);
        const department = await transaction.department.findFirst({ where: { id: data.departmentId, isActive: true }, select: { id: true } });
        if (!department) throw new WorkforceCatalogError('INVALID_REFERENCE');
      }
    }
    if (input.isActive !== undefined) data.isActive = optionalBoolean(input.isActive);
    if (!Object.keys(data).length) throw new WorkforceCatalogError('INVALID_INPUT');
    const position = await transaction.workforcePosition.update({ where: { id: positionId }, data });
    await transaction.auditLog.create({
      data: { userId: actor.id, userName: actorName(actor), action: AuditAction.UPDATE, entityType: 'WorkforcePosition', entityId: positionId, details: `Updated workforce position ${existing.name}: ${Object.keys(data).join(', ')}`, outcome: 'SUCCESS', reason: 'Procurement changed service-position catalog metadata', beforeState: serializeWorkforcePositionAuditState(existing), afterState: serializeWorkforcePositionAuditState(position) },
    });
    return position;
  });
}

export async function createWorkforceVendor(
  database: WorkforceDatabase,
  actor: AuthUser,
  input: { name?: unknown; contactEmail?: unknown; phone?: unknown; insuranceNotes?: unknown },
  notificationOptions: WorkforceNotificationOptions,
) {
  await assertCatalogAccess(database, actor);
  const name = requiredText(input.name, 160);
  const contactEmail = optionalText(input.contactEmail, 254)?.toLocaleLowerCase('en-US') || null;
  const phone = optionalText(input.phone, 50);
  const insuranceNotes = optionalText(input.insuranceNotes, 4000);
  if (!validEmail(contactEmail)) throw new WorkforceCatalogError('INVALID_INPUT');
  return database.$transaction(async (transaction) => {
    await transaction.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`workforce-vendor:${name.toLocaleLowerCase('en-US')}`}, 0))`);
    const duplicate = await transaction.vendor.findFirst({
      where: { name: { equals: name, mode: 'insensitive' } }, select: { id: true },
    });
    if (duplicate) throw new WorkforceCatalogError('DUPLICATE');
    const userName = actorName(actor);
    const vendor = await transaction.vendor.create({
      data: {
        name, contactEmail, phone, insuranceNotes,
        isApproved: false,
        approvalStatus: VendorApprovalStatus.PENDING_APPROVAL,
        approvalSteps: DEFAULT_VENDOR_APPROVAL_STEPS,
        submittedById: actor.id,
        submittedAt: new Date(),
        approvalEvents: { create: { action: 'SUBMITTED', userId: actor.id, userName, comment: 'Submitted by Procurement' } },
      },
      include: { approvalEvents: true, serviceRates: { include: { position: true } } },
    });
    await transaction.auditLog.create({
      data: { userId: actor.id, userName, action: AuditAction.CREATE, entityType: 'Vendor', entityId: vendor.id, details: `Created and submitted workforce vendor ${name}`, outcome: 'SUCCESS', reason: 'Procurement created a vendor and submitted it to the configured approval route', afterState: serializeWorkforceVendorAuditState(vendor) },
    });
    await queueVendorApprovalNotifications(transaction, vendor, notificationOptions);
    return { vendor };
  });
}

export async function updateWorkforceVendor(
  database: WorkforceDatabase,
  actor: AuthUser,
  vendorId: string,
  input: { name?: unknown; contactEmail?: unknown; phone?: unknown; insuranceNotes?: unknown; replacementRequested?: unknown; isActive?: unknown },
  notificationOptions: WorkforceNotificationOptions,
) {
  await assertCatalogAccess(database, actor);
  return database.$transaction(async (transaction) => {
    await transaction.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${vendorId}, 0))`);
    const existing = await transaction.vendor.findUnique({ where: { id: vendorId } });
    if (!existing) throw new WorkforceCatalogError('NOT_FOUND');
    const data: {
      name?: string; contactEmail?: string | null; phone?: string | null; insuranceNotes?: string | null;
      replacementRequested?: boolean; isActive?: boolean; isApproved?: boolean; approvalStatus?: VendorApprovalStatus;
      approvalSteps?: string; currentStepIndex?: number; submittedById?: string; submittedAt?: Date;
      approvedAt?: null; rejectionReason?: null;
    } = {};
    if (input.name !== undefined) {
      data.name = requiredText(input.name, 160);
      const duplicate = await transaction.vendor.findFirst({
        where: { id: { not: vendorId }, name: { equals: data.name, mode: 'insensitive' } }, select: { id: true },
      });
      if (duplicate) throw new WorkforceCatalogError('DUPLICATE');
    }
    if (input.contactEmail !== undefined) {
      data.contactEmail = optionalText(input.contactEmail, 254)?.toLocaleLowerCase('en-US') || null;
      if (!validEmail(data.contactEmail)) throw new WorkforceCatalogError('INVALID_INPUT');
    }
    if (input.phone !== undefined) data.phone = optionalText(input.phone, 50);
    if (input.insuranceNotes !== undefined) data.insuranceNotes = optionalText(input.insuranceNotes, 4000);
    if (input.replacementRequested !== undefined) data.replacementRequested = optionalBoolean(input.replacementRequested);
    if (input.isActive !== undefined) data.isActive = optionalBoolean(input.isActive);
    if (!Object.keys(data).length) throw new WorkforceCatalogError('INVALID_INPUT');

    const materialFields = ['name', 'contactEmail', 'phone', 'insuranceNotes'] as const;
    const hasMaterialChange = materialFields.some((field) => field in data && data[field] !== existing[field]);
    const needsResubmission = existing.approvalStatus === VendorApprovalStatus.APPROVED && hasMaterialChange;
    if (needsResubmission) {
      Object.assign(data, {
        isApproved: false,
        approvalStatus: VendorApprovalStatus.PENDING_APPROVAL,
        approvalSteps: DEFAULT_VENDOR_APPROVAL_STEPS,
        currentStepIndex: 0,
        submittedById: actor.id,
        submittedAt: new Date(),
        approvedAt: null,
        rejectionReason: null,
      });
    }
    const userName = actorName(actor);
    const vendor = await transaction.vendor.update({
      where: { id: vendorId },
      data: {
        ...data,
        ...(needsResubmission && { approvalEvents: { create: { action: 'RESUBMITTED', userId: actor.id, userName, comment: 'Material vendor details changed' } } }),
      },
      include: { approvalEvents: { orderBy: { signedAt: 'desc' } }, serviceRates: { include: { position: true } } },
    });
    await transaction.auditLog.create({
      data: { userId: actor.id, userName, action: AuditAction.UPDATE, entityType: 'Vendor', entityId: vendorId, details: `Updated vendor ${existing.name}: ${Object.keys(data).join(', ')}${needsResubmission ? '; approval reset' : ''}`, outcome: 'SUCCESS', reason: needsResubmission ? 'Material vendor data changed and approval was reset' : 'Procurement updated vendor lifecycle or profile metadata', beforeState: serializeWorkforceVendorAuditState(existing), afterState: serializeWorkforceVendorAuditState(vendor) },
    });
    if (needsResubmission) await queueVendorApprovalNotifications(transaction, vendor, notificationOptions);
    return { vendor };
  });
}

export async function disableWorkforceVendor(database: WorkforceDatabase, actor: AuthUser, vendorId: string) {
  await assertCatalogAccess(database, actor);
  return database.$transaction(async (transaction) => {
    await transaction.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${vendorId}, 0))`);
    const vendor = await transaction.vendor.findUnique({ where: { id: vendorId }, select: { id: true, name: true, isActive: true } });
    if (!vendor) throw new WorkforceCatalogError('NOT_FOUND');
    if (!vendor.isActive) return { ok: true, alreadyProcessed: true };
    const disabled = await transaction.vendor.update({ where: { id: vendorId }, data: { isActive: false, serviceRates: { updateMany: { where: { isActive: true }, data: { isActive: false } } } } });
    await transaction.auditLog.create({
      data: { userId: actor.id, userName: actorName(actor), action: AuditAction.UPDATE, entityType: 'Vendor', entityId: vendorId, details: `Disabled workforce vendor ${vendor.name} and its active rates`, outcome: 'SUCCESS', reason: 'Procurement deactivated the vendor and all active catalog rates', beforeState: serializeWorkforceVendorAuditState(vendor), afterState: serializeWorkforceVendorAuditState(disabled) },
    });
    return { ok: true };
  });
}

export async function upsertWorkforceRate(
  database: WorkforceDatabase,
  actor: AuthUser,
  input: { vendorId?: unknown; positionId?: unknown; unit?: unknown; price?: unknown; currency?: unknown; uom?: unknown; requirements?: unknown },
) {
  await assertCatalogAccess(database, actor);
  const vendorId = requiredText(input.vendorId, 100);
  const positionId = requiredText(input.positionId, 100);
  if (!Object.values(WorkforceRateUnit).includes(input.unit as WorkforceRateUnit)) throw new WorkforceCatalogError('INVALID_INPUT');
  const unit = input.unit as WorkforceRateUnit;
  const price = priceValue(input.price);
  const currency = requiredText(input.currency || 'AZN', 3).toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new WorkforceCatalogError('INVALID_INPUT');
  const uom = requiredText(input.uom || 'Each', 50);
  const requirements = optionalText(input.requirements, 2000);
  return database.$transaction(async (transaction) => {
    const lockKey = `workforce-rate:${vendorId}:${positionId}:${unit}`;
    await transaction.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`);
    const [vendor, position, existing] = await Promise.all([
      transaction.vendor.findUnique({ where: { id: vendorId }, select: { id: true, isActive: true } }),
      transaction.workforcePosition.findUnique({ where: { id: positionId }, select: { id: true, isActive: true } }),
      transaction.vendorServiceRate.findUnique({ where: { vendorId_positionId_unit: { vendorId, positionId, unit } } }),
    ]);
    if (!vendor?.isActive || !position?.isActive) throw new WorkforceCatalogError('INVALID_REFERENCE');
    const rate = await transaction.vendorServiceRate.upsert({
      where: { vendorId_positionId_unit: { vendorId, positionId, unit } },
      update: { price, currency, uom, requirements, isActive: true },
      create: { vendorId, positionId, unit, price, currency, uom, requirements },
      include: { vendor: true, position: true },
    });
    await transaction.auditLog.create({
      data: { userId: actor.id, userName: actorName(actor), action: existing ? AuditAction.UPDATE : AuditAction.CREATE, entityType: 'VendorServiceRate', entityId: rate.id, details: `${existing ? 'Updated' : 'Created'} ${rate.vendor.name} / ${rate.position.name} / ${unit}: ${price.toFixed(2)} ${currency}`, outcome: 'SUCCESS', reason: existing ? 'Procurement replaced the active vendor service rate' : 'Procurement added a vendor service rate', beforeState: serializeWorkforceRateAuditState(existing), afterState: serializeWorkforceRateAuditState(rate) },
    });
    return rate;
  });
}

export async function updateWorkforceRate(
  database: WorkforceDatabase,
  actor: AuthUser,
  rateId: string,
  input: { price?: unknown; requirements?: unknown; isActive?: unknown },
) {
  await assertCatalogAccess(database, actor);
  return database.$transaction(async (transaction) => {
    await transaction.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${rateId}, 0))`);
    const existing = await transaction.vendorServiceRate.findUnique({ where: { id: rateId }, include: { vendor: true, position: true } });
    if (!existing) throw new WorkforceCatalogError('NOT_FOUND');
    const data: { price?: number; requirements?: string | null; isActive?: boolean } = {};
    if (input.price !== undefined) data.price = priceValue(input.price);
    if (input.requirements !== undefined) data.requirements = optionalText(input.requirements, 2000);
    if (input.isActive !== undefined) data.isActive = optionalBoolean(input.isActive);
    if (!Object.keys(data).length) throw new WorkforceCatalogError('INVALID_INPUT');
    const rate = await transaction.vendorServiceRate.update({ where: { id: rateId }, data, include: { vendor: true, position: true } });
    await transaction.auditLog.create({
      data: { userId: actor.id, userName: actorName(actor), action: AuditAction.UPDATE, entityType: 'VendorServiceRate', entityId: rateId, details: `Updated ${existing.vendor.name} / ${existing.position.name}: ${Object.keys(data).join(', ')}`, outcome: 'SUCCESS', reason: 'Procurement updated price, requirements, or catalog availability', beforeState: serializeWorkforceRateAuditState(existing), afterState: serializeWorkforceRateAuditState(rate) },
    });
    return rate;
  });
}

export async function disableWorkforceRate(database: WorkforceDatabase, actor: AuthUser, rateId: string) {
  await assertCatalogAccess(database, actor);
  return database.$transaction(async (transaction) => {
    await transaction.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${rateId}, 0))`);
    const rate = await transaction.vendorServiceRate.findUnique({ where: { id: rateId }, include: { vendor: true, position: true } });
    if (!rate) throw new WorkforceCatalogError('NOT_FOUND');
    if (!rate.isActive) return { ok: true, alreadyProcessed: true };
    const disabled = await transaction.vendorServiceRate.update({ where: { id: rateId }, data: { isActive: false } });
    await transaction.auditLog.create({
      data: { userId: actor.id, userName: actorName(actor), action: AuditAction.UPDATE, entityType: 'VendorServiceRate', entityId: rateId, details: `Disabled ${rate.vendor.name} / ${rate.position.name} / ${rate.unit}`, outcome: 'SUCCESS', reason: 'Procurement removed this rate from active request selection', beforeState: serializeWorkforceRateAuditState(rate), afterState: serializeWorkforceRateAuditState(disabled) },
    });
    return { ok: true };
  });
}
