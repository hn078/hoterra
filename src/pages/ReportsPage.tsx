import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Archive, Calendar, CheckCircle, Clock, Download, FilePlus, FileText, HardDrive, RefreshCw, Users } from 'lucide-react';
import { Header } from '@/components/layout/Sidebar';
import { DashStatCard } from '@/components/ui/DashStatCard';
import { api } from '@/lib/api';
import { hasCapability } from '@/modules/access-control';
import { useAuthStore } from '@/store/auth';
import { formatDateTime } from '@/lib/utils';

type CompareMode = 'previous' | 'year' | 'none';
type ReportData = Awaited<ReturnType<typeof api.getReports>>;

function isoDay(date: Date) { return date.toISOString().slice(0, 10); }
function initialRange() {
  const to = new Date();
  const from = new Date(to); from.setUTCDate(from.getUTCDate() - 29);
  return { from: isoDay(from), to: isoDay(to) };
}

function comparisonText(value: number | null, mode: CompareMode) {
  if (mode === 'none' || value === null) return 'Comparison disabled';
  if (value === 0) return 'No change vs comparison period';
  return `${value > 0 ? '↑' : '↓'} ${Math.abs(value).toFixed(1)}% vs ${mode === 'year' ? 'same period last year' : 'previous period'}`;
}

const APPROVAL_COLORS = { approved: '#22C55E', rejected: '#EF4444', returned: '#F59E0B' };

export function ReportsPage() {
  const currentUser = useAuthStore((state) => state.user);
  const canExport = hasCapability(currentUser, 'reports.export');
  const initial = useMemo(initialRange, []);
  const [dateFrom, setDateFrom] = useState(initial.from);
  const [dateTo, setDateTo] = useState(initial.to);
  const [compare, setCompare] = useState<CompareMode>('previous');
  const [applied, setApplied] = useState({ from: initial.from, to: initial.to, compare: 'previous' as CompareMode });
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setLoading(true); setError('');
    api.getReports(applied).then(setData).catch((reason) => setError(reason instanceof Error ? reason.message : 'Report could not be loaded')).finally(() => setLoading(false));
  }, [applied]);
  useEffect(() => { load(); }, [load]);

  const applyFilters = () => {
    if (!dateFrom || !dateTo || dateFrom > dateTo) { setError('Choose a valid date range'); return; }
    setApplied({ from: dateFrom, to: dateTo, compare });
  };
  const exportReport = async () => {
    setExporting(true);
    try { await api.exportReports(applied); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Report export failed'); }
    finally { setExporting(false); }
  };

  const approvalData = data ? Object.entries(data.approvalPerformance).map(([name, value]) => ({ name, value })) : [];
  const departmentTotal = data?.byDepartment.reduce((sum, entry) => sum + entry.count, 0) ?? 0;
  const categoryData = data?.byCategory.map((entry) => ({ type: entry.category.replaceAll('_', ' '), count: entry.count })) ?? [];

  return <div className="flex flex-1 flex-col overflow-hidden bg-hoterra-page">
    <Header title="Reports & Analytics" subtitle="Actor-scoped document, approval and storage analytics" />
    <div className="border-b border-gray-200 bg-white px-4 py-4 sm:px-6">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
        <div className="flex flex-col gap-2 rounded-lg border border-gray-200 p-3 sm:flex-row sm:items-center sm:py-2">
          <Calendar className="hidden h-4 w-4 text-gray-400 sm:block" />
          <label className="flex items-center gap-2 text-xs text-gray-500">From<input aria-label="Report from date" type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} className="min-w-0 flex-1 border-none bg-transparent text-sm text-gray-800 focus:outline-none" /></label>
          <span className="hidden text-gray-400 sm:inline">–</span>
          <label className="flex items-center gap-2 text-xs text-gray-500">To<input aria-label="Report to date" type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} className="min-w-0 flex-1 border-none bg-transparent text-sm text-gray-800 focus:outline-none" /></label>
        </div>
        <select value={compare} onChange={(event) => setCompare(event.target.value as CompareMode)} className="filter-select xl:w-64">
          <option value="previous">Compare: Previous Period</option><option value="year">Compare: Same Period Last Year</option><option value="none">No Comparison</option>
        </select>
        <button onClick={applyFilters} disabled={loading} className="btn-secondary justify-center py-2.5 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Apply</button>
        {canExport && <button onClick={exportReport} disabled={exporting || loading || !data} className="btn-primary justify-center disabled:opacity-50"><Download className="h-4 w-4" />{exporting ? 'Exporting...' : 'Export CSV'}</button>}
      </div>
      {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {data?.warnings.map((warning) => <p key={warning} className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{warning}</p>)}
    </div>

    <div className="page-content">
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-8">
        <DashStatCard label="Visible Documents" value={data?.kpis.totalDocuments ?? '—'} sub="Current authorized scope" icon={FileText} iconColor="text-blue-600" iconBg="bg-blue-50" />
        <DashStatCard label="New Documents" value={data?.kpis.newDocuments ?? '—'} sub={data ? comparisonText(data.comparison.newDocuments, applied.compare) : 'Selected period'} icon={FilePlus} iconColor="text-green-600" iconBg="bg-green-50" />
        <DashStatCard label="Approval Actions" value={data?.kpis.completedApprovals ?? '—'} sub={data ? comparisonText(data.comparison.completedApprovals, applied.compare) : 'Selected period'} icon={CheckCircle} iconColor="text-purple-600" iconBg="bg-purple-50" />
        <DashStatCard label="Active Users" value={data?.kpis.activeUsers ?? '—'} sub="Within authorized scope" icon={Users} iconColor="text-orange-600" iconBg="bg-orange-50" />
        <DashStatCard label="Storage Used" value={data ? `${data.kpis.storageGb.toFixed(2)} GB` : '—'} sub="Visible documents and attachments" icon={HardDrive} iconColor="text-cyan-600" iconBg="bg-cyan-50" />
        <DashStatCard label="Pending" value={data?.kpis.pendingApprovals ?? '—'} sub="Current workflow state" icon={Clock} iconColor="text-amber-600" iconBg="bg-amber-50" />
        <DashStatCard label="Published" value={data?.kpis.published ?? '—'} sub="Current workflow state" icon={CheckCircle} iconColor="text-emerald-600" iconBg="bg-emerald-50" />
        <DashStatCard label="Archived" value={data?.kpis.archived ?? '—'} sub="Current authorized scope" icon={Archive} iconColor="text-slate-600" iconBg="bg-slate-100" />
      </div>

      {loading && !data ? <div className="card p-12 text-center text-sm text-gray-500">Loading report...</div> : <>
        <div className="mb-6 grid grid-cols-1 gap-5 xl:grid-cols-2">
          <ChartCard title="Documents and approval actions by period">
            <div className="h-72"><ResponsiveContainer width="100%" height="100%"><LineChart data={data?.trend ?? []}><CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" /><XAxis dataKey="bucket" tick={{ fontSize: 10 }} /><YAxis allowDecimals={false} tick={{ fontSize: 11 }} /><Tooltip /><Legend /><Line type="monotone" dataKey="created" stroke="#294660" strokeWidth={2} dot={false} name="Created" /><Line type="monotone" dataKey="approvalActions" stroke="#8B5CF6" strokeWidth={2} dot={false} name="Approval actions" /></LineChart></ResponsiveContainer></div>
          </ChartCard>
          <ChartCard title="Documents created by department">
            <div className="flex flex-col items-center gap-4 sm:flex-row"><div className="relative h-60 w-60 shrink-0"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={data?.byDepartment ?? []} cx="50%" cy="50%" innerRadius={55} outerRadius={82} paddingAngle={2} dataKey="count">{data?.byDepartment.map((entry) => <Cell key={entry.id} fill={entry.color || '#294660'} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer><div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"><strong className="text-xl text-hoterra-navy">{departmentTotal}</strong><span className="text-xs text-gray-500">Created</span></div></div><div className="w-full space-y-2 text-xs">{data?.byDepartment.map((entry) => <div key={entry.id} className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: entry.color || '#294660' }} /><span className="flex-1 text-gray-600">{entry.name}</span><strong>{entry.count}</strong></div>)}</div></div>
          </ChartCard>
          <ChartCard title="Approval outcomes">
            <div className="h-72"><ResponsiveContainer width="100%" height="100%"><BarChart data={approvalData}><CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" /><XAxis dataKey="name" tickFormatter={(value) => String(value).replace(/^./, (char) => char.toUpperCase())} /><YAxis allowDecimals={false} /><Tooltip /><Bar dataKey="value" name="Actions" radius={[5, 5, 0, 0]}>{approvalData.map((entry) => <Cell key={entry.name} fill={APPROVAL_COLORS[entry.name as keyof typeof APPROVAL_COLORS]} />)}</Bar></BarChart></ResponsiveContainer></div>
          </ChartCard>
          <ChartCard title="Documents created by category">
            <div className="h-72"><ResponsiveContainer width="100%" height="100%"><BarChart data={categoryData} layout="vertical" margin={{ left: 8, right: 20 }}><XAxis type="number" allowDecimals={false} /><YAxis type="category" dataKey="type" width={110} tick={{ fontSize: 10 }} /><Tooltip /><Bar dataKey="count" fill="#294660" radius={[0, 4, 4, 0]} /></BarChart></ResponsiveContainer></div>
          </ChartCard>
          <ChartCard title="Storage added during the selected period">
            <div className="h-72"><ResponsiveContainer width="100%" height="100%"><AreaChart data={data?.trend ?? []}><CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" /><XAxis dataKey="bucket" tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 11 }} unit=" GB" /><Tooltip formatter={(value: number) => `${value.toFixed(3)} GB`} /><Area type="monotone" dataKey="storageGb" stroke="#06B6D4" fill="#06B6D4" fillOpacity={0.2} strokeWidth={2} name="Storage added" /></AreaChart></ResponsiveContainer></div>
          </ChartCard>
        </div>

        <div className="card overflow-hidden"><div className="border-b border-gray-100 px-5 py-4"><h3 className="font-semibold text-hoterra-navy">Recent activity in selected period</h3><p className="mt-1 text-xs text-gray-500">Only documents inside your authorized scope are included.</p></div><div className="overflow-x-auto"><table className="w-full min-w-[720px] text-sm"><thead className="bg-gray-50 text-left text-xs font-medium uppercase text-gray-500"><tr><th className="px-5 py-3">Document</th><th className="px-4 py-3">Action</th><th className="px-4 py-3">Performed by</th><th className="px-4 py-3">Date</th></tr></thead><tbody className="divide-y divide-gray-100">{data?.activityTimeline.length ? data.activityTimeline.map((entry) => <tr key={entry.id} className="hover:bg-gray-50"><td className="px-5 py-3"><Link to={`/documents/${entry.document.id}`} className="font-medium text-hoterra-navy hover:underline">{entry.document.title}</Link><div className="text-xs text-gray-400">{entry.document.code}</div></td><td className="px-4 py-3 text-gray-700">{entry.action}</td><td className="px-4 py-3 text-gray-600">{entry.userName || 'System'}</td><td className="px-4 py-3 text-gray-500">{formatDateTime(entry.createdAt)}</td></tr>) : <tr><td colSpan={4} className="px-5 py-10 text-center text-gray-500">No document activity in this period</td></tr>}</tbody></table></div></div>
      </>}
    </div>
  </div>;
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="card p-4 sm:p-5"><h3 className="mb-4 font-semibold text-hoterra-navy">{title}</h3>{children}</section>;
}
