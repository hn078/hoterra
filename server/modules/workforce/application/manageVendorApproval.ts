import { AuditAction, Role, VendorApprovalStatus } from '@prisma/client';
import type * as DatabaseModule from '../../../db';
import type { AuthUser } from '../../../middleware/auth';
import {
  queueVendorApprovalNotifications,
  type WorkforceNotificationOptions,
} from './workforceNotificationOutbox';
import { serializeWorkforceVendorAuditState } from './workforceAuditState';

type WorkforceDatabase = typeof DatabaseModule.prisma;

interface VendorApprovalStep {
  role: Role;
  label: string;
}

export type VendorApprovalErrorCode =
  | 'NOT_FOUND'
  | 'INVALID_STATE'
  | 'FORBIDDEN'
  | 'COMMENT_REQUIRED'
  | 'CONFLICT';

export class VendorApprovalError extends Error {
  constructor(public readonly code: VendorApprovalErrorCode) {
    super(code);
    this.name = 'VendorApprovalError';
  }
}

function parseSteps(value: string): VendorApprovalStep[] {
  try {
    const parsed = JSON.parse(value) as Array<{ role?: unknown; label?: unknown }>;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((step): step is VendorApprovalStep =>
      typeof step.label === 'string' && Object.values(Role).includes(step.role as Role)
    );
  } catch {
    return [];
  }
}

function canApprove(actor: AuthUser, steps: VendorApprovalStep[], currentStepIndex: number) {
  return actor.capabilities.includes('workforce.read') && steps[currentStepIndex]?.role === actor.role;
}

const vendorResultInclude = {
  approvalEvents: { orderBy: { signedAt: 'desc' as const } },
  serviceRates: { include: { position: true } },
};

/** Atomically approves the current vendor step and records evidence/audit. */
export async function approveVendor(
  database: WorkforceDatabase,
  actor: AuthUser,
  vendorId: string,
  input: { comment?: string },
  notificationOptions: WorkforceNotificationOptions,
) {
  return database.$transaction(async (transaction) => {
    const vendor = await transaction.vendor.findUnique({ where: { id: vendorId } });
    if (!vendor) throw new VendorApprovalError('NOT_FOUND');
    if (vendor.approvalStatus !== VendorApprovalStatus.PENDING_APPROVAL) {
      throw new VendorApprovalError('INVALID_STATE');
    }

    const steps = parseSteps(vendor.approvalSteps);
    const step = steps[vendor.currentStepIndex];
    if (!step || !canApprove(actor, steps, vendor.currentStepIndex)) {
      throw new VendorApprovalError('FORBIDDEN');
    }

    const isLast = vendor.currentStepIndex >= steps.length - 1;
    const update = await transaction.vendor.updateMany({
      where: {
        id: vendorId,
        approvalStatus: VendorApprovalStatus.PENDING_APPROVAL,
        currentStepIndex: vendor.currentStepIndex,
      },
      data: {
        approvalStatus: isLast ? VendorApprovalStatus.APPROVED : VendorApprovalStatus.PENDING_APPROVAL,
        currentStepIndex: isLast ? vendor.currentStepIndex : vendor.currentStepIndex + 1,
        isApproved: isLast,
        approvedAt: isLast ? new Date() : null,
        rejectionReason: null,
      },
    });
    if (update.count === 0) throw new VendorApprovalError('CONFLICT');

    await transaction.notification.updateMany({
      where: {
        userId: actor.id,
        entityType: 'Vendor',
        entityId: vendorId,
        actionType: 'VENDOR_APPROVAL',
        actionCompletedAt: null,
      },
      data: {
        isRead: true,
        actionCompletedAt: new Date(),
        actionCompletedById: actor.id,
        actionCompletedByName: `${actor.firstName} ${actor.lastName}`,
      },
    });

    const actorName = `${actor.firstName} ${actor.lastName}`;
    await transaction.vendorApprovalEvent.create({
      data: {
        vendorId,
        action: isLast ? 'APPROVED' : 'STEP_APPROVED',
        stepIndex: vendor.currentStepIndex,
        role: actor.role,
        userId: actor.id,
        userName: actorName,
        comment: input.comment?.trim().slice(0, 2000) || step.label,
      },
    });
    const updatedVendor = await transaction.vendor.findUniqueOrThrow({
      where: { id: vendorId },
      include: vendorResultInclude,
    });
    await transaction.auditLog.create({
      data: {
        userId: actor.id,
        userName: actorName,
        action: AuditAction.APPROVE,
        entityType: 'Vendor',
        entityId: vendorId,
        details: `${isLast ? 'Approved' : 'Approved step for'} vendor ${vendor.name} (${step.label})`,
        outcome: 'SUCCESS',
        reason: isLast ? 'Final configured approver approved vendor catalog eligibility' : `${step.label} approved the current vendor review step`,
        beforeState: serializeWorkforceVendorAuditState(vendor),
        afterState: serializeWorkforceVendorAuditState(updatedVendor),
      },
    });

    if (!isLast) await queueVendorApprovalNotifications(transaction, updatedVendor, notificationOptions);
    return { vendor: updatedVendor, isLast };
  });
}

/** Atomically rejects a pending vendor and records evidence/audit. */
export async function rejectVendor(
  database: WorkforceDatabase,
  actor: AuthUser,
  vendorId: string,
  input: { reason?: string } = {},
) {
  const reason = input.reason?.trim().slice(0, 2000) || '';
  if (!reason) throw new VendorApprovalError('COMMENT_REQUIRED');

  return database.$transaction(async (transaction) => {
    const vendor = await transaction.vendor.findUnique({ where: { id: vendorId } });
    if (!vendor) throw new VendorApprovalError('NOT_FOUND');
    if (vendor.approvalStatus !== VendorApprovalStatus.PENDING_APPROVAL) {
      throw new VendorApprovalError('INVALID_STATE');
    }

    const steps = parseSteps(vendor.approvalSteps);
    if (!steps[vendor.currentStepIndex] || !canApprove(actor, steps, vendor.currentStepIndex)) {
      throw new VendorApprovalError('FORBIDDEN');
    }

    const update = await transaction.vendor.updateMany({
      where: {
        id: vendorId,
        approvalStatus: VendorApprovalStatus.PENDING_APPROVAL,
        currentStepIndex: vendor.currentStepIndex,
      },
      data: {
        approvalStatus: VendorApprovalStatus.REJECTED,
        isApproved: false,
        approvedAt: null,
        rejectionReason: reason,
      },
    });
    if (update.count === 0) throw new VendorApprovalError('CONFLICT');

    await transaction.notification.updateMany({
      where: {
        userId: actor.id,
        entityType: 'Vendor',
        entityId: vendorId,
        actionType: 'VENDOR_APPROVAL',
        actionCompletedAt: null,
      },
      data: {
        isRead: true,
        actionCompletedAt: new Date(),
        actionCompletedById: actor.id,
        actionCompletedByName: `${actor.firstName} ${actor.lastName}`,
      },
    });

    const actorName = `${actor.firstName} ${actor.lastName}`;
    await transaction.vendorApprovalEvent.create({
      data: {
        vendorId,
        action: 'REJECTED',
        stepIndex: vendor.currentStepIndex,
        role: actor.role,
        userId: actor.id,
        userName: actorName,
        comment: reason,
      },
    });
    const rejectedVendor = await transaction.vendor.findUniqueOrThrow({ where: { id: vendorId }, include: vendorResultInclude });
    await transaction.auditLog.create({
      data: {
        userId: actor.id,
        userName: actorName,
        action: AuditAction.REJECT,
        entityType: 'Vendor',
        entityId: vendorId,
        details: `Rejected vendor ${vendor.name}`,
        outcome: 'SUCCESS',
        reason: 'Current configured approver rejected the vendor; reason digest retained in structured evidence',
        beforeState: serializeWorkforceVendorAuditState(vendor),
        afterState: serializeWorkforceVendorAuditState(rejectedVendor),
      },
    });

    return rejectedVendor;
  });
}
