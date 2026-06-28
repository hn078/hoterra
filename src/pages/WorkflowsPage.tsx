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
import { cn } from '@/lib/utils';

export function WorkflowsPage() {
  const navigate = useNavigate();
  const [workflows, setWorkflows] = useState<WorkflowItem[]>([]);
  const [view, setView] = useState<'cards' | 'table'>('cards');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    api.getWorkflows().then(setWorkflows).catch(console.error);
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
              <WorkflowCard key={wf.id} workflow={wf} />
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
                        {wf.isDefault && (
                          <Star className="h-3.5 w-3.5 fill-hoterra-gold text-hoterra-gold" />
                        )}
                      </div>
                    </td>
                    <td className="max-w-xs truncate px-4 py-3 text-gray-600">
                      {wf.description ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{wf.steps.length}</td>
                    <td className="px-4 py-3">
                      <WorkflowStatus isDefault={wf.isDefault} />
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

function WorkflowCard({ workflow }: { workflow: WorkflowItem }) {
  return (
    <Link
      to={`/workflows/${workflow.id}/designer`}
      className="card group p-5 transition-shadow hover:border-hoterra-steel/40 hover:shadow-md"
    >
      <div className="mb-3 flex items-start justify-between">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-hoterra-steel/10">
          <GitBranch className="h-5 w-5 text-hoterra-steel" />
        </div>
        <WorkflowStatus isDefault={workflow.isDefault} />
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
      <div className="mt-4 flex items-center justify-between text-xs text-gray-400">
        <span>{workflow.steps.length} steps</span>
        <span className="flex items-center gap-1 text-hoterra-steel opacity-0 transition-opacity group-hover:opacity-100">
          Open Designer
          <ChevronRight className="h-3.5 w-3.5" />
        </span>
      </div>
    </Link>
  );
}

function WorkflowStatus({ isDefault }: { isDefault: boolean }) {
  return (
    <span
      className={cn(
        'rounded-full px-2.5 py-0.5 text-xs font-medium',
        isDefault ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
      )}
    >
      {isDefault ? 'Active' : 'Draft'}
    </span>
  );
}
