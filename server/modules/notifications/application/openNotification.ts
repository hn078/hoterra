import { Prisma } from '@prisma/client';
import type * as DatabaseModule from '../../../db';
import type { AuthUser } from '../../../middleware/auth';
import { documentApprovalActionScope, getDocumentDetail } from '../../documents';
import { getWorkforceRequestDetail, listPendingWorkforceTasks } from '../../workforce';
import { resolveNotificationDestination } from './resolveNotificationDestination';

type NotificationDatabase = typeof DatabaseModule.prisma;

export type NotificationOpenResult = {
  state: 'AVAILABLE' | 'COMPLETED' | 'UNAVAILABLE';
  destination: string | null;
  completedAt?: Date | null;
  completedByName?: string | null;
};

function objectTarget(destination: string) {
  const url = new URL(destination, 'https://hoterra.invalid');
  const documentMatch = url.pathname.match(/^\/(?:documents|approvals)\/([^/]+)(?:\/review)?$/);
  if (documentMatch) return { type: 'DOCUMENT' as const, id: documentMatch[1] };

  const workforceMatch = url.pathname.match(/^\/workforce\/([^/]+)$/);
  if (workforceMatch) return { type: 'WORKFORCE' as const, id: workforceMatch[1] };

  return null;
}

const WORKFORCE_ACTION_LABELS: Readonly<Record<string, string>> = {
  WORKFORCE_APPROVAL: 'Review workforce request',
  PROCUREMENT_CONFIRMATION: 'Confirm selected vendors',
  VENDOR_CORRECTION_REVIEW: 'Review vendor changes',
  PROCUREMENT_CORRECTION_REVISION: 'Revise vendor changes',
  WORKFORCE_FINAL_EVALUATION: 'Complete final vendor evaluation',
};

/**
 * Resolve a notification click on the server. Capability filtering alone is
 * insufficient for object links: the authoritative document/workforce read
 * model also verifies tenant, department, assignment, and participation scope.
 * Dead or revoked targets are marked read but never reveal whether the object
 * exists.
 */
export async function openNotification(
  database: NotificationDatabase,
  actor: AuthUser,
  notificationId: string,
): Promise<NotificationOpenResult | null> {
  const notification = await database.notification.findFirst({
    where: { id: notificationId, userId: actor.id },
    select: {
      id: true,
      link: true,
      entityType: true,
      entityId: true,
      actionType: true,
      expiresAt: true,
      actionCompletedAt: true,
      actionCompletedByName: true,
    },
  });
  if (!notification) return null;

  const destination = resolveNotificationDestination(notification.link, actor.capabilities);
  let available = Boolean(destination);
  let completedAt = notification.actionCompletedAt;

  if (destination) {
    const target = objectTarget(destination);
    try {
      if (target?.type === 'DOCUMENT') {
        await getDocumentDetail(database, actor, target.id);
        if (notification.actionType === 'DOCUMENT_APPROVAL' && !completedAt) {
          const pending = await database.document.count({
            where: {
              AND: [
                { id: target.id },
                documentApprovalActionScope(actor) as Prisma.DocumentWhereInput,
              ],
            },
          });
          if (!pending) completedAt = new Date();
        }
      } else if (target?.type === 'WORKFORCE') {
        await getWorkforceRequestDetail(database, actor, target.id);
        const expectedAction = notification.actionType
          ? WORKFORCE_ACTION_LABELS[notification.actionType]
          : undefined;
        if (expectedAction && !completedAt) {
          const pendingTasks = await listPendingWorkforceTasks(database, actor, 200);
          if (!pendingTasks.some((task) => task.id === target.id && task.action === expectedAction)) {
            completedAt = new Date();
          }
        }
      }
    } catch {
      available = false;
    }
  }

  if (
    available &&
    !completedAt &&
    notification.actionType === 'VENDOR_APPROVAL' &&
    notification.entityType === 'Vendor' &&
    notification.entityId
  ) {
    const vendor = await database.vendor.findUnique({
      where: { id: notification.entityId },
      select: { approvalStatus: true, currentStepIndex: true, approvalSteps: true },
    });
    if (!vendor) {
      available = false;
    } else {
      let expectedRole: string | undefined;
      try {
        const steps = JSON.parse(vendor.approvalSteps) as Array<{ role?: string }>;
        expectedRole = steps[vendor.currentStepIndex]?.role;
      } catch {
        expectedRole = undefined;
      }
      if (vendor.approvalStatus !== 'PENDING_APPROVAL' || expectedRole !== actor.role) {
        completedAt = new Date();
      }
    }
  }

  if (!completedAt && notification.expiresAt && notification.expiresAt <= new Date()) {
    completedAt = notification.expiresAt;
  }

  await database.notification.updateMany({
    where: { id: notification.id, userId: actor.id },
    data: {
      isRead: true,
      ...(completedAt && !notification.actionCompletedAt ? { actionCompletedAt: completedAt } : {}),
    },
  });

  if (!available) return { state: 'UNAVAILABLE', destination: null };
  if (completedAt) {
    return {
      state: 'COMPLETED',
      destination,
      completedAt,
      completedByName: notification.actionCompletedByName,
    };
  }
  return { state: 'AVAILABLE', destination };
}
