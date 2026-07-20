import type { Role } from '@/types';

/**
 * Workflow step types — runtime support matrix:
 * - APPROVAL / SIGN: enforced at document approval/sign
 * - PARALLEL, READ, EDIT, NOTIFY, CONDITION: design-only in MVP (see server/lib/workflows.ts)
 */
export type WorkflowStepType =
  | 'APPROVAL'
  | 'SIGN'
  | 'PARALLEL'
  | 'READ'
  | 'EDIT'
  | 'NOTIFY'
  | 'CONDITION';

export type WorkflowStatus = 'DRAFT' | 'ACTIVE' | 'ARCHIVED';

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
  color: string;
}[] = [
  { type: 'APPROVAL', label: 'Approval / Sign', description: 'Single role must approve and sign', runtimeImplemented: true, color: 'bg-purple-500' },
  { type: 'PARALLEL', label: 'Parallel Signatures', description: 'Multiple roles sign in parallel', runtimeImplemented: false, color: 'bg-indigo-500' },
  { type: 'READ', label: 'Must Read', description: 'Role must read and acknowledge', runtimeImplemented: false, color: 'bg-blue-500' },
  { type: 'EDIT', label: 'Must Edit', description: 'Role must edit document before proceeding', runtimeImplemented: false, color: 'bg-amber-500' },
  { type: 'NOTIFY', label: 'Notify', description: 'Send notification only', runtimeImplemented: false, color: 'bg-teal-500' },
  { type: 'CONDITION', label: 'Condition', description: 'Branching rule (placeholder)', runtimeImplemented: false, color: 'bg-gray-500' },
];

const LEGACY_STEP_MAP: Record<string, Role> = {
  HOD: 'HOD',
  FINANCE: 'FINANCE_DIRECTOR',
  GM: 'GENERAL_MANAGER',
};

export function normalizeLegacyRole(value: string): Role | null {
  if (value in LEGACY_STEP_MAP) return LEGACY_STEP_MAP[value];
  const valid: Role[] = ['EMPLOYEE', 'SUPERVISOR', 'HOD', 'FINANCE_DIRECTOR', 'GENERAL_MANAGER', 'SYSTEM_ADMINISTRATOR'];
  if (valid.includes(value as Role)) return value as Role;
  return null;
}

export function createStepId(): string {
  return `step-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function createApprovalStep(role: Role = 'HOD', label?: string): WorkflowApprovalStep {
  return { id: createStepId(), type: 'APPROVAL', role, label };
}

export function createDefaultStep(type: WorkflowStepType): WorkflowStep {
  switch (type) {
    case 'PARALLEL':
      return {
        id: createStepId(),
        type: 'PARALLEL',
        label: 'Parallel signatures',
        steps: [createApprovalStep('HOD'), createApprovalStep('FINANCE_DIRECTOR')],
      };
    case 'READ':
      return { id: createStepId(), type: 'READ', role: 'SUPERVISOR', action: 'READ', label: 'Must read' };
    case 'EDIT':
      return { id: createStepId(), type: 'EDIT', role: 'EMPLOYEE', action: 'EDIT', label: 'Must edit' };
    case 'NOTIFY':
      return { id: createStepId(), type: 'NOTIFY', role: 'SUPERVISOR', label: 'Notification' };
    case 'CONDITION':
      return { id: createStepId(), type: 'CONDITION', label: 'Condition', expression: '' };
    default:
      return createApprovalStep('HOD');
  }
}

export function parseWorkflowSteps(raw: unknown): WorkflowStep[] {
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

export function stepTypeMeta(type: WorkflowStepType) {
  return WORKFLOW_STEP_TYPES.find((t) => t.type === type) ?? WORKFLOW_STEP_TYPES[0];
}

export function stepDisplayLabel(step: WorkflowStep, roleLabels: Record<Role, string>): string {
  if (step.label) return step.label;
  switch (step.type) {
    case 'APPROVAL':
    case 'SIGN':
      return roleLabels[step.role] ?? step.role;
    case 'PARALLEL':
      return step.steps.map((s) => roleLabels[s.role] ?? s.role).join(' + ');
    case 'READ':
      return `Read — ${roleLabels[step.role] ?? step.role}`;
    case 'EDIT':
      return `Edit — ${roleLabels[step.role] ?? step.role}`;
    case 'NOTIFY':
      return step.role ? `Notify — ${roleLabels[step.role]}` : 'Notify';
    case 'CONDITION':
      return 'Condition';
    default:
      return 'Step';
  }
}

export const WORKFLOW_STATUS_LABELS: Record<WorkflowStatus, string> = {
  DRAFT: 'Draft',
  ACTIVE: 'Active',
  ARCHIVED: 'Archived',
};
