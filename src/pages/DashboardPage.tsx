import { useEffect, useState } from 'react';
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  Legend,
} from 'recharts';
import {
  FileCheck,
  AlertTriangle,
  Clock,
  CheckCircle,
  Archive,
  FileText,
  Upload,
  Search,
  LayoutTemplate,
  BarChart3,
} from 'lucide-react';
import { Header, CreateDocumentButton } from '@/components/layout/Sidebar';
import { api } from '@/lib/api';
import type { DashboardStats } from '@/types';
import { STATUS_LABELS } from '@/types';
import { timeAgo } from '@/lib/utils';
import { NavLink } from 'react-router-dom';

const CARD_CONFIG = [
  { key: 'pendingApproval' as const, label: 'Documents for Approval', icon: FileCheck, color: 'bg-yellow-50 border-yellow-200 text-yellow-700' },
  { key: 'overdue' as const, label: 'Overdue Documents', icon: AlertTriangle, color: 'bg-red-50 border-red-200 text-red-700' },
  { key: 'dueForReview' as const, label: 'Due for Review', icon: Clock, color: 'bg-orange-50 border-orange-200 text-orange-700' },
  { key: 'published' as const, label: 'Published Documents', icon: CheckCircle, color: 'bg-green-50 border-green-200 text-green-700' },
  { key: 'archived' as const, label: 'Archived Documents', icon: Archive, color: 'bg-blue-50 border-blue-200 text-blue-700' },
];

const STATUS_CHART_COLORS: Record<string, string> = {
  DRAFT: '#9CA3AF',
  IN_REVIEW: '#F97316',
  SIGNED_HOD: '#A855F7',
  SIGNED_FINANCE: '#3B82F6',
  SIGNED_GM: '#06B6D4',
  PUBLISHED: '#22C55E',
  ARCHIVED: '#64748B',
  REJECTED: '#EF4444',
  NEEDS_REVIEW: '#F59E0B',
};

const TREND_DATA = [
  { month: 'Jan', created: 12, published: 8 },
  { month: 'Feb', created: 18, published: 14 },
  { month: 'Mar', created: 22, published: 19 },
  { month: 'Apr', created: 15, published: 12 },
  { month: 'May', created: 28, published: 24 },
  { month: 'Jun', created: 32, published: 28 },
];

const QUICK_ACTIONS = [
  { icon: FileText, label: 'Create Document', to: '/documents/create' },
  { icon: Upload, label: 'Upload Document', to: '/documents/create' },
  { icon: FileCheck, label: 'My Approvals', to: '/approvals' },
  { icon: Search, label: 'Search Documents', to: '/documents' },
  { icon: LayoutTemplate, label: 'Document Templates', to: '/templates' },
  { icon: BarChart3, label: 'Reports & Analytics', to: '/reports' },
];

export function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);

  useEffect(() => {
    api.getDashboardStats().then(setStats).catch(console.error);
  }, []);

  const statusData =
    stats?.byStatus.map((s) => ({
      name: STATUS_LABELS[s.status],
      value: s.count,
      status: s.status,
    })) ?? [];

  const totalDocs = statusData.reduce((sum, s) => sum + s.value, 0);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <Header
        title="Dashboard"
        subtitle="Overview of document management"
        showSearch
        action={<CreateDocumentButton />}
      />

      <div className="flex-1 overflow-y-auto p-6">
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {CARD_CONFIG.map(({ key, label, icon: Icon, color }) => (
            <div key={key} className={`rounded-xl border p-4 ${color}`}>
              <div className="mb-3 flex items-center justify-between">
                <Icon className="h-5 w-5 opacity-70" />
                <button className="text-xs underline opacity-70 hover:opacity-100">View all</button>
              </div>
              <div className="text-3xl font-bold">{stats?.cards[key] ?? '—'}</div>
              <div className="mt-1 text-xs opacity-80">{label}</div>
            </div>
          ))}
        </div>

        <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="rounded-xl border border-gray-200 bg-white p-5 lg:col-span-1">
            <h3 className="mb-4 font-semibold text-hoterra-navy">Documents by Status</h3>
            <div className="relative h-56">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={statusData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={80}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {statusData.map((entry) => (
                      <Cell
                        key={entry.status}
                        fill={STATUS_CHART_COLORS[entry.status] || '#ccc'}
                      />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <div className="text-2xl font-bold text-hoterra-navy">{totalDocs}</div>
                <div className="text-xs text-gray-500">Total</div>
              </div>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-1 text-xs">
              {statusData.slice(0, 6).map((s) => (
                <div key={s.status} className="flex items-center gap-1.5">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: STATUS_CHART_COLORS[s.status] }}
                  />
                  <span className="truncate text-gray-600">{s.name}</span>
                  <span className="font-medium">{s.value}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-5 lg:col-span-1">
            <h3 className="mb-4 font-semibold text-hoterra-navy">Documents by Department</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={stats?.byDepartment ?? []}
                  layout="vertical"
                  margin={{ left: 0, right: 16 }}
                >
                  <XAxis type="number" hide />
                  <YAxis
                    type="category"
                    dataKey="department"
                    width={100}
                    tick={{ fontSize: 10 }}
                  />
                  <Tooltip />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                    {(stats?.byDepartment ?? []).map((entry, i) => (
                      <Cell key={i} fill={entry.color || '#294660'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-5 lg:col-span-1">
            <h3 className="mb-4 font-semibold text-hoterra-navy">Upcoming Review</h3>
            <div className="space-y-3">
              <div className="rounded-lg border border-orange-100 bg-orange-50 p-3">
                <div className="text-sm font-medium text-hoterra-navy">
                  Credit Card Handling Procedure
                </div>
                <div className="mt-1 text-xs text-gray-500">Front Office · SOP</div>
                <div className="mt-1 text-xs font-medium text-orange-600">12 Jun 2026</div>
              </div>
              <div className="rounded-lg border border-orange-100 bg-orange-50 p-3">
                <div className="text-sm font-medium text-hoterra-navy">
                  Housekeeping Cleaning Checklist
                </div>
                <div className="mt-1 text-xs text-gray-500">Housekeeping · Checklist</div>
                <div className="mt-1 text-xs font-medium text-orange-600">15 Jun 2025</div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="rounded-xl border border-gray-200 bg-white p-5 lg:col-span-1">
            <h3 className="mb-4 font-semibold text-hoterra-navy">Recent Activity</h3>
            <div className="space-y-4">
              {(stats?.recentActivity ?? []).slice(0, 5).map((item) => (
                <div key={item.id} className="flex gap-3">
                  <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-hoterra-gold" />
                  <div>
                    <p className="text-sm text-gray-700">
                      <span className="font-medium">{item.userName}</span>{' '}
                      {item.action.toLowerCase()}{' '}
                      {item.document && (
                        <span className="font-medium text-hoterra-steel">
                          "{item.document.title}"
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-gray-400">{timeAgo(item.createdAt)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-5 lg:col-span-1">
            <h3 className="mb-4 font-semibold text-hoterra-navy">Document Trend</h3>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={TREND_DATA}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="created" stroke="#294660" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="published" stroke="#D4A017" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-5 lg:col-span-1">
            <h3 className="mb-4 font-semibold text-hoterra-navy">Quick Actions</h3>
            <div className="grid grid-cols-2 gap-3">
              {QUICK_ACTIONS.map(({ icon: Icon, label, to }) => (
                <NavLink
                  key={label}
                  to={to}
                  className="flex flex-col items-center gap-2 rounded-xl border border-gray-100 bg-gray-50 p-4 text-center transition-colors hover:border-hoterra-steel hover:bg-white"
                >
                  <Icon className="h-6 w-6 text-hoterra-steel" />
                  <span className="text-xs font-medium text-gray-700">{label}</span>
                </NavLink>
              ))}
            </div>
          </div>
        </div>

        <footer className="mt-8 flex items-center justify-between border-t border-gray-200 pt-4 text-xs text-gray-400">
          <span>© 2025 HOTERRA Document Management System</span>
          <span>v1.0.0</span>
        </footer>
      </div>
    </div>
  );
}
