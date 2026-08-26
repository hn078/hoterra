import type * as DatabaseModule from '../../../db';
import type { WorkforceNotificationOptions } from './workforceNotificationOutbox';
import { generateRecurringWorkforceRequests } from './generateRecurringWorkforceRequests';
import { reconcileWorkforceLifecycle } from './reconcileWorkforceLifecycle';

type WorkforceDatabase = typeof DatabaseModule.prisma;

/** Runs the tenant-local lifecycle reconciliation and recurring request generator. */
export async function runWorkforceAutomation(
  database: WorkforceDatabase,
  notificationOptions: WorkforceNotificationOptions,
  now = new Date(),
) {
  const lifecycle = await reconcileWorkforceLifecycle(database, now);
  const recurring = await generateRecurringWorkforceRequests(database, notificationOptions, now);
  return { lifecycle, ...recurring };
}
