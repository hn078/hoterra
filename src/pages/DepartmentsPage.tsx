import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Building2,
  FileText,
  Users,
  ClipboardList,
  Clock,
  Search,
  Filter,
  Plus,
  MapPin,
  ChevronRight,
} from 'lucide-react';
import { Header, DepartmentBadge } from '@/components/layout/Sidebar';
import { DashStatCard } from '@/components/ui/DashStatCard';
import { PageTabs } from '@/components/ui/PageTabs';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { api } from '@/lib/api';
import type { Department } from '@/types';
import { cn } from '@/lib/utils';

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
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('ALL');
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newDept, setNewDept] = useState({ name: '', code: '', location: 'Main Hotel', description: '' });

  const loadDepartments = useCallback(() => {
    setLoading(true);
    api
      .getDepartments()
      .then(setDepartments)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

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
      alert(err instanceof Error ? err.message : 'Failed to create department');
    } finally {
      setCreating(false);
    }
  };

  const filtered = useMemo(() => {
    return departments.filter((d) => {
      const location = d.location ?? 'Main Hotel';
      const matchesTab = activeTab === 'ALL' || location === activeTab;
      const q = search.toLowerCase();
      const headName = d.head ? `${d.head.firstName} ${d.head.lastName}`.toLowerCase() : '';
      const matchesSearch =
        !q ||
        d.name.toLowerCase().includes(q) ||
        d.code.toLowerCase().includes(q) ||
        headName.includes(q) ||
        location.toLowerCase().includes(q);
      return matchesTab && matchesSearch;
    });
  }, [departments, activeTab, search]);

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
      departments: departments.length,
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
        action={
          <button onClick={() => setShowAddModal(true)} disabled={creating} className="btn-primary disabled:opacity-50">
            <Plus className="h-4 w-4" />
            {creating ? 'Adding...' : 'Add Department'}
          </button>
        }
      />

      <div className="page-stats">
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
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
          <div className="relative min-w-[280px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              placeholder="Search departments, codes or department heads..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-gray-200 py-2.5 pl-10 pr-4 text-sm focus:border-hoterra-steel focus:outline-none focus:ring-1 focus:ring-hoterra-steel"
            />
          </div>
          <button className="btn-secondary py-2.5">
            <Filter className="h-4 w-4" />
            Filter
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-white">
        <table className="w-full min-w-[1000px] text-sm">
          <thead className="sticky top-0 bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-6 py-3">Department</th>
              <th className="px-4 py-3">Head</th>
              <th className="px-4 py-3">Location</th>
              <th className="px-4 py-3">Documents</th>
              <th className="px-4 py-3">Users</th>
              <th className="px-4 py-3">Active SOPs</th>
              <th className="px-4 py-3">SOP Progress</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {loading ? (
              <tr>
                <td colSpan={8} className="px-6 py-12 text-center text-gray-500">Loading departments...</td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-6 py-12 text-center text-gray-500">No departments found</td>
              </tr>
            ) : (
              filtered.map((dept) => {
                const activeSops = dept.sopStats?.active ?? 0;
                const sopTotal = dept.sopStats?.total ?? 0;
                const underReview = Math.max(0, sopTotal - activeSops);
                return (
                  <tr key={dept.id} className="hover:bg-gray-50/80">
                    <td className="px-6 py-3">
                      <Link to={`/departments/${dept.id}`} className="flex items-start gap-3">
                        <div>
                          <span className="font-medium text-hoterra-navy hover:text-hoterra-steel">{dept.name}</span>
                          <p className="mt-0.5 font-mono text-xs text-gray-400">{dept.code}</p>
                        </div>
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      {dept.head ? (
                        <div className="flex items-center gap-2">
                          <UserAvatar firstName={dept.head.firstName} lastName={dept.head.lastName} size="sm" />
                          <span className="text-gray-700">{dept.head.firstName} {dept.head.lastName}</span>
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
                      <Link to={`/departments/${dept.id}`} className="inline-flex items-center gap-1 text-sm text-hoterra-steel hover:underline">
                        View
                        <ChevronRight className="h-4 w-4" />
                      </Link>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
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
    </div>
  );
}
