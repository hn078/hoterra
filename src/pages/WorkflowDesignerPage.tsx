import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Save,
  CheckCircle,
  Upload,
  Play,
  Square,
  Circle,
  Diamond,
  GitBranch,
  Users,
  Settings2,
  GripVertical,
  ArrowDown,
} from 'lucide-react';
import { Header } from '@/components/layout/Sidebar';
import { Breadcrumbs } from '@/components/ui/Breadcrumbs';
import { api } from '@/lib/api';
import { WORKFLOW_STEPS } from '@/data/mock';
import type { WorkflowItem } from '@/types';
import { cn } from '@/lib/utils';

const PALETTE_ITEMS = [
  { type: 'start', label: 'Start', icon: Play, color: 'bg-green-500' },
  { type: 'task', label: 'User Task', icon: Square, color: 'bg-blue-500' },
  { type: 'approval', label: 'Approval', icon: CheckCircle, color: 'bg-purple-500' },
  { type: 'condition', label: 'Condition', icon: Diamond, color: 'bg-yellow-400' },
  { type: 'parallel', label: 'Parallel', icon: Users, color: 'bg-orange-500' },
  { type: 'end', label: 'End', icon: Circle, color: 'bg-red-500' },
];

export function WorkflowDesignerPage() {
  const { id } = useParams<{ id: string }>();
  const [workflow, setWorkflow] = useState<WorkflowItem | null>(null);
  const [selectedStepId, setSelectedStepId] = useState(WORKFLOW_STEPS[1]?.id ?? '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (id) {
      api.getWorkflow(id).then(setWorkflow).catch(console.error);
    }
  }, [id]);

  const selectedStep = WORKFLOW_STEPS.find((s) => s.id === selectedStepId);

  const handleSave = async () => {
    if (!id || !workflow) return;
    setSaving(true);
    try {
      await api.updateWorkflow(id, {
        name: workflow.name,
        description: workflow.description ?? undefined,
        steps: workflow.steps,
      });
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
    alert('Workflow is valid');
  };

  const handlePublish = async () => {
    if (!id || !workflow) return;
    if (!workflow.steps?.length) {
      alert('Workflow must have at least one step before publishing');
      return;
    }
    setSaving(true);
    try {
      await api.updateWorkflow(id, {
        name: workflow.name,
        description: workflow.description ?? undefined,
        steps: workflow.steps,
      });
      alert('Workflow published successfully');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to publish workflow');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-hoterra-page">
      <Header
        title={workflow?.name ?? 'Workflow Designer'}
        subtitle={workflow?.description ?? 'Design approval route'}
        action={
          <div className="flex items-center gap-2">
            <ToolbarBtn icon={Save} label={saving ? 'Saving...' : 'Save'} variant="outline" onClick={handleSave} disabled={saving} />
            <ToolbarBtn icon={CheckCircle} label="Validate" variant="outline" onClick={handleValidate} />
            <ToolbarBtn icon={Upload} label="Publish" variant="primary" onClick={handlePublish} />
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
        <aside className="card w-56 shrink-0 overflow-y-auto rounded-none border-r border-t-0 border-l-0 border-b-0 p-4 shadow-none">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
            Step Palette
          </h3>
          <div className="space-y-2">
            {PALETTE_ITEMS.map(({ type, label, icon: Icon, color }) => (
              <div
                key={type}
                draggable
                className="flex cursor-grab items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm hover:border-hoterra-steel hover:bg-white"
              >
                <GripVertical className="h-3.5 w-3.5 text-gray-300" />
                <div className={cn('flex h-6 w-6 items-center justify-center rounded text-white', color)}>
                  <Icon className="h-3.5 w-3.5" />
                </div>
                <span className="text-gray-700">{label}</span>
              </div>
            ))}
          </div>
        </aside>

        <div className="relative flex-1 overflow-auto bg-[radial-gradient(circle,#e5e7eb_1px,transparent_1px)] bg-[size:20px_20px] p-8">
          <div className="mx-auto flex max-w-md flex-col items-center">
            {WORKFLOW_STEPS.map((step, i) => (
              <div key={step.id} className="flex w-full flex-col items-center">
                <button
                  onClick={() => setSelectedStepId(step.id)}
                  className={cn(
                    'w-full rounded-xl border-2 bg-white p-4 text-left shadow-sm transition-all',
                    selectedStepId === step.id
                      ? 'border-hoterra-gold ring-2 ring-hoterra-gold/20'
                      : 'border-gray-200 hover:border-hoterra-steel'
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className={cn('mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white', step.color)}>
                      <StepIcon type={step.type} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-hoterra-navy">{step.title}</p>
                      <p className="mt-0.5 text-xs text-gray-500">{step.subtitle}</p>
                    </div>
                  </div>
                </button>
                {i < WORKFLOW_STEPS.length - 1 && (
                  <div className="flex flex-col items-center py-1 text-gray-300">
                    <div className="h-4 w-0.5 bg-gray-300" />
                    <ArrowDown className="h-4 w-4" />
                    <div className="h-4 w-0.5 bg-gray-300" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <aside className="card w-72 shrink-0 overflow-y-auto rounded-none border-l border-t-0 border-r-0 border-b-0 p-5 shadow-none">
          <div className="mb-4 flex items-center gap-2">
            <Settings2 className="h-4 w-4 text-hoterra-steel" />
            <h3 className="font-semibold text-hoterra-navy">Step Properties</h3>
          </div>

          {selectedStep ? (
            <dl className="space-y-4 text-sm">
              <PropRow label="Step ID" value={selectedStep.id} />
              <PropRow label="Type" value={selectedStep.type} />
              <PropRow label="Title" value={selectedStep.title} />
              <PropRow label="Description" value={selectedStep.subtitle} />

              <div>
                <dt className="mb-1 text-xs text-gray-500">Assignee Role</dt>
                <select
                  disabled
                  className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600"
                  defaultValue="hod"
                >
                  <option value="author">Author</option>
                  <option value="supervisor">Supervisor</option>
                  <option value="hod">Head of Department</option>
                  <option value="finance">Finance Director</option>
                  <option value="gm">General Manager</option>
                </select>
              </div>

              <div>
                <dt className="mb-1 text-xs text-gray-500">Timeout (days)</dt>
                <input
                  type="number"
                  disabled
                  defaultValue={5}
                  className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600"
                />
              </div>

              <div className="flex items-center gap-2">
                <input type="checkbox" id="required" defaultChecked disabled className="h-4 w-4 rounded" />
                <label htmlFor="required" className="text-sm text-gray-600">
                  Required step
                </label>
              </div>
            </dl>
          ) : (
            <p className="text-sm text-gray-400">Select a step to view properties</p>
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

function StepIcon({ type }: { type: string }) {
  switch (type) {
    case 'start':
      return <Play className="h-4 w-4" />;
    case 'end':
      return <Circle className="h-4 w-4" />;
    case 'condition':
      return <Diamond className="h-4 w-4" />;
    case 'approval':
      return <CheckCircle className="h-4 w-4" />;
    case 'parallel':
      return <Users className="h-4 w-4" />;
    default:
      return <Square className="h-4 w-4" />;
  }
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
