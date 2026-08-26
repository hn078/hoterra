import { runtimeConfig } from '../config';
import { prisma } from '../db';
import { appUrl } from '../lib/mail';
import type { Request } from 'express';
import { getWorkforceRequestDetail } from '../modules/workforce';

export function workforceNotificationOptions() {
  return {
    applicationBaseUrl: appUrl(''),
    emailDeliveryEnabled: runtimeConfig.emailDeliveryEnabled,
  };
}

export function workforceRequestDetailForViewer(req: Request, requestId: string) {
  return getWorkforceRequestDetail(prisma, req.user!, requestId);
}
