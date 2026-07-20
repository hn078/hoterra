import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Save,
  CheckCircle,
  Upload,
  Play,
  Circle,
  GitBranch,
  Settings2,
  ArrowDown,
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  Star,
  Eye,
  Pencil,
  Bell,
  GitMerge,
  Users,
  AlertCircle,
} from 'lucide-react';
import { Header } from '@/components/layout/Sidebar';
import { Breadcrumbs } from '@/components/ui/Breadcrumbs';
import { SwitchField } from '@/components/ui/Switch';
import { api } from '@/lib/api';
import { SIGNATURE_ROLES } from '@/lib/signatures';
import type { Role, WorkflowItem } from '@/types';
import { ROLE_LABELS } from '@/types';
import {
  WORKFLOW_STEP_TYPES,
  WORKFLOW_STATUS_LABELS,
  createDefaultStep,
  createApprovalStep,
  parseWorkflowSteps,
  stepDisplayLabel,
  stepTypeMeta,
  type WorkflowStep,
  type WorkflowStepType,
  type WorkflowApprovalStep,
  type WorkflowParallelStep,
} from '@/lib/workflows';
import { cn } from '@/lib/utils';

const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: 'EMPLOYEE', label: ROLE_LABELS.EMPLOYEE },
  { value: 'SUPERVISOR', label: ROLE_LABELS.SUPERVISOR },
  ...SIGNATURE_ROLES.map(({ role, label }) => ({ value: role, label })),
];

const STEP_ICONS: Partial<Record<WorkflowStepType, React.ElementType>> = {
  APPROVAL: CheckCircle,
  SIGN: CheckCircle,
  PARALLEL: Users,
  READ: Eye,
  EDIT: Pencil,
  NOTIFY: Bell,
  CONDITION: GitMerge,
};

export function WorkflowDesignerPage() {
  const { id } = useParams<{ id: string }>();
  const [workflow, setWorkflow] = useState<WorkflowItem | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const [showAddMenu, setShowAddMenu] = useState(false);

  useEffect(() => {
    if (id) {
      api.getWorkflow(id).then((wf) => {
        setWorkflow({ ...wf, steps: parseWorkflowSteps(wf.steps) });
        setSelectedIndex(0);
      }).catch(console.error);
    }
  }, [id]);

  const updateWorkflow = (patch: Partial<Pick<WorkflowItem, 'name' | 'description' | 'steps' | 'isDefault' | 'status'>>) => {
    setWorkflow((prev) => (prev ? { ...prev, ...patch } : prev));
  };

  const handleSave = async () => {
    if (!id || !workflow) return;
    setSaving(true);
    try {
      const saved = await api.updateWorkflow(id, {
        name: workflow.name,
        description: workflow.description ?? undefined,
        steps: workflow.steps,
      });
      setWorkflow({ ...saved, steps: parseWorkflowSteps(saved.steps) });
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to save workflow');
    } finally {
      setSaving(false);
    }
  };

  const handleValidate = () => {
    if (!workflow?.steps?.length) {
      alert('Workflow must have at least one step');
      return;
    }
    alert('Workflow structure is valid');
  };

  const handleActivate = async () => {
    if (!id || !workflow) return;
    if (!workflow.steps?.length) {
      alert('Add at least one step before activating');
      return;
    }
    setSaving(true);
    try {
      await api.updateWorkflow(id, {
        name: workflow.name,
        description: workflow.description ?? undefined,
        steps: workflow.steps,
      });
      const activated = await api.activateWorkflow(id);
      setWorkflow({ ...activated, steps: parseWorkflowSteps(activated.steps) });
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to activate workflow');
    } finally {
      setSaving(false);
    }
  };

  const handleSetDefault = async (checked: boolean) => {
    if (!id || !workflow) return;
    if (workflow.status !== 'ACTIVE') {
      alert('Activate the workflow before setting it as default');
      return;
    }
    setSaving(true);
    try {
      const updated = await api.setWorkflowDefault(id, checked);
      setWorkflow({ ...updated, steps: parseWorkflowSteps(updated.steps) });
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update default');
    } finally {
      setSaving(false);
    }
  };

  const addStep = (type: WorkflowStepType) => {
    if (!workflow) return;
    const steps = [...workflow.steps, createDefaultStep(type)];
    updateWorkflow({ steps });
    setSelectedIndex(steps.length - 1);
    setShowAddMenu(false);
  };

  const removeStep = (index: number) => {
    if (!workflow) return;
    const steps = workflow.steps.filter((_, i) => i !== index);
    updateWorkflow({ steps });
    setSelectedIndex(Math.min(selectedIndex, Math.max(0, steps.length - 1)));
  };

  const moveStep = (index: number, direction: -1 | 1) => {
    if (!workflow) return;
    const target = index + direction;
    if (target < 0 || target >= workflow.steps.length) return;
    const steps = [...workflow.steps];
    [steps[index], steps[target]] = [steps[target], steps[index]];
    updateWorkflow({ steps });
    setSelectedIndex(target);
  };

  const updateStep = (index: number, patch: Partial<WorkflowStep>) => {
    if (!workflow) return;
    const steps = [...workflow.steps];
    steps[index] = { ...steps[index], ...patch } as WorkflowStep;
    updateWorkflow({ steps });
  };

  const updateParallelSubStep = (stepIndex: number, subIndex: number, role: Role) => {
    if (!workflow) return;
    const step = workflow.steps[stepIndex];
    if (step.type !== 'PARALLEL') return;
    const subSteps = [...step.steps];
    subSteps[subIndex] = { ...subSteps[subIndex], role };
    updateStep(stepIndex, { steps: subSteps } as Partial<WorkflowParallelStep>);
  };

  const addParallelSubStep = (stepIndex: number) => {
    if (!workflow) return;
    const step = workflow.steps[stepIndex];
    if (step.type !== 'PARALLEL') return;
    updateStep(stepIndex, {
      steps: [...step.steps, createApprovalStep('SUPERVISOR')],
    } as Partial<WorkflowParallelStep>);
  };

  const removeParallelSubStep = (stepIndex: number, subIndex: number) => {
    if (!workflow) return;
    const step = workflow.steps[stepIndex];
    if (step.type !== 'PARALLEL' || step.steps.length <= 2) return;
    updateStep(stepIndex, {
      steps: step.steps.filter((_, i) => i !== subIndex),
    } as Partial<WorkflowParallelStep>);
  };

  const selectedStep = workflow?.steps[selectedIndex];
  const isDraft = workflow?.status === 'DRAFT';
  const isActive = workflow?.status === 'ACTIVE';

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-hoterra-page">
      <Header
        title={workflow?.name ?? 'Workflow Designer'}
        subtitle={workflow?.description ?? 'Design approval route'}
        action={
          <div className="flex items-center gap-2">
            {workflow && (
              <StatusBadge status={workflow.status} isDefault={workflow.isDefault} />
            )}
            <ToolbarBtn icon={Save} label={saving ? 'Saving...' : 'Save Draft'} variant="outline" onClick={handleSave} disabled={saving} />
            <ToolbarBtn icon={CheckCircle} label="Validate" variant="outline" onClick={handleValidate} />
            {isDraft && (
              <ToolbarBtn icon={Upload} label="Activate" variant="primary" onClick={handleActivate} disabled={saving} />
            )}
          </div>
        }
      />

      <div className="border-b border-gray-200 bg-white px-6 pb-2 pt-2">
        <Breadcrumbs
          items={[
            { label: 'Workflows', to: '/workflows' },
            { label: workflow?.name ?? 'Designer' },
          ]}
        />
      </div>

      <div className="flex flex-1 overflow-hidden bg-hoterra-page">
        <aside className="card w-64 shrink-0 overflow-y-auto rounded-none border-r border-t-0 border-l-0 border-b-0 p-5 shadow-none">
          <h3 className="mb-4 text-xs font-semibold uppercase tracking-wide text-gray-400">
            Workflow Details
          </h3>
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-xs text-gray-500">Name</label>
              <input
                type="text"
                value={workflow?.name ?? ''}
                onChange={(e) => updateWorkflow({ name: e.target.value })}
                className="input w-full text-sm"
                placeholder="Workflow name"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-500">Description</label>
              <textarea
                value={workflow?.description ?? ''}
                onChange={(e) => updateWorkflow({ description: e.target.value })}
                rows={3}
                className="input w-full resize-none text-sm"
                placeholder="Describe this approval route"
              />
            </div>

            {isActive && (
              <SwitchField
                label="Default workflow"
                description="Used when creating new documents"
                checked={workflow?.isDefault ?? false}
                onChange={handleSetDefault}
                disabled={saving}
              />
            )}

            {isDraft && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                <div className="flex items-start gap-2">
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <p>Draft workflows are not available in document creation until activated.</p>
                </div>
              </div>
            )}
          </div>

          <div className="relative mt-6">
            <button
              type="button"
              onClick={() => setShowAddMenu((v) => !v)}
              disabled={!workflow}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 px-3 py-2 text-sm text-gray-600 hover:border-hoterra-steel hover:text-hoterra-steel disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              Add step
            </button>
            {showAddMenu && (
              <div className="absolute left-0 right-0 top-full z-10 mt-1 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
                {WORKFLOW_STEP_TYPES.map(({ type, label, runtimeImplemented }) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => addStep(type)}
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-gray-50"
                  >
                    <span>{label}</span>
                    {!runtimeImplemented && (
                      <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">Design</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </aside>

        <div className="relative flex-1 overflow-auto bg-[radial-gradient(circle,#e5e7eb_1px,transparent_1px)] bg-[size:20px_20px] p-8">
          <div className="mx-auto flex max-w-md flex-col items-center">
            <FlowNode
              title="Start"
              subtitle="Document submitted for approval"
              color="bg-green-500"
              icon={<Play className="h-4 w-4" />}
              selected={false}
              onClick={() => {}}
            />

            <FlowConnector />

            {workflow?.steps.map((step, i) => (
              <div key={step.id ?? i} className="flex w-full flex-col items-center">
                <FlowNode
                  title={stepTypeMeta(step.type === 'SIGN' ? 'APPROVAL' : step.type).label}
                  subtitle={`Step ${i + 1} · ${stepDisplayLabel(step, ROLE_LABELS)}`}
                  color={stepTypeMeta(step.type === 'SIGN' ? 'APPROVAL' : step.type).color}
                  icon={renderStepIcon(step.type)}
                  selected={selectedIndex === i}
                  badge={!stepTypeMeta(step.type === 'SIGN' ? 'APPROVAL' : step.type).runtimeImplemented ? 'Design only' : undefined}
                  onClick={() => setSelectedIndex(i)}
                />
                {i < workflow.steps.length - 1 && <FlowConnector />}
              </div>
            ))}

            {workflow && workflow.steps.length === 0 && (
              <p className="my-4 text-center text-sm text-gray-400">
                No steps yet. Add approval, parallel signatures, read/edit, or notify steps.
              </p>
            )}

            <FlowConnector />

            <FlowNode
              title="End"
              subtitle="Document published"
              color="bg-red-500"
              icon={<Circle className="h-4 w-4" />}
              selected={false}
              onClick={() => {}}
            />
          </div>
        </div>

        <aside className="card w-80 shrink-0 overflow-y-auto rounded-none border-l border-t-0 border-r-0 border-b-0 p-5 shadow-none">
          <div className="mb-4 flex items-center gap-2">
            <Settings2 className="h-4 w-4 text-hoterra-steel" />
            <h3 className="font-semibold text-hoterra-navy">Step Properties</h3>
          </div>

          {selectedStep ? (
            <StepPropertiesPanel
              step={selectedStep}
              index={selectedIndex}
              total={workflow?.steps.length ?? 0}
              onUpdate={(patch) => updateStep(selectedIndex, patch)}
              onMoveUp={() => moveStep(selectedIndex, -1)}
              onMoveDown={() => moveStep(selectedIndex, 1)}
              onRemove={() => removeStep(selectedIndex)}
              canMoveUp={selectedIndex > 0}
              canMoveDown={!!workflow && selectedIndex < workflow.steps.length - 1}
              onUpdateParallelSubStep={(subIndex, role) => updateParallelSubStep(selectedIndex, subIndex, role)}
              onAddParallelSubStep={() => addParallelSubStep(selectedIndex)}
              onRemoveParallelSubStep={(subIndex) => removeParallelSubStep(selectedIndex, subIndex)}
            />
          ) : workflow && workflow.steps.length === 0 ? (
            <div className="space-y-3 text-sm text-gray-500">
              <p>No steps yet. Use <strong className="text-hoterra-navy">Add step</strong> in the left panel to build your route.</p>
              <p className="text-xs">Choose from Approval, Parallel, Read, Edit, Notify, or Condition step types.</p>
            </div>
          ) : (
            <p className="text-sm text-gray-400">Select a step to edit</p>
          )}

          <Link
            to="/workflows"
            className="mt-6 inline-flex items-center gap-1 text-xs text-hoterra-steel hover:underline"
          >
            <GitBranch className="h-3.5 w-3.5" />
            Back to workflows
          </Link>
        </aside>
      </div>
    </div>
  );
}

function StepPropertiesPanel({
  step,
  index,
  total,
  onUpdate,
  onMoveUp,
  onMoveDown,
  onRemove,
  canMoveUp,
  canMoveDown,
  onUpdateParallelSubStep,
  onAddParallelSubStep,
  onRemoveParallelSubStep,
}: {
  step: WorkflowStep;
  index: number;
  total: number;
  onUpdate: (patch: Partial<WorkflowStep>) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onUpdateParallelSubStep: (subIndex: number, role: Role) => void;
  onAddParallelSubStep: () => void;
  onRemoveParallelSubStep: (subIndex: number) => void;
}) {
  const meta = stepTypeMeta(step.type === 'SIGN' ? 'APPROVAL' : step.type);

  return (
    <div className="space-y-4 text-sm">
      <PropRow label="Step" value={`${index + 1} of ${total}`} />
      <PropRow label="Type" value={meta.label} />

      {!meta.runtimeImplemented && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-2.5 text-xs text-gray-600">
          This step type is saved in the workflow design but not yet enforced at runtime.
        </div>
      )}

      <div>
        <label className="mb-1 block text-xs text-gray-500">Label (optional)</label>
        <input
          type="text"
          value={step.label ?? ''}
          onChange={(e) => onUpdate({ label: e.target.value || undefined })}
          className="input w-full text-sm"
          placeholder={meta.label}
        />
      </div>

      {(step.type === 'APPROVAL' || step.type === 'SIGN') && (
        <RoleSelect
          label="Approver role"
          value={(step as WorkflowApprovalStep).role}
          onChange={(role) => onUpdate({ role } as Partial<WorkflowApprovalStep>)}
        />
      )}

      {(step.type === 'READ' || step.type === 'EDIT') && (
        <RoleSelect
          label={step.type === 'READ' ? 'Reader role' : 'Editor role'}
          value={step.role}
          onChange={(role) => role && onUpdate({ role })}
        />
      )}

      {step.type === 'NOTIFY' && (
        <RoleSelect
          label="Notify role (optional)"
          value={step.role}
          onChange={(role) => onUpdate({ role: role === '' ? undefined : role })}
          allowEmpty
        />
      )}

      {step.type === 'CONDITION' && (
        <div>
          <label className="mb-1 block text-xs text-gray-500">Condition expression (placeholder)</label>
          <textarea
            value={step.expression ?? ''}
            onChange={(e) => onUpdate({ expression: e.target.value })}
            rows={2}
            className="input w-full resize-none text-sm"
            placeholder="e.g. department == 'Finance'"
          />
        </div>
      )}

      {step.type === 'PARALLEL' && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-gray-500">Parallel signers</p>
          {step.steps.map((sub, subIndex) => (
            <div key={sub.id} className="flex items-center gap-2">
              <select
                value={sub.role}
                onChange={(e) => onUpdateParallelSubStep(subIndex, e.target.value as Role)}
                className="input flex-1 text-sm"
              >
                {ROLE_OPTIONS.map(({ value, label }) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => onRemoveParallelSubStep(subIndex)}
                disabled={step.steps.length <= 2}
                className="rounded p-1 text-red-500 hover:bg-red-50 disabled:opacity-30"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={onAddParallelSubStep}
            className="inline-flex items-center gap-1 text-xs text-hoterra-steel hover:underline"
          >
            <Plus className="h-3.5 w-3.5" />
            Add parallel signer
          </button>
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onMoveUp}
          disabled={!canMoveUp}
          className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg border border-gray-200 px-3 py-2 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-40"
        >
          <ChevronUp className="h-3.5 w-3.5" />
          Move up
        </button>
        <button
          type="button"
          onClick={onMoveDown}
          disabled={!canMoveDown}
          className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg border border-gray-200 px-3 py-2 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-40"
        >
          <ChevronDown className="h-3.5 w-3.5" />
          Move down
        </button>
      </div>

      <button
        type="button"
        onClick={onRemove}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
      >
        <Trash2 className="h-4 w-4" />
        Remove step
      </button>
    </div>
  );
}

function RoleSelect({
  label,
  value,
  onChange,
  allowEmpty,
}: {
  label: string;
  value?: Role;
  onChange: (role: Role | '') => void;
  allowEmpty?: boolean;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs text-gray-500">{label}</label>
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value as Role | '')}
        className="input w-full text-sm"
      >
        {allowEmpty && <option value="">All roles</option>}
        {ROLE_OPTIONS.map(({ value: v, label: l }) => (
          <option key={v} value={v}>{l}</option>
        ))}
      </select>
    </div>
  );
}

function renderStepIcon(type: WorkflowStepType) {
  const Icon = STEP_ICONS[type === 'SIGN' ? 'APPROVAL' : type] ?? CheckCircle;
  return <Icon className="h-4 w-4" />;
}

function StatusBadge({ status, isDefault }: { status: WorkflowItem['status']; isDefault: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-medium">
      <span className={cn(
        'h-2 w-2 rounded-full',
        status === 'ACTIVE' ? 'bg-green-500' : status === 'DRAFT' ? 'bg-amber-400' : 'bg-gray-400'
      )} />
      {WORKFLOW_STATUS_LABELS[status]}
      {isDefault && (
        <>
          <span className="text-gray-300">·</span>
          <Star className="h-3 w-3 fill-hoterra-gold text-hoterra-gold" />
          Default
        </>
      )}
    </span>
  );
}

function FlowNode({
  title,
  subtitle,
  color,
  icon,
  selected,
  badge,
  onClick,
}: {
  title: string;
  subtitle: string;
  color: string;
  icon: React.ReactNode;
  selected: boolean;
  badge?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full rounded-xl border-2 bg-white p-4 text-left shadow-sm transition-all',
        selected ? 'border-hoterra-gold ring-2 ring-hoterra-gold/20' : 'border-gray-200 hover:border-hoterra-steel'
      )}
    >
      <div className="flex items-start gap-3">
        <div className={cn('mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white', color)}>
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-hoterra-navy">{title}</p>
          <p className="mt-0.5 text-xs text-gray-500">{subtitle}</p>
          {badge && (
            <span className="mt-1 inline-block rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">{badge}</span>
          )}
        </div>
      </div>
    </button>
  );
}

function FlowConnector() {
  return (
    <div className="flex flex-col items-center py-1 text-gray-300">
      <div className="h-4 w-0.5 bg-gray-300" />
      <ArrowDown className="h-4 w-4" />
      <div className="h-4 w-0.5 bg-gray-300" />
    </div>
  );
}

function PropRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className="mt-0.5 font-medium text-gray-800">{value}</dd>
    </div>
  );
}

function ToolbarBtn({
  icon: Icon,
  label,
  variant,
  onClick,
  disabled,
}: {
  icon: React.ElementType;
  label: string;
  variant: 'outline' | 'primary';
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50',
        variant === 'primary'
          ? 'bg-hoterra-navy text-white hover:bg-hoterra-steel'
          : 'border border-gray-200 text-gray-700 hover:bg-gray-50'
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}
