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
  Check,
} from 'lucide-react';
import { Header, CreateDocumentButton } from '@/components/layout/Sidebar';
import { DashStatCard } from '@/components/ui/DashStatCard';
import { api } from '@/lib/api';
import type { DashboardStats } from '@/types';
import { STATUS_LABELS } from '@/types';
import { formatDate, timeAgo } from '@/lib/utils';
import { CATEGORY_LABELS } from '@/types';
import { NavLink, Link } from 'react-router-dom';

const CARD_CONFIG = [
  { key: 'pendingApproval' as const, label: 'Documents for Approval', icon: FileCheck, iconColor: 'text-orange-600', iconBg: 'bg-orange-50', to: '/approvals' },
  { key: 'overdue' as const, label: 'Overdue Documents', icon: AlertTriangle, iconColor: 'text-red-600', iconBg: 'bg-red-50', to: '/documents' },
  { key: 'dueForReview' as const, label: 'Due for Review', icon: Clock, iconColor: 'text-yellow-600', iconBg: 'bg-yellow-50', to: '/documents' },
  { key: 'published' as const, label: 'Published Documents', icon: CheckCircle, iconColor: 'text-green-600', iconBg: 'bg-green-50', to: '/documents' },
  { key: 'archived' as const, label: 'Archived Documents', icon: Archive, iconColor: 'text-blue-600', iconBg: 'bg-blue-50', to: '/archive' },
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

const QUICK_ACTIONS = [
  { icon: FileText, label: 'Create Document', to: '/documents/create' },
  { icon: Upload, label: 'Upload Document', to: '/documents/create' },
  { icon: FileCheck, label: 'My Approvals', to: '/approvals' },
  { icon: Search, label: 'Search Documents', to: '/search' },
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

      <div className="page-content">
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {CARD_CONFIG.map(({ key, label, icon, iconColor, iconBg, to }) => (
            <DashStatCard
              key={key}
              label={label}
              value={stats?.cards[key] ?? '—'}
              icon={icon}
              iconColor={iconColor}
              iconBg={iconBg}
              to={to}
            />
          ))}
        </div>

        <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="card p-5 lg:col-span-1">
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
                      <Cell key={entry.status} fill={STATUS_CHART_COLORS[entry.status] || '#ccc'} />
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
            <div className="mt-2 space-y-1 text-xs">
              {statusData.map((s) => (
                <div key={s.status} className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: STATUS_CHART_COLORS[s.status] }} />
                    <span className="text-gray-600">{s.name}</span>
                  </div>
                  <span className="font-medium text-gray-800">{s.value}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="card p-5 lg:col-span-1">
            <h3 className="mb-4 font-semibold text-hoterra-navy">Documents by Department</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats?.byDepartment ?? []} layout="vertical" margin={{ left: 0, right: 16 }}>
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="department" width={100} tick={{ fontSize: 10 }} />
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

          <div className="card p-5 lg:col-span-1">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-semibold text-hoterra-navy">Upcoming Review</h3>
              <Link to="/documents" className="text-xs text-hoterra-steel hover:underline">
                View all →
              </Link>
            </div>
            <div className="space-y-3">
              {(stats?.upcomingReviews ?? []).length === 0 ? (
                <p className="py-4 text-center text-sm text-gray-400">No upcoming reviews</p>
              ) : (
                (stats?.upcomingReviews ?? []).map((item) => (
                  <Link
                    key={item.id}
                    to={`/documents/${item.id}`}
                    className="block rounded-lg border border-orange-100 bg-orange-50/80 p-3 hover:border-orange-200"
                  >
                    <div className="text-sm font-medium text-hoterra-navy">{item.title}</div>
                    <div className="mt-1 text-xs text-gray-500">
                      {item.department} · {CATEGORY_LABELS[item.category]}
                    </div>
                    <div className="mt-2 inline-block rounded-md bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700">
                      {formatDate(item.nextReviewDate)}
                    </div>
                  </Link>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="card p-5 lg:col-span-1">
            <h3 className="mb-4 font-semibold text-hoterra-navy">Recent Activity</h3>
            <div className="space-y-4">
              {(stats?.recentActivity ?? []).slice(0, 5).map((item) => (
                <div key={item.id} className="flex items-start gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-100 text-xs font-semibold text-green-700">
                    {(item.userName ?? 'U').split(' ').map((n) => n[0]).join('').slice(0, 2)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-gray-700">
                      <span className="font-medium">{item.userName}</span>{' '}
                      {item.action.toLowerCase()}
                      {item.document && (
                        <span className="font-medium text-hoterra-steel"> &quot;{item.document.title}&quot;</span>
                      )}
                    </p>
                    <p className="text-xs text-gray-400">{timeAgo(item.createdAt)}</p>
                  </div>
                  <Check className="mt-1 h-4 w-4 shrink-0 text-green-500" />
                </div>
              ))}
            </div>
          </div>

          <div className="card p-5 lg:col-span-1">
            <h3 className="mb-4 font-semibold text-hoterra-navy">Document Trend</h3>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={stats?.trend ?? []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="created" stroke="#294660" strokeWidth={2} dot={false} name="Created" />
                  <Line type="monotone" dataKey="published" stroke="#22C55E" strokeWidth={2} dot={false} name="Published" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="card p-5 lg:col-span-1">
            <h3 className="mb-4 font-semibold text-hoterra-navy">Quick Actions</h3>
            <div className="grid grid-cols-2 gap-3">
              {QUICK_ACTIONS.map(({ icon: Icon, label, to }) => (
                <NavLink
                  key={label}
                  to={to}
                  className="flex flex-col items-center gap-2 rounded-xl border border-gray-100 bg-gray-50/80 p-4 text-center transition-colors hover:border-hoterra-steel/30 hover:bg-white hover:shadow-sm"
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
          <span>v1.0.3</span>
        </footer>
      </div>
    </div>
  );
}
