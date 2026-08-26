import { prisma, systemPrisma } from '../../../db';
import { appUrl } from '../../../lib/mail';
import { runtimeConfig } from '../../../config';
import { runWithTenant } from '../../../lib/tenantContext';
import { runWorkforceAutomation } from '../application/runWorkforceAutomation';

/** Runs lifecycle and recurring generation only for the active tenant context. */
export async function runRecurringTemplatesForCurrentTenant(now = new Date()) {
  const result = await runWorkforceAutomation(prisma, {
    applicationBaseUrl: appUrl(''),
    emailDeliveryEnabled: runtimeConfig.emailDeliveryEnabled,
  }, now);
  const { lifecycle } = result;
  if (lifecycle.transitionedRequestIds.length) {
    console.log(`[workforce-lifecycle] awaiting evaluation: ${lifecycle.transitionedRequestIds.length}`);
  }

  if (result.created.length) {
    console.log(`[recurring] created: ${result.created.map((request) => request.code).join(', ')}`);
  }
  if (result.skipped.some((item) => !/Already generated|no longer due/.test(item.reason))) {
    console.warn('[recurring] skipped templates', result.skipped);
  }
  return result;
}

/** Infrastructure scheduler entry point: explicitly iterates every active tenant. */
export async function runRecurringTemplates(now = new Date()) {
  const tenants = await systemPrisma.tenant.findMany({ where: { isActive: true } });
  const created: string[] = [];
  for (const tenant of tenants) {
    const tenantResult = await runWithTenant(
      { id: tenant.id, slug: tenant.slug, name: tenant.name },
      () => runRecurringTemplatesForCurrentTenant(now),
    );
    created.push(...tenantResult.created.map((request) => request.code));
  }
  return created;
}

let timer: ReturnType<typeof setInterval> | null = null;

export function startRecurringScheduler() {
  if (timer) return;
  setTimeout(() => {
    runRecurringTemplates().catch((error) => console.error('[recurring]', error));
  }, 5000);
  timer = setInterval(
    () => {
      runRecurringTemplates().catch((error) => console.error('[recurring]', error));
    },
    60 * 60 * 1000,
  );
  console.log('[recurring] scheduler started');
}
