import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Check, X } from 'lucide-react';
import { Header, DepartmentBadge } from '@/components/layout/Sidebar';
import { Breadcrumbs } from '@/components/ui/Breadcrumbs';
import { api } from '@/lib/api';
import { cn, formatDate } from '@/lib/utils';
import type { WorkforceRequest } from '@/types';
import {
  ROLE_LABELS,
  WORKFORCE_SHIFT_LABELS,
  WORKFORCE_STATUS_COLORS,
  WORKFORCE_STATUS_LABELS,
} from '@/types';
import { useAuthStore } from '@/store/auth';

export function WorkforceRequestPage() {
  const { id } = useParams<{ id: string }>();
  const user = useAuthStore((s) => s.user);
  const [request, setRequest] = useState<WorkforceRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [actuals, setActuals] = useState({ actualQuantity: 0, actualHours: 0, actualCost: 0 });
  const [rejectReason, setRejectReason] = useState('');

  const load = () => {
    if (!id) return;
    setLoading(true);
    api
      .getWorkforceRequest(id)
      .then((r) => {
        setRequest(r);
        setActuals({
          actualQuantity: r.actualQuantity ?? r.quantity,
          actualHours: r.actualHours ?? 0,
          actualCost: r.actualCost ?? r.estimatedCost ?? 0,
        });
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [id]);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      load();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setBusy(false);
    }
  };

  if (loading || !request) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-gray-400">
        {loading ? 'Loading…' : 'Request not found'}
      </div>
    );
  }

  const currentStep = request.approvalSteps[request.currentStepIndex];
  const canConfirmHod =
    request.actualQuantity != null &&
    !request.hodConfirmedAt &&
    user &&
    ['HOD', 'GENERAL_MANAGER', 'SYSTEM_ADMINISTRATOR'].includes(user.role);
  const canConfirmFinance =
    !!request.hodConfirmedAt &&
    !request.financeConfirmedAt &&
    user &&
    ['FINANCE_DIRECTOR', 'GENERAL_MANAGER', 'SYSTEM_ADMINISTRATOR'].includes(user.role);

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-hoterra-page">
      <Header
        title={request.code}
        subtitle="Casual workforce request detail"
        action={
          <Link to="/workforce" className="btn-secondary">
            <ArrowLeft className="h-4 w-4" />
            Back
          </Link>
        }
      />

      <div className="border-b border-gray-200 bg-white px-6 pb-4 pt-2">
        <Breadcrumbs
          items={[
            { label: 'Casual Workforce', to: '/workforce' },
            { label: request.code },
          ]}
        />
      </div>

      <div className="page-content">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  'inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium',
                  WORKFORCE_STATUS_COLORS[request.status]
                )}
              >
                {WORKFORCE_STATUS_LABELS[request.status]}
              </span>
              <DepartmentBadge
                name={request.department.name}
                color={request.department.color}
              />
              {request.needsExtraApproval && (
                <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs text-amber-800">
                  Extra approval
                </span>
              )}
              {request.isUrgentOverride && (
                <span className="rounded-full bg-red-50 px-2.5 py-0.5 text-xs text-red-700">
                  Urgent
                </span>
              )}
            </div>
            <h2 className="text-xl font-bold text-hoterra-navy">{request.position.name}</h2>
            <p className="text-sm text-gray-500">
              {request.hotelName} · {formatDate(request.workDate)} ·{' '}
              {WORKFORCE_SHIFT_LABELS[request.shift]}
              {request.startTime && request.endTime
                ? ` (${request.startTime}–${request.endTime})`
                : ''}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {request.canApprove && (
              <>
                <button
                  disabled={busy}
                  onClick={() => run(() => api.approveWorkforceRequest(request.id))}
                  className="btn-primary disabled:opacity-50"
                >
                  <Check className="h-4 w-4" />
                  Approve
                </button>
                <button
                  disabled={busy}
                  onClick={() => {
                    const reason = rejectReason || prompt('Rejection reason') || undefined;
                    run(() => api.rejectWorkforceRequest(request.id, reason));
                  }}
                  className="btn-secondary text-red-600 disabled:opacity-50"
                >
                  <X className="h-4 w-4" />
                  Reject
                </button>
              </>
            )}
            {request.status === 'SENT_TO_VENDOR' && (
              <>
                <button
                  disabled={busy}
                  onClick={() => run(() => api.resendWorkforceVendor(request.id))}
                  className="btn-secondary disabled:opacity-50"
                >
                  Resend vendor email
                </button>
                <button
                  disabled={busy}
                  onClick={() =>
                    run(() =>
                      api.vendorAcceptWorkforceRequest(
                        request.id,
                        request.vendorMode === 'BROADCAST'
                          ? request.broadcastVendorIds[0]
                          : undefined
                      )
                    )
                  }
                  className="btn-primary disabled:opacity-50"
                >
                  Simulate Accept
                </button>
              </>
            )}
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            <div className="card p-5">
              <h3 className="mb-4 text-sm font-semibold text-hoterra-navy">Request details</h3>
              <dl className="grid grid-cols-2 gap-4 text-sm">
                <Item label="Quantity" value={String(request.quantity)} />
                <Item
                  label="Estimated cost"
                  value={request.estimatedCost != null ? `$${request.estimatedCost}` : '—'}
                />
                <Item
                  label="Vendor"
                  value={
                    request.acceptedVendor?.name ||
                    request.vendor?.name ||
                    (request.vendorMode === 'BROADCAST'
                      ? `Broadcast (${request.broadcastVendorIds.length})`
                      : '—')
                  }
                />
                <Item label="Mode" value={request.vendorMode} />
                <Item
                  label="Created by"
                  value={`${request.createdBy.firstName} ${request.createdBy.lastName}`}
                />
                <Item label="Created" value={formatDate(request.createdAt)} />
              </dl>
              {request.comment && (
                <p className="mt-4 rounded-lg bg-gray-50 p-3 text-sm text-gray-600">
                  {request.comment}
                </p>
              )}
            </div>

            {request.invites && request.invites.length > 0 && (
              <div className="card p-5">
                <h3 className="mb-3 text-sm font-semibold text-hoterra-navy">Vendor portal links</h3>
                <ul className="space-y-2 text-sm">
                  {request.invites.map((inv) => (
                    <li key={inv.id} className="rounded-lg border border-gray-100 px-3 py-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <div className="font-medium">{inv.vendor.name}</div>
                          <div className="text-xs text-gray-500">{inv.status}</div>
                        </div>
                        <a
                          href={inv.portalPath}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs font-medium text-hoterra-steel hover:underline"
                        >
                          Open portal
                        </a>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {(request.status === 'VENDOR_ACCEPTED' || request.status === 'COMPLETED') && (
              <div className="card p-5">
                <h3 className="mb-4 text-sm font-semibold text-hoterra-navy">
                  Service completion
                </h3>
                {request.status === 'VENDOR_ACCEPTED' && request.actualQuantity == null && (
                  <div className="mb-4 grid gap-3 sm:grid-cols-3">
                    <label className="text-sm">
                      <span className="mb-1 block text-xs text-gray-500">Actual staff</span>
                      <input
                        type="number"
                        min={0}
                        value={actuals.actualQuantity}
                        onChange={(e) =>
                          setActuals((a) => ({ ...a, actualQuantity: Number(e.target.value) }))
                        }
                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                      />
                    </label>
                    <label className="text-sm">
                      <span className="mb-1 block text-xs text-gray-500">Actual hours</span>
                      <input
                        type="number"
                        min={0}
                        step="0.5"
                        value={actuals.actualHours}
                        onChange={(e) =>
                          setActuals((a) => ({ ...a, actualHours: Number(e.target.value) }))
                        }
                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                      />
                    </label>
                    <label className="text-sm">
                      <span className="mb-1 block text-xs text-gray-500">Actual cost</span>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={actuals.actualCost}
                        onChange={(e) =>
                          setActuals((a) => ({ ...a, actualCost: Number(e.target.value) }))
                        }
                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                      />
                    </label>
                  </div>
                )}
                {request.actualQuantity != null && (
                  <dl className="mb-4 grid grid-cols-3 gap-4 text-sm">
                    <Item label="Actual staff" value={String(request.actualQuantity)} />
                    <Item label="Actual hours" value={String(request.actualHours)} />
                    <Item label="Actual cost" value={`$${request.actualCost}`} />
                  </dl>
                )}
                <div className="flex flex-wrap gap-2">
                  {request.status === 'VENDOR_ACCEPTED' && request.actualQuantity == null && (
                    <button
                      disabled={busy}
                      onClick={() => run(() => api.submitWorkforceCompletion(request.id, actuals))}
                      className="btn-primary disabled:opacity-50"
                    >
                      Submit actuals
                    </button>
                  )}
                  {canConfirmHod && (
                    <button
                      disabled={busy}
                      onClick={() => run(() => api.confirmWorkforceHod(request.id))}
                      className="btn-primary disabled:opacity-50"
                    >
                      HOD confirm
                    </button>
                  )}
                  {canConfirmFinance && (
                    <button
                      disabled={busy}
                      onClick={() => run(() => api.confirmWorkforceFinance(request.id))}
                      className="btn-primary disabled:opacity-50"
                    >
                      Finance confirm → Complete
                    </button>
                  )}
                </div>
                <div className="mt-3 flex gap-4 text-xs text-gray-500">
                  <span>HOD: {request.hodConfirmedAt ? formatDate(request.hodConfirmedAt) : '—'}</span>
                  <span>
                    Finance: {request.financeConfirmedAt ? formatDate(request.financeConfirmedAt) : '—'}
                  </span>
                </div>
              </div>
            )}

            <div className="card p-5">
              <h3 className="mb-4 text-sm font-semibold text-hoterra-navy">Activity history</h3>
              <ul className="space-y-3">
                {request.events.map((e) => (
                  <li key={e.id} className="border-l-2 border-hoterra-gold/40 pl-3 text-sm">
                    <div className="font-medium text-hoterra-navy">{e.action}</div>
                    <div className="text-xs text-gray-500">
                      {e.userName || 'System'} · {formatDate(e.createdAt)}
                    </div>
                    {e.details && <div className="mt-0.5 text-gray-600">{e.details}</div>}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="space-y-4">
            <div className="card p-5">
              <h3 className="mb-4 text-sm font-semibold text-hoterra-navy">Approval route</h3>
              <ol className="space-y-3">
                {request.approvalSteps.map((step, i) => {
                  const done = i < request.currentStepIndex ||
                    ['SENT_TO_VENDOR', 'VENDOR_ACCEPTED', 'COMPLETED', 'APPROVED'].includes(
                      request.status
                    );
                  const current =
                    i === request.currentStepIndex &&
                    ['PENDING', 'AWAITING_EXTRA_APPROVAL'].includes(request.status);
                  return (
                    <li
                      key={`${step.label}-${i}`}
                      className={cn(
                        'rounded-lg border px-3 py-2 text-sm',
                        done && 'border-green-200 bg-green-50',
                        current && 'border-hoterra-gold bg-amber-50',
                        !done && !current && 'border-gray-100 bg-gray-50'
                      )}
                    >
                      <div className="font-medium">{step.label}</div>
                      <div className="text-xs text-gray-500">
                        {ROLE_LABELS[step.role]}
                        {current ? ' · waiting' : done ? ' · done' : ''}
                      </div>
                    </li>
                  );
                })}
              </ol>
              {currentStep &&
                ['PENDING', 'AWAITING_EXTRA_APPROVAL'].includes(request.status) && (
                  <p className="mt-3 text-xs text-gray-500">
                    Current: {currentStep.label}
                  </p>
                )}
            </div>

            {request.canApprove && (
              <div className="card p-5">
                <label className="text-sm">
                  <span className="mb-1 block text-xs text-gray-500">Reject reason (optional)</span>
                  <input
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                    placeholder="Reason…"
                  />
                </label>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className="font-medium text-hoterra-navy">{value}</dd>
    </div>
  );
}
