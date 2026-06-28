import { useEffect, useMemo, useState } from 'react';
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
import { StatCard } from '@/components/ui/StatCard';
import { PageTabs } from '@/components/ui/PageTabs';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { api } from '@/lib/api';
import type { Department, User } from '@/types';
import { enrichDepartment } from '@/data/mock';

type EnrichedDepartment = ReturnType<typeof enrichDepartment>;

const LOCATION_TABS = [
  { id: 'ALL', label: 'All Locations' },
  { id: 'Main Hotel', label: 'Main Hotel' },
  { id: 'Head Office', label: 'Head Office' },
];

export function DepartmentsPage() {
  const [departments, setDepartments] = useState<EnrichedDepartment[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('ALL');
  const [search, setSearch] = useState('');

  useEffect(() => {
    setLoading(true);
    Promise.all([api.getDepartments(), api.getUsers()])
      .then(([depts, users]: [Department[], User[]]) => {
        setDepartments(depts.map((d) => enrichDepartment(d, users)));
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    return departments.filter((d) => {
      const matchesTab = activeTab === 'ALL' || d.location === activeTab;
      const q = search.toLowerCase();
      const headName = d.head ? `${d.head.firstName} ${d.head.lastName}`.toLowerCase() : '';
      const matchesSearch =
        !q ||
        d.name.toLowerCase().includes(q) ||
        d.code.toLowerCase().includes(q) ||
        headName.includes(q) ||
        d.location.toLowerCase().includes(q);
      return matchesTab && matchesSearch;
    });
  }, [departments, activeTab, search]);

  const stats = useMemo(() => {
    const totalDocs = departments.reduce((s, d) => s + (d._count?.documents ?? 0), 0);
    const totalUsers = departments.reduce((s, d) => s + (d._count?.users ?? 0), 0);
    const activeSops = departments.reduce((s, d) => s + d.activeSops, 0);
    const underReview = departments.reduce((s, d) => s + d.underReview, 0);
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
        : departments.filter((d) => d.location === tab.id).length,
  }));

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <Header
        title="Departments"
        subtitle="Manage hotel departments, heads and document ownership"
        action={
          <button className="inline-flex items-center gap-2 rounded-lg bg-hoterra-navy px-4 py-2 text-sm font-medium text-white hover:bg-hoterra-steel">
            <Plus className="h-4 w-4" />
            Add Department
          </button>
        }
      />

      <div className="grid grid-cols-2 gap-4 border-b border-gray-200 bg-gray-50 px-6 py-4 lg:grid-cols-5">
        <StatCard label="Departments" value={stats.departments} icon={Building2} color="blue" />
        <StatCard label="Total Documents" value={stats.totalDocs} icon={FileText} color="purple" />
        <StatCard label="Total Users" value={stats.totalUsers} icon={Users} color="cyan" />
        <StatCard label="Active SOPs" value={stats.activeSops} icon={ClipboardList} color="green" />
        <StatCard label="Under Review" value={stats.underReview} icon={Clock} color="orange" />
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
              className="w-full rounded-lg border border-gray-200 py-2 pl-10 pr-4 text-sm focus:border-hoterra-steel focus:outline-none"
            />
          </div>
          <button className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm hover:bg-gray-50">
            <Filter className="h-4 w-4" />
            Filter
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <table className="w-full min-w-[1000px] text-sm">
          <thead className="sticky top-0 bg-gray-50 text-left text-xs font-medium uppercase text-gray-500">
            <tr>
              <th className="px-6 py-3">Department</th>
              <th className="px-4 py-3">Head</th>
              <th className="px-4 py-3">Location</th>
              <th className="px-4 py-3">Documents</th>
              <th className="px-4 py-3">Users</th>
              <th className="px-4 py-3">Active SOPs</th>
              <th className="px-4 py-3">Under Review</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {loading ? (
              <tr>
                <td colSpan={8} className="px-6 py-12 text-center text-gray-500">
                  Loading departments...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-6 py-12 text-center text-gray-500">
                  No departments found
                </td>
              </tr>
            ) : (
              filtered.map((dept) => (
                <tr key={dept.id} className="hover:bg-gray-50">
                  <td className="px-6 py-3">
                    <Link
                      to={`/departments/${dept.id}`}
                      className="flex items-start gap-3"
                    >
                      <DepartmentBadge name={dept.name} color={dept.color} />
                      <div>
                        <span className="font-medium text-hoterra-navy hover:text-hoterra-steel">
                          {dept.name}
                        </span>
                        <p className="mt-0.5 font-mono text-xs text-gray-400">{dept.code}</p>
                      </div>
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    {dept.head ? (
                      <div className="flex items-center gap-2">
                        <UserAvatar
                          firstName={dept.head.firstName}
                          lastName={dept.head.lastName}
                          size="sm"
                        />
                        <span className="text-gray-700">
                          {dept.head.firstName} {dept.head.lastName}
                        </span>
                      </div>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1 text-gray-600">
                      <MapPin className="h-3.5 w-3.5 text-gray-400" />
                      {dept.location}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium text-hoterra-navy">
                    {dept._count?.documents ?? 0}
                  </td>
                  <td className="px-4 py-3 text-gray-700">{dept._count?.users ?? 0}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                      {dept.activeSops}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {dept.underReview > 0 ? (
                      <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700">
                        {dept.underReview}
                      </span>
                    ) : (
                      <span className="text-gray-400">0</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      to={`/departments/${dept.id}`}
                      className="inline-flex items-center gap-1 text-sm text-hoterra-steel hover:underline"
                    >
                      View
                      <ChevronRight className="h-4 w-4" />
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
