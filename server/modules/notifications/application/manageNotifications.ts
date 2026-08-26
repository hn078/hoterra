import type * as DatabaseModule from '../../../db';
import type { AuthUser } from '../../../middleware/auth';
import { resolveNotificationDestination } from './resolveNotificationDestination';

type NotificationDatabase = typeof DatabaseModule.prisma;

export async function listNotifications(
  database: NotificationDatabase,
  actor: AuthUser,
) {
  const notifications = await database.notification.findMany({
    where: { userId: actor.id },
    select: {
      id: true,
      title: true,
      message: true,
      type: true,
      isRead: true,
      link: true,
      entityType: true,
      entityId: true,
      actionType: true,
      expiresAt: true,
      actionCompletedAt: true,
      actionCompletedByName: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  return notifications.map((notification) => ({
    id: notification.id,
    title: notification.title,
    message: notification.message,
    type: notification.type,
    isRead: notification.isRead,
    link: resolveNotificationDestination(notification.link, actor.capabilities),
    entityType: notification.entityType,
    entityId: notification.entityId,
    actionType: notification.actionType,
    expiresAt: notification.expiresAt,
    actionCompletedAt: notification.actionCompletedAt,
    actionCompletedByName: notification.actionCompletedByName,
    createdAt: notification.createdAt,
  }));
}

export function countUnreadNotifications(database: NotificationDatabase, actorId: string) {
  return database.notification.count({ where: { userId: actorId, isRead: false } });
}

export async function markNotificationRead(
  database: NotificationDatabase,
  actorId: string,
  notificationId: string,
) {
  const result = await database.notification.updateMany({
    where: { id: notificationId, userId: actorId },
    data: { isRead: true },
  });
  return result.count > 0;
}

export function markAllNotificationsRead(database: NotificationDatabase, actorId: string) {
  return database.notification.updateMany({
    where: { userId: actorId, isRead: false },
    data: { isRead: true },
  });
}
