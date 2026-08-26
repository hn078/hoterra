import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Building2,
  FileText,
  Users,
  ClipboardList,
  Clock,
  Search,
  Plus,
  MapPin,
  ChevronRight,
  Power,
  RotateCcw,
  AlertTriangle,
} from 'lucide-react';
import { Header } from '@/components/layout/Sidebar';
import { DashStatCard } from '@/components/ui/DashStatCard';
import { PageTabs } from '@/components/ui/PageTabs';
import { useAppDialog } from '@/components/ui/AppDialogProvider';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { api } from '@/lib/api';
import type { Department, DepartmentLifecycleSummary } from '@/types';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/auth';
import { hasCapability } from '@/modules/access-control';

const LOCATION_TABS = [
  { id: 'ALL', label: 'All Locations' },
  { id: 'Main Hotel', label: 'Main Hotel' },
  { id: 'Head Office', label: 'Head Office' },
];

function SopProgressBar({ active, total }: { active: number; total: number }) {
  const pct = total > 0 ? Math.round((active / total) * 100) : 0;
  return (
    <div className="min-w-[120px]">
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="font-medium text-green-700">{active} active</span>
        <span className="text-gray-400">{pct}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-gray-100">
        <div className="h-full rounded-full bg-green-500 transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function DepartmentsPage() {
  const currentUser = useAuthStore((state) => state.user);
  const dialog = useAppDialog();
  const canManageDepartments = hasCapability(currentUser, 'departments.manage');
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [activeTab, setActiveTab] = useState('ALL');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ACTIVE');
  const [creating, setCreating] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newDept, setNewDept] = useState({ name: '', code: '', location: 'Main Hotel', description: '' });
  const [lifecycleDepartment, setLifecycleDepartment] = useState<Department | null>(null);
  const [lifecycleSummary, setLifecycleSummary] = useState<DepartmentLifecycleSummary | null>(null);
  const [lifecycleLoading, setLifecycleLoading] = useState(false);
  const [lifecycleSaving, setLifecycleSaving] = useState(false);
  const [lifecycleReason, setLifecycleReason] = useState('');
  const [transferDepartmentId, setTransferDepartmentId] = useState('');

  const loadDepartments = useCallback(() => {
    setLoading(true);
    setLoadError('');
    api
      .getDepartments({ includeInactive: canManageDepartments })
      .then(setDepartments)
      .catch((error) => setLoadError(error instanceof Error ? error.message : 'Departments could not be loaded'))
      .finally(() => setLoading(false));
  }, [canManageDepartments]);

  const openLifecycle = async (department: Department) => {
    setLifecycleDepartment(department);
    setLifecycleSummary(null);
    setLifecycleReason('');
    setTransferDepartmentId('');
    setLifecycleLoading(true);
    try {
      setLifecycleSummary(await api.getDepartmentLifecycle(department.id));
    } catch (error) {
      setLifecycleDepartment(null);
      await dialog.alert(error instanceof Error ? error.message : 'Lifecycle summary could not be loaded', { title: 'Department unavailable' });
    } finally {
      setLifecycleLoading(false);
    }
  };

  const handleLifecycle = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!lifecycleDepartment || lifecycleReason.trim().length < 3) return;
    setLifecycleSaving(true);
    try {
      if (lifecycleDepartment.isActive) {
        await api.deactivateDepartment(lifecycleDepartment.id, {
          reason: lifecycleReason.trim(),
          ...(transferDepartmentId ? { transferDepartmentId } : {}),
        });
      } else {
        await api.reactivateDepartment(lifecycleDepartment.id, lifecycleReason.trim());
      }
      setLifecycleDepartment(null);
      setLifecycleSummary(null);
      loadDepartments();
    } catch (error) {
      await dialog.alert(error instanceof Error ? error.message : 'Department lifecycle could not be changed', { title: 'Change not completed' });
      if (lifecycleDepartment) {
        setLifecycleSummary(await api.getDepartmentLifecycle(lifecycleDepartment.id).catch(() => lifecycleSummary));
      }
    } finally {
      setLifecycleSaving(false);
    }
  };

  useEffect(() => {
    loadDepartments();
  }, [loadDepartments]);

  const handleAddDepartment = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      await api.createDepartment({
        name: newDept.name.trim(),
        code: newDept.code.trim(),
        location: newDept.location,
        description: newDept.description || undefined,
      });
      setShowAddModal(false);
      setNewDept({ name: '', code: '', location: 'Main Hotel', description: '' });
      loadDepartments();
    } catch (err) {
      await dialog.alert(err instanceof Error ? err.message : 'Failed to create department', { title: 'Department not created' });
    } finally {
      setCreating(false);
    }
  };

  const filtered = useMemo(() => {
    return departments.filter((d) => {
      const location = d.location ?? 'Main Hotel';
      const matchesTab = activeTab === 'ALL' || location === activeTab;
      const matchesStatus = statusFilter === 'ALL' || (statusFilter === 'ACTIVE' ? d.isActive : !d.isActive);
      const q = search.toLowerCase();
      const headName = d.head ? `${d.head.firstName} ${d.head.lastName}`.toLowerCase() : '';
      const matchesSearch =
        !q ||
        d.name.toLowerCase().includes(q) ||
        d.code.toLowerCase().includes(q) ||
        headName.includes(q) ||
        location.toLowerCase().includes(q);
      return matchesTab && matchesStatus && matchesSearch;
    });
  }, [departments, activeTab, search, statusFilter]);

  const stats = useMemo(() => {
    const totalDocs = departments.reduce((s, d) => s + (d._count?.documents ?? 0), 0);
    const totalUsers = departments.reduce((s, d) => s + (d._count?.users ?? 0), 0);
    const activeSops = departments.reduce((s, d) => s + (d.sopStats?.active ?? 0), 0);
    const underReview = departments.reduce((s, d) => {
      const total = d.sopStats?.total ?? 0;
      const active = d.sopStats?.active ?? 0;
      return s + Math.max(0, total - active);
    }, 0);
    return {
      departments: departments.filter((department) => department.isActive).length,
      totalDocs,
      totalUsers,
      activeSops,
      underReview,
    };
  }, [departments]);

  const tabs = LOCATION_TABS.map((tab) => ({
    ...tab,
    count:
      tab.id === 'ALL'
        ? departments.length
        : departments.filter((d) => (d.location ?? 'Main Hotel') === tab.id).length,
  }));

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-hoterra-page">
      <Header
        title="Departments"
        subtitle="Organize and manage departments across your organization"
        action={canManageDepartments ? (
          <button onClick={() => setShowAddModal(true)} disabled={creating} className="btn-primary disabled:opacity-50">
            <Plus className="h-4 w-4" />
            {creating ? 'Adding...' : 'Add Department'}
          </button>
        ) : undefined}
      />

      <div className="page-stats page-stats--tabs">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <DashStatCard label="Departments" value={stats.departments} icon={Building2} iconColor="text-blue-600" iconBg="bg-blue-50" />
          <DashStatCard label="Total Documents" value={stats.totalDocs} icon={FileText} iconColor="text-purple-600" iconBg="bg-purple-50" />
          <DashStatCard label="Total Users" value={stats.totalUsers} icon={Users} iconColor="text-cyan-600" iconBg="bg-cyan-50" />
          <DashStatCard label="Active SOPs" value={stats.activeSops} icon={ClipboardList} iconColor="text-green-600" iconBg="bg-green-50" />
          <DashStatCard label="Under Review" value={stats.underReview} icon={Clock} iconColor="text-orange-600" iconBg="bg-orange-50" />
        </div>
      </div>

      <PageTabs tabs={tabs} active={activeTab} onChange={setActiveTab} />

      <div className="border-b border-gray-200 bg-white px-6 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-0 flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              placeholder="Search departments, codes or department heads..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-gray-200 py-2.5 pl-10 pr-4 text-sm focus:border-hoterra-steel focus:outline-none focus:ring-1 focus:ring-hoterra-steel"
            />
          </div>
          {canManageDepartments && <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)} className="input min-h-11 w-full sm:w-44">
            <option value="ACTIVE">Active departments</option>
            <option value="INACTIVE">Inactive departments</option>
            <option value="ALL">All statuses</option>
          </select>}
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-white">
        <table className="hidden w-full min-w-[1000px] text-sm md:table">
          <thead className="sticky top-0 bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-6 py-3">Department</th>
              <th className="px-4 py-3">Head</th>
              <th className="px-4 py-3">Location</th>
              <th className="px-4 py-3">Documents</th>
              <th className="px-4 py-3">Users</th>
              <th className="px-4 py-3">Active SOPs</th>
              <th className="px-4 py-3">SOP Progress</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {loading ? (
              <tr>
                <td colSpan={9} className="px-6 py-12 text-center text-gray-500">Loading departments...</td>
              </tr>
            ) : loadError ? (
              <tr>
                <td colSpan={9} className="px-6 py-12 text-center">
                  <p className="font-medium text-hoterra-navy">Departments unavailable</p>
                  <p className="mt-1 text-sm text-gray-500">{loadError}</p>
                  <button onClick={loadDepartments} className="btn-secondary mt-4">Try again</button>
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-6 py-12 text-center text-gray-500">No departments found</td>
              </tr>
            ) : (
              filtered.map((dept) => {
                const activeSops = dept.sopStats?.active ?? 0;
                const sopTotal = dept.sopStats?.total ?? 0;
                const underReview = Math.max(0, sopTotal - activeSops);
                return (
                  <tr key={dept.id} className="hover:bg-gray-50/80">
                    <td className="px-6 py-3">
                      {dept.canOpen ? <Link to={`/departments/${dept.id}`} className="flex items-start gap-3">
                        <div>
                          <span className="font-medium text-hoterra-navy hover:text-hoterra-steel">{dept.name}</span>
                          <p className="mt-0.5 font-mono text-xs text-gray-400">{dept.code}</p>
                        </div>
                      </Link> : <div>
                        <span className="font-medium text-hoterra-navy">{dept.name}</span>
                        <p className="mt-0.5 font-mono text-xs text-gray-400">{dept.code}</p>
                      </div>}
                    </td>
                    <td className="px-4 py-3">
                      {dept.head ? (
                        <div className="flex items-center gap-2">
                          <UserAvatar firstName={dept.head.firstName} lastName={dept.head.lastName} size="sm" />
                          <div>
                            <span className="text-gray-700">{dept.head.firstName} {dept.head.lastName}</span>
                            {dept.head.jobTitle && <p className="text-xs text-gray-400">{dept.head.jobTitle}</p>}
                          </div>
                        </div>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 text-gray-600">
                        <MapPin className="h-3.5 w-3.5 text-gray-400" />
                        {dept.location ?? 'Main Hotel'}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium text-hoterra-navy">{dept._count?.documents ?? 0}</td>
                    <td className="px-4 py-3 text-gray-700">{dept._count?.users ?? 0}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">{activeSops}</span>
                    </td>
                    <td className="px-4 py-3">
                      <SopProgressBar active={activeSops} total={sopTotal || activeSops || 1} />
                      {underReview > 0 && (
                        <span className={cn('mt-1 inline-flex rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-medium text-orange-700')}>
                          {underReview} under review
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn('rounded-full px-2 py-1 text-xs font-medium', dept.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600')}>
                        {dept.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-3">
                        {dept.canOpen ? <Link to={`/departments/${dept.id}`} className="inline-flex min-h-11 items-center gap-1 text-sm text-hoterra-steel hover:underline">
                          View <ChevronRight className="h-4 w-4" />
                        </Link> : !canManageDepartments && <span className="text-xs text-gray-400">Directory only</span>}
                        {canManageDepartments && <button onClick={() => openLifecycle(dept)} className={cn('inline-flex min-h-11 items-center gap-1 text-sm font-medium', dept.isActive ? 'text-red-600' : 'text-green-700')}>
                          {dept.isActive ? <Power className="h-4 w-4" /> : <RotateCcw className="h-4 w-4" />}
                          {dept.isActive ? 'Deactivate' : 'Reactivate'}
                        </button>}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>

        <div className="space-y-3 bg-hoterra-page p-4 md:hidden">
          {loading ? (
            <div className="card p-8 text-center text-sm text-gray-500">Loading departments...</div>
          ) : loadError ? (
            <div className="card p-6 text-center">
              <p className="font-medium text-hoterra-navy">Departments unavailable</p>
              <p className="mt-1 text-sm text-gray-500">{loadError}</p>
              <button onClick={loadDepartments} className="btn-secondary mt-4 min-h-11 justify-center">Try again</button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="card p-8 text-center text-sm text-gray-500">No departments found</div>
          ) : filtered.map((dept) => {
            const activeSops = dept.sopStats?.active ?? 0;
            const sopTotal = dept.sopStats?.total ?? 0;
            const underReview = Math.max(0, sopTotal - activeSops);
            return (
              <article key={dept.id} className="card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    {dept.canOpen ? <Link to={`/departments/${dept.id}`} className="font-semibold text-hoterra-navy">
                      {dept.name}
                    </Link> : <p className="font-semibold text-hoterra-navy">{dept.name}</p>}
                    <p className="mt-0.5 font-mono text-xs text-gray-400">{dept.code}</p>
                  </div>
                  <span className="inline-flex shrink-0 items-center gap-1 text-xs text-gray-500">
                    <MapPin className="h-3.5 w-3.5" />{dept.location ?? 'Main Hotel'}
                  </span>
                </div>
                {dept.head && (
                  <div className="mt-3 flex items-center gap-2 border-t border-gray-100 pt-3">
                    <UserAvatar firstName={dept.head.firstName} lastName={dept.head.lastName} size="sm" />
                    <div className="min-w-0">
                      <p className="text-xs text-gray-400">Department head</p>
                      <p className="truncate text-sm text-gray-700">{dept.head.firstName} {dept.head.lastName}</p>
                      {dept.head.jobTitle && <p className="truncate text-xs text-gray-400">{dept.head.jobTitle}</p>}
                    </div>
                  </div>
                )}
                <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg bg-gray-50 px-2 py-2"><dt className="text-[11px] text-gray-400">Documents</dt><dd className="font-semibold text-hoterra-navy">{dept._count?.documents ?? 0}</dd></div>
                  <div className="rounded-lg bg-gray-50 px-2 py-2"><dt className="text-[11px] text-gray-400">Users</dt><dd className="font-semibold text-hoterra-navy">{dept._count?.users ?? 0}</dd></div>
                  <div className="rounded-lg bg-gray-50 px-2 py-2"><dt className="text-[11px] text-gray-400">Active SOPs</dt><dd className="font-semibold text-green-700">{activeSops}</dd></div>
                </dl>
                {underReview > 0 && <p className="mt-2 text-xs font-medium text-orange-700">{underReview} SOP under review</p>}
                <span className={cn('mt-3 inline-flex rounded-full px-2 py-1 text-xs font-medium', dept.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600')}>
                  {dept.isActive ? 'Active' : 'Inactive'}
                </span>
                {dept.canOpen ? <Link to={`/departments/${dept.id}`} className="btn-secondary mt-3 min-h-11 w-full justify-center">
                  View department <ChevronRight className="h-4 w-4" />
                </Link> : <p className="mt-3 rounded-lg bg-gray-50 px-3 py-2 text-center text-xs text-gray-500">Directory information only</p>}
                {canManageDepartments && <button onClick={() => openLifecycle(dept)} className={cn('mt-2 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border text-sm font-medium', dept.isActive ? 'border-red-200 text-red-600' : 'border-green-200 text-green-700')}>
                  {dept.isActive ? <Power className="h-4 w-4" /> : <RotateCcw className="h-4 w-4" />}
                  {dept.isActive ? 'Deactivate department' : 'Reactivate department'}
                </button>}
              </article>
            );
          })}
        </div>
      </div>

      {showAddModal && canManageDepartments && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
          <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:max-w-md sm:rounded-xl sm:p-6">
            <h2 className="mb-4 text-lg font-bold text-hoterra-navy">Add Department</h2>
            <form onSubmit={handleAddDepartment} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Department Name</label>
                <input required value={newDept.name} onChange={(e) => setNewDept({ ...newDept, name: e.target.value })} className="input" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Code</label>
                <input required value={newDept.code} onChange={(e) => setNewDept({ ...newDept, code: e.target.value })} className="input font-mono" placeholder="e.g. FO" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Location</label>
                <select value={newDept.location} onChange={(e) => setNewDept({ ...newDept, location: e.target.value })} className="input">
                  <option value="Main Hotel">Main Hotel</option>
                  <option value="Head Office">Head Office</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Description</label>
                <textarea value={newDept.description} onChange={(e) => setNewDept({ ...newDept, description: e.target.value })} rows={3} className="input" />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowAddModal(false)} className="btn-secondary">Cancel</button>
                <button type="submit" disabled={creating} className="btn-primary disabled:opacity-50">{creating ? 'Adding...' : 'Add Department'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {lifecycleDepartment && canManageDepartments && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
          <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:max-w-xl sm:rounded-xl sm:p-6">
            <div className="flex items-start gap-3">
              <div className={cn('rounded-full p-2', lifecycleDepartment.isActive ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-700')}>
                {lifecycleDepartment.isActive ? <AlertTriangle className="h-5 w-5" /> : <RotateCcw className="h-5 w-5" />}
              </div>
              <div>
                <h2 className="text-lg font-bold text-hoterra-navy">{lifecycleDepartment.isActive ? 'Deactivate' : 'Reactivate'} {lifecycleDepartment.name}</h2>
                <p className="mt-1 text-sm text-gray-500">Historical documents and audit evidence will be retained.</p>
              </div>
            </div>

            {lifecycleLoading || !lifecycleSummary ? <p className="py-8 text-center text-sm text-gray-500">Checking dependencies...</p> : <form onSubmit={handleLifecycle} className="mt-5 space-y-4">
              {lifecycleDepartment.isActive && <>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {[
                    ['Active staff', lifecycleSummary.dependencies.activeUsers],
                    ['Open staff tasks', lifecycleSummary.dependencies.openUserResponsibilities],
                    ['Open documents', lifecycleSummary.dependencies.openDocuments],
                    ['Open workforce', lifecycleSummary.dependencies.openWorkforceRequests],
                    ['Active templates', lifecycleSummary.dependencies.activeDocumentTemplates + lifecycleSummary.dependencies.activeWorkforceTemplates],
                    ['Active positions', lifecycleSummary.dependencies.activeWorkforcePositions],
                  ].map(([label, value]) => <div key={String(label)} className="rounded-lg bg-gray-50 p-3"><p className="text-xs text-gray-500">{label}</p><p className={cn('mt-1 text-lg font-semibold', Number(value) > 0 ? 'text-orange-700' : 'text-hoterra-navy')}>{value}</p></div>)}
                </div>
                {lifecycleSummary.dependencies.blockingDependencies > 0 && <div className="rounded-lg border border-orange-200 bg-orange-50 p-3 text-sm text-orange-800">
                  Resolve all open tasks, documents, Workforce requests, active templates and catalog positions before deactivation.
                </div>}
                {lifecycleSummary.dependencies.activeUsers > 0 && <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Transfer active staff to</label>
                  <select required value={transferDepartmentId} onChange={(event) => setTransferDepartmentId(event.target.value)} className="input">
                    <option value="">Select an active department...</option>
                    {departments.filter((department) => department.isActive && department.id !== lifecycleDepartment.id).map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
                  </select>
                  <p className="mt-1 text-xs text-gray-500">Accounts move atomically and their existing sessions are revoked.</p>
                </div>}
              </>}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Reason</label>
                <textarea required minLength={3} maxLength={500} rows={3} value={lifecycleReason} onChange={(event) => setLifecycleReason(event.target.value)} className="input" placeholder="Explain the organizational change..." />
              </div>
              <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
                <button type="button" onClick={() => setLifecycleDepartment(null)} className="btn-secondary min-h-11 justify-center">Cancel</button>
                <button type="submit" disabled={lifecycleSaving || lifecycleReason.trim().length < 3 || (lifecycleDepartment.isActive && (!lifecycleSummary.dependencies.canDeactivate || (lifecycleSummary.dependencies.activeUsers > 0 && !transferDepartmentId)))} className={cn('inline-flex min-h-11 items-center rounded-lg px-4 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50', lifecycleDepartment.isActive ? 'bg-red-600 text-white hover:bg-red-700' : 'btn-primary')}>
                  {lifecycleSaving ? 'Saving...' : lifecycleDepartment.isActive ? 'Confirm deactivation' : 'Reactivate department'}
                </button>
              </div>
            </form>}
          </div>
        </div>
      )}
    </div>
  );
}
