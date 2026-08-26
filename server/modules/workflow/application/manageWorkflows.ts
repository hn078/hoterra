import { AuditAction, Role, WorkflowStatus } from '@prisma/client';
import type * as DatabaseModule from '../../../db';
import type { AuthUser } from '../../../middleware/auth';
import { auditStateDigest, serializeAuditState } from '../../audit';
import {
  formatWorkflow,
  parseWorkflowSteps,
  serializeWorkflowSteps,
  validateWorkflowSteps,
  type WorkflowStep,
} from '../domain/workflowDefinition';

type WorkflowDatabase = typeof DatabaseModule.prisma;

export type WorkflowMutationErrorCode =
  | 'FORBIDDEN'
  | 'INVALID_INPUT'
  | 'INVALID_STEPS'
  | 'NOT_FOUND'
  | 'DUPLICATE'
  | 'INVALID_STATE'
  | 'DEFAULT_REQUIRED';

export class WorkflowMutationError extends Error {
  constructor(public readonly code: WorkflowMutationErrorCode, public readonly detail?: string) {
    super(code);
    this.name = 'WorkflowMutationError';
  }
}

function name(value: unknown) {
  const normalized = String(value ?? '').trim();
  if (normalized.length < 2 || normalized.length > 120) {
    throw new WorkflowMutationError('INVALID_INPUT', 'Workflow name must be 2–120 characters');
  }
  return normalized;
}

function description(value: unknown) {
  if (value === undefined) return undefined;
  const normalized = String(value ?? '').trim();
  if (normalized.length > 1000) throw new WorkflowMutationError('INVALID_INPUT', 'Description is too long');
  return normalized || null;
}

function steps(value: unknown, allowEmpty = true) {
  const validation = validateWorkflowSteps(value, { allowEmpty });
  if (!validation.ok) throw new WorkflowMutationError('INVALID_STEPS', validation.error);
  if (validation.steps.length > 50) throw new WorkflowMutationError('INVALID_STEPS', 'Workflow cannot exceed 50 steps');
  const serialized = serializeWorkflowSteps(validation.steps);
  if (serialized.length > 64_000) throw new WorkflowMutationError('INVALID_STEPS', 'Workflow definition is too large');
  return { normalized: validation.steps, serialized };
}

function assertRuntimeSupported(runtimeSteps: WorkflowStep[]) {
  const expected = [Role.HOD, Role.FINANCE_DIRECTOR, Role.GENERAL_MANAGER];
  const actual = runtimeSteps.map((step) => step.type === 'APPROVAL' || step.type === 'SIGN' ? step.role : null);
  if (actual.length !== expected.length || actual.some((role, index) => role !== expected[index])) {
    throw new WorkflowMutationError(
      'INVALID_STEPS',
      'Runtime workflows must use exactly: Head of Department → Finance Director → General Manager',
    );
  }
}

function uniqueConflict(error: unknown) {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'P2002');
}

async function duplicateName(transaction: any, workflowName: string, excludeId?: string) {
  return transaction.workflowRoute.findFirst({
    where: {
      ...(excludeId ? { id: { not: excludeId } } : {}),
      name: { equals: workflowName, mode: 'insensitive' },
      status: { not: WorkflowStatus.ARCHIVED },
    },
    select: { id: true },
  });
}

function workflowAuditState(workflow: any) {
  const workflowSteps = parseWorkflowSteps(workflow.steps);
  const stepSummary = workflowSteps.map((step) => {
    if (step.type === 'PARALLEL') {
      return { type: step.type, label: step.label, roles: step.steps.map((item) => item.role) };
    }
    if (step.type === 'CONDITION') {
      return { type: step.type, label: step.label, expressionDigest: auditStateDigest(step.expression) };
    }
    return {
      type: step.type,
      label: step.label,
      ...('role' in step ? { role: step.role } : {}),
      ...('action' in step ? { action: step.action } : {}),
    };
  });
  return {
    id: workflow.id,
    name: workflow.name,
    description: workflow.description,
    status: workflow.status,
    isDefault: workflow.isDefault,
    stepCount: workflowSteps.length,
    stepSummary,
    stepsDigest: auditStateDigest(String(workflow.steps || '[]')),
  };
}

export async function createWorkflow(database: WorkflowDatabase, actor: AuthUser, inputValue: unknown) {
  if (!actor.capabilities.includes('workflows.manage')) throw new WorkflowMutationError('FORBIDDEN');
  const input = inputValue && typeof inputValue === 'object' ? inputValue as Record<string, unknown> : {};
  const workflowName = name(input.name ?? 'New Workflow');
  const workflowDescription = description(input.description);
  const normalizedSteps = steps(input.steps ?? [], true);
  try {
    const workflow = await database.$transaction(async (transaction) => {
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`workflow:name:${workflowName.toLowerCase()}`}))`;
      if (await duplicateName(transaction, workflowName)) throw new WorkflowMutationError('DUPLICATE');
      const created = await transaction.workflowRoute.create({
        data: {
          name: workflowName,
          description: workflowDescription,
          steps: normalizedSteps.serialized,
          isDefault: false,
          status: WorkflowStatus.DRAFT,
        },
      });
      await transaction.auditLog.create({
        data: {
          userId: actor.id,
          userName: `${actor.firstName} ${actor.lastName}`,
          action: AuditAction.CREATE,
          entityType: 'WorkflowRoute',
          entityId: created.id,
          details: `Created draft workflow ${created.name}`,
          outcome: 'SUCCESS',
          reason: 'Authorized workflow draft creation',
          afterState: serializeAuditState(workflowAuditState(created)),
        },
      });
      return created;
    });
    return formatWorkflow(workflow);
  } catch (error) {
    if (uniqueConflict(error)) throw new WorkflowMutationError('DUPLICATE');
    throw error;
  }
}

export async function updateWorkflow(
  database: WorkflowDatabase,
  actor: AuthUser,
  workflowId: string,
  inputValue: unknown,
) {
  if (!actor.capabilities.includes('workflows.manage')) throw new WorkflowMutationError('FORBIDDEN');
  const input = inputValue && typeof inputValue === 'object' ? inputValue as Record<string, unknown> : {};
  if (input.status !== undefined || input.isDefault !== undefined) throw new WorkflowMutationError('INVALID_INPUT');
  const workflowName = input.name === undefined ? undefined : name(input.name);
  const workflowDescription = input.description === undefined ? undefined : description(input.description);
  const workflowSteps = input.steps === undefined ? undefined : steps(input.steps, true);

  try {
    const workflow = await database.$transaction(async (transaction) => {
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`workflow:${workflowId}`}))`;
      if (workflowName) await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`workflow:name:${workflowName.toLowerCase()}`}))`;
      const existing = await transaction.workflowRoute.findUnique({ where: { id: workflowId } });
      if (!existing) throw new WorkflowMutationError('NOT_FOUND');
      if (existing.status === WorkflowStatus.ARCHIVED) throw new WorkflowMutationError('INVALID_STATE', 'Archived workflows are immutable');
      if (workflowName && await duplicateName(transaction, workflowName, workflowId)) throw new WorkflowMutationError('DUPLICATE');
      if (existing.status === WorkflowStatus.ACTIVE && workflowSteps) {
        throw new WorkflowMutationError('INVALID_STATE', 'Active workflow steps are immutable; create a new draft version');
      }
      const data: Record<string, unknown> = {};
      if (workflowName !== undefined) data.name = workflowName;
      if (workflowDescription !== undefined) data.description = workflowDescription;
      if (workflowSteps !== undefined) data.steps = workflowSteps.serialized;
      if (!Object.keys(data).length) return existing;
      const updated = await transaction.workflowRoute.update({ where: { id: workflowId }, data });
      await transaction.auditLog.create({
        data: {
          userId: actor.id,
          userName: `${actor.firstName} ${actor.lastName}`,
          action: AuditAction.UPDATE,
          entityType: 'WorkflowRoute',
          entityId: updated.id,
          details: `Updated workflow ${updated.name}: ${Object.keys(data).join(', ')}`,
          outcome: 'SUCCESS',
          reason: `Workflow fields updated: ${Object.keys(data).sort().join(', ')}`,
          beforeState: serializeAuditState(workflowAuditState(existing)),
          afterState: serializeAuditState(workflowAuditState(updated)),
        },
      });
      return updated;
    });
    return formatWorkflow(workflow);
  } catch (error) {
    if (uniqueConflict(error)) throw new WorkflowMutationError('DUPLICATE');
    throw error;
  }
}

export async function activateWorkflow(database: WorkflowDatabase, actor: AuthUser, workflowId: string) {
  if (!actor.capabilities.includes('workflows.manage')) throw new WorkflowMutationError('FORBIDDEN');
  const workflow = await database.$transaction(async (transaction) => {
    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`workflow:${workflowId}`}))`;
    const existing = await transaction.workflowRoute.findUnique({ where: { id: workflowId } });
    if (!existing) throw new WorkflowMutationError('NOT_FOUND');
    if (existing.status === WorkflowStatus.ACTIVE) return existing;
    if (existing.status !== WorkflowStatus.DRAFT) throw new WorkflowMutationError('INVALID_STATE');
    const workflowSteps = steps(parseWorkflowSteps(existing.steps), false);
    assertRuntimeSupported(workflowSteps.normalized);
    const updated = await transaction.workflowRoute.update({
      where: { id: workflowId },
      data: { status: WorkflowStatus.ACTIVE, steps: workflowSteps.serialized },
    });
    await transaction.auditLog.create({
      data: {
        userId: actor.id,
        userName: `${actor.firstName} ${actor.lastName}`,
        action: AuditAction.UPDATE,
        entityType: 'WorkflowRoute',
        entityId: updated.id,
        details: `Activated workflow ${updated.name}`,
        outcome: 'SUCCESS',
        reason: 'Draft workflow activated after runtime-step validation',
        beforeState: serializeAuditState(workflowAuditState(existing)),
        afterState: serializeAuditState(workflowAuditState(updated)),
      },
    });
    return updated;
  });
  return formatWorkflow(workflow);
}

export async function setDefaultWorkflow(
  database: WorkflowDatabase,
  actor: AuthUser,
  workflowId: string,
  shouldDefault: boolean,
) {
  if (!actor.capabilities.includes('workflows.manage')) throw new WorkflowMutationError('FORBIDDEN');
  const workflow = await database.$transaction(async (transaction) => {
    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`workflow:default:${actor.tenantId}`}))`;
    const existing = await transaction.workflowRoute.findUnique({ where: { id: workflowId } });
    if (!existing) throw new WorkflowMutationError('NOT_FOUND');
    if (existing.status !== WorkflowStatus.ACTIVE) throw new WorkflowMutationError('INVALID_STATE', 'Only active workflows can be default');
    if (!shouldDefault) {
      if (existing.isDefault) throw new WorkflowMutationError('DEFAULT_REQUIRED', 'Choose another default workflow instead');
      return existing;
    }
    if (existing.isDefault) return existing;
    const previousDefaults = await transaction.workflowRoute.findMany({
      where: { isDefault: true },
      select: { id: true },
    });
    await transaction.workflowRoute.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
    const updated = await transaction.workflowRoute.update({ where: { id: workflowId }, data: { isDefault: true } });
    await transaction.auditLog.create({
      data: {
        userId: actor.id,
        userName: `${actor.firstName} ${actor.lastName}`,
        action: AuditAction.UPDATE,
        entityType: 'WorkflowRoute',
        entityId: updated.id,
        details: `Set ${updated.name} as the default workflow`,
        outcome: 'SUCCESS',
        reason: 'Authorized tenant default workflow replacement',
        beforeState: serializeAuditState({
          workflow: workflowAuditState(existing),
          tenantDefaultWorkflowIds: previousDefaults.map((item: { id: string }) => item.id).sort(),
        }),
        afterState: serializeAuditState({
          workflow: workflowAuditState(updated),
          tenantDefaultWorkflowIds: [updated.id],
        }),
      },
    });
    return updated;
  });
  return formatWorkflow(workflow);
}

export async function archiveWorkflow(database: WorkflowDatabase, actor: AuthUser, workflowId: string) {
  if (!actor.capabilities.includes('workflows.manage')) throw new WorkflowMutationError('FORBIDDEN');
  return database.$transaction(async (transaction) => {
    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`workflow:default:${actor.tenantId}`}))`;
    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`workflow:${workflowId}`}))`;
    const existing = await transaction.workflowRoute.findUnique({ where: { id: workflowId } });
    if (!existing) throw new WorkflowMutationError('NOT_FOUND');
    if (existing.status === WorkflowStatus.ARCHIVED) return { ok: true, id: workflowId };
    if (existing.isDefault) throw new WorkflowMutationError('DEFAULT_REQUIRED', 'Choose another default workflow before archiving this one');
    const references = await transaction.document.count({ where: { workflowId } });
    const archived = await transaction.workflowRoute.update({
      where: { id: workflowId },
      data: { status: WorkflowStatus.ARCHIVED, isDefault: false },
    });
    await transaction.auditLog.create({
      data: {
        userId: actor.id,
        userName: `${actor.firstName} ${actor.lastName}`,
        action: AuditAction.UPDATE,
        entityType: 'WorkflowRoute',
        entityId: archived.id,
        details: `Archived workflow ${archived.name}; retained ${references} document reference(s)`,
        outcome: 'SUCCESS',
        reason: 'Recoverable workflow archival',
        beforeState: serializeAuditState(workflowAuditState(existing)),
        afterState: serializeAuditState({
          ...workflowAuditState(archived),
          retainedDocumentReferences: references,
        }),
      },
    });
    return { ok: true, id: workflowId };
  });
}
