import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { Department, Role, VendorInvoice, WorkforceApprovalStep, WorkforceMeta } from '@/types';
import { ROLE_LABELS } from '@/types';
import { formatDate } from '@/lib/utils';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function RoutesEditorPanel({
  meta,
  departments,
  onSaved,
}: {
  meta: WorkforceMeta;
  departments: Department[];
  onSaved: () => void;
}) {
  const [deptId, setDeptId] = useState(departments[0]?.id || '');
  const existing = meta.routes.find((r) => r.departmentId === deptId);
  const [name, setName] = useState(existing?.name || '');
  const [steps, setSteps] = useState<WorkforceApprovalStep[]>(
    existing?.steps || [
      { role: 'HOD', label: 'Head of Department' },
      { role: 'FINANCE_DIRECTOR', label: 'Financial Controller' },
      { role: 'GENERAL_MANAGER', label: 'GM / COO' },
    ]
  );
  const [budgetAmount, setBudgetAmount] = useState('5000');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const route = meta.routes.find((r) => r.departmentId === deptId);
    setName(route?.name || `${departments.find((d) => d.id === deptId)?.name || ''} Casual Route`);
    setSteps(
      route?.steps || [
        { role: 'HOD', label: 'Head of Department' },
        { role: 'FINANCE_DIRECTOR', label: 'Financial Controller' },
        { role: 'GENERAL_MANAGER', label: 'GM / COO' },
      ]
    );
    const now = new Date();
    const budget = meta.budgets.find(
      (b) => b.departmentId === deptId && b.year === now.getFullYear() && b.month === now.getMonth() + 1
    );
    setBudgetAmount(String(budget?.budgetAmount ?? 5000));
  }, [deptId, meta, departments]);

  const roles = meta.approvalRoles || [
    'HOD',
    'FINANCE_DIRECTOR',
    'GENERAL_MANAGER',
    'SUPERVISOR',
    'SYSTEM_ADMINISTRATOR',
  ];

  const saveRoute = async () => {
    if (!deptId || steps.length === 0) return;
    setSaving(true);
    try {
      await api.upsertWorkforceRoute(deptId, { name, steps });
      const now = new Date();
      await api.upsertWorkforceBudget({
        departmentId: deptId,
        year: now.getFullYear(),
        month: now.getMonth() + 1,
        budgetAmount: Number(budgetAmount) || 0,
      });
      onSaved();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        Configure per-department approvers (e.g. Housekeeping → Executive Housekeeper → FC → GM/COO).
      </p>
      <div className="card space-y-4 p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <span className="mb-1 block text-xs text-gray-500">Department</span>
            <select
              value={deptId}
              onChange={(e) => setDeptId(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            >
              {departments.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs text-gray-500">Route name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            />
          </label>
        </div>

        <div className="space-y-2">
          {steps.map((step, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <span className="w-6 text-xs text-gray-400">{i + 1}.</span>
              <input
                value={step.label}
                onChange={(e) => {
                  const next = [...steps];
                  next[i] = { ...step, label: e.target.value };
                  setSteps(next);
                }}
                className="min-w-[160px] flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm"
                placeholder="Label"
              />
              <select
                value={step.role}
                onChange={(e) => {
                  const next = [...steps];
                  next[i] = { ...step, role: e.target.value as Role };
                  setSteps(next);
                }}
                className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
              >
                {roles.map((r) => (
                  <option key={r} value={r}>{ROLE_LABELS[r as Role] || r}</option>
                ))}
              </select>
              <button
                type="button"
                className="text-xs text-red-600"
                onClick={() => setSteps(steps.filter((_, idx) => idx !== i))}
              >
                Remove
              </button>
            </div>
          ))}
          <button
            type="button"
            className="btn-secondary"
            onClick={() =>
              setSteps([...steps, { role: 'GENERAL_MANAGER', label: 'GM / COO' }])
            }
          >
            Add step
          </button>
        </div>

        <label className="block text-sm">
          <span className="mb-1 block text-xs text-gray-500">
            This month casual budget ($)
          </span>
          <input
            type="number"
            value={budgetAmount}
            onChange={(e) => setBudgetAmount(e.target.value)}
            className="w-full max-w-xs rounded-lg border border-gray-200 px-3 py-2 text-sm"
          />
        </label>

        <button onClick={saveRoute} disabled={saving} className="btn-primary disabled:opacity-50">
          {saving ? 'Saving…' : 'Save route & budget'}
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {meta.routes.map((route) => (
          <div key={route.id} className="card p-4">
            <div className="font-medium text-hoterra-navy">{route.name}</div>
            <div className="mb-2 text-xs text-gray-500">{route.department.name}</div>
            <ol className="flex flex-wrap gap-1">
              {route.steps.map((s, i) => (
                <li key={i} className="rounded-full bg-gray-50 px-2 py-0.5 text-[11px] text-gray-600">
                  {s.label}
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SettingsPanel({ meta, onSaved }: { meta: WorkforceMeta; onSaved: () => void }) {
  const [hotels, setHotels] = useState((meta.settings.hotels || [meta.settings.hotelName]).join(', '));
  const [minLeadHours, setMinLeadHours] = useState(String(meta.settings.minLeadHours));
  const [rate, setRate] = useState(String(meta.settings.estimatedHourlyRate));
  const [hours, setHours] = useState(String(meta.settings.estimatedHoursPerShift));
  const [tolerance, setTolerance] = useState(String(meta.settings.payrollTolerancePct ?? 5));
  const [notifyEmail, setNotifyEmail] = useState(meta.settings.notifyEmail !== false);
  const [notifyPush, setNotifyPush] = useState(meta.settings.notifyPush !== false);
  const [outbox, setOutbox] = useState<
    { id: string; toEmail: string; subject: string; createdAt: string; status: string }[]
  >([]);

  useEffect(() => {
    api.getWorkforceOutbox().then(setOutbox).catch(() => setOutbox([]));
  }, []);

  const save = async () => {
    try {
      await api.updateWorkforceSettings({
        hotels: hotels.split(',').map((h) => h.trim()).filter(Boolean),
        minLeadHours: Number(minLeadHours),
        estimatedHourlyRate: Number(rate),
        estimatedHoursPerShift: Number(hours),
        payrollTolerancePct: Number(tolerance),
        notifyEmail,
        notifyPush,
      });
      onSaved();
      alert('Settings saved');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed');
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="card space-y-3 p-5">
        <h3 className="text-sm font-semibold text-hoterra-navy">Workforce settings</h3>
        <label className="block text-sm">
          <span className="mb-1 block text-xs text-gray-500">Hotels (comma-separated)</span>
          <input value={hotels} onChange={(e) => setHotels(e.target.value)} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm">
            <span className="mb-1 block text-xs text-gray-500">Min lead hours</span>
            <input type="number" value={minLeadHours} onChange={(e) => setMinLeadHours(e.target.value)} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs text-gray-500">Payroll tolerance %</span>
            <input type="number" value={tolerance} onChange={(e) => setTolerance(e.target.value)} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs text-gray-500">Hourly rate est.</span>
            <input type="number" value={rate} onChange={(e) => setRate(e.target.value)} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs text-gray-500">Hours / shift est.</span>
            <input type="number" value={hours} onChange={(e) => setHours(e.target.value)} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
          </label>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={notifyEmail} onChange={(e) => setNotifyEmail(e.target.checked)} />
          Email notifications to approvers
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={notifyPush} onChange={(e) => setNotifyPush(e.target.checked)} />
          In-app push notifications
        </label>
        <button onClick={save} className="btn-primary">Save settings</button>
      </div>

      <div className="card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-hoterra-navy">Email outbox</h3>
          <button
            className="text-xs text-hoterra-steel hover:underline"
            onClick={() => api.getWorkforceOutbox().then(setOutbox).catch(() => {})}
          >
            Refresh
          </button>
        </div>
        <ul className="max-h-80 space-y-2 overflow-y-auto text-xs">
          {outbox.map((m) => (
            <li key={m.id} className="rounded-lg border border-gray-100 px-3 py-2">
              <div className="font-medium text-hoterra-navy">{m.subject}</div>
              <div className="text-gray-500">{m.toEmail} · {formatDate(m.createdAt)} · {m.status}</div>
            </li>
          ))}
          {outbox.length === 0 && <li className="text-gray-400">No emails yet</li>}
        </ul>
      </div>
    </div>
  );
}

export function PayrollPanel({
  completedRequestIds,
}: {
  completedRequestIds: { id: string; code: string }[];
}) {
  const [invoices, setInvoices] = useState<VendorInvoice[]>([]);
  const [form, setForm] = useState({
    requestId: '',
    invoiceNumber: '',
    invoiceHours: '',
    invoiceAmount: '',
  });

  const load = () => api.getWorkforcePayroll().then(setInvoices).catch(console.error);
  useEffect(() => {
    load();
  }, []);

  const submit = async () => {
    try {
      await api.createWorkforceInvoice({
        requestId: form.requestId,
        invoiceNumber: form.invoiceNumber,
        invoiceHours: Number(form.invoiceHours),
        invoiceAmount: Number(form.invoiceAmount),
      });
      setForm({ requestId: '', invoiceNumber: '', invoiceHours: '', invoiceAmount: '' });
      load();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed');
    }
  };

  return (
    <div className="space-y-4">
      <div className="card space-y-3 p-5">
        <h3 className="text-sm font-semibold text-hoterra-navy">Register vendor invoice</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <select
            value={form.requestId}
            onChange={(e) => setForm((f) => ({ ...f, requestId: e.target.value }))}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
          >
            <option value="">Completed request…</option>
            {completedRequestIds.map((r) => (
              <option key={r.id} value={r.id}>{r.code}</option>
            ))}
          </select>
          <input
            placeholder="Invoice #"
            value={form.invoiceNumber}
            onChange={(e) => setForm((f) => ({ ...f, invoiceNumber: e.target.value }))}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
          />
          <input
            type="number"
            placeholder="Hours"
            value={form.invoiceHours}
            onChange={(e) => setForm((f) => ({ ...f, invoiceHours: e.target.value }))}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
          />
          <input
            type="number"
            placeholder="Amount $"
            value={form.invoiceAmount}
            onChange={(e) => setForm((f) => ({ ...f, invoiceAmount: e.target.value }))}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
          />
        </div>
        <button onClick={submit} className="btn-primary">Add invoice</button>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs text-gray-500">
            <tr>
              <th className="px-4 py-2">Invoice</th>
              <th className="px-4 py-2">Vendor</th>
              <th className="px-4 py-2">Hours</th>
              <th className="px-4 py-2">Amount</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => (
              <tr key={inv.id} className="border-t border-gray-50">
                <td className="px-4 py-2 font-medium">{inv.invoiceNumber}</td>
                <td className="px-4 py-2">{inv.vendor?.name}</td>
                <td className="px-4 py-2">{inv.invoiceHours}</td>
                <td className="px-4 py-2">${inv.invoiceAmount}</td>
                <td className="px-4 py-2">{inv.status}</td>
                <td className="px-4 py-2 text-right">
                  {inv.status === 'PENDING' || inv.status === 'MISMATCH' ? (
                    <button
                      className="text-xs text-hoterra-steel hover:underline"
                      onClick={() =>
                        api.matchWorkforceInvoice(inv.id).then(load).catch((e) => alert(e.message))
                      }
                    >
                      Match vs actuals
                    </button>
                  ) : null}
                  {inv.status === 'MATCHED' && (
                    <button
                      className="ml-2 text-xs text-green-700 hover:underline"
                      onClick={() =>
                        api.markWorkforceInvoicePaid(inv.id).then(load).catch((e) => alert(e.message))
                      }
                    >
                      Mark paid
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {invoices.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                  No invoices yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function TemplatesPanel({
  meta,
  onUse,
  onSaved,
}: {
  meta: WorkforceMeta;
  onUse: (id: string) => void;
  onSaved: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          className="btn-secondary"
          onClick={() =>
            api
              .runWorkforceRecurring()
              .then((r) => {
                alert(r.created.length ? `Created: ${r.created.join(', ')}` : 'No templates due today');
                onSaved();
              })
              .catch((e) => alert(e.message))
          }
        >
          Run recurring now
        </button>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {meta.templates.map((t) => (
          <div key={t.id} className="card p-5">
            <div className="mb-2 flex items-start justify-between gap-2">
              <div className="font-semibold text-hoterra-navy">{t.name}</div>
              {t.isRecurring && (
                <span className="rounded-full bg-green-50 px-2 py-0.5 text-[10px] text-green-700">
                  Recurring
                </span>
              )}
            </div>
            <div className="mb-3 space-y-1 text-xs text-gray-500">
              <div>{t.department?.name || 'Any dept'} · {t.position?.name || 'Any position'}</div>
              <div>
                {t.quantity} staff
                {t.dayOfWeek != null ? ` · ${WEEKDAYS[t.dayOfWeek]}` : ''}
                {t.hotelName ? ` · ${t.hotelName}` : ''}
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => onUse(t.id)} className="btn-secondary flex-1 justify-center">
                Use
              </button>
              <button
                className="btn-secondary"
                onClick={() =>
                  api
                    .updateWorkforceTemplate(t.id, { isRecurring: !t.isRecurring })
                    .then(onSaved)
                    .catch((e) => alert(e.message))
                }
              >
                {t.isRecurring ? 'Stop auto' : 'Make auto'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
