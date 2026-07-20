import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Briefcase,
  CheckCircle2,
  Clock,
  DollarSign,
  Plus,
  Search,
  Send,
  Users,
} from 'lucide-react';
import { Header, DepartmentBadge } from '@/components/layout/Sidebar';
import { Breadcrumbs } from '@/components/ui/Breadcrumbs';
import { PageTabs } from '@/components/ui/PageTabs';
import { DashStatCard } from '@/components/ui/DashStatCard';
import { api } from '@/lib/api';
import { formatDate, cn } from '@/lib/utils';
import type {
  Department,
  WorkforceMeta,
  WorkforceReport,
  WorkforceRequest,
  WorkforceShift,
  WorkforceVendorMode,
} from '@/types';
import {
  WORKFORCE_SHIFT_LABELS,
  WORKFORCE_STATUS_COLORS,
  WORKFORCE_STATUS_LABELS,
} from '@/types';
import {
  PayrollPanel,
  RoutesEditorPanel,
  SettingsPanel,
  TemplatesPanel,
} from '@/components/workforce/WorkforceAdminPanels';

const TABS = [
  { id: 'requests', label: 'Requests' },
  { id: 'catalog', label: 'Catalog' },
  { id: 'routes', label: 'Approval Routes' },
  { id: 'templates', label: 'Templates' },
  { id: 'payroll', label: 'Payroll' },
  { id: 'reports', label: 'Reports' },
  { id: 'settings', label: 'Settings' },
];

const SHIFTS: WorkforceShift[] = ['MORNING', 'EVENING', 'NIGHT', 'CUSTOM'];

export function WorkforcePage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState('requests');
  const [requests, setRequests] = useState<WorkforceRequest[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [meta, setMeta] = useState<WorkforceMeta | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [report, setReport] = useState<WorkforceReport | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newPosition, setNewPosition] = useState('');
  const [newVendor, setNewVendor] = useState({ name: '', contactEmail: '', phone: '' });

  const [form, setForm] = useState({
    hotelName: '',
    departmentId: '',
    positionId: '',
    workDate: '',
    shift: 'MORNING' as WorkforceShift,
    startTime: '',
    endTime: '',
    quantity: 1,
    comment: '',
    vendorMode: 'DIRECT' as WorkforceVendorMode,
    vendorId: '',
    broadcastVendorIds: [] as string[],
    isUrgentOverride: false,
  });

  const load = () => {
    api.getWorkforceRequests().then((res) => {
      setRequests(res.data);
      setCounts(res.counts || {});
    }).catch(console.error);
    api.getWorkforceMeta().then(setMeta).catch(console.error);
  };

  useEffect(() => {
    load();
    api.getDepartments().then(setDepartments).catch(console.error);
  }, []);

  useEffect(() => {
    if (tab === 'reports') {
      const now = new Date();
      api.getWorkforceReport({ year: now.getFullYear(), month: now.getMonth() + 1 })
        .then(setReport)
        .catch(console.error);
    }
  }, [tab]);

  useEffect(() => {
    if (meta && !form.hotelName) {
      setForm((f) => ({ ...f, hotelName: meta.settings.hotels?.[0] || meta.settings.hotelName }));
    }
  }, [meta, form.hotelName]);

  const filtered = useMemo(() => {
    return requests.filter((r) => {
      const q = search.toLowerCase();
      const matchesSearch =
        !q ||
        r.code.toLowerCase().includes(q) ||
        r.position.name.toLowerCase().includes(q) ||
        r.department.name.toLowerCase().includes(q);
      const matchesStatus = !statusFilter || r.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [requests, search, statusFilter]);

  const pendingCount =
    (counts.PENDING || 0) + (counts.AWAITING_EXTRA_APPROVAL || 0);

  const applyTemplate = (templateId: string) => {
    const t = meta?.templates.find((x) => x.id === templateId);
    if (!t) return;
    const date = new Date();
    date.setDate(date.getDate() + ((t.dayOfWeek ?? date.getDay()) - date.getDay() + 7) % 7 || 7);
    setForm((f) => ({
      ...f,
      departmentId: t.departmentId || f.departmentId,
      positionId: t.positionId || f.positionId,
      shift: t.shift,
      quantity: t.quantity,
      comment: t.comment || '',
      vendorMode: t.vendorMode,
      vendorId: t.vendorId || '',
      workDate: date.toISOString().slice(0, 10),
    }));
    setShowCreate(true);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const created = await api.createWorkforceRequest({
        ...form,
        quantity: Number(form.quantity),
        startTime: form.shift === 'CUSTOM' ? form.startTime : form.startTime || undefined,
        endTime: form.shift === 'CUSTOM' ? form.endTime : form.endTime || undefined,
      });
      setShowCreate(false);
      navigate(`/workforce/${created.id}`);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to create request');
    } finally {
      setCreating(false);
    }
  };

  const handleAddPosition = async () => {
    if (!newPosition.trim()) return;
    try {
      await api.createWorkforcePosition(newPosition.trim());
      setNewPosition('');
      load();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to add position');
    }
  };

  const handleAddVendor = async () => {
    if (!newVendor.name.trim()) return;
    try {
      await api.createWorkforceVendor(newVendor);
      setNewVendor({ name: '', contactEmail: '', phone: '' });
      load();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to add vendor');
    }
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-hoterra-page">
      <Header
        title="Casual Workforce"
        subtitle="Request, approve, and track temporary staff from approved vendors"
        action={
          <button onClick={() => setShowCreate(true)} className="btn-primary">
            <Plus className="h-4 w-4" />
            New Request
          </button>
        }
      />

      <div className="border-b border-gray-200 bg-white px-6 pb-4 pt-2">
        <Breadcrumbs items={[{ label: 'Casual Workforce' }]} />
      </div>

      <div className="border-b border-gray-200 bg-white px-6">
        <PageTabs tabs={TABS} active={tab} onChange={setTab} />
      </div>

      <div className="page-content">
        {tab === 'requests' && (
          <>
            <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
              <DashStatCard
                label="Pending"
                value={pendingCount}
                icon={Clock}
                iconColor="text-orange-600"
                iconBg="bg-orange-50"
              />
              <DashStatCard
                label="Sent to Vendor"
                value={counts.SENT_TO_VENDOR || 0}
                icon={Send}
                iconColor="text-indigo-600"
                iconBg="bg-indigo-50"
              />
              <DashStatCard
                label="Vendor Accepted"
                value={counts.VENDOR_ACCEPTED || 0}
                icon={Users}
                iconColor="text-cyan-600"
                iconBg="bg-cyan-50"
              />
              <DashStatCard
                label="Completed"
                value={counts.COMPLETED || 0}
                icon={CheckCircle2}
                iconColor="text-green-600"
                iconBg="bg-green-50"
              />
            </div>

            <div className="mb-4 flex flex-wrap items-center gap-3">
              <div className="relative min-w-[220px] flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by code, position, department..."
                  className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm"
                />
              </div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
              >
                <option value="">All statuses</option>
                {Object.entries(WORKFORCE_STATUS_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>

            <div className="card overflow-hidden">
              <table className="w-full text-sm">
                <thead className="border-b border-gray-100 bg-gray-50 text-left text-xs text-gray-500">
                  <tr>
                    <th className="px-4 py-3 font-medium">Code</th>
                    <th className="px-4 py-3 font-medium">Department</th>
                    <th className="px-4 py-3 font-medium">Position</th>
                    <th className="px-4 py-3 font-medium">Date / Shift</th>
                    <th className="px-4 py-3 font-medium">Qty</th>
                    <th className="px-4 py-3 font-medium">Vendor</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-hoterra-navy">{r.code}</td>
                      <td className="px-4 py-3">
                        <DepartmentBadge name={r.department.name} color={r.department.color} />
                      </td>
                      <td className="px-4 py-3">{r.position.name}</td>
                      <td className="px-4 py-3 text-gray-600">
                        {formatDate(r.workDate)} · {WORKFORCE_SHIFT_LABELS[r.shift]}
                      </td>
                      <td className="px-4 py-3">{r.quantity}</td>
                      <td className="px-4 py-3 text-gray-600">
                        {r.acceptedVendor?.name || r.vendor?.name || (r.vendorMode === 'BROADCAST' ? 'Broadcast' : '—')}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            'inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium',
                            WORKFORCE_STATUS_COLORS[r.status]
                          )}
                        >
                          {WORKFORCE_STATUS_LABELS[r.status]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          to={`/workforce/${r.id}`}
                          className="text-sm font-medium text-hoterra-steel hover:underline"
                        >
                          Open
                        </Link>
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-4 py-12 text-center text-gray-400">
                        <Briefcase className="mx-auto mb-2 h-8 w-8 opacity-40" />
                        No workforce requests yet
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {tab === 'catalog' && meta && (
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="card p-5">
              <h3 className="mb-3 text-sm font-semibold text-hoterra-navy">Positions</h3>
              <div className="mb-3 flex gap-2">
                <input
                  value={newPosition}
                  onChange={(e) => setNewPosition(e.target.value)}
                  placeholder="Add position (e.g. Banquet Captain)"
                  className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm"
                />
                <button onClick={handleAddPosition} className="btn-secondary">Add</button>
              </div>
              <ul className="max-h-80 space-y-1 overflow-y-auto text-sm">
                {meta.positions.map((p) => (
                  <li key={p.id} className="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-gray-50">
                    <span>{p.name}</span>
                    {!p.isActive && <span className="text-xs text-gray-400">Inactive</span>}
                  </li>
                ))}
              </ul>
            </div>
            <div className="card p-5">
              <h3 className="mb-3 text-sm font-semibold text-hoterra-navy">Approved Vendors</h3>
              <div className="mb-3 grid gap-2 sm:grid-cols-3">
                <input
                  value={newVendor.name}
                  onChange={(e) => setNewVendor((v) => ({ ...v, name: e.target.value }))}
                  placeholder="Vendor name"
                  className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
                />
                <input
                  value={newVendor.contactEmail}
                  onChange={(e) => setNewVendor((v) => ({ ...v, contactEmail: e.target.value }))}
                  placeholder="Email"
                  className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
                />
                <button onClick={handleAddVendor} className="btn-secondary">Add vendor</button>
              </div>
              <ul className="space-y-2 text-sm">
                {meta.vendors.map((v) => (
                  <li key={v.id} className="rounded-lg border border-gray-100 px-3 py-2">
                    <div className="font-medium text-hoterra-navy">{v.name}</div>
                    <div className="text-xs text-gray-500">
                      {v.contactEmail || 'No email'} · {v.isApproved ? 'Approved' : 'Pending'}
                    </div>
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-xs text-gray-500">
                Lead time rule: min {meta.settings.minLeadHours}h · Est. rate ${meta.settings.estimatedHourlyRate}/h
              </p>
            </div>
          </div>
        )}

        {tab === 'routes' && meta && (
          <RoutesEditorPanel meta={meta} departments={departments} onSaved={load} />
        )}

        {tab === 'templates' && meta && (
          <TemplatesPanel meta={meta} onUse={applyTemplate} onSaved={load} />
        )}

        {tab === 'payroll' && (
          <PayrollPanel
            completedRequestIds={requests
              .filter((r) => r.status === 'COMPLETED')
              .map((r) => ({ id: r.id, code: r.code }))}
          />
        )}

        {tab === 'settings' && meta && <SettingsPanel meta={meta} onSaved={load} />}

        {tab === 'reports' && report && (
          <div className="space-y-6">
            <div className="flex justify-end">
              <button
                className="btn-secondary"
                onClick={() => {
                  const now = new Date();
                  api
                    .downloadWorkforceReportCsv({
                      year: now.getFullYear(),
                      month: now.getMonth() + 1,
                    })
                    .catch((e) => alert(e.message));
                }}
              >
                Export CSV
              </button>
            </div>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <DashStatCard
                label="Requests"
                value={report.summary.totalRequests}
                icon={Briefcase}
                iconColor="text-hoterra-steel"
                iconBg="bg-slate-100"
              />
              <DashStatCard
                label="Cost"
                value={`$${report.summary.totalCost.toLocaleString()}`}
                icon={DollarSign}
                iconColor="text-emerald-600"
                iconBg="bg-emerald-50"
              />
              <DashStatCard
                label="Hours"
                value={report.summary.totalHours}
                icon={Clock}
                iconColor="text-blue-600"
                iconBg="bg-blue-50"
              />
              <DashStatCard
                label="Headcount"
                value={report.summary.totalHeadcount}
                icon={Users}
                iconColor="text-violet-600"
                iconBg="bg-violet-50"
              />
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <ReportTable
                title="By department"
                rows={report.byDepartment.map((r) => [r.name, r.requests, `$${r.cost}`, `${r.hours}h`])}
                headers={['Department', 'Req', 'Cost', 'Hours']}
              />
              <ReportTable
                title="By vendor"
                rows={report.byVendor.map((r) => [r.name, r.requests, `$${r.cost}`, ''])}
                headers={['Vendor', 'Req', 'Cost', '']}
              />
              <ReportTable
                title="By position"
                rows={report.byPosition.map((r) => [r.name, r.quantity, `$${r.cost}`, ''])}
                headers={['Position', 'Qty', 'Cost', '']}
              />
              <ReportTable
                title="Budget vs Actual"
                rows={report.budgetVsActual.map((r) => [
                  r.department,
                  `$${r.budget}`,
                  `$${r.actual}`,
                  `$${r.variance}`,
                ])}
                headers={['Department', 'Budget', 'Actual', 'Variance']}
              />
            </div>
          </div>
        )}
      </div>

      {showCreate && meta && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form
            onSubmit={handleCreate}
            className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
          >
            <h2 className="mb-1 text-lg font-bold text-hoterra-navy">New casual staff request</h2>
            <p className="mb-5 text-sm text-gray-500">Fill the request and submit for approval</p>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Hotel">
                <select
                  required
                  value={form.hotelName}
                  onChange={(e) => setForm((f) => ({ ...f, hotelName: e.target.value }))}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                >
                  {(meta.settings.hotels || [meta.settings.hotelName]).map((h) => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
              </Field>
              <Field label="Department">
                <select
                  required
                  value={form.departmentId}
                  onChange={(e) => setForm((f) => ({ ...f, departmentId: e.target.value }))}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                >
                  <option value="">Select…</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Position">
                <select
                  required
                  value={form.positionId}
                  onChange={(e) => setForm((f) => ({ ...f, positionId: e.target.value }))}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                >
                  <option value="">Select…</option>
                  {meta.positions.filter((p) => p.isActive).map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Date">
                <input
                  type="date"
                  required
                  value={form.workDate}
                  onChange={(e) => setForm((f) => ({ ...f, workDate: e.target.value }))}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                />
              </Field>
              <Field label="Shift">
                <select
                  value={form.shift}
                  onChange={(e) => setForm((f) => ({ ...f, shift: e.target.value as WorkforceShift }))}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                >
                  {SHIFTS.map((s) => (
                    <option key={s} value={s}>{WORKFORCE_SHIFT_LABELS[s]}</option>
                  ))}
                </select>
              </Field>
              <Field label="Start time">
                <input
                  type="time"
                  value={form.startTime}
                  onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                />
              </Field>
              <Field label="End time">
                <input
                  type="time"
                  value={form.endTime}
                  onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                />
              </Field>
              <Field label="Quantity">
                <input
                  type="number"
                  min={1}
                  required
                  value={form.quantity}
                  onChange={(e) => setForm((f) => ({ ...f, quantity: Number(e.target.value) }))}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                />
              </Field>
              <Field label="Vendor mode">
                <select
                  value={form.vendorMode}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, vendorMode: e.target.value as WorkforceVendorMode }))
                  }
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                >
                  <option value="DIRECT">Direct vendor</option>
                  <option value="BROADCAST">Broadcast (first to accept)</option>
                </select>
              </Field>
            </div>

            {form.vendorMode === 'DIRECT' ? (
              <Field label="Vendor" className="mt-3">
                <select
                  required
                  value={form.vendorId}
                  onChange={(e) => setForm((f) => ({ ...f, vendorId: e.target.value }))}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                >
                  <option value="">Select vendor…</option>
                  {meta.vendors.filter((v) => v.isActive && v.isApproved).map((v) => (
                    <option key={v.id} value={v.id}>{v.name}</option>
                  ))}
                </select>
              </Field>
            ) : (
              <Field label="Broadcast vendors" className="mt-3">
                <div className="space-y-1 rounded-lg border border-gray-200 p-3">
                  {meta.vendors.filter((v) => v.isActive && v.isApproved).map((v) => (
                    <label key={v.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={form.broadcastVendorIds.includes(v.id)}
                        onChange={(e) => {
                          setForm((f) => ({
                            ...f,
                            broadcastVendorIds: e.target.checked
                              ? [...f.broadcastVendorIds, v.id]
                              : f.broadcastVendorIds.filter((id) => id !== v.id),
                          }));
                        }}
                      />
                      {v.name}
                    </label>
                  ))}
                </div>
              </Field>
            )}

            <Field label="Comment" className="mt-3">
              <textarea
                value={form.comment}
                onChange={(e) => setForm((f) => ({ ...f, comment: e.target.value }))}
                rows={3}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              />
            </Field>

            <label className="mt-3 flex items-center gap-2 text-sm text-gray-600">
              <input
                type="checkbox"
                checked={form.isUrgentOverride}
                onChange={(e) => setForm((f) => ({ ...f, isUrgentOverride: e.target.checked }))}
              />
              Urgent override (less than {meta.settings.minLeadHours}h lead time — requires extra GM approval)
            </label>

            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setShowCreate(false)} className="btn-secondary">
                Cancel
              </button>
              <button type="submit" disabled={creating} className="btn-primary disabled:opacity-50">
                {creating ? 'Submitting…' : 'Submit request'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={cn('block text-sm', className)}>
      <span className="mb-1 block text-xs font-medium text-gray-500">{label}</span>
      {children}
    </label>
  );
}

function ReportTable({
  title,
  headers,
  rows,
}: {
  title: string;
  headers: string[];
  rows: (string | number)[][];
}) {
  return (
    <div className="card overflow-hidden">
      <div className="border-b border-gray-100 px-4 py-3 text-sm font-semibold text-hoterra-navy">
        {title}
      </div>
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-left text-xs text-gray-500">
          <tr>
            {headers.map((h) => (
              <th key={h} className="px-4 py-2 font-medium">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={headers.length} className="px-4 py-6 text-center text-gray-400">
                No data
              </td>
            </tr>
          ) : (
            rows.map((row, i) => (
              <tr key={i} className="border-t border-gray-50">
                {row.map((cell, j) => (
                  <td key={j} className="px-4 py-2">{cell}</td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
