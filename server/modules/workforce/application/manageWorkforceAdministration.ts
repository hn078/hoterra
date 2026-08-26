import { AuditAction, Prisma, Role } from '@prisma/client';
import type * as DatabaseModule from '../../../db';
import type { AuthUser } from '../../../middleware/auth';
import {
  serializeWorkforceApprovalRouteAuditState,
  serializeWorkforceBudgetAuditState,
} from './workforceAuditState';

type WorkforceDatabase = typeof DatabaseModule.prisma;

export interface WorkforceApprovalStepInput {
  role?: unknown;
  label?: unknown;
  approverUserId?: unknown;
  approverDepartmentId?: unknown;
}

interface WorkforceApprovalStep {
  role: Role;
  label: string;
  approverUserId?: string;
  approverDepartmentId?: string;
}

export type WorkforceAdministrationErrorCode =
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'INVALID_INPUT'
  | 'INVALID_APPROVER'
  | 'HR_DEPARTMENT_REQUIRED';

export class WorkforceAdministrationError extends Error {
  constructor(public readonly code: WorkforceAdministrationErrorCode) {
    super(code);
    this.name = 'WorkforceAdministrationError';
  }
}

const APPROVER_ROLES = new Set<Role>([
  Role.HOD,
  Role.SUPERVISOR,
  Role.FINANCE_DIRECTOR,
  Role.GENERAL_MANAGER,
]);

function actorName(actor: AuthUser) {
  return `${actor.firstName} ${actor.lastName}`;
}

function parseStep(input: WorkforceApprovalStepInput): WorkforceApprovalStep {
  const role = input?.role as Role;
  const label = String(input?.label || '').trim();
  const approverUserId = input?.approverUserId ? String(input.approverUserId).trim() : undefined;
  const approverDepartmentId = input?.approverDepartmentId ? String(input.approverDepartmentId).trim() : undefined;
  if (!APPROVER_ROLES.has(role) || !label || label.length > 160) {
    throw new WorkforceAdministrationError('INVALID_INPUT');
  }
  if (approverDepartmentId && role !== Role.HOD) {
    throw new WorkforceAdministrationError('INVALID_APPROVER');
  }
  return { role, label, ...(approverUserId && { approverUserId }), ...(approverDepartmentId && { approverDepartmentId }) };
}

export async function saveWorkforceApprovalRoute(
  database: WorkforceDatabase,
  actor: AuthUser,
  departmentId: string,
  input: { name?: unknown; steps?: unknown },
) {
  if (!actor.capabilities.includes('workforce.routes.manage')) {
    throw new WorkforceAdministrationError('FORBIDDEN');
  }
  if (!Array.isArray(input.steps) || input.steps.length === 0 || input.steps.length > 12) {
    throw new WorkforceAdministrationError('INVALID_INPUT');
  }
  const submitted = input.steps.map((step) => parseStep(step as WorkforceApprovalStepInput));
  return database.$transaction(async (transaction) => {
    const validateApproverReferences = async (stepsToValidate: WorkforceApprovalStep[]) => {
      for (const step of stepsToValidate) {
        if (step.approverDepartmentId) {
          const stepDepartment = await transaction.department.findFirst({ where: { id: step.approverDepartmentId, isActive: true }, select: { id: true } });
          if (!stepDepartment) throw new WorkforceAdministrationError('INVALID_APPROVER');
        }
        if (step.approverUserId) {
          const approver = await transaction.user.findUnique({
            where: { id: step.approverUserId },
            select: { isActive: true, role: true, departmentId: true },
          });
          if (!approver?.isActive || approver.role !== step.role ||
            (step.approverDepartmentId && approver.departmentId !== step.approverDepartmentId)) {
            throw new WorkforceAdministrationError('INVALID_APPROVER');
          }
        }
      }
    };
    await transaction.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`workforce-route:${departmentId}`}, 0))`);
    const [department, humanResources] = await Promise.all([
      transaction.department.findFirst({ where: { id: departmentId, isActive: true }, select: { id: true, name: true } }),
      transaction.department.findFirst({
        where: { isActive: true, OR: [{ code: 'HR' }, { name: { equals: 'Human Resources', mode: 'insensitive' } }] },
        select: { id: true },
      }),
    ]);
    if (!department) throw new WorkforceAdministrationError('NOT_FOUND');
    if (!humanResources) throw new WorkforceAdministrationError('HR_DEPARTMENT_REQUIRED');
    await validateApproverReferences(submitted);

    const isHrStep = (step: WorkforceApprovalStep) =>
      step.role === Role.HOD && (step.approverDepartmentId === humanResources.id || /human resources/i.test(step.label));
    const requesterHod = submitted.find((step) => step.role === Role.HOD && !isHrStep(step)) || {
      role: Role.HOD,
      label: 'Head of Department',
      approverDepartmentId: departmentId,
    };
    if (!requesterHod.approverUserId) requesterHod.approverDepartmentId = departmentId;
    const hrHod = submitted.find(isHrStep) || {
      role: Role.HOD,
      label: 'Human Resources — Head of Department',
      approverDepartmentId: humanResources.id,
    };
    hrHod.approverDepartmentId = humanResources.id;
    const finance = submitted.find((step) => step.role === Role.FINANCE_DIRECTOR) || {
      role: Role.FINANCE_DIRECTOR,
      label: 'Finance Director',
    };
    const generalManager = submitted.find((step) => step.role === Role.GENERAL_MANAGER) || {
      role: Role.GENERAL_MANAGER,
      label: 'General Manager',
    };
    const required = new Set([requesterHod, hrHod, finance, generalManager]);
    const customSteps = submitted.filter((step) => !required.has(step) &&
      step.role !== Role.FINANCE_DIRECTOR && step.role !== Role.GENERAL_MANAGER && !isHrStep(step) && step !== requesterHod);
    const steps: WorkforceApprovalStep[] = [requesterHod, ...customSteps, hrHod, finance, generalManager];
    await validateApproverReferences(steps);
    const routeName = input.name == null || input.name === ''
      ? `${department.name} Casual Staff Route`
      : String(input.name).trim();
    if (!routeName || routeName.length > 160) throw new WorkforceAdministrationError('INVALID_INPUT');
    const existing = await transaction.workforceApprovalRoute.findUnique({ where: { departmentId } });
    const route = await transaction.workforceApprovalRoute.upsert({
      where: { departmentId },
      update: { name: routeName, steps: JSON.stringify(steps) },
      create: { departmentId, name: routeName, steps: JSON.stringify(steps) },
      include: { department: true },
    });
    await transaction.auditLog.create({
      data: { userId: actor.id, userName: actorName(actor), action: existing ? AuditAction.UPDATE : AuditAction.CREATE, entityType: 'WorkforceApprovalRoute', entityId: route.id, details: `${existing ? 'Updated' : 'Created'} ${routeName}: ${steps.map((step) => step.label).join(' → ')}`, outcome: 'SUCCESS', reason: 'Authorized route manager configured the department request approval chain', beforeState: serializeWorkforceApprovalRouteAuditState(existing), afterState: serializeWorkforceApprovalRouteAuditState(route) },
    });
    return { ...route, steps };
  });
}

export async function saveDepartmentCasualBudget(
  database: WorkforceDatabase,
  actor: AuthUser,
  input: { departmentId?: unknown; year?: unknown; month?: unknown; budgetAmount?: unknown },
) {
  if (!actor.capabilities.includes('workforce.budget.manage')) {
    throw new WorkforceAdministrationError('FORBIDDEN');
  }
  const departmentId = String(input.departmentId || '').trim();
  const year = Number(input.year);
  const month = Number(input.month);
  const rawAmount = Number(input.budgetAmount);
  if (!departmentId || !Number.isInteger(year) || year < 2020 || year > 2100 ||
    !Number.isInteger(month) || month < 1 || month > 12 ||
    !Number.isFinite(rawAmount) || rawAmount < 0 || rawAmount > 1_000_000_000) {
    throw new WorkforceAdministrationError('INVALID_INPUT');
  }
  const budgetAmount = Math.round((rawAmount + Number.EPSILON) * 100) / 100;
  return database.$transaction(async (transaction) => {
    const lockKey = `workforce-budget:${departmentId}:${year}:${month}`;
    await transaction.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`);
    const department = await transaction.department.findFirst({ where: { id: departmentId, isActive: true }, select: { id: true, name: true } });
    if (!department) throw new WorkforceAdministrationError('NOT_FOUND');
    const existing = await transaction.departmentCasualBudget.findUnique({
      where: { departmentId_year_month: { departmentId, year, month } },
    });
    const budget = await transaction.departmentCasualBudget.upsert({
      where: { departmentId_year_month: { departmentId, year, month } },
      update: { budgetAmount },
      create: { departmentId, year, month, budgetAmount },
      include: { department: true },
    });
    await transaction.auditLog.create({
      data: { userId: actor.id, userName: actorName(actor), action: existing ? AuditAction.UPDATE : AuditAction.CREATE, entityType: 'DepartmentCasualBudget', entityId: budget.id, details: `${department.name} ${year}-${String(month).padStart(2, '0')} budget: ${budgetAmount.toFixed(2)} AZN`, outcome: 'SUCCESS', reason: 'Authorized budget manager set the department monthly casual workforce budget', beforeState: serializeWorkforceBudgetAuditState(existing), afterState: serializeWorkforceBudgetAuditState(budget) },
    });
    return budget;
  });
}
