import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ScrollText,
  Shield,
  AlertTriangle,
  Activity,
  Users,
  Search,
  Filter,
  Download,
  X,
} from 'lucide-react';
import { Header } from '@/components/layout/Sidebar';
import { DashStatCard } from '@/components/ui/DashStatCard';
import { Pagination } from '@/components/ui/Pagination';
import { api } from '@/lib/api';
import type { AuditLog, Department, Template, User } from '@/types';
import { CATEGORY_LABELS } from '@/types';
import {
  AUDIT_ACTION_OPTIONS,
  AUDIT_ENTITY_TYPE_OPTIONS,
  AUDIT_MODULE_OPTIONS,
  mapAuditAction,
} from '@/data/mock';
import { formatDateTime } from '@/lib/utils';
import { cn } from '@/lib/utils';

const SEVERITY_STYLE: Record<string, string> = {
  Low: 'bg-gray-100 text-gray-600',
  Medium: 'bg-blue-100 text-blue-700',
  High: 'bg-red-100 text-red-700',
};

const FILTER_KEYS = [
  'userId',
  'action',
  'entityType',
  'category',
  'departmentId',
  'templateId',
  'module',
  'severity',
  'from',
  'to',
] as const;

interface AuditFilters {
  search: string;
  userId: string;
  action: string;
  entityType: string;
  category: string;
  departmentId: string;
  templateId: string;
  module: string;
  severity: string;
  from: string;
  to: string;
}

const EMPTY_FILTERS: AuditFilters = {
  search: '',
  userId: '',
  action: '',
  entityType: '',
  category: '',
  departmentId: '',
  templateId: '',
  module: '',
  severity: '',
  from: '',
  to: '',
};

function filtersFromParams(params: URLSearchParams): AuditFilters {
  return {
    search: params.get('q') ?? '',
    userId: params.get('userId') ?? '',
    action: params.get('action') ?? '',
    entityType: params.get('entityType') ?? '',
    category: params.get('category') ?? '',
    departmentId: params.get('departmentId') ?? '',
    templateId: params.get('templateId') ?? '',
    module: params.get('module') ?? '',
    severity: params.get('severity') ?? '',
    from: params.get('from') ?? '',
    to: params.get('to') ?? '',
  };
}

function apiParamsFromFilters(filters: AuditFilters, page: number, limit: number) {
  return {
    page,
    limit,
    search: filters.search || undefined,
    userId: filters.userId || undefined,
    action: filters.action || undefined,
    entityType: filters.entityType || undefined,
    category: filters.category || undefined,
    departmentId: filters.departmentId || undefined,
    templateId: filters.templateId || undefined,
    module: filters.module || undefined,
    severity: filters.severity || undefined,
    from: filters.from || undefined,
    to: filters.to || undefined,
  };
}

export function AuditLogPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [filters, setFilters] = useState<AuditFilters>(() => filtersFromParams(searchParams));
  const [debouncedSearch, setDebouncedSearch] = useState(filters.search);
  const [page, setPage] = useState(() => Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1));
  const [limit, setLimit] = useState(20);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState({ today: 0, highSeverity: 0, activeUsers: 0 });
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);

  useEffect(() => {
    Promise.all([api.getDepartments(), api.getUsers(), api.getTemplates()])
      .then(([depts, usrs, tmpls]) => {
        setDepartments(depts);
        setUsers(usrs);
        setTemplates(tmpls);
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(filters.search), 300);
    return () => clearTimeout(timer);
  }, [filters.search]);

  const syncUrl = useCallback(
    (nextFilters: AuditFilters, nextPage: number) => {
      const params = new URLSearchParams();
      if (nextFilters.search) params.set('q', nextFilters.search);
      for (const key of FILTER_KEYS) {
        if (nextFilters[key]) params.set(key, nextFilters[key]);
      }
      if (nextPage > 1) params.set('page', String(nextPage));
      setSearchParams(params, { replace: true });
    },
    [setSearchParams]
  );

  const updateFilter = useCallback(
    (key: keyof AuditFilters, value: string) => {
      setFilters((prev) => {
        const next = { ...prev, [key]: value };
        syncUrl(next, 1);
        return next;
      });
      setPage(1);
    },
    [syncUrl]
  );

  const clearFilters = useCallback(() => {
    setFilters(EMPTY_FILTERS);
    setPage(1);
    setSearchParams(new URLSearchParams(), { replace: true });
  }, [setSearchParams]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    for (const key of FILTER_KEYS) {
      if (filters[key]) count++;
    }
    return count;
  }, [filters]);

  const queryFilters = useMemo(
    () => ({ ...filters, search: debouncedSearch }),
    [filters, debouncedSearch]
  );

  useEffect(() => {
    setLoading(true);
    api
      .getAuditLogs(apiParamsFromFilters(queryFilters, page, limit))
      .then((res) => {
        setLogs(res.data);
        setTotal(res.pagination.total);
        setSummary(res.summary);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [page, limit, queryFilters]);

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

  const totalPages = Math.max(1, Math.ceil(total / limit));

  const handleExport = async () => {
    setExporting(true);
    try {
      const { page: _p, limit: _l, ...exportParams } = apiParamsFromFilters(queryFilters, page, limit);
      await api.exportAuditLogs(exportParams);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  const handlePageChange = (nextPage: number) => {
    setPage(nextPage);
    syncUrl(filters, nextPage);
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-hoterra-page">
      <Header
        title="Audit Log"
        subtitle="Track all system activity, security events and document actions"
        action={
          <button onClick={handleExport} disabled={exporting} className="btn-secondary disabled:opacity-50">
            <Download className="h-4 w-4" />
            {exporting ? 'Exporting...' : 'Export Log'}
          </button>
        }
      />

      <div className="page-stats">
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <DashStatCard label="Total Events" value={total} icon={ScrollText} iconColor="text-blue-600" iconBg="bg-blue-50" />
          <DashStatCard label="Today's Activity" value={summary.today} icon={Activity} iconColor="text-green-600" iconBg="bg-green-50" />
          <DashStatCard label="High Severity" value={summary.highSeverity} icon={AlertTriangle} iconColor="text-red-600" iconBg="bg-red-50" />
          <DashStatCard label="Active Users" value={summary.activeUsers} icon={Users} iconColor="text-purple-600" iconBg="bg-purple-50" />
        </div>
      </div>

      <div className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="relative mb-4 max-w-2xl">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            placeholder="Search user, action, details or IP..."
            value={filters.search}
            onChange={(e) => updateFilter('search', e.target.value)}
            className="w-full rounded-lg border border-gray-200 py-2.5 pl-10 pr-4 text-sm focus:border-hoterra-steel focus:outline-none focus:ring-1 focus:ring-hoterra-steel"
          />
        </div>

        <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
          <div>
            <label className="mb-1 block text-[10px] font-medium uppercase text-gray-400">User</label>
            <select value={filters.userId} onChange={(e) => updateFilter('userId', e.target.value)} className="filter-select w-full">
              <option value="">All Users</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.firstName} {u.lastName}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-medium uppercase text-gray-400">Action</label>
            <select value={filters.action} onChange={(e) => updateFilter('action', e.target.value)} className="filter-select w-full">
              <option value="">All Actions</option>
              {AUDIT_ACTION_OPTIONS.map((a) => (
                <option key={a} value={a}>
                  {mapAuditAction(a).label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-medium uppercase text-gray-400">Entity Type</label>
            <select value={filters.entityType} onChange={(e) => updateFilter('entityType', e.target.value)} className="filter-select w-full">
              <option value="">All Entities</option>
              {AUDIT_ENTITY_TYPE_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-medium uppercase text-gray-400">Category</label>
            <select value={filters.category} onChange={(e) => updateFilter('category', e.target.value)} className="filter-select w-full">
              <option value="">All Categories</option>
              {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-medium uppercase text-gray-400">Department</label>
            <select value={filters.departmentId} onChange={(e) => updateFilter('departmentId', e.target.value)} className="filter-select w-full">
              <option value="">All Departments</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-medium uppercase text-gray-400">Template</label>
            <select value={filters.templateId} onChange={(e) => updateFilter('templateId', e.target.value)} className="filter-select w-full">
              <option value="">All Templates</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-medium uppercase text-gray-400">Module</label>
            <select value={filters.module} onChange={(e) => updateFilter('module', e.target.value)} className="filter-select w-full">
              <option value="">All Modules</option>
              {AUDIT_MODULE_OPTIONS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-medium uppercase text-gray-400">Severity</label>
            <select value={filters.severity} onChange={(e) => updateFilter('severity', e.target.value)} className="filter-select w-full">
              <option value="">All Severity</option>
              <option value="Low">Low</option>
              <option value="Medium">Medium</option>
              <option value="High">High</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-medium uppercase text-gray-400">From</label>
            <input
              type="date"
              value={filters.from}
              onChange={(e) => updateFilter('from', e.target.value)}
              className="filter-select w-full"
            />
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-medium uppercase text-gray-400">To</label>
            <input
              type="date"
              value={filters.to}
              onChange={(e) => updateFilter('to', e.target.value)}
              className="filter-select w-full"
            />
          </div>
          <div className="flex items-end">
            <button onClick={clearFilters} className="btn-secondary relative w-full py-2 text-xs">
              <Filter className="h-3.5 w-3.5" />
              Clear Filters
              {activeFilterCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-hoterra-gold px-1 text-[10px] font-semibold text-white">
                  {activeFilterCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {activeFilterCount > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3">
            <span className="text-xs text-gray-500">
              {activeFilterCount} active filter{activeFilterCount !== 1 ? 's' : ''}
            </span>
            {FILTER_KEYS.filter((key) => filters[key]).map((key) => {
              const value = filters[key];
              let label = value;
              if (key === 'userId') {
                const u = users.find((x) => x.id === value);
                label = u ? `${u.firstName} ${u.lastName}` : value;
              } else if (key === 'departmentId') {
                label = departments.find((d) => d.id === value)?.name ?? value;
              } else if (key === 'templateId') {
                label = templates.find((t) => t.id === value)?.name ?? value;
              } else if (key === 'category') {
                label = CATEGORY_LABELS[value as keyof typeof CATEGORY_LABELS] ?? value;
              } else if (key === 'action') {
                label = mapAuditAction(value).label;
              }
              return (
                <button
                  key={key}
                  onClick={() => updateFilter(key, '')}
                  className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-200"
                >
                  {label}
                  <X className="h-3 w-3" />
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-2 text-sm text-gray-500">
        <span>{total} events</span>
      </div>

      <div className="flex-1 overflow-auto bg-white">
        <table className="w-full min-w-[1200px] text-sm">
          <thead className="sticky top-0 bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
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
            ) : enriched.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-6 py-12 text-center text-gray-500">
                  No audit events found
                </td>
              </tr>
            ) : (
              enriched.map((log) => (
                <tr key={log.id} className="hover:bg-gray-50/80">
                  <td className="whitespace-nowrap px-6 py-3 text-gray-600">{formatDateTime(log.createdAt)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-hoterra-steel text-[10px] font-semibold text-white">
                        {(log.userName ?? 'S')[0]}
                      </div>
                      <span className="font-medium text-gray-800">{log.userName ?? 'System'}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn('inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium', log.mapped.color)}>
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
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">{log.ipAddress ?? '—'}</td>
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
        onPageChange={handlePageChange}
        onLimitChange={(n) => {
          setLimit(n);
          setPage(1);
          syncUrl(filters, 1);
        }}
        label="events"
      />
    </div>
  );
}
