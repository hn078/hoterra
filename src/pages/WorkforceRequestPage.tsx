import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Check, Pencil, Plus, X } from 'lucide-react';
import { Header, DepartmentBadge } from '@/components/layout/Sidebar';
import { Breadcrumbs } from '@/components/ui/Breadcrumbs';
import { api } from '@/lib/api';
import { cn, formatDate } from '@/lib/utils';
import type { WorkforceMeta, WorkforceRateUnit, WorkforceRequest } from '@/types';
import {
  ROLE_LABELS,
  WORKFORCE_STATUS_COLORS,
  WORKFORCE_STATUS_LABELS,
} from '@/types';
import { useAuthStore } from '@/store/auth';

export function WorkforceRequestPage() {
  const { id } = useParams<{ id: string }>();
  const user = useAuthStore((s) => s.user);
  const [request, setRequest] = useState<WorkforceRequest | null>(null);
  const [meta, setMeta] = useState<WorkforceMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [actuals, setActuals] = useState({ actualQuantity: 0, actualHours: 0, actualCost: 0 });
  const [rejectReason, setRejectReason] = useState('');
  const [evaluation, setEvaluation] = useState({
    phase: 'ONGOING' as 'ONGOING' | 'FINAL',
    overallScore: 5,
    notes: '',
    replacementRecommended: false,
  });
  const [revision, setRevision] = useState({
    workDate: '',
    endDate: '',
    comment: '',
    revisionComment: '',
    items: [] as Array<{ positionId: string; rateUnit: WorkforceRateUnit; quantity: number; hours: number | null }>,
  });
  const [correctingItemId, setCorrectingItemId] = useState<string | null>(null);
  const [vendorCorrection, setVendorCorrection] = useState({ vendorRateId: '', comment: '' });
  const [reviewComment, setReviewComment] = useState('');
  const [financeAction, setFinanceAction] = useState<'cancel' | 'return' | null>(null);
  const [financeActionComment, setFinanceActionComment] = useState('');

  const load = () => {
    if (!id) return;
    setLoading(true);
    api
      .getWorkforceRequest(id)
      .then((r) => {
        setRequest(r);
        if (r.canCorrectVendors || r.status === 'RETURNED_FOR_REVISION') api.getWorkforceMeta().then(setMeta).catch(console.error);
        else setMeta(null);
        setActuals({
          actualQuantity: r.actualQuantity ?? r.quantity,
          actualHours: r.actualHours ?? 0,
          actualCost: r.actualCost ?? r.estimatedCost ?? 0,
        });
        setRevision({
          workDate: r.workDate.slice(0, 10),
          endDate: r.endDate.slice(0, 10),
          comment: r.comment || '',
          revisionComment: '',
          items: r.items.map((item) => ({
            positionId: item.positionId,
            rateUnit: item.rateUnit,
            quantity: item.quantity,
            hours: item.hours ?? (item.rateUnit === 'HOURLY' ? 1 : null),
          })),
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
  const isPrivileged = !!user && ['GENERAL_MANAGER', 'SYSTEM_ADMINISTRATOR'].includes(user.role);
  const isDepartmentHod = !!user && user.role === 'HOD' && user.department?.id === request.departmentId;
  const isProcurementHead = !!user && user.role === 'HOD' && user.department?.code === 'PR';
  const canProcurementConfirm = Boolean(request.canConfirmProcurement);
  const canEvaluate = !!request.vendorId && (isDepartmentHod || isPrivileged);
  const canReplaceVendor = !!request.vendorId && (isDepartmentHod || isProcurementHead || isPrivileged);
  const canReturnForRevision = !!request.canApprove && !!user && ['FINANCE_DIRECTOR', 'GENERAL_MANAGER'].includes(user.role);
  const canCorrectVendors = Boolean(
    request.canCorrectVendors &&
    ['VENDOR_ACCEPTED', 'IN_SERVICE'].includes(request.status) &&
    request.actualQuantity == null &&
    !request.hodConfirmedAt &&
    !request.financeConfirmedAt
  );
  const activeVendorCorrectionReview = request.vendorCorrectionReviews?.find((review) =>
    ['DRAFT', 'PENDING_FD', 'PENDING_GM'].includes(review.status)
  );
  const stagedCorrectionByItemId = new Map(
    (activeVendorCorrectionReview?.corrections || []).map((correction) => [correction.itemId, correction])
  );
  const canStageVendorCorrections = canCorrectVendors && (!activeVendorCorrectionReview || activeVendorCorrectionReview.status === 'DRAFT');
  const latestApprovedVendorCorrectionReview = request.vendorCorrectionReviews?.find((review) => review.status === 'APPROVED');
  const canFinanceAdjustFullyApproved = Boolean(
    user?.role === 'FINANCE_DIRECTOR' &&
    request.status === 'VENDORS_FULLY_APPROVED' &&
    new Date(`${request.endDate.slice(0, 10)}T23:59:59`).getTime() >= Date.now()
  );
  const correctingItem = request.items.find((item) => item.id === correctingItemId) || null;
  const alternativeRates = correctingItem
    ? (meta?.catalogRates || [])
        .filter((rate) =>
          rate.positionId === correctingItem.positionId &&
          rate.unit === correctingItem.rateUnit &&
          rate.vendorId !== correctingItem.vendorId
        )
        .sort((a, b) => a.price - b.price)
    : [];
  const revisionServiceOptions = (() => {
    const options = new Map<string, { positionId: string; positionName: string; rateUnit: WorkforceRateUnit; prices: number[] }>();
    for (const rate of meta?.catalogRates || []) {
      if (rate.position.departmentId !== request.departmentId) continue;
      const key = `${rate.positionId}:${rate.unit}`;
      const current = options.get(key);
      if (current) current.prices.push(rate.price);
      else options.set(key, { positionId: rate.positionId, positionName: rate.position.name, rateUnit: rate.unit, prices: [rate.price] });
    }
    return [...options.values()].sort((a, b) => a.positionName.localeCompare(b.positionName) || a.rateUnit.localeCompare(b.rateUnit));
  })();
  const updateRevisionItem = (index: number, changes: Partial<(typeof revision.items)[number]>) => {
    setRevision((value) => ({ ...value, items: value.items.map((item, itemIndex) => itemIndex === index ? { ...item, ...changes } : item) }));
  };
  const addRevisionItem = () => setRevision((value) => ({ ...value, items: [...value.items, { positionId: '', rateUnit: 'HOURLY', quantity: 1, hours: 1 }] }));
  const removeRevisionItem = (index: number) => setRevision((value) => ({ ...value, items: value.items.filter((_, itemIndex) => itemIndex !== index) }));

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
            <h2 className="text-xl font-bold text-hoterra-navy">{request.items?.length || 1} service line{(request.items?.length || 1) === 1 ? '' : 's'}</h2>
            <p className="text-sm text-gray-500">
              {request.hotelName} · {formatDate(request.workDate)}–{formatDate(request.endDate)}
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
                {canReturnForRevision && (
                  <button
                    disabled={busy || !rejectReason.trim()}
                    onClick={() => run(() => api.returnWorkforceRequestForRevision(request.id, rejectReason.trim()))}
                    className="btn-secondary text-amber-700 disabled:opacity-50"
                  >
                    Return to HOD
                  </button>
                )}
              </>
            )}
              {canProcurementConfirm && (
                <button
                  disabled={busy}
                  onClick={() => run(() => api.confirmWorkforceProcurement(request.id))}
                  className="btn-primary disabled:opacity-50"
                >
                  <Check className="h-4 w-4" />
                  Accept selection & send to vendors
                </button>
              )}
              {request.canSubmitVendorCorrectionReview && activeVendorCorrectionReview && activeVendorCorrectionReview.corrections.length > 0 && (
                <button
                  disabled={busy}
                  onClick={() => run(() => api.submitWorkforceVendorCorrectionReview(request.id))}
                  className="btn-primary bg-amber-600 hover:bg-amber-700 disabled:opacity-50"
                >
                  Send changes for review ({activeVendorCorrectionReview.corrections.length})
                </button>
              )}
              {request.canMarkVendorsFullyApproved && (
                <button
                  disabled={busy}
                  onClick={() => run(() => api.markWorkforceVendorsReadyForExecution(request.id))}
                  className="btn-primary bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50"
                >
                  Vendors ready for execution
                </button>
              )}
              {canFinanceAdjustFullyApproved && (
                <>
                  <button disabled={busy} onClick={() => { setFinanceAction('return'); setFinanceActionComment(''); }} className="btn-secondary text-amber-700 disabled:opacity-50">Return to HoD</button>
                  <button disabled={busy} onClick={() => { setFinanceAction('cancel'); setFinanceActionComment(''); }} className="btn-secondary text-red-600 disabled:opacity-50">Cancel request</button>
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
                <Item label="Total staff" value={String(request.quantity)} />
                <Item label="Work period" value={`${formatDate(request.workDate)} – ${formatDate(request.endDate)}`} />
                <Item
                  label="Estimated cost"
                  value={request.estimatedCost != null ? `${request.estimatedCost.toFixed(2)} ${request.rateCurrency || 'AZN'}` : '—'}
                />
                <Item label="Contract rate" value={request.unitRate != null ? `${request.unitRate.toFixed(2)} ${request.rateCurrency || 'AZN'} · ${request.rateUnit || ''}` : '—'} />
                <Item
                  label="Vendor"
                  value={
                    [...new Set((request.items || []).map((item) => item.vendor?.name).filter(Boolean))].join(', ') ||
                    request.acceptedVendor?.name || request.vendor?.name ||
                    (request.vendorMode === 'BROADCAST'
                      ? `Broadcast (${request.broadcastVendorIds.length})`
                      : isDepartmentHod
                        ? 'Available after Procurement confirms all vendors'
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
              {!!request.items?.length && (
                <div className="mt-5 overflow-x-auto rounded-lg border border-gray-100">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-left text-xs text-gray-500">
                      <tr><th className="px-3 py-2">Service</th><th className="px-3 py-2">Quantity</th><th className="px-3 py-2">Unit</th><th className="px-3 py-2">Hours</th><th className="px-3 py-2">Selected vendor</th><th className="px-3 py-2">Cost</th>{canStageVendorCorrections && <th className="px-3 py-2 text-right">Action</th>}</tr>
                    </thead>
                    <tbody>
                      {request.items.map((item) => (
                        <tr key={item.id} className="border-t border-gray-100">
                          <td className="px-3 py-2 font-medium">{item.position.name}</td>
                          <td className="px-3 py-2">{item.quantity}</td>
                          <td className="px-3 py-2">{item.rateUnit === 'HOURLY' ? 'Hourly' : item.rateUnit === 'DAILY_9' ? 'Daily 9h' : 'Daily 12h'}</td>
                          <td className="px-3 py-2">{item.hours ?? '—'}</td>
                          <td className="px-3 py-2">
                            <div>{item.vendor?.name || (isDepartmentHod ? 'Visible after Procurement confirmation' : 'Selected after GM')}</div>
                            {stagedCorrectionByItemId.get(item.id) && <div className="mt-1 text-xs font-medium text-amber-700">Proposed: {stagedCorrectionByItemId.get(item.id)!.proposedVendorName}</div>}
                          </td>
                          <td className="px-3 py-2">
                            <div>{item.estimatedCost != null ? `${item.estimatedCost.toFixed(2)} ${item.rateCurrency || 'AZN'}` : '—'}</div>
                            {stagedCorrectionByItemId.get(item.id) && <div className="mt-1 text-xs font-medium text-amber-700">Proposed: {stagedCorrectionByItemId.get(item.id)!.proposedCost.toFixed(2)} {stagedCorrectionByItemId.get(item.id)!.proposedCurrency}</div>}
                          </td>
                          {canStageVendorCorrections && (
                            <td className="px-3 py-2 text-right">
                              <button
                                type="button"
                                onClick={() => {
                                  setCorrectingItemId(item.id);
                                  setVendorCorrection({ vendorRateId: '', comment: '' });
                                }}
                                className="inline-flex items-center gap-1 text-xs font-medium text-hoterra-steel hover:underline"
                              >
                                <Pencil className="h-3.5 w-3.5" /> Change vendor
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {canStageVendorCorrections && (
                <div className="mt-3 rounded-lg border border-amber-100 bg-amber-50 p-3 text-xs leading-5 text-amber-800">
                  Procurement may prepare one or several unavailable-vendor corrections. They remain drafts until the Finance Director and General Manager approve the complete change package.
                </div>
              )}
              {activeVendorCorrectionReview && (
                <div className={`mt-4 rounded-lg border p-4 text-sm ${activeVendorCorrectionReview.status === 'DRAFT' ? 'border-amber-200 bg-amber-50' : 'border-blue-200 bg-blue-50'}`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h4 className="font-semibold text-hoterra-navy">Vendor change review · {activeVendorCorrectionReview.status === 'DRAFT' ? 'Draft' : activeVendorCorrectionReview.status === 'PENDING_FD' ? 'Awaiting Finance Director approval' : 'Awaiting General Manager approval'}</h4>
                      <p className="mt-1 text-xs text-gray-600">{activeVendorCorrectionReview.corrections.length} service-line change(s) are in this review package.</p>
                    </div>
                    {activeVendorCorrectionReview.status === 'PENDING_FD' && <span className="rounded-full bg-blue-100 px-2 py-1 text-xs font-medium text-blue-700">Finance Director review</span>}
                    {activeVendorCorrectionReview.status === 'PENDING_GM' && <span className="rounded-full bg-violet-100 px-2 py-1 text-xs font-medium text-violet-700">General Manager review</span>}
                  </div>
                  <ul className="mt-3 space-y-2 border-t border-black/5 pt-3 text-xs text-gray-700">
                    {activeVendorCorrectionReview.corrections.map((correction) => (
                      <li key={correction.id}><strong>{correction.item.position.name}</strong>: {correction.originalVendorName || 'Unassigned'} → {correction.proposedVendorName} · {correction.originalCost?.toFixed(2) || '0.00'} → {correction.proposedCost.toFixed(2)} {correction.proposedCurrency}<br /><span className="text-gray-500">{correction.comment}</span></li>
                    ))}
                  </ul>
                  {activeVendorCorrectionReview.returnComment && <p className="mt-3 rounded bg-white/70 p-2 text-xs text-red-700">Returned to Procurement: {activeVendorCorrectionReview.returnComment}</p>}
                  {request.canReviewVendorCorrectionReview && (
                    <div className="mt-4 border-t border-black/5 pt-3">
                      <label className="block text-xs font-medium text-gray-600">Decision comment {activeVendorCorrectionReview.status === 'PENDING_FD' ? '(optional for approval)' : '(optional for approval)'}</label>
                      <textarea rows={2} value={reviewComment} onChange={(event) => setReviewComment(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm" placeholder="Add a review comment…" />
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button disabled={busy} onClick={() => run(() => api.decideWorkforceVendorCorrectionReview(request.id, activeVendorCorrectionReview.id, 'approve', reviewComment))} className="btn-primary disabled:opacity-50">{activeVendorCorrectionReview.status === 'PENDING_FD' ? 'Finance Director approve & send to General Manager' : 'General Manager approve & apply changes'}</button>
                        <button disabled={busy || reviewComment.trim().length < 3} onClick={() => run(() => api.decideWorkforceVendorCorrectionReview(request.id, activeVendorCorrectionReview.id, 'return', reviewComment))} className="btn-secondary text-red-600 disabled:opacity-50">Return to Procurement</button>
                      </div>
                    </div>
                  )}
                </div>
              )}
              {latestApprovedVendorCorrectionReview && (
                <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
                  <strong>Vendors fully approved — ready for execution.</strong> The Finance Director and General Manager approved the latest vendor correction package on {formatDate(latestApprovedVendorCorrectionReview.appliedAt || latestApprovedVendorCorrectionReview.updatedAt)}. The department HoD has been notified.
                </div>
              )}
              {request.status === 'PROCUREMENT_REVIEW' && request.vendor && (
                <div className="mt-4 rounded-lg border border-violet-100 bg-violet-50 p-3 text-sm text-violet-900">
                  GM confirmed only the workforce need. The system automatically selected <strong>{request.vendor.name}</strong> at the lowest current approved rate of <strong>{request.unitRate?.toFixed(2)} {request.rateCurrency || 'AZN'}</strong>. Procurement must confirm before dispatch.
                </div>
              )}
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

            {request.actualQuantity != null && (
              <div className="card p-5">
                <h3 className="mb-4 text-sm font-semibold text-hoterra-navy">
                  Service completion
                </h3>
                {['VENDOR_ACCEPTED', 'VENDORS_FULLY_APPROVED'].includes(request.status) && request.actualQuantity == null && (
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
                  {['VENDOR_ACCEPTED', 'VENDORS_FULLY_APPROVED'].includes(request.status) && request.actualQuantity == null && (
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

            {request.status === 'RETURNED_FOR_REVISION' && (isDepartmentHod || isPrivileged) && (
              <div className="card p-5">
                <h3 className="text-sm font-semibold text-hoterra-navy">Edit request and resubmit</h3>
                <p className="mt-1 text-xs text-gray-500">Review the Finance Director/General Manager comment in Activity history. You can update, remove or add service lines before submitting again.</p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <label className="text-sm"><span className="mb-1 block text-xs text-gray-500">Start date</span><input type="date" value={revision.workDate} onChange={(e) => setRevision((value) => ({ ...value, workDate: e.target.value }))} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" /></label>
                  <label className="text-sm"><span className="mb-1 block text-xs text-gray-500">End date</span><input type="date" min={revision.workDate} value={revision.endDate} onChange={(e) => setRevision((value) => ({ ...value, endDate: e.target.value }))} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" /></label>
                </div>
                <div className="mt-5">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <h4 className="text-sm font-semibold text-hoterra-navy">Service list</h4>
                    <button type="button" onClick={addRevisionItem} className="btn-secondary"><Plus className="h-4 w-4" /> Add service</button>
                  </div>
                  {meta && revisionServiceOptions.length === 0 && <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">No approved services are currently available for this department.</div>}
                  {!meta && <div className="rounded-lg bg-gray-50 p-3 text-sm text-gray-500">Loading available services…</div>}
                  <div className="space-y-3">
                    {revision.items.map((item, index) => {
                      const selected = revisionServiceOptions.find((option) => option.positionId === item.positionId && option.rateUnit === item.rateUnit);
                      const priceRange = selected?.prices || [];
                      return (
                        <div key={`${item.positionId}-${item.rateUnit}-${index}`} className="rounded-xl border border-gray-200 p-3">
                          <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr_auto]">
                            <label className="text-sm"><span className="mb-1 block text-xs text-gray-500">Service / unit</span><select value={item.positionId ? `${item.positionId}:${item.rateUnit}` : ''} onChange={(e) => { const [positionId, rateUnit] = e.target.value.split(':'); updateRevisionItem(index, { positionId, rateUnit: rateUnit as WorkforceRateUnit, hours: rateUnit === 'HOURLY' ? (item.hours || 1) : null }); }} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"><option value="">Select…</option>{revisionServiceOptions.map((option) => <option key={`${option.positionId}:${option.rateUnit}`} value={`${option.positionId}:${option.rateUnit}`}>{option.positionName} · {option.rateUnit === 'HOURLY' ? 'Hourly' : option.rateUnit === 'DAILY_9' ? 'Daily 9 hours' : 'Daily 12 hours'}</option>)}</select></label>
                            <label className="text-sm"><span className="mb-1 block text-xs text-gray-500">Quantity</span><input type="number" min={1} value={item.quantity} onChange={(e) => updateRevisionItem(index, { quantity: Number(e.target.value) })} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" /></label>
                            {item.rateUnit === 'HOURLY' ? <label className="text-sm"><span className="mb-1 block text-xs text-gray-500">Hours</span><input type="number" min="0.5" step="0.5" value={item.hours || 1} onChange={(e) => updateRevisionItem(index, { hours: Number(e.target.value) })} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" /></label> : <div className="self-end rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-600">{item.rateUnit === 'DAILY_9' ? '9 hours' : '12 hours'}</div>}
                            <button type="button" disabled={revision.items.length === 1} onClick={() => removeRevisionItem(index)} className="self-end rounded-lg p-2 text-red-500 hover:bg-red-50 disabled:opacity-30" title="Remove service"><X className="h-5 w-5" /></button>
                          </div>
                          {!!priceRange.length && <div className="mt-2 text-xs text-blue-700">{priceRange.length} approved offers · {Math.min(...priceRange).toFixed(2)}–{Math.max(...priceRange).toFixed(2)} AZN. Lowest offer will be selected automatically after GM approval.</div>}
                        </div>
                      );
                    })}
                  </div>
                </div>
                <label className="mt-3 block text-sm"><span className="mb-1 block text-xs text-gray-500">Request comment</span><textarea rows={3} value={revision.comment} onChange={(e) => setRevision((value) => ({ ...value, comment: e.target.value }))} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" /></label>
                <label className="mt-3 block text-sm"><span className="mb-1 block text-xs text-gray-500">Revision response</span><input value={revision.revisionComment} onChange={(e) => setRevision((value) => ({ ...value, revisionComment: e.target.value }))} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" placeholder="Describe what was changed" /></label>
                <button disabled={busy} onClick={() => run(() => api.resubmitWorkforceRequest(request.id, revision))} className="btn-primary mt-4 disabled:opacity-50">Resubmit for approval</button>
              </div>
            )}

            {canEvaluate && ['VENDOR_ACCEPTED', 'VENDORS_FULLY_APPROVED', 'IN_SERVICE', 'AWAITING_EVALUATION', 'COMPLETED'].includes(request.status) && (
              <div className="card p-5">
                <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-hoterra-navy">Casual worker quality evaluation</h3>
                    <p className="mt-1 text-xs text-gray-500">Give one overall score from 1 (poor) to 5 (excellent). Five HOD scores of 3 or below within 30 days trigger an automatic vendor alert.</p>
                  </div>
                  {canReplaceVendor && !request.vendor?.replacementRequested && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        const reason = prompt('Reason for replacing this vendor on the next order') || undefined;
                        run(() => api.requestWorkforceVendorReplacement(request.id, reason));
                      }}
                      className="btn-secondary text-red-600 disabled:opacity-50"
                    >
                      Replace on next order
                    </button>
                  )}
                </div>
                {request.vendor?.replacementRequested && (
                  <div className="mb-4 rounded-lg border border-red-100 bg-red-50 p-3 text-sm text-red-700">
                    This vendor is excluded from automatic selection for future orders until Procurement clears the replacement flag.
                  </div>
                )}
                {request.status !== 'COMPLETED' && (
                  <div className="space-y-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="text-sm">
                        <span className="mb-1 block text-xs text-gray-500">Overall score</span>
                        <select value={evaluation.overallScore} onChange={(e) => setEvaluation((value) => ({ ...value, overallScore: Number(e.target.value) }))} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm">
                          {[1, 2, 3, 4, 5].map((score) => <option key={score} value={score}>{score}</option>)}
                        </select>
                      </label>
                      <label className="text-sm">
                        <span className="mb-1 block text-xs text-gray-500">Evaluation phase</span>
                        <select value={evaluation.phase} onChange={(e) => setEvaluation((value) => ({ ...value, phase: e.target.value as 'ONGOING' | 'FINAL' }))} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm">
                          <option value="ONGOING">Ongoing evaluation</option>
                          <option value="FINAL">Final evaluation</option>
                        </select>
                      </label>
                      <label className="text-sm">
                        <span className="mb-1 block text-xs text-gray-500">Notes</span>
                        <input value={evaluation.notes} onChange={(e) => setEvaluation((value) => ({ ...value, notes: e.target.value }))} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
                      </label>
                    </div>
                    <label className="flex items-center gap-2 text-sm text-gray-600">
                      <input type="checkbox" checked={evaluation.replacementRecommended} onChange={(e) => setEvaluation((value) => ({ ...value, replacementRecommended: e.target.checked }))} />
                      Recommend replacing this vendor for future orders
                    </label>
                    <button disabled={busy} onClick={() => run(() => api.createWorkforceEvaluation(request.id, evaluation))} className="btn-primary disabled:opacity-50">
                      Save evaluation
                    </button>
                  </div>
                )}
                {!!request.evaluations?.length && (
                  <ul className="mt-5 space-y-2 border-t border-gray-100 pt-4">
                    {request.evaluations.map((item) => (
                      <li key={item.id} className="rounded-lg bg-gray-50 p-3 text-sm">
                        <div className="flex flex-wrap justify-between gap-2"><strong>{item.phase === 'FINAL' ? 'Final' : 'Ongoing'} · {item.overallScore.toFixed(2)}/5</strong><span className="text-xs text-gray-500">{item.createdByName} · {formatDate(item.createdAt)}</span></div>
                        <div className="mt-1 text-xs text-gray-600">Overall service satisfaction: {item.overallScore}/5 · Rated by {ROLE_LABELS[item.createdByRole]}</div>
                        {item.notes && <div className="mt-1 text-gray-600">{item.notes}</div>}
                      </li>
                    ))}
                  </ul>
                )}
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
                    ['PROCUREMENT_REVIEW', 'PROCUREMENT_CONFIRMED', 'SENT_TO_VENDOR', 'VENDOR_ACCEPTED', 'VENDORS_FULLY_APPROVED', 'IN_SERVICE', 'AWAITING_EVALUATION', 'COMPLETED', 'APPROVED'].includes(
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
                  <span className="mb-1 block text-xs text-gray-500">Decision comment</span>
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

      {financeAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              run(async () => {
                if (financeAction === 'return') await api.returnWorkforceRequestToHodByFinance(request.id, financeActionComment);
                else await api.cancelWorkforceRequest(request.id, financeActionComment || undefined);
                setFinanceAction(null);
                setFinanceActionComment('');
              });
            }}
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
          >
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-hoterra-navy">{financeAction === 'return' ? 'Return request to HoD' : 'Cancel fully approved request'}</h2>
                <p className="mt-1 text-sm text-gray-500">This action is available while the request end date has not passed.</p>
              </div>
              <button type="button" onClick={() => setFinanceAction(null)} className="rounded-lg p-2 hover:bg-gray-100"><X className="h-5 w-5" /></button>
            </div>
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium text-gray-500">Finance Director comment {financeAction === 'return' ? '(required)' : '(optional)'}</span>
              <textarea rows={4} required={financeAction === 'return'} minLength={financeAction === 'return' ? 3 : undefined} value={financeActionComment} onChange={(event) => setFinanceActionComment(event.target.value)} className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm" placeholder={financeAction === 'return' ? 'Explain what HoD should revise…' : 'Reason for cancellation…'} />
            </label>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setFinanceAction(null)} className="btn-secondary">Cancel</button>
              <button type="submit" disabled={busy || (financeAction === 'return' && financeActionComment.trim().length < 3)} className={cn('btn-primary disabled:opacity-50', financeAction === 'cancel' && 'bg-red-600 hover:bg-red-700')}>{busy ? 'Saving…' : financeAction === 'return' ? 'Return to HoD' : 'Cancel request'}</button>
            </div>
          </form>
        </div>
      )}

      {correctingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              run(async () => {
                await api.correctWorkforceItemVendor(request.id, correctingItem.id, vendorCorrection);
                setCorrectingItemId(null);
                setVendorCorrection({ vendorRateId: '', comment: '' });
              });
            }}
            className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl"
          >
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-hoterra-navy">Prepare vendor change</h2>
                <p className="mt-1 text-sm text-gray-500">{correctingItem.position.name} · {correctingItem.rateUnit === 'HOURLY' ? 'Hourly' : correctingItem.rateUnit === 'DAILY_9' ? 'Daily 9 hours' : 'Daily 12 hours'}</p>
              </div>
              <button type="button" onClick={() => setCorrectingItemId(null)} className="rounded-lg p-2 hover:bg-gray-100"><X className="h-5 w-5" /></button>
            </div>

            <div className="mb-4 rounded-lg bg-gray-50 p-3 text-sm">
              <span className="text-gray-500">Current vendor:</span>{' '}
              <strong className="text-hoterra-navy">{correctingItem.vendor?.name || 'Not assigned'}</strong>
              {correctingItem.estimatedCost != null && <span className="ml-2 text-gray-500">· {correctingItem.estimatedCost.toFixed(2)} {correctingItem.rateCurrency || 'AZN'}</span>}
            </div>

            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium text-gray-500">Alternative approved vendor</span>
              <select
                required
                value={vendorCorrection.vendorRateId}
                onChange={(event) => setVendorCorrection((value) => ({ ...value, vendorRateId: event.target.value }))}
                className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm"
              >
                <option value="">Select vendor and current rate…</option>
                {alternativeRates.map((rate) => (
                  <option key={rate.id} value={rate.id}>{rate.vendor.name} · {rate.price.toFixed(2)} {rate.currency}</option>
                ))}
              </select>
              {alternativeRates.length === 0 && <span className="mt-1 block text-xs text-red-600">No other approved vendor has an active rate for this service unit.</span>}
            </label>

            <label className="mt-4 block text-sm">
              <span className="mb-1 block text-xs font-medium text-gray-500">Procurement correction comment (required)</span>
              <textarea
                required
                minLength={5}
                rows={4}
                value={vendorCorrection.comment}
                onChange={(event) => setVendorCorrection((value) => ({ ...value, comment: event.target.value }))}
                className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm"
                placeholder="Explain why the original vendor cannot provide this service and why the replacement was selected…"
              />
            </label>

            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setCorrectingItemId(null)} className="btn-secondary">Cancel</button>
              <button type="submit" disabled={busy || !vendorCorrection.vendorRateId || vendorCorrection.comment.trim().length < 5} className="btn-primary disabled:opacity-50">{busy ? 'Saving…' : 'Save change draft'}</button>
            </div>
          </form>
        </div>
      )}
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
