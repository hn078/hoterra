import { AuditAction, Role, WorkforceRequestStatus } from '@prisma/client';
import type * as DatabaseModule from '../../../db';
import { resolveEffectiveCapabilities } from '../../access-control';

type WorkforceDatabase = typeof DatabaseModule.prisma;

const ENDABLE_STATUSES: WorkforceRequestStatus[] = [
  WorkforceRequestStatus.VENDOR_ACCEPTED,
  WorkforceRequestStatus.VENDORS_FULLY_APPROVED,
  WorkforceRequestStatus.IN_SERVICE,
];

export type WorkforceLifecycleResult = {
  transitionedRequestIds: string[];
};

function startOfToday(now: Date) {
  const value = new Date(now);
  value.setHours(0, 0, 0, 0);
  return value;
}

/**
 * Advances ended workforce orders from an execution state to final evaluation.
 *
 * This is intentionally an automation use-case, not part of any GET read model.
 * The conditional update makes concurrent scheduler executions idempotent while
 * the event, audit row and notifications remain in the same transaction.
 */
export async function reconcileWorkforceLifecycle(
  database: WorkforceDatabase,
  now = new Date(),
): Promise<WorkforceLifecycleResult> {
  const endedBefore = startOfToday(now);

  return database.$transaction(async (transaction) => {
    const candidates = await transaction.workforceRequest.findMany({
      where: {
        endDate: { lt: endedBefore },
        status: { in: ENDABLE_STATUSES },
      },
      select: {
        id: true,
        code: true,
        status: true,
        departmentId: true,
      },
      orderBy: { endDate: 'asc' },
    });

    const transitionedRequestIds: string[] = [];
    for (const request of candidates) {
      const updated = await transaction.workforceRequest.updateMany({
        where: { id: request.id, status: request.status },
        data: { status: WorkforceRequestStatus.AWAITING_EVALUATION },
      });
      if (updated.count !== 1) continue;

      transitionedRequestIds.push(request.id);
      await transaction.workforceRequestEvent.create({
        data: {
          requestId: request.id,
          action: 'FINAL_EVALUATION_DUE',
          userName: 'System Automation',
          details: `${request.code}: work period ended; final workforce and vendor evaluation is required`,
        },
      });
      await transaction.auditLog.create({
        data: {
          userName: 'System Automation',
          action: AuditAction.UPDATE,
          entityType: 'WorkforceRequest',
          entityId: request.id,
          details: `${request.code}: automatically moved to final evaluation`,
        },
      });

      const recipients = await transaction.user.findMany({
        where: {
          isActive: true,
          role: Role.HOD,
          departmentId: request.departmentId,
        },
        select: {
          id: true,
          role: true,
          customRole: { select: { permissions: true, isActive: true } },
        },
      });
      const eligibleRecipients = recipients.filter((recipient) =>
        resolveEffectiveCapabilities(recipient.role, recipient.customRole).includes('workforce.read')
      );
      if (eligibleRecipients.length) {
        await transaction.notification.createMany({
          data: [...new Set(eligibleRecipients.map((recipient) => recipient.id))].map((userId) => ({
            userId,
            title: 'Final workforce evaluation required',
            message: `${request.code} has ended. Please evaluate the provided staff and vendor.`,
            type: 'workforce',
            link: `/workforce/${request.id}`,
            entityType: 'WorkforceRequest',
            entityId: request.id,
            actionType: 'WORKFORCE_FINAL_EVALUATION',
          })),
        });
      }
    }

    return { transitionedRequestIds };
  });
}
