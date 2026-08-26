import { Role, WorkforceEvaluationPhase, WorkforceRequestStatus } from '@prisma/client';
import type * as DatabaseModule from '../../../db';
import { canApproveCurrentStep } from './workforceRequestSerialization';
import type { AuthUser } from '../../../middleware/auth';
import { canConfirmProcurementSelection, canManageProcurementWorkforce } from './procurementAccess';
import { canReviewVendorCorrection } from './decideVendorCorrectionReview';

type WorkforceDatabase = typeof DatabaseModule.prisma;

type WorkforceTaskAccess = {
  procurementManager: boolean;
  procurementConfirmer: boolean;
};

type WorkforceTaskCandidate = {
  status: WorkforceRequestStatus;
  departmentId: string;
  currentStepIndex: number;
  approvalSteps: string;
  vendorId: string | null;
  acceptedVendorId: string | null;
  actualQuantity: number | null;
  hodConfirmedAt: Date | null;
  financeConfirmedAt: Date | null;
  items: Array<{ vendorId: string | null }>;
  evaluations: Array<{ vendorId: string; phase: WorkforceEvaluationPhase }>;
  vendorCorrectionReviews: Array<{ status: string }>;
};

export function workforceTaskAction(
  actor: AuthUser,
  request: WorkforceTaskCandidate,
  access: WorkforceTaskAccess,
): string | null {
  const correctionReview = request.vendorCorrectionReviews.find((review) =>
    ['DRAFT', 'PENDING_FD', 'PENDING_GM'].includes(review.status)
  );
  if (correctionReview && canReviewVendorCorrection(actor.role, correctionReview.status)) {
    return 'Review vendor changes';
  }
  if (correctionReview?.status === 'DRAFT' && access.procurementManager) {
    return 'Revise vendor changes';
  }
  if (request.status === WorkforceRequestStatus.PROCUREMENT_REVIEW && access.procurementConfirmer) {
    return 'Confirm selected vendors';
  }
  if (canApproveCurrentStep(actor, request)) return 'Review workforce request';

  const isDepartmentHod = actor.role === Role.HOD && actor.departmentId === request.departmentId;
  const serviceCompletionStatuses: WorkforceRequestStatus[] = [
    WorkforceRequestStatus.VENDOR_ACCEPTED,
    WorkforceRequestStatus.VENDORS_FULLY_APPROVED,
    WorkforceRequestStatus.IN_SERVICE,
    WorkforceRequestStatus.AWAITING_EVALUATION,
  ];
  const isServiceCompletionState = serviceCompletionStatuses.includes(request.status);
  if (!isServiceCompletionState) return null;

  if (isDepartmentHod && request.status === WorkforceRequestStatus.AWAITING_EVALUATION) {
    const assignedVendorIds = new Set([
      ...request.items.map((item) => item.vendorId),
      request.acceptedVendorId,
      request.vendorId,
    ].filter((id): id is string => Boolean(id)));
    const evaluatedVendorIds = new Set(
      request.evaluations
        .filter((evaluation) => evaluation.phase === WorkforceEvaluationPhase.FINAL)
        .map((evaluation) => evaluation.vendorId),
    );
    if ([...assignedVendorIds].some((vendorId) => !evaluatedVendorIds.has(vendorId))) {
      return 'Complete final vendor evaluation';
    }
  }
  if (isDepartmentHod && request.actualQuantity == null && request.status === WorkforceRequestStatus.AWAITING_EVALUATION) {
    return 'Submit service actuals';
  }
  if (isDepartmentHod && request.actualQuantity != null && !request.hodConfirmedAt) {
    return 'Confirm service delivery';
  }
  if (
    actor.role === Role.FINANCE_DIRECTOR
    && request.actualQuantity != null
    && request.hodConfirmedAt
    && !request.financeConfirmedAt
  ) {
    return 'Confirm actuals and complete';
  }
  return null;
}

/**
 * Small, actor-scoped read model used by Dashboard. It deliberately returns
 * only presentation fields and reuses the same current-step policy as the
 * workforce approval endpoints.
 */
export async function listPendingWorkforceTasks(
  database: WorkforceDatabase,
  actor: AuthUser,
  limit = 5,
) {
  if (!actor.capabilities.includes('workforce.read')) return [];

  const [procurementManager, procurementConfirmer, candidates] = await Promise.all([
    canManageProcurementWorkforce(database, actor),
    canConfirmProcurementSelection(database, actor),
    database.workforceRequest.findMany({
    where: {
      status: {
        in: [
          WorkforceRequestStatus.PENDING,
          WorkforceRequestStatus.AWAITING_EXTRA_APPROVAL,
          WorkforceRequestStatus.PROCUREMENT_REVIEW,
          WorkforceRequestStatus.VENDOR_ACCEPTED,
          WorkforceRequestStatus.VENDORS_FULLY_APPROVED,
          WorkforceRequestStatus.IN_SERVICE,
          WorkforceRequestStatus.AWAITING_EVALUATION,
        ],
      },
    },
    select: {
      id: true,
      code: true,
      status: true,
      departmentId: true,
      currentStepIndex: true,
      approvalSteps: true,
      workDate: true,
      endDate: true,
      vendorId: true,
      acceptedVendorId: true,
      actualQuantity: true,
      hodConfirmedAt: true,
      financeConfirmedAt: true,
      department: { select: { name: true } },
      position: { select: { name: true } },
      items: {
        select: { vendorId: true, position: { select: { name: true } } },
        orderBy: { createdAt: 'asc' },
      },
      evaluations: { select: { vendorId: true, phase: true } },
      vendorCorrectionReviews: {
        where: { status: { in: ['DRAFT', 'PENDING_FD', 'PENDING_GM'] } },
        select: { status: true },
        orderBy: { updatedAt: 'desc' },
        take: 1,
      },
    },
    orderBy: { updatedAt: 'desc' },
    take: 200,
    }),
  ]);
  const access = { procurementManager, procurementConfirmer };

  return candidates
    .map((request) => ({ request, action: workforceTaskAction(actor, request, access) }))
    .filter((entry): entry is typeof entry & { action: string } => Boolean(entry.action))
    .slice(0, Math.max(0, Math.min(limit, 200)))
    .map(({ request, action }) => {
      const services = Array.from(new Set([
        request.position.name,
        ...request.items.map((item) => item.position.name),
      ].filter(Boolean)));
      return {
        id: request.id,
        code: request.code,
        status: request.status,
        department: request.department.name,
        services: services.slice(0, 3),
        workDate: request.workDate,
        endDate: request.endDate,
        action,
        link: `/workforce/${request.id}`,
      };
    });
}
