import { Role, VendorApprovalStatus } from '@prisma/client';
import type * as DatabaseModule from '../../../db';
import type { AuthUser } from '../../../middleware/auth';
import {
  parseApprovalSteps,
  parseHotels,
  POSITION_CATALOG,
  type ApprovalStep,
} from './workforceRequestSerialization';
import { canManageProcurementWorkforce } from './procurementAccess';

type WorkforceDatabase = typeof DatabaseModule.prisma;

export class WorkforceMetaReadError extends Error {
  constructor(public readonly code: 'FORBIDDEN') {
    super(code);
    this.name = 'WorkforceMetaReadError';
  }
}

const APPROVAL_ROLES = [
  Role.HOD,
  Role.FINANCE_DIRECTOR,
  Role.GENERAL_MANAGER,
  Role.SUPERVISOR,
];

function ensureRequiredSteps(
  steps: ApprovalStep[],
  humanResourcesId: string | null,
) {
  const normalized = steps.map((step) => ({ ...step }));
  const financeIndex = normalized.findIndex((step) => step.role === Role.FINANCE_DIRECTOR);
  const hasHumanResourcesHod = normalized.some((step) =>
    step.role === Role.HOD &&
    (step.approverDepartmentId === humanResourcesId || /human resources/i.test(step.label))
  );
  const existing = normalized.find((step) => step.role === Role.HOD && /human resources/i.test(step.label));
  if (existing && humanResourcesId) existing.approverDepartmentId = humanResourcesId;
  if (!hasHumanResourcesHod) {
    normalized.splice(financeIndex >= 0 ? financeIndex : normalized.length, 0, {
      role: Role.HOD,
      label: 'Human Resources — Head of Department',
      ...(humanResourcesId ? { approverDepartmentId: humanResourcesId } : {}),
    });
  }
  return normalized;
}

export async function getWorkforceMeta(database: WorkforceDatabase, actor: AuthUser) {
  if (!actor.capabilities.includes('workforce.read')) throw new WorkforceMetaReadError('FORBIDDEN');

  const canManageProcurement = await canManageProcurementWorkforce(database, actor);
  const canManageRoutes = actor.capabilities.includes('workforce.routes.manage');
  const canManageTemplates = actor.capabilities.includes('workforce.templates.manage');
  const hotelWide = ([Role.GENERAL_MANAGER, Role.FINANCE_DIRECTOR] as Role[])
    .includes(actor.role);
  const canSeeVendorCatalog = canManageProcurement || hotelWide;
  const noRows = { id: '__not_authorized__' };

  const [positions, vendors, catalogRates, settingsRow, routes, budgets, templates, approvers, humanResources] =
    await Promise.all([
      database.workforcePosition.findMany({ orderBy: { name: 'asc' } }),
      database.vendor.findMany({
        where: canSeeVendorCatalog ? undefined : noRows,
        include: {
          approvalEvents: { orderBy: { signedAt: 'desc' } },
          serviceRates: { include: { position: true } },
        },
        orderBy: { name: 'asc' },
      }),
      database.vendorServiceRate.findMany({
        where: { isActive: true, vendor: { isActive: true, approvalStatus: VendorApprovalStatus.APPROVED } },
        include: { vendor: true, position: true },
        orderBy: [{ position: { name: 'asc' } }, { vendor: { name: 'asc' } }],
      }),
      database.workforceSettings.findFirst(),
      database.workforceApprovalRoute.findMany({
        where: canManageRoutes ? undefined : noRows,
        include: { department: true },
        orderBy: { name: 'asc' },
      }),
      database.departmentCasualBudget.findMany({
        where: hotelWide
          ? undefined
          : actor.role === Role.HOD && actor.departmentId
            ? { departmentId: actor.departmentId }
            : noRows,
        include: { department: true },
        orderBy: [{ year: 'desc' }, { month: 'desc' }],
      }),
      database.workforceRequestTemplate.findMany({
        where: !canManageTemplates
          ? noRows
          : hotelWide
            ? undefined
            : actor.departmentId
              ? { departmentId: actor.departmentId }
              : noRows,
        include: { department: true, position: true },
        orderBy: { name: 'asc' },
      }),
      database.user.findMany({
        where: canManageRoutes ? { isActive: true, role: { in: APPROVAL_ROLES } } : noRows,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          role: true,
          departmentId: true,
          department: { select: { name: true, code: true } },
        },
        orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      }),
      database.department.findFirst({
        where: { OR: [{ code: 'HR' }, { name: { equals: 'Human Resources', mode: 'insensitive' } }] },
        select: { id: true },
      }),
    ]);

  const visibleCatalogRates = canSeeVendorCatalog
    ? catalogRates
    : [...catalogRates.reduce((lowest, rate) => {
        const key = `${rate.positionId}:${rate.unit}`;
        const current = lowest.get(key);
        if (!current || rate.price < current.price) lowest.set(key, rate);
        return lowest;
      }, new Map<string, (typeof catalogRates)[number]>()).values()].map((rate) => ({
        ...rate,
        vendorId: '',
        vendor: { id: '', name: 'Approved vendor' },
      }));

  const settings = settingsRow
    ? { ...settingsRow, hotels: parseHotels(settingsRow.hotelsJson) }
    : {
        id: '',
        hotelName: 'HOTERRA',
        hotelsJson: '["HOTERRA"]',
        hotels: ['HOTERRA'],
        minLeadHours: 24,
        estimatedHourlyRate: 15,
        estimatedHoursPerShift: 8,
        notifyEmail: true,
        notifyPush: true,
        payrollTolerancePct: 5,
      };

  return {
    positions,
    vendors,
    catalogRates: visibleCatalogRates,
    settings,
    routes: routes.map((route) => ({
      ...route,
      steps: ensureRequiredSteps(parseApprovalSteps(route.steps), humanResources?.id || null),
    })),
    budgets,
    templates,
    approvers,
    defaultPositions: POSITION_CATALOG,
    approvalRoles: APPROVAL_ROLES,
  };
}
