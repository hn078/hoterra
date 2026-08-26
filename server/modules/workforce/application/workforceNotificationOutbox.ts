import { Role } from '@prisma/client';
import type * as DatabaseModule from '../../../db';

type WorkforceDatabase = typeof DatabaseModule.prisma;
type NotificationTransaction = Pick<
  WorkforceDatabase,
  'workforceSettings' | 'user' | 'notification' | 'emailOutbox'
>;

export type WorkforceNotificationOptions = {
  applicationBaseUrl: string;
  emailDeliveryEnabled: boolean;
};

type VendorApprovalStep = { role: Role; label: string };
type RequestApprovalStep = VendorApprovalStep & {
  approverUserId?: string;
  approverDepartmentId?: string;
};

function parseVendorApprovalSteps(value: string): VendorApprovalStep[] {
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

function parseRequestApprovalSteps(value: string): RequestApprovalStep[] {
  try {
    const parsed = JSON.parse(value) as Array<Partial<RequestApprovalStep>>;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((step): step is RequestApprovalStep =>
      typeof step.label === 'string' && Object.values(Role).includes(step.role as Role)
    );
  } catch {
    return [];
  }
}

export async function queueRequestApprovalNotifications(
  transaction: NotificationTransaction,
  request: {
    id: string;
    code: string;
    departmentId: string;
    approvalSteps: string;
    currentStepIndex: number;
  },
  options: WorkforceNotificationOptions,
) {
  const step = parseRequestApprovalSteps(request.approvalSteps)[request.currentStepIndex];
  if (!step) return { notificationCount: 0, emailCount: 0 };
  const [settings, users] = await Promise.all([
    transaction.workforceSettings.findFirst({ select: { notifyPush: true, notifyEmail: true } }),
    transaction.user.findMany({
      where: step.approverUserId
        ? {
            isActive: true,
            id: step.approverUserId,
          }
        : {
            isActive: true,
            role: step.role,
            ...(step.role === Role.HOD
              ? {
                  departmentId: step.approverDepartmentId || request.departmentId,
                }
              : {}),
          },
      select: {
        id: true,
        email: true,
        firstName: true,
        notificationPreference: { select: { emailEnabled: true } },
      },
    }),
  ]);
  const link = `/workforce/${request.id}`;
  const baseUrl = options.applicationBaseUrl.replace(/\/$/, '');
  if (settings?.notifyPush !== false && users.length) {
    await transaction.notification.createMany({
      data: users.map((user) => ({
        userId: user.id,
        title: 'Casual staff approval required',
        message: `Request ${request.code} needs your approval (${step.label})`,
        type: 'workforce',
        link,
        entityType: 'WorkforceRequest',
        entityId: request.id,
        actionType: 'WORKFORCE_APPROVAL',
      })),
    });
  }
  const emailUsers = settings?.notifyEmail === false
    ? []
    : users.filter((user) => Boolean(user.email) && user.notificationPreference?.emailEnabled !== false);
  if (emailUsers.length) {
    await transaction.emailOutbox.createMany({
      data: emailUsers.map((user) => ({
        toEmail: user.email!.trim().toLowerCase(),
        subject: `[HOTERRA] Approval needed: ${request.code}`,
        body: `Hi ${user.firstName},\n\nRequest ${request.code} needs your approval (${step.label}).\n\nOpen: ${baseUrl}${link}\n`,
        entityType: 'WorkforceRequest',
        entityId: request.id,
        status: options.emailDeliveryEnabled ? 'QUEUED' : 'DISABLED',
      })),
    });
  }
  return {
    notificationCount: settings?.notifyPush === false ? 0 : users.length,
    emailCount: emailUsers.length,
  };
}

export async function queueVendorApprovalNotifications(
  transaction: NotificationTransaction,
  vendor: { id: string; name: string; approvalSteps: string; currentStepIndex: number },
  options: WorkforceNotificationOptions,
) {
  const step = parseVendorApprovalSteps(vendor.approvalSteps)[vendor.currentStepIndex];
  if (!step) return { notificationCount: 0, emailCount: 0 };

  const [settings, users] = await Promise.all([
    transaction.workforceSettings.findFirst({ select: { notifyPush: true, notifyEmail: true } }),
    transaction.user.findMany({
      where: { isActive: true, role: step.role },
      select: {
        id: true,
        email: true,
        firstName: true,
        notificationPreference: { select: { emailEnabled: true } },
      },
    }),
  ]);
  const link = '/workforce?tab=catalog';
  const baseUrl = options.applicationBaseUrl.replace(/\/$/, '');

  if (settings?.notifyPush !== false && users.length) {
    await transaction.notification.createMany({
      data: users.map((user) => ({
        userId: user.id,
        title: 'Vendor approval required',
        message: `${vendor.name} needs your approval (${step.label})`,
        type: 'workforce',
        link,
        entityType: 'Vendor',
        entityId: vendor.id,
        actionType: 'VENDOR_APPROVAL',
      })),
    });
  }
  const emailUsers = settings?.notifyEmail === false
    ? []
    : users.filter((user) => Boolean(user.email) && user.notificationPreference?.emailEnabled !== false);
  if (emailUsers.length) {
    await transaction.emailOutbox.createMany({
      data: emailUsers.map((user) => ({
        toEmail: user.email!.trim().toLowerCase(),
        subject: `[HOTERRA] Vendor approval needed: ${vendor.name}`,
        body: `Hi ${user.firstName},\n\n${vendor.name} needs your approval (${step.label}).\n\nOpen: ${baseUrl}${link}\n`,
        entityType: 'Vendor',
        entityId: vendor.id,
        status: options.emailDeliveryEnabled ? 'QUEUED' : 'DISABLED',
      })),
    });
  }
  return {
    notificationCount: settings?.notifyPush === false ? 0 : users.length,
    emailCount: emailUsers.length,
  };
}
