import type * as DatabaseModule from '../../../db';
import type { AuthUser } from '../../../middleware/auth';

type NotificationDatabase = typeof DatabaseModule.prisma;

export type NotificationPreferences = {
  emailEnabled: boolean;
  inAppRequired: true;
  browserPushAvailable: false;
  smsAvailable: false;
};

export async function readNotificationPreferences(
  database: NotificationDatabase,
  actor: AuthUser,
): Promise<NotificationPreferences> {
  const preference = await database.userNotificationPreference.findUnique({
    where: { userId: actor.id },
    select: { emailEnabled: true },
  });
  return {
    emailEnabled: preference?.emailEnabled ?? true,
    inAppRequired: true,
    browserPushAvailable: false,
    smsAvailable: false,
  };
}

export async function updateNotificationPreferences(
  database: NotificationDatabase,
  actor: AuthUser,
  input: unknown,
): Promise<NotificationPreferences> {
  if (!input || typeof input !== 'object' || typeof (input as { emailEnabled?: unknown }).emailEnabled !== 'boolean') {
    throw new TypeError('emailEnabled must be a boolean');
  }
  const emailEnabled = (input as { emailEnabled: boolean }).emailEnabled;
  await database.$transaction(async (transaction) => {
    const previous = await transaction.userNotificationPreference.findUnique({
      where: { userId: actor.id },
      select: { emailEnabled: true },
    });
    await transaction.userNotificationPreference.upsert({
      where: { userId: actor.id },
      create: { userId: actor.id, emailEnabled },
      update: { emailEnabled },
    });
    await transaction.auditLog.create({
      data: {
        userId: actor.id,
        action: 'UPDATE',
        entityType: 'UserNotificationPreference',
        entityId: actor.id,
        details: JSON.stringify({
          before: { emailEnabled: previous?.emailEnabled ?? true },
          after: { emailEnabled },
        }),
      },
    });
  });
  return {
    emailEnabled,
    inAppRequired: true,
    browserPushAvailable: false,
    smsAvailable: false,
  };
}
