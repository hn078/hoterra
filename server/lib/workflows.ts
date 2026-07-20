import { Role, WorkflowStatus } from '@prisma/client';

/**
 * Workflow step types — runtime support matrix:
 * - APPROVAL / SIGN: enforced at document approval/sign (documents.ts, signatures.ts)
 * - PARALLEL: design-only — stored as grouped SIGN steps; runtime still uses linear status flow
 * - READ / EDIT: design-only — acknowledge / edit-before-approve (future phase)
 * - NOTIFY: design-only — notification dispatch on step entry (future phase)
 * - CONDITION: design-only — branching placeholder (future phase)
 */
export type WorkflowStepType =
  | 'APPROVAL'
  | 'SIGN'
  | 'PARALLEL'
  | 'READ'
  | 'EDIT'
  | 'NOTIFY'
  | 'CONDITION';

export interface WorkflowStepBase {
  id: string;
  type: WorkflowStepType;
  label?: string;
}

export interface WorkflowApprovalStep extends WorkflowStepBase {
  type: 'APPROVAL' | 'SIGN';
  role: Role;
}

export interface WorkflowParallelStep extends WorkflowStepBase {
  type: 'PARALLEL';
  steps: WorkflowApprovalStep[];
}

export interface WorkflowReviewStep extends WorkflowStepBase {
  type: 'READ' | 'EDIT';
  role: Role;
  action?: 'READ' | 'EDIT';
}

export interface WorkflowNotifyStep extends WorkflowStepBase {
  type: 'NOTIFY';
  role?: Role;
}

export interface WorkflowConditionStep extends WorkflowStepBase {
  type: 'CONDITION';
  expression?: string;
}

export type WorkflowStep =
  | WorkflowApprovalStep
  | WorkflowParallelStep
  | WorkflowReviewStep
  | WorkflowNotifyStep
  | WorkflowConditionStep;

export const WORKFLOW_STEP_TYPES: {
  type: WorkflowStepType;
  label: string;
  description: string;
  runtimeImplemented: boolean;
}[] = [
  { type: 'APPROVAL', label: 'Approval / Sign', description: 'Single role must approve and sign', runtimeImplemented: true },
  { type: 'PARALLEL', label: 'Parallel Signatures', description: 'Multiple roles sign in parallel', runtimeImplemented: false },
  { type: 'READ', label: 'Must Read', description: 'Role must read and acknowledge', runtimeImplemented: false },
  { type: 'EDIT', label: 'Must Edit', description: 'Role must edit document before proceeding', runtimeImplemented: false },
  { type: 'NOTIFY', label: 'Notify', description: 'Send notification only — no action required', runtimeImplemented: false },
  { type: 'CONDITION', label: 'Condition', description: 'Branching rule (placeholder)', runtimeImplemented: false },
];

const LEGACY_STEP_MAP: Record<string, Role> = {
  HOD: Role.HOD,
  FINANCE: Role.FINANCE_DIRECTOR,
  GM: Role.GENERAL_MANAGER,
  SUPERVISOR: Role.SUPERVISOR,
  EMPLOYEE: Role.EMPLOYEE,
};

const VALID_ROLES = new Set<string>(Object.values(Role));
const VALID_STEP_TYPES = new Set<string>(WORKFLOW_STEP_TYPES.map((t) => t.type));

export function normalizeLegacyRole(value: string): Role | null {
  if (VALID_ROLES.has(value)) return value as Role;
  return LEGACY_STEP_MAP[value] ?? null;
}

export function createStepId(): string {
  return `step-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function createApprovalStep(role: Role = Role.HOD, label?: string): WorkflowApprovalStep {
  return {
    id: createStepId(),
    type: 'APPROVAL',
    role,
    label,
  };
}

export function createDefaultStep(type: WorkflowStepType): WorkflowStep {
  switch (type) {
    case 'PARALLEL':
      return {
        id: createStepId(),
        type: 'PARALLEL',
        label: 'Parallel signatures',
        steps: [createApprovalStep(Role.HOD), createApprovalStep(Role.FINANCE_DIRECTOR)],
      };
    case 'READ':
      return { id: createStepId(), type: 'READ', role: Role.SUPERVISOR, action: 'READ', label: 'Must read' };
    case 'EDIT':
      return { id: createStepId(), type: 'EDIT', role: Role.EMPLOYEE, action: 'EDIT', label: 'Must edit' };
    case 'NOTIFY':
      return { id: createStepId(), type: 'NOTIFY', role: Role.SUPERVISOR, label: 'Notification' };
    case 'CONDITION':
      return { id: createStepId(), type: 'CONDITION', label: 'Condition', expression: '' };
    case 'SIGN':
    case 'APPROVAL':
    default:
      return createApprovalStep(Role.HOD);
  }
}

/** Parse stored JSON — accepts legacy string[] or structured WorkflowStep[]. */
export function parseWorkflowSteps(raw: string | unknown): WorkflowStep[] {
  let parsed: unknown = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(parsed)) return [];

  return parsed
    .map((item): WorkflowStep | null => {
      if (typeof item === 'string') {
        const role = normalizeLegacyRole(item);
        if (!role) return null;
        return createApprovalStep(role);
      }
      if (item && typeof item === 'object' && 'type' in item) {
        return item as WorkflowStep;
      }
      return null;
    })
    .filter((s): s is WorkflowStep => s !== null);
}

export function serializeWorkflowSteps(steps: WorkflowStep[]): string {
  return JSON.stringify(steps);
}

export function validateWorkflowSteps(
  steps: unknown,
  options?: { allowEmpty?: boolean }
): { ok: true; steps: WorkflowStep[] } | { ok: false; error: string } {
  if (!Array.isArray(steps)) {
    return { ok: false, error: 'Steps must be an array' };
  }
  if (steps.length === 0) {
    if (options?.allowEmpty) return { ok: true, steps: [] };
    return { ok: false, error: 'Workflow must have at least one step' };
  }

  const normalized: WorkflowStep[] = [];

  for (let i = 0; i < steps.length; i++) {
    const item = steps[i];

    if (typeof item === 'string') {
      const role = normalizeLegacyRole(item);
      if (!role) return { ok: false, error: `Step ${i + 1}: unknown role "${item}"` };
      normalized.push(createApprovalStep(role));
      continue;
    }

    if (!item || typeof item !== 'object' || !('type' in item)) {
      return { ok: false, error: `Step ${i + 1}: invalid step object` };
    }

    const step = item as WorkflowStep;
    if (!VALID_STEP_TYPES.has(step.type)) {
      return { ok: false, error: `Step ${i + 1}: unknown type "${step.type}"` };
    }

    if (step.type === 'APPROVAL' || step.type === 'SIGN') {
      const role = normalizeLegacyRole((step as WorkflowApprovalStep).role);
      if (!role) return { ok: false, error: `Step ${i + 1}: approval step requires a valid role` };
      normalized.push({
        id: step.id || createStepId(),
        type: 'APPROVAL',
        role,
        label: step.label,
      });
    } else if (step.type === 'PARALLEL') {
      const parallel = step as WorkflowParallelStep;
      if (!Array.isArray(parallel.steps) || parallel.steps.length < 2) {
        return { ok: false, error: `Step ${i + 1}: parallel group needs at least 2 sub-steps` };
      }
      const subSteps: WorkflowApprovalStep[] = [];
      for (let j = 0; j < parallel.steps.length; j++) {
        const sub = parallel.steps[j];
        const role = normalizeLegacyRole(sub.role);
        if (!role) return { ok: false, error: `Step ${i + 1}, sub-step ${j + 1}: invalid role` };
        subSteps.push({
          id: sub.id || createStepId(),
          type: 'APPROVAL',
          role,
          label: sub.label,
        });
      }
      normalized.push({
        id: step.id || createStepId(),
        type: 'PARALLEL',
        label: step.label,
        steps: subSteps,
      });
    } else if (step.type === 'READ' || step.type === 'EDIT') {
      const review = step as WorkflowReviewStep;
      const role = normalizeLegacyRole(review.role);
      if (!role) return { ok: false, error: `Step ${i + 1}: review step requires a valid role` };
      normalized.push({
        id: step.id || createStepId(),
        type: step.type,
        role,
        action: step.type,
        label: step.label,
      });
    } else if (step.type === 'NOTIFY') {
      const notify = step as WorkflowNotifyStep;
      const role = notify.role ? normalizeLegacyRole(notify.role) : undefined;
      if (notify.role && !role) {
        return { ok: false, error: `Step ${i + 1}: notify step has invalid role` };
      }
      normalized.push({
        id: step.id || createStepId(),
        type: 'NOTIFY',
        role: role ?? undefined,
        label: step.label,
      });
    } else if (step.type === 'CONDITION') {
      normalized.push({
        id: step.id || createStepId(),
        type: 'CONDITION',
        label: step.label,
        expression: (step as WorkflowConditionStep).expression ?? '',
      });
    }
  }

  return { ok: true, steps: normalized };
}

/** Flatten to approval roles in order — used by runtime engine (APPROVAL + PARALLEL sub-steps only). */
export function flattenApprovalRoles(steps: WorkflowStep[]): Role[] {
  const roles: Role[] = [];
  for (const step of steps) {
    if (step.type === 'APPROVAL' || step.type === 'SIGN') {
      roles.push(step.role);
    } else if (step.type === 'PARALLEL') {
      for (const sub of step.steps) {
        roles.push(sub.role);
      }
    }
  }
  return roles;
}

export function countWorkflowSteps(steps: WorkflowStep[]): number {
  return steps.reduce((n, step) => {
    if (step.type === 'PARALLEL') return n + step.steps.length;
    return n + 1;
  }, 0);
}

export function summarizeWorkflowSteps(steps: WorkflowStep[]): string {
  if (steps.length === 0) return 'No steps';
  const parts = steps.map((step) => {
    switch (step.type) {
      case 'APPROVAL':
      case 'SIGN':
        return `Sign (${step.role})`;
      case 'PARALLEL':
        return `Parallel (${step.steps.map((s) => s.role).join(', ')})`;
      case 'READ':
        return `Read (${step.role})`;
      case 'EDIT':
        return `Edit (${step.role})`;
      case 'NOTIFY':
        return step.role ? `Notify (${step.role})` : 'Notify';
      case 'CONDITION':
        return 'Condition';
      default:
        return 'Step';
    }
  });
  return parts.join(' → ');
}

export function formatWorkflow<T extends { steps: string; status?: WorkflowStatus }>(workflow: T) {
  const steps = parseWorkflowSteps(workflow.steps);
  return {
    ...workflow,
    steps,
    stepCount: countWorkflowSteps(steps),
    stepsSummary: summarizeWorkflowSteps(steps),
  };
}
