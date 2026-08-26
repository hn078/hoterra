import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Users,
  FileText,
  BookOpen,
  GitBranch,
  MapPin,
  ExternalLink,
} from 'lucide-react';
import { Header, DepartmentBadge, StatusBadge } from '@/components/layout/Sidebar';
import { Breadcrumbs } from '@/components/ui/Breadcrumbs';
import { DashStatCard } from '@/components/ui/DashStatCard';
import { PageTabs } from '@/components/ui/PageTabs';
import { useAppDialog } from '@/components/ui/AppDialogProvider';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { api } from '@/lib/api';
import type { Department, Document, Template, User, WorkflowItem } from '@/types';
import { CATEGORY_LABELS, ROLE_LABELS } from '@/types';
import { countWorkflowSteps, WORKFLOW_STATUS_LABELS } from '@/lib/workflows';
import { formatDate } from '@/lib/utils';
import { useAuthStore } from '@/store/auth';
import { hasCapability } from '@/modules/access-control';

type DepartmentDetail = Department & {
  users: Array<Omit<User, 'email'> & { email?: string }>;
  documents: Document[];
  workflowList?: WorkflowItem[];
  templateList?: Template[];
};

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'users', label: 'Users' },
  { id: 'documents', label: 'Documents' },
  { id: 'sops', label: 'SOPs' },
  { id: 'workflows', label: 'Workflows' },
  { id: 'templates', label: 'Templates' },
];

export function DepartmentDetailPage() {
  const currentUser = useAuthStore((state) => state.user);
  const dialog = useAppDialog();
  const canManageDepartments = hasCapability(currentUser, 'departments.manage');
  const canManageTemplates = hasCapability(currentUser, 'templates.manage');
  const canManageWorkflows = hasCapability(currentUser, 'workflows.manage');
  const canReadUserDirectory = hasCapability(currentUser, 'users.directory.read');
  const { id } = useParams<{ id: string }>();
  const [dept, setDept] = useState<DepartmentDetail | null>(null);
  const [loadError, setLoadError] = useState('');
  const [activeTab, setActiveTab] = useState('overview');
  const [showEditModal, setShowEditModal] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', location: '', description: '', color: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (id) {
      setLoadError('');
      api.getDepartment(id)
        .then(setDept)
        .catch((error) => setLoadError(error instanceof Error ? error.message : 'Department could not be loaded'));
    } else {
      setLoadError('Department not found');
    }
  }, [id]);

  const openEditModal = () => {
    if (!dept) return;
    setEditForm({
      name: dept.name,
      location: dept.location ?? 'Main Hotel',
      description: dept.description ?? '',
      color: dept.color,
    });
    setShowEditModal(true);
  };

  const handleSaveDepartment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    setSaving(true);
    try {
      const updated = await api.updateDepartment(id, editForm);
      setDept((prev) => (prev ? { ...prev, ...updated } : prev));
      setShowEditModal(false);
    } catch (err) {
      await dialog.alert(err instanceof Error ? err.message : 'Failed to update department', { title: 'Department not updated' });
    } finally {
      setSaving(false);
    }
  };

  if (!dept) {
    return (
      <div className="flex flex-1 items-center justify-center">
        {loadError ? <div className="max-w-md px-6 text-center">
          <p className="font-medium text-hoterra-navy">Department unavailable</p>
          <p className="mt-2 text-sm text-gray-500">{loadError}</p>
          <Link to="/departments" className="btn-secondary mt-4 min-h-11 justify-center">Back to departments</Link>
        </div> : <p className="text-gray-500">Loading department...</p>}
      </div>
    );
  }

  const head = dept.head ?? dept.users.find(
    (u) => u.role === 'HOD' || u.role === 'GENERAL_MANAGER'
  );
  const sops = dept.documents.filter((d) => d.category === 'SOP');
  const userCount = dept._count?.users ?? dept.users.length;
  const docCount = dept._count?.documents ?? dept.documents.length;

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-hoterra-page">
      <Header title={dept.name} subtitle={`Department · ${dept.code}`} />

      <div className="border-b border-gray-200 bg-white px-4 pb-4 pt-2 sm:px-6">
        <Breadcrumbs
          items={[
            { label: 'Departments', to: '/departments' },
            { label: dept.name },
          ]}
        />

        <div className="card mt-4 bg-gradient-to-r from-white to-gray-50/80 p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <DepartmentBadge name={dept.code} color={dept.color} />
              <div>
                <h2 className="text-lg font-bold text-hoterra-navy">{dept.name}</h2>
                {!dept.isActive && <span className="mt-1 inline-flex rounded-full bg-gray-200 px-2 py-1 text-xs font-medium text-gray-700">Inactive department</span>}
                <p className="mt-1 max-w-xl text-sm text-gray-600">{dept.description ?? dept.name}</p>
                <div className="mt-3 flex flex-wrap gap-4 text-sm text-gray-600">
                  <span className="flex items-center gap-1.5">
                    <MapPin className="h-4 w-4 text-gray-400" />
                    {dept.location ?? 'Main Hotel'}
                  </span>
                  <span className="font-mono text-xs text-gray-500">{dept.code}</span>
                </div>
              </div>
            </div>
            {canManageDepartments && <div className="flex gap-2">
              <button onClick={openEditModal} className="btn-secondary min-h-11 justify-center py-2 text-sm">Edit Department</button>
            </div>}
            {head && (
              <div className="flex items-center gap-3 rounded-lg border border-gray-100 bg-white px-4 py-3">
                <UserAvatar firstName={head.firstName} lastName={head.lastName} size="md" />
                <div>
                  <p className="text-xs text-gray-500">Department Head</p>
                  <p className="text-sm font-medium text-hoterra-navy">
                    {head.firstName} {head.lastName}
                  </p>
                  <p className="text-xs text-gray-500">{head.jobTitle || ROLE_LABELS[head.role]}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {!dept.isActive && <div className="border-b border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-800 sm:px-6">
        This department is inactive. Historical records remain readable, but new users, documents, templates and Workforce configuration cannot be assigned to it.
      </div>}

      <div className="page-stats page-stats--tabs">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <DashStatCard label="Team Members" value={userCount} icon={Users} iconColor="text-blue-600" iconBg="bg-blue-50" />
          <DashStatCard label="Documents" value={docCount} icon={FileText} iconColor="text-green-600" iconBg="bg-green-50" />
          <DashStatCard label="Active SOPs" value={sops.length} icon={BookOpen} iconColor="text-purple-600" iconBg="bg-purple-50" />
          <DashStatCard label="Workflows" value={dept.stats?.workflows ?? 0} icon={GitBranch} iconColor="text-orange-600" iconBg="bg-orange-50" />
          <DashStatCard label="Templates" value={dept.stats?.templates ?? 0} icon={FileText} iconColor="text-cyan-600" iconBg="bg-cyan-50" />
          <DashStatCard label="Under Review" value={dept.stats?.underReview ?? 0} icon={BookOpen} iconColor="text-amber-600" iconBg="bg-amber-50" />
        </div>
      </div>

      <PageTabs tabs={TABS} active={activeTab} onChange={setActiveTab} />

      <div className="flex-1 overflow-y-auto bg-hoterra-page p-4 sm:p-6">
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Widget title="Team Members" icon={Users} action={`${userCount} total`}>
              <div className="space-y-2">
                {dept.users.slice(0, 5).map((u) => {
                  const content = <>
                    <UserAvatar firstName={u.firstName} lastName={u.lastName} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-gray-800">
                        {u.firstName} {u.lastName}
                      </p>
                      <p className="text-xs text-gray-500">{u.jobTitle || ROLE_LABELS[u.role]}</p>
                    </div>
                    {canReadUserDirectory && <ExternalLink className="h-3.5 w-3.5 shrink-0 text-gray-300" />}
                  </>;
                  return canReadUserDirectory ? (
                    <Link key={u.id} to={`/users/${u.id}`} className="flex min-h-11 items-center gap-3 rounded-lg p-2 hover:bg-gray-50">
                      {content}
                    </Link>
                  ) : (
                    <div key={u.id} className="flex min-h-11 items-center gap-3 rounded-lg p-2">
                      {content}
                    </div>
                  );
                })}
              </div>
            </Widget>

            <Widget title="Standard Operating Procedures" icon={BookOpen} action={`${sops.length} SOPs`}>
              <div className="space-y-2">
                {sops.slice(0, 4).map((doc) => (
                  <Link
                    key={doc.id}
                    to={`/documents/${doc.id}`}
                    className="flex items-center justify-between rounded-lg p-2 hover:bg-gray-50"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-gray-800">{doc.title}</p>
                      <p className="text-xs text-gray-500">{doc.code}</p>
                    </div>
                    <StatusBadge status={doc.status} />
                  </Link>
                ))}
                {sops.length === 0 && (
                  <p className="py-4 text-center text-sm text-gray-400">No SOPs yet</p>
                )}
              </div>
            </Widget>

            <Widget title="Recent Documents" icon={FileText}>
              <div className="space-y-2">
                {dept.documents.slice(0, 4).map((doc) => (
                  <Link
                    key={doc.id}
                    to={`/documents/${doc.id}`}
                    className="flex items-center justify-between rounded-lg p-2 hover:bg-gray-50"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-gray-800">{doc.title}</p>
                      <p className="text-xs text-gray-500">
                        {CATEGORY_LABELS[doc.category]} · {formatDate(doc.updatedAt)}
                      </p>
                    </div>
                    <StatusBadge status={doc.status} />
                  </Link>
                ))}
              </div>
            </Widget>

            <Widget title="Workflows" icon={GitBranch}>
              <div className="space-y-2">
                {(dept.workflowList ?? []).slice(0, 4).map((wf) => {
                  const content = <>
                    <div>
                      <p className="text-sm font-medium text-gray-800">{wf.name}</p>
                      <p className="text-xs text-gray-500">{countWorkflowSteps(wf.steps)} steps</p>
                    </div>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      wf.isDefault ? 'bg-hoterra-gold/15 text-hoterra-gold' : wf.status === 'ACTIVE' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                    }`}>
                      {wf.isDefault ? 'Default' : WORKFLOW_STATUS_LABELS[wf.status ?? 'DRAFT']}
                    </span>
                  </>;
                  return canManageWorkflows ? (
                    <Link key={wf.id} to={`/workflows/${wf.id}/designer`} className="flex items-center justify-between rounded-lg border border-gray-100 p-3 hover:bg-gray-50">{content}</Link>
                  ) : (
                    <div key={wf.id} className="flex items-center justify-between rounded-lg border border-gray-100 p-3">{content}</div>
                  );
                })}
                {(dept.workflowList ?? []).length === 0 && (
                  <p className="py-4 text-center text-sm text-gray-400">No workflows</p>
                )}
              </div>
            </Widget>
          </div>
        )}

        {activeTab === 'users' && (
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="w-full min-w-[620px] text-sm">
              <thead className="border-b border-gray-100 bg-gray-50 text-left text-xs text-gray-500">
                <tr>
                  <th className="px-4 py-3 font-medium">User</th>
                  <th className="px-4 py-3 font-medium">Role</th>
                  <th className="px-4 py-3 font-medium">Email</th>
                </tr>
              </thead>
              <tbody>
                {dept.users.map((u) => (
                  <tr key={u.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-4 py-3">
                      {canReadUserDirectory ? <Link to={`/users/${u.id}`} className="flex items-center gap-2">
                        <UserAvatar firstName={u.firstName} lastName={u.lastName} size="sm" />
                        <span className="font-medium text-hoterra-navy">
                          {u.firstName} {u.lastName}
                        </span>
                      </Link> : <div className="flex items-center gap-2">
                        <UserAvatar firstName={u.firstName} lastName={u.lastName} size="sm" />
                        <span className="font-medium text-hoterra-navy">{u.firstName} {u.lastName}</span>
                      </div>}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      <p>{u.jobTitle || ROLE_LABELS[u.role]}</p>
                      {u.jobTitle && <p className="mt-0.5 text-xs text-gray-400">Access: {ROLE_LABELS[u.role]}</p>}
                    </td>
                    <td className="px-4 py-3 text-gray-500">{u.email ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'documents' && (
          <DocList docs={dept.documents} empty="No documents in this department" />
        )}

        {activeTab === 'sops' && (
          <DocList docs={sops} empty="No SOPs in this department" />
        )}

        {activeTab === 'workflows' && (
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="w-full min-w-[620px] text-sm">
              <thead className="border-b border-gray-100 bg-gray-50 text-left text-xs text-gray-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Workflow</th>
                  <th className="px-4 py-3 font-medium">Steps</th>
                  <th className="px-4 py-3 font-medium">Default</th>
                  <th className="px-4 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {(dept.workflowList ?? []).map((wf) => (
                  <tr key={wf.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-hoterra-navy">{wf.name}</td>
                    <td className="px-4 py-3 text-gray-600">{countWorkflowSteps(wf.steps)}</td>
                    <td className="px-4 py-3">{wf.isDefault ? 'Yes' : 'No'}</td>
                    <td className="px-4 py-3">
                      {canManageWorkflows ? <Link to={`/workflows/${wf.id}/designer`} className="text-hoterra-steel hover:underline">Design →</Link> : <span className="text-gray-400">View only</span>}
                    </td>
                  </tr>
                ))}
                {(dept.workflowList ?? []).length === 0 && (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400">No workflows</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'templates' && (
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="w-full min-w-[620px] text-sm">
              <thead className="border-b border-gray-100 bg-gray-50 text-left text-xs text-gray-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Template</th>
                  <th className="px-4 py-3 font-medium">Category</th>
                  <th className="px-4 py-3 font-medium">Version</th>
                  <th className="px-4 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {(dept.templateList ?? []).map((t) => (
                  <tr key={t.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-hoterra-navy">{t.name}</td>
                    <td className="px-4 py-3 text-gray-600">{CATEGORY_LABELS[t.category]}</td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">{t.version ?? '1.0'}</td>
                    <td className="px-4 py-3">
                      {canManageTemplates ? <Link to={`/templates/${t.id}/edit`} className="text-hoterra-steel hover:underline">Edit →</Link> : <span className="text-gray-400">View only</span>}
                    </td>
                  </tr>
                ))}
                {(dept.templateList ?? []).length === 0 && (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400">No templates</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showEditModal && canManageDepartments && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
          <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:max-w-md sm:rounded-xl sm:p-6">
            <h2 className="mb-4 text-lg font-bold text-hoterra-navy">Edit Department</h2>
            <form onSubmit={handleSaveDepartment} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Name</label>
                <input required value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} className="input" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Location</label>
                <select value={editForm.location} onChange={(e) => setEditForm({ ...editForm, location: e.target.value })} className="input">
                  <option value="Main Hotel">Main Hotel</option>
                  <option value="Head Office">Head Office</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Description</label>
                <textarea value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} rows={3} className="input" />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowEditModal(false)} className="btn-secondary">Cancel</button>
                <button type="submit" disabled={saving} className="btn-primary disabled:opacity-50">{saving ? 'Saving...' : 'Save'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function Widget({
  title,
  icon: Icon,
  action,
  children,
}: {
  title: string;
  icon: React.ElementType;
  action?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="card p-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-hoterra-steel" />
          <h3 className="font-semibold text-hoterra-navy">{title}</h3>
        </div>
        {action && <span className="text-xs text-gray-400">{action}</span>}
      </div>
      {children}
    </div>
  );
}

function DocList({ docs, empty }: { docs: Document[]; empty: string }) {
  if (docs.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center rounded-xl border border-dashed border-gray-300 bg-white">
        <p className="text-sm text-gray-400">{empty}</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="w-full min-w-[720px] text-sm">
        <thead className="border-b border-gray-100 bg-gray-50 text-left text-xs text-gray-500">
          <tr>
            <th className="px-4 py-3 font-medium">Title</th>
            <th className="px-4 py-3 font-medium">Code</th>
            <th className="px-4 py-3 font-medium">Category</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">Updated</th>
          </tr>
        </thead>
        <tbody>
          {docs.map((doc) => (
            <tr key={doc.id} className="border-b border-gray-50 hover:bg-gray-50">
              <td className="px-4 py-3">
                <Link to={`/documents/${doc.id}`} className="font-medium text-hoterra-steel hover:underline">
                  {doc.title}
                </Link>
              </td>
              <td className="px-4 py-3 font-mono text-xs text-gray-500">{doc.code}</td>
              <td className="px-4 py-3 text-gray-600">{CATEGORY_LABELS[doc.category]}</td>
              <td className="px-4 py-3">
                <StatusBadge status={doc.status} />
              </td>
              <td className="px-4 py-3 text-gray-500">{formatDate(doc.updatedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
