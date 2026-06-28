import { useEffect, useMemo, useState } from 'react';
import {
  ScrollText,
  Shield,
  AlertTriangle,
  Activity,
  Users,
  Search,
  Filter,
  Download,
  Calendar,
} from 'lucide-react';
import { Header } from '@/components/layout/Sidebar';
import { StatCard } from '@/components/ui/StatCard';
import { Pagination } from '@/components/ui/Pagination';
import { api } from '@/lib/api';
import type { AuditLog } from '@/types';
import { mapAuditAction } from '@/data/mock';
import { formatDateTime } from '@/lib/utils';
import { cn } from '@/lib/utils';

const SEVERITY_STYLE: Record<string, string> = {
  Low: 'bg-gray-100 text-gray-600',
  Medium: 'bg-blue-100 text-blue-700',
  High: 'bg-red-100 text-red-700',
};

const MODULES = ['ALL', 'System', 'Documents', 'My Approvals', 'Archive', 'Users & Roles'];

export function AuditLogPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [moduleFilter, setModuleFilter] = useState('ALL');
  const [severityFilter, setSeverityFilter] = useState('ALL');

  useEffect(() => {
    setLoading(true);
    api
      .getAuditLogs(page, limit)
      .then((res) => {
        setLogs(res.data);
        setTotal(res.pagination.total);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [page, limit]);

  const enriched = useMemo(
    () =>
      logs.map((log) => ({
        ...log,
        mapped: mapAuditAction(log.action),
        resource: log.entityType
          ? `${log.entityType}${log.entityId ? ` #${log.entityId.slice(0, 8)}` : ''}`
          : '—',
      })),
    [logs]
  );

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return enriched.filter((log) => {
      const matchesModule = moduleFilter === 'ALL' || log.mapped.module === moduleFilter;
      const matchesSeverity =
        severityFilter === 'ALL' || log.mapped.severity === severityFilter;
      const matchesSearch =
        !q ||
        (log.userName?.toLowerCase().includes(q) ?? false) ||
        log.mapped.label.toLowerCase().includes(q) ||
        (log.details?.toLowerCase().includes(q) ?? false) ||
        (log.ipAddress?.includes(q) ?? false);
      return matchesModule && matchesSeverity && matchesSearch;
    });
  }, [enriched, search, moduleFilter, severityFilter]);

  const stats = useMemo(() => {
    const high = enriched.filter((l) => l.mapped.severity === 'High').length;
    const today = enriched.filter((l) => {
      const d = new Date(l.createdAt);
      const now = new Date();
      return d.toDateString() === now.toDateString();
    }).length;
    const uniqueUsers = new Set(enriched.map((l) => l.userName).filter(Boolean)).size;
    return { total, today, high, uniqueUsers };
  }, [enriched, total]);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <Header
        title="Audit Log"
        subtitle="Track all system activity, security events and document actions"
        action={
          <button className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium hover:bg-gray-50">
            <Download className="h-4 w-4" />
            Export Log
          </button>
        }
      />

      <div className="grid grid-cols-2 gap-4 border-b border-gray-200 bg-gray-50 px-6 py-4 lg:grid-cols-4">
        <StatCard label="Total Events" value={stats.total} icon={ScrollText} color="blue" />
        <StatCard label="Today's Activity" value={stats.today} icon={Activity} color="green" />
        <StatCard label="High Severity" value={stats.high} icon={AlertTriangle} color="red" />
        <StatCard label="Active Users" value={stats.uniqueUsers} icon={Users} color="purple" />
      </div>

      <div className="border-b border-gray-200 bg-white px-6 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[240px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              placeholder="Search user, action, details or IP..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-gray-200 py-2 pl-10 pr-4 text-sm focus:border-hoterra-steel focus:outline-none"
            />
          </div>
          <select
            value={moduleFilter}
            onChange={(e) => setModuleFilter(e.target.value)}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
          >
            {MODULES.map((m) => (
              <option key={m} value={m}>
                {m === 'ALL' ? 'All Modules' : m}
              </option>
            ))}
          </select>
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
          >
            <option value="ALL">All Severity</option>
            <option value="Low">Low</option>
            <option value="Medium">Medium</option>
            <option value="High">High</option>
          </select>
          <button className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm hover:bg-gray-50">
            <Calendar className="h-4 w-4" />
            Date Range
          </button>
          <button className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm hover:bg-gray-50">
            <Filter className="h-4 w-4" />
            More Filters
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <table className="w-full min-w-[1200px] text-sm">
          <thead className="sticky top-0 bg-gray-50 text-left text-xs font-medium uppercase text-gray-500">
            <tr>
              <th className="px-6 py-3">Time</th>
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Action</th>
              <th className="px-4 py-3">Module</th>
              <th className="px-4 py-3">Resource</th>
              <th className="px-4 py-3">Details</th>
              <th className="px-4 py-3">IP Address</th>
              <th className="px-4 py-3">Severity</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {loading ? (
              <tr>
                <td colSpan={8} className="px-6 py-12 text-center text-gray-500">
                  Loading audit log...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-6 py-12 text-center text-gray-500">
                  No audit events found
                </td>
              </tr>
            ) : (
              filtered.map((log) => (
                <tr key={log.id} className="hover:bg-gray-50">
                  <td className="whitespace-nowrap px-6 py-3 text-gray-600">
                    {formatDateTime(log.createdAt)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-hoterra-steel text-[10px] font-semibold text-white">
                        {(log.userName ?? 'S')[0]}
                      </div>
                      <span className="font-medium text-gray-800">{log.userName ?? 'System'}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        'inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium',
                        log.mapped.color
                      )}
                    >
                      {log.mapped.label}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1 text-gray-600">
                      <Shield className="h-3.5 w-3.5 text-gray-400" />
                      {log.mapped.module}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">{log.resource}</td>
                  <td className="max-w-xs truncate px-4 py-3 text-gray-600" title={log.details ?? ''}>
                    {log.details ?? '—'}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">
                    {log.ipAddress ?? '192.168.1.100'}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        'inline-flex rounded-full px-2 py-0.5 text-xs font-medium',
                        SEVERITY_STYLE[log.mapped.severity] || SEVERITY_STYLE.Low
                      )}
                    >
                      {log.mapped.severity}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Pagination
        page={page}
        totalPages={totalPages}
        total={total}
        limit={limit}
        onPageChange={setPage}
        onLimitChange={(n) => {
          setLimit(n);
          setPage(1);
        }}
        label="events"
      />
    </div>
  );
}
