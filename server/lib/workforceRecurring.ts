import { Role, WorkforceRequestStatus, WorkforceVendorMode } from '@prisma/client';
import { prisma } from '../db';
import {
  addEvent,
  estimateCost,
  getWorkforceSettings,
  nextRequestCode,
  notifyApprovers,
  resolveApprovalSteps,
  serializeApprovalSteps,
} from './workforce';

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function wasGeneratedToday(last: Date | null | undefined) {
  if (!last) return false;
  return startOfDay(last).getTime() === startOfDay(new Date()).getTime();
}

/** Create requests from recurring templates for today's weekday. */
export async function runRecurringTemplates() {
  const today = new Date();
  const day = today.getDay(); // 0=Sun
  const settings = await getWorkforceSettings();

  const templates = await prisma.workforceRequestTemplate.findMany({
    where: {
      isActive: true,
      isRecurring: true,
      dayOfWeek: day,
    },
  });

  const created: string[] = [];

  for (const t of templates) {
    if (wasGeneratedToday(t.lastGeneratedAt)) continue;
    if (!t.departmentId || !t.positionId || !t.vendorId) {
      console.warn(`[recurring] skip template ${t.name}: missing department/position/vendor`);
      continue;
    }

    const workDate = startOfDay(today);
    workDate.setDate(workDate.getDate() + 7); // next week occurrence by default
    // If generating on the target weekday morning, use today + lead buffer of 7 days for planning
    // Spec: "every Friday need 5 waiters" — generate for upcoming Friday (= today if day matches, use today+7 for lead time)
    const leadMs = settings.minLeadHours * 60 * 60 * 1000;
    if (workDate.getTime() - Date.now() < leadMs) {
      workDate.setDate(workDate.getDate() + 7);
    }

    const creator =
      (await prisma.user.findFirst({
        where: { role: Role.SYSTEM_ADMINISTRATOR, isActive: true },
      })) ||
      (await prisma.user.findFirst({
        where: { role: Role.HOD, departmentId: t.departmentId, isActive: true },
      })) ||
      (await prisma.user.findFirst({ where: { isActive: true } }));

    if (!creator) continue;

    const steps = await resolveApprovalSteps(t.departmentId);
    const cost = estimateCost(t.quantity, settings);
    const code = await nextRequestCode();

    const req = await prisma.workforceRequest.create({
      data: {
        code,
        hotelName: t.hotelName || settings.hotelName,
        departmentId: t.departmentId,
        positionId: t.positionId,
        workDate,
        shift: t.shift,
        quantity: t.quantity,
        comment: t.comment
          ? `${t.comment} (auto from template: ${t.name})`
          : `Auto-generated from recurring template: ${t.name}`,
        vendorMode: t.vendorMode || WorkforceVendorMode.DIRECT,
        vendorId: t.vendorId,
        status: WorkforceRequestStatus.PENDING,
        approvalSteps: serializeApprovalSteps(steps),
        estimatedCost: cost,
        createdById: creator.id,
      },
    });

    await addEvent(req.id, 'CREATED', null, `Recurring template "${t.name}"`);
    await prisma.workforceRequestTemplate.update({
      where: { id: t.id },
      data: { lastGeneratedAt: new Date() },
    });

    await notifyApprovers({
      id: req.id,
      code: req.code,
      departmentId: req.departmentId,
      approvalSteps: req.approvalSteps,
      currentStepIndex: 0,
    });

    created.push(req.code);
  }

  if (created.length) {
    console.log(`[recurring] created: ${created.join(', ')}`);
  }
  return created;
}

let timer: ReturnType<typeof setInterval> | null = null;

export function startRecurringScheduler() {
  if (timer) return;
  // Run shortly after boot, then hourly
  setTimeout(() => {
    runRecurringTemplates().catch((e) => console.error('[recurring]', e));
  }, 5000);
  timer = setInterval(
    () => {
      runRecurringTemplates().catch((e) => console.error('[recurring]', e));
    },
    60 * 60 * 1000
  );
  console.log('[recurring] scheduler started');
}
