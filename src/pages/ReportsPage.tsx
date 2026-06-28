import { useEffect, useState } from 'react';
import {
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from 'recharts';
import {
  FileText,
  FilePlus,
  CheckCircle,
  Users,
  HardDrive,
  Calendar,
  Filter,
  Download,
  Eye,
  MoreHorizontal,
} from 'lucide-react';
import { Header } from '@/components/layout/Sidebar';
import { DashStatCard } from '@/components/ui/DashStatCard';
import { formatDateTime } from '@/lib/utils';
import { api } from '@/lib/api';
import type { AuditLog } from '@/types';

type ReportKpis = {
  totalDocuments: number;
  newDocuments: number;
  completedApprovals: number;
  activeUsers: number;
  storageGb: number;
  pendingApprovals: number;
  archived: number;
};

const KPI_CARDS: {
  label: string;
  key: keyof ReportKpis;
  sub: string;
  icon: typeof FileText;
  iconColor: string;
  iconBg: string;
  format?: (v: number) => string;
}[] = [
  { label: 'Total Documents', key: 'totalDocuments', sub: '↑ 18.4% vs previous period', icon: FileText, iconColor: 'text-blue-600', iconBg: 'bg-blue-50' },
  { label: 'New Documents', key: 'newDocuments', sub: '↑ 12.1% vs previous period', icon: FilePlus, iconColor: 'text-green-600', iconBg: 'bg-green-50' },
  { label: 'Completed Approvals', key: 'completedApprovals', sub: '↑ 8.7% vs previous period', icon: CheckCircle, iconColor: 'text-purple-600', iconBg: 'bg-purple-50' },
  { label: 'Active Users', key: 'activeUsers', sub: '↑ 5.2% vs previous period', icon: Users, iconColor: 'text-orange-600', iconBg: 'bg-orange-50' },
  { label: 'Storage Used', key: 'storageGb', sub: '↑ 3.4% vs previous period', icon: HardDrive, iconColor: 'text-cyan-600', iconBg: 'bg-cyan-50', format: (v) => `${v} GB` },
];

const STORAGE_USAGE = [
  { date: 'Jan', gb: 210 },
  { date: 'Feb', gb: 218 },
  { date: 'Mar', gb: 225 },
  { date: 'Apr', gb: 240 },
  { date: 'May', gb: 257 },
];

const RECENT_REPORTS = [
  { id: '1', name: 'Document Summary Report', category: 'Documents', period: '1 May – 10 May 2025', generatedBy: 'Fuad Ahmadov', generatedOn: '2025-05-10T14:30:00Z' },
  { id: '2', name: 'Approval Performance Report', category: 'Approvals', period: '1 May – 10 May 2025', generatedBy: 'Elnur Mahmudov', generatedOn: '2025-05-09T11:15:00Z' },
  { id: '3', name: 'User Activity Report', category: 'Users', period: '1 May – 10 May 2025', generatedBy: 'Nigar Rustamova', generatedOn: '2025-05-08T09:00:00Z' },
  { id: '4', name: 'Storage Usage Report', category: 'System', period: 'Apr 2025', generatedBy: 'System', generatedOn: '2025-05-01T00:00:00Z' },
  { id: '5', name: 'Department Compliance Report', category: 'Documents', period: 'Q1 2025', generatedBy: 'Fuad Ahmadov', generatedOn: '2025-04-15T16:45:00Z' },
];

export function ReportsPage() {
  const [dateFrom, setDateFrom] = useState('2025-05-01');
  const [dateTo, setDateTo] = useState('2025-05-10');
  const [compare, setCompare] = useState('previous');
  const [kpis, setKpis] = useState<ReportKpis | null>(null);
  const [trend, setTrend] = useState<{ month: string; created: number; published: number }[]>([]);
  const [byDepartment, setByDepartment] = useState<{ name: string; count: number; color?: string }[]>([]);
  const [byCategory, setByCategory] = useState<{ category: string; count: number }[]>([]);
  const [activityTimeline, setActivityTimeline] = useState<AuditLog[]>([]);

  useEffect(() => {
    api
      .getReports()
      .then((data) => {
        setKpis(data.kpis);
        setTrend(data.trend);
        setByDepartment(data.byDepartment);
        setByCategory(data.byCategory);
        setActivityTimeline(data.activityTimeline);
      })
      .catch(console.error);
  }, []);

  const deptTotal = byDepartment.reduce((s, d) => s + d.count, 0);
  const activityChartData = activityTimeline.map((log) => ({
    day: formatDateTime(log.createdAt).split(',')[0],
    actions: 1,
    label: log.action,
  }));
  const categoryChartData = byCategory.map((c) => ({
    type: c.category.replace(/_/g, ' '),
    count: c.count,
  }));

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-hoterra-page">
      <Header
        title="Reports & Analytics"
        subtitle="Gain insights and make data-driven decisions"
      />

      <div className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm">
            <Calendar className="h-4 w-4 text-gray-400" />
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="border-none bg-transparent text-sm focus:outline-none" />
            <span className="text-gray-400">–</span>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="border-none bg-transparent text-sm focus:outline-none" />
          </div>
          <select value={compare} onChange={(e) => setCompare(e.target.value)} className="filter-select">
            <option value="previous">Compare: Previous Period</option>
            <option value="year">Compare: Same Period Last Year</option>
            <option value="none">No Comparison</option>
          </select>
          <button className="btn-secondary py-2.5">
            <Filter className="h-4 w-4" />
            Filter
          </button>
          <button className="btn-primary">
            <Download className="h-4 w-4" />
            Export
          </button>
        </div>
      </div>

      <div className="page-content">
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {KPI_CARDS.map((card) => {
            const raw = kpis?.[card.key];
            const value =
              raw !== undefined
                ? card.format
                  ? card.format(raw)
                  : raw.toLocaleString()
                : '—';
            return (
              <DashStatCard
                key={card.label}
                label={card.label}
                value={value}
                sub={card.sub}
                icon={card.icon}
                iconColor={card.iconColor}
                iconBg={card.iconBg}
                sparkline
              />
            );
          })}
        </div>

        <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <ChartCard title="Documents Overview" link="View Details">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trend}>
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
          </ChartCard>

          <ChartCard title="Documents by Department" link="View Details">
            <div className="flex items-center gap-4">
              <div className="relative h-56 w-56 shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={byDepartment}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={80}
                      paddingAngle={2}
                      dataKey="count"
                    >
                      {byDepartment.map((entry) => (
                        <Cell key={entry.name} fill={entry.color || '#294660'} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <div className="text-xl font-bold text-hoterra-navy">{deptTotal}</div>
                  <div className="text-xs text-gray-500">Total</div>
                </div>
              </div>
              <div className="flex-1 space-y-2 text-xs">
                {byDepartment.map((d) => (
                  <div key={d.name} className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: d.color || '#294660' }} />
                    <span className="flex-1 text-gray-600">{d.name}</span>
                    <span className="font-medium">{d.count}</span>
                  </div>
                ))}
              </div>
            </div>
          </ChartCard>

          <ChartCard title="Approval Performance" link="View Details">
            <div className="flex h-64 items-center justify-center text-sm text-gray-400">
              Approval metrics available in KPI cards above
            </div>
          </ChartCard>

          <ChartCard title="Documents by Category" link="View Details">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={categoryChartData} layout="vertical" margin={{ left: 0, right: 16 }}>
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="type" width={100} tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#294660" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          <ChartCard title="Activity Timeline" link="View Details">
            <div className="h-64">
              {activityChartData.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-gray-400">
                  No recent activity
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={activityChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="actions" fill="#22C55E" radius={[4, 4, 0, 0]} name="Events" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </ChartCard>

          <ChartCard title="Storage Usage" link="View Details">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={STORAGE_USAGE}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} unit=" GB" />
                  <Tooltip formatter={(v: number) => `${v} GB`} />
                  <Area type="monotone" dataKey="gb" stroke="#06B6D4" fill="#06B6D4" fillOpacity={0.2} strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
        </div>

        <div className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
            <h3 className="font-semibold text-hoterra-navy">Recent Reports</h3>
            <button className="text-sm font-medium text-hoterra-steel hover:underline">
              View All Reports →
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs font-medium uppercase text-gray-500">
                <tr>
                  <th className="px-5 py-3">Report Name</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Period</th>
                  <th className="px-4 py-3">Generated By</th>
                  <th className="px-4 py-3">Generated On</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {RECENT_REPORTS.map((report) => (
                  <tr key={report.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-hoterra-steel" />
                        <span className="font-medium text-hoterra-navy">{report.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs">{report.category}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{report.period}</td>
                    <td className="px-4 py-3 text-gray-600">{report.generatedBy}</td>
                    <td className="px-4 py-3 text-gray-600">{formatDateTime(report.generatedOn)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-hoterra-steel">
                          <Eye className="h-4 w-4" />
                        </button>
                        <button className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-hoterra-steel">
                          <Download className="h-4 w-4" />
                        </button>
                        <button className="rounded p-1.5 text-gray-400 hover:bg-gray-100">
                          <MoreHorizontal className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function ChartCard({
  title,
  link,
  children,
}: {
  title: string;
  link: string;
  children: React.ReactNode;
}) {
  return (
    <div className="card p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-semibold text-hoterra-navy">{title}</h3>
        <button className="text-xs font-medium text-hoterra-steel hover:underline">{link}</button>
      </div>
      {children}
    </div>
  );
}
