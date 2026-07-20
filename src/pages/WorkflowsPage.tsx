import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  GitBranch,
  Plus,
  LayoutGrid,
  List,
  ChevronRight,
  Star,
} from 'lucide-react';
import { Header } from '@/components/layout/Sidebar';
import { Breadcrumbs } from '@/components/ui/Breadcrumbs';
import { api } from '@/lib/api';
import type { WorkflowItem } from '@/types';
import {
  WORKFLOW_STATUS_LABELS,
  countWorkflowSteps,
  parseWorkflowSteps,
  stepDisplayLabel,
  stepTypeMeta,
} from '@/lib/workflows';
import { ROLE_LABELS } from '@/types';
import { cn } from '@/lib/utils';

export function WorkflowsPage() {
  const navigate = useNavigate();
  const [workflows, setWorkflows] = useState<WorkflowItem[]>([]);
  const [view, setView] = useState<'cards' | 'table'>('cards');
  const [creating, setCreating] = useState(false);
  const [updatingDefault, setUpdatingDefault] = useState<string | null>(null);

  const loadWorkflows = () => {
    api.getWorkflows().then((list) => {
      setWorkflows(list.map((wf) => ({ ...wf, steps: parseWorkflowSteps(wf.steps) })));
    }).catch(console.error);
  };

  useEffect(() => {
    loadWorkflows();
  }, []);

  const handleNewWorkflow = async () => {
    setCreating(true);
    try {
      const wf = await api.createWorkflow({
        name: 'New Workflow',
        description: 'Configure approval route',
      });
      navigate(`/workflows/${wf.id}/designer`);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to create workflow');
    } finally {
      setCreating(false);
    }
  };

  const handleSetDefault = async (e: React.MouseEvent, wf: WorkflowItem) => {
    e.preventDefault();
    e.stopPropagation();
    if (wf.status !== 'ACTIVE') {
      alert('Activate the workflow in the designer before setting it as default');
      return;
    }
    setUpdatingDefault(wf.id);
    try {
      await api.setWorkflowDefault(wf.id, !wf.isDefault);
      loadWorkflows();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update default');
    } finally {
      setUpdatingDefault(null);
    }
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-hoterra-page">
      <Header
        title="Workflows"
        subtitle="Configure document approval routes and processes"
        action={
          <button
            onClick={handleNewWorkflow}
            disabled={creating}
            className="btn-primary disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            {creating ? 'Creating...' : 'New Workflow'}
          </button>
        }
      />

      <div className="border-b border-gray-200 bg-white px-6 pb-4 pt-2">
        <Breadcrumbs items={[{ label: 'Workflows' }]} />
      </div>

      <div className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-3">
        <p className="text-sm text-gray-500">{workflows.length} workflow routes</p>
        <div className="flex rounded-lg border border-gray-200 p-0.5">
          <button
            onClick={() => setView('cards')}
            className={cn(
              'rounded-md p-1.5',
              view === 'cards' ? 'bg-gray-100 text-hoterra-navy' : 'text-gray-400'
            )}
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
          <button
            onClick={() => setView('table')}
            className={cn(
              'rounded-md p-1.5',
              view === 'table' ? 'bg-gray-100 text-hoterra-navy' : 'text-gray-400'
            )}
          >
            <List className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="page-content">
        {view === 'cards' ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {workflows.map((wf) => (
              <WorkflowCard
                key={wf.id}
                workflow={wf}
                onSetDefault={handleSetDefault}
                updatingDefault={updatingDefault === wf.id}
              />
            ))}
          </div>
        ) : (
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="border-b border-gray-100 bg-gray-50 text-left text-xs text-gray-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Description</th>
                  <th className="px-4 py-3 font-medium">Steps</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Default</th>
                  <th className="px-4 py-3 font-medium" />
                </tr>
              </thead>
              <tbody>
                {workflows.map((wf) => (
                  <tr key={wf.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <GitBranch className="h-4 w-4 text-hoterra-steel" />
                        <span className="font-medium text-hoterra-navy">{wf.name}</span>
                      </div>
                    </td>
                    <td className="max-w-xs truncate px-4 py-3 text-gray-600">
                      {wf.description ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{countWorkflowSteps(wf.steps)}</td>
                    <td className="px-4 py-3">
                      <WorkflowStatusBadge status={wf.status} />
                    </td>
                    <td className="px-4 py-3">
                      {wf.status === 'ACTIVE' ? (
                        <button
                          type="button"
                          onClick={(e) => handleSetDefault(e, wf)}
                          disabled={updatingDefault === wf.id}
                          className={cn(
                            'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs',
                            wf.isDefault
                              ? 'bg-hoterra-gold/15 text-hoterra-gold'
                              : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'
                          )}
                        >
                          <Star className={cn('h-3 w-3', wf.isDefault && 'fill-current')} />
                          {wf.isDefault ? 'Default' : 'Set default'}
                        </button>
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        to={`/workflows/${wf.id}/designer`}
                        className="inline-flex items-center gap-1 text-sm text-hoterra-steel hover:underline"
                      >
                        Open Designer
                        <ChevronRight className="h-4 w-4" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {workflows.length === 0 && (
          <div className="flex h-48 items-center justify-center rounded-xl border border-dashed border-gray-300 bg-white">
            <p className="text-sm text-gray-400">No workflows configured</p>
          </div>
        )}
      </div>
    </div>
  );
}

function WorkflowCard({
  workflow,
  onSetDefault,
  updatingDefault,
}: {
  workflow: WorkflowItem;
  onSetDefault: (e: React.MouseEvent, wf: WorkflowItem) => void;
  updatingDefault: boolean;
}) {
  const stepCount = countWorkflowSteps(workflow.steps);

  return (
    <Link
      to={`/workflows/${workflow.id}/designer`}
      className="card group p-5 transition-shadow hover:border-hoterra-steel/40 hover:shadow-md"
    >
      <div className="mb-3 flex items-start justify-between">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-hoterra-steel/10">
          <GitBranch className="h-5 w-5 text-hoterra-steel" />
        </div>
        <WorkflowStatusBadge status={workflow.status} />
      </div>
      <h3 className="font-semibold text-hoterra-navy group-hover:text-hoterra-steel">
        {workflow.name}
        {workflow.isDefault && (
          <Star className="ml-1.5 inline h-3.5 w-3.5 fill-hoterra-gold text-hoterra-gold" />
        )}
      </h3>
      <p className="mt-1 line-clamp-2 text-sm text-gray-500">
        {workflow.description ?? 'No description'}
      </p>

      <div className="mt-3 flex flex-wrap gap-1">
        {workflow.steps.slice(0, 4).map((step, i) => (
          <span
            key={step.id ?? i}
            className={cn(
              'rounded px-1.5 py-0.5 text-[10px]',
              stepTypeMeta(step.type === 'SIGN' ? 'APPROVAL' : step.type).runtimeImplemented
                ? 'bg-purple-50 text-purple-700'
                : 'bg-gray-100 text-gray-600'
            )}
          >
            {stepDisplayLabel(step, ROLE_LABELS)}
          </span>
        ))}
        {workflow.steps.length > 4 && (
          <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">
            +{workflow.steps.length - 4}
          </span>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between text-xs text-gray-400">
        <span>{stepCount} step{stepCount !== 1 ? 's' : ''}</span>
        <div className="flex items-center gap-2">
          {workflow.status === 'ACTIVE' && (
            <button
              type="button"
              onClick={(e) => onSetDefault(e, workflow)}
              disabled={updatingDefault}
              className={cn(
                'inline-flex items-center gap-1 rounded px-1.5 py-0.5 opacity-0 transition-opacity group-hover:opacity-100',
                workflow.isDefault ? 'text-hoterra-gold' : 'text-gray-500 hover:text-hoterra-steel'
              )}
            >
              <Star className={cn('h-3 w-3', workflow.isDefault && 'fill-current')} />
              {workflow.isDefault ? 'Default' : 'Set default'}
            </button>
          )}
          <span className="flex items-center gap-1 text-hoterra-steel opacity-0 transition-opacity group-hover:opacity-100">
            Open Designer
            <ChevronRight className="h-3.5 w-3.5" />
          </span>
        </div>
      </div>
    </Link>
  );
}

function WorkflowStatusBadge({ status }: { status: WorkflowItem['status'] }) {
  return (
    <span
      className={cn(
        'rounded-full px-2.5 py-0.5 text-xs font-medium',
        status === 'ACTIVE' && 'bg-green-100 text-green-700',
        status === 'DRAFT' && 'bg-amber-100 text-amber-700',
        status === 'ARCHIVED' && 'bg-gray-100 text-gray-600'
      )}
    >
      {WORKFLOW_STATUS_LABELS[status]}
    </span>
  );
}
