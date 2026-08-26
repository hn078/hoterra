import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { Department, Role, VendorInvoice, WorkforceApprovalStep, WorkforceMeta } from '@/types';
import { ROLE_LABELS } from '@/types';
import { formatDate } from '@/lib/utils';
import { useAppDialog } from '@/components/ui/AppDialogProvider';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function RoutesEditorPanel({
  meta,
  departments,
  canManageRoutes,
  canManageBudget,
  onSaved,
}: {
  meta: WorkforceMeta;
  departments: Department[];
  canManageRoutes: boolean;
  canManageBudget: boolean;
  onSaved: () => void;
}) {
  const dialog = useAppDialog();
  const humanResourcesDepartment = departments.find((department) => department.code === 'HR' || department.name === 'Human Resources');
  const defaultSteps = (): WorkforceApprovalStep[] => [
    { role: 'HOD', label: 'Requesting department — Head of Department' },
    { role: 'HOD', label: 'Human Resources — Head of Department', ...(humanResourcesDepartment ? { approverDepartmentId: humanResourcesDepartment.id } : {}) },
    { role: 'FINANCE_DIRECTOR', label: 'Finance Director' },
    { role: 'GENERAL_MANAGER', label: 'General Manager' },
  ];
  const [deptId, setDeptId] = useState(departments[0]?.id || '');
  const existing = meta.routes.find((r) => r.departmentId === deptId);
  const [name, setName] = useState(existing?.name || '');
  const [steps, setSteps] = useState<WorkforceApprovalStep[]>(
    existing?.steps || defaultSteps()
  );
  const [budgetAmount, setBudgetAmount] = useState('5000');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const route = meta.routes.find((r) => r.departmentId === deptId);
    setName(route?.name || `${departments.find((d) => d.id === deptId)?.name || ''} Casual Route`);
    setSteps(
      route?.steps || defaultSteps()
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
  const approversForRole = (role: Role) => meta.approvers.filter((approver) => approver.role === role);
  const updateStep = (index: number, next: WorkforceApprovalStep) => setSteps((current) => current.map((step, stepIndex) => stepIndex === index ? next : step));
  const setStepRole = (index: number, role: Role) => {
    const nextLabel = role === 'HOD' ? 'Head of Department' : ROLE_LABELS[role] || role;
    updateStep(index, { role, label: nextLabel });
  };
  const setStepApprover = (index: number, value: string) => {
    const step = steps[index];
    if (value.startsWith('department:')) {
      const departmentId = value.slice('department:'.length);
      const department = departments.find((item) => item.id === departmentId);
      updateStep(index, { ...step, approverUserId: undefined, approverDepartmentId: departmentId, label: `${department?.name || 'Department'} — Head of Department` });
      return;
    }
    if (!value) {
      updateStep(index, { ...step, approverUserId: undefined, approverDepartmentId: undefined, label: step.role === 'HOD' ? 'Requesting department — Head of Department' : ROLE_LABELS[step.role] || step.role });
      return;
    }
    const approver = meta.approvers.find((item) => item.id === value);
    if (approver) updateStep(index, { ...step, approverUserId: approver.id, approverDepartmentId: undefined, label: `${approver.firstName} ${approver.lastName} — ${ROLE_LABELS[approver.role] || approver.role}` });
  };

  const saveRoute = async () => {
    if (!deptId || steps.length === 0) return;
    setSaving(true);
    try {
      if (canManageRoutes) await api.upsertWorkforceRoute(deptId, { name, steps });
      const now = new Date();
      if (canManageBudget) {
        await api.upsertWorkforceBudget({
          departmentId: deptId,
          year: now.getFullYear(),
          month: now.getMonth() + 1,
          budgetAmount: Number(budgetAmount) || 0,
        });
      }
      onSaved();
    } catch (err) {
      await dialog.alert(err instanceof Error ? err.message : 'Save failed', { title: 'Route not saved' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">{canManageRoutes ? 'Choose approvers from the active-user list. Every route includes Human Resources Head of Department before Finance Director.' : 'Set the monthly casual workforce budget for each department.'}</p>
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
          {canManageRoutes && <label className="text-sm">
            <span className="mb-1 block text-xs text-gray-500">Route name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            />
          </label>}
        </div>

        {canManageRoutes && <div className="space-y-2">
          {steps.map((step, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <span className="w-6 text-xs text-gray-400">{i + 1}.</span>
              <select
                value={step.role}
                onChange={(e) => setStepRole(i, e.target.value as Role)}
                className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
              >
                {roles.map((r) => (
                  <option key={r} value={r}>{ROLE_LABELS[r as Role] || r}</option>
                ))}
              </select>
              <select
                value={step.approverUserId || (step.approverDepartmentId ? `department:${step.approverDepartmentId}` : '')}
                onChange={(e) => setStepApprover(i, e.target.value)}
                className="min-w-[240px] flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm"
              >
                <option value="">{step.role === 'HOD' ? 'Requesting department Head of Department' : `Any active ${ROLE_LABELS[step.role] || step.role}`}</option>
                {step.role === 'HOD' && departments.map((department) => <option key={department.id} value={`department:${department.id}`}>{department.name} — Head of Department</option>)}
                {approversForRole(step.role).map((approver) => <option key={approver.id} value={approver.id}>{approver.firstName} {approver.lastName} · {approver.department?.name || ROLE_LABELS[approver.role]}</option>)}
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
              setSteps([...steps, { role: 'GENERAL_MANAGER', label: 'General Manager' }])
            }
          >
            Add step
          </button>
        </div>}

        {canManageBudget && <label className="block text-sm">
          <span className="mb-1 block text-xs text-gray-500">
            This month casual budget (AZN)
          </span>
          <input
            type="number"
            value={budgetAmount}
            onChange={(e) => setBudgetAmount(e.target.value)}
            className="w-full max-w-xs rounded-lg border border-gray-200 px-3 py-2 text-sm"
          />
        </label>}

        <button onClick={saveRoute} disabled={saving} className="btn-primary disabled:opacity-50">
          {saving ? 'Saving…' : canManageRoutes && canManageBudget ? 'Save route & budget' : canManageRoutes ? 'Save route' : 'Save budget'}
        </button>
      </div>

      {canManageRoutes && <div className="grid gap-3 md:grid-cols-2">
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
      </div>}
    </div>
  );
}

export function SettingsPanel({
  meta,
  canViewOutbox,
  onSaved,
}: {
  meta: WorkforceMeta;
  canViewOutbox: boolean;
  onSaved: () => void;
}) {
  const dialog = useAppDialog();
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
    if (canViewOutbox) api.getWorkforceOutbox().then(setOutbox).catch(() => setOutbox([]));
  }, [canViewOutbox]);

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
      await dialog.alert('Workforce settings saved', { title: 'Saved' });
    } catch (err) {
      await dialog.alert(err instanceof Error ? err.message : 'Failed', { title: 'Settings not saved' });
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

      {canViewOutbox && <div className="card p-5">
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
      </div>}
    </div>
  );
}

export function PayrollPanel({
  completedRequestIds,
}: {
  completedRequestIds: { id: string; code: string; vendors: { id: string; name: string }[] }[];
}) {
  const dialog = useAppDialog();
  const [invoices, setInvoices] = useState<VendorInvoice[]>([]);
  const [form, setForm] = useState({
    requestId: '',
    vendorId: '',
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
        vendorId: form.vendorId,
        invoiceNumber: form.invoiceNumber,
        invoiceHours: Number(form.invoiceHours),
        invoiceAmount: Number(form.invoiceAmount),
      });
      setForm({ requestId: '', vendorId: '', invoiceNumber: '', invoiceHours: '', invoiceAmount: '' });
      load();
    } catch (err) {
      await dialog.alert(err instanceof Error ? err.message : 'Failed', { title: 'Invoice not registered' });
    }
  };

  const matchInvoice = async (invoice: VendorInvoice) => {
    try {
      await api.matchWorkforceInvoice(invoice.id);
      load();
    } catch (error) {
      await dialog.alert(error instanceof Error ? error.message : 'Invoice could not be matched', { title: 'Matching failed' });
    }
  };

  const markInvoicePaid = async (invoice: VendorInvoice) => {
    if (!await dialog.confirm(`Mark invoice “${invoice.invoiceNumber}” as paid?`, {
      title: 'Confirm payment',
      confirmLabel: 'Mark paid',
    })) return;
    try {
      await api.markWorkforceInvoicePaid(invoice.id);
      load();
    } catch (error) {
      await dialog.alert(error instanceof Error ? error.message : 'Invoice could not be marked paid', { title: 'Payment update failed' });
    }
  };

  return (
    <div className="space-y-4">
      <div className="card space-y-3 p-5">
        <h3 className="text-sm font-semibold text-hoterra-navy">Register vendor invoice</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <select
            value={form.requestId}
            onChange={(e) => {
              const requestId = e.target.value;
              const vendors = completedRequestIds.find((request) => request.id === requestId)?.vendors || [];
              setForm((f) => ({ ...f, requestId, vendorId: vendors.length === 1 ? vendors[0].id : '' }));
            }}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
          >
            <option value="">Completed request…</option>
            {completedRequestIds.map((r) => (
              <option key={r.id} value={r.id}>{r.code}</option>
            ))}
          </select>
          <select
            value={form.vendorId}
            onChange={(e) => setForm((f) => ({ ...f, vendorId: e.target.value }))}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
          >
            <option value="">Vendor…</option>
            {(completedRequestIds.find((request) => request.id === form.requestId)?.vendors || []).map((vendor) => (
              <option key={vendor.id} value={vendor.id}>{vendor.name}</option>
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
            placeholder="Amount AZN"
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
                <td className="px-4 py-2">{inv.invoiceAmount.toFixed(2)} AZN</td>
                <td className="px-4 py-2">{inv.status}</td>
                <td className="px-4 py-2 text-right">
                  {inv.status === 'PENDING' || inv.status === 'MISMATCH' ? (
                    <button
                      className="text-xs text-hoterra-steel hover:underline"
                      onClick={() => void matchInvoice(inv)}
                    >
                      Match vs actuals
                    </button>
                  ) : null}
                  {inv.status === 'MATCHED' && (
                    <button
                      className="ml-2 text-xs text-green-700 hover:underline"
                      onClick={() => void markInvoicePaid(inv)}
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
  canManageRecurring,
  onUse,
  onSaved,
}: {
  meta: WorkforceMeta;
  canManageRecurring: boolean;
  onUse: (id: string) => void;
  onSaved: () => void;
}) {
  const dialog = useAppDialog();

  const runRecurring = async () => {
    if (!await dialog.confirm('Generate every workforce request template that is due today?', {
      title: 'Run recurring requests',
      confirmLabel: 'Run now',
    })) return;
    try {
      const result = await api.runWorkforceRecurring();
      await dialog.alert(result.created.length ? `Created: ${result.created.join(', ')}` : 'No templates are due today', {
        title: result.created.length ? 'Requests created' : 'Nothing to generate',
      });
      onSaved();
    } catch (error) {
      await dialog.alert(error instanceof Error ? error.message : 'Recurring requests could not be generated', { title: 'Automation failed' });
    }
  };

  const toggleRecurring = async (template: WorkforceMeta['templates'][number]) => {
    const action = template.isRecurring ? 'stop automatic generation for' : 'enable automatic generation for';
    if (!await dialog.confirm(`Do you want to ${action} “${template.name}”?`, {
      title: template.isRecurring ? 'Stop recurring template' : 'Enable recurring template',
      confirmLabel: template.isRecurring ? 'Stop auto' : 'Enable auto',
    })) return;
    try {
      await api.updateWorkforceTemplate(template.id, { isRecurring: !template.isRecurring });
      onSaved();
    } catch (error) {
      await dialog.alert(error instanceof Error ? error.message : 'Template could not be updated', { title: 'Update failed' });
    }
  };

  return (
    <div className="space-y-4">
      {canManageRecurring && <div className="flex justify-end">
        <button
          className="btn-secondary"
          onClick={() => void runRecurring()}
        >
          Run recurring now
        </button>
      </div>}
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
              {canManageRecurring && <button
                className="btn-secondary"
                onClick={() => void toggleRecurring(t)}
              >
                {t.isRecurring ? 'Stop auto' : 'Make auto'}
              </button>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
