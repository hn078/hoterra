import { useCallback, useEffect, useMemo, useState } from 'react';
import { Archive, CheckCircle2, Clock, Download, FileText, Gavel, HardDrive, LayoutTemplate, LockKeyhole, RotateCcw, Search, Settings2, ShieldAlert, X } from 'lucide-react';
import { Header } from '@/components/layout/Sidebar';
import { DashStatCard } from '@/components/ui/DashStatCard';
import { Pagination } from '@/components/ui/Pagination';
import { useAppDialog } from '@/components/ui/AppDialogProvider';
import { api } from '@/lib/api';
import { hasCapability } from '@/modules/access-control';
import { useAuthStore } from '@/store/auth';
import { formatDate } from '@/lib/utils';
import { CATEGORY_LABELS, type ArchiveItem, type DocumentCategory, type RetentionPolicy } from '@/types';

const LIMIT = 20;
type ArchiveKind = 'Document' | 'Template';
const CATEGORY_OPTIONS = Object.entries(CATEGORY_LABELS) as Array<[DocumentCategory, string]>;

function formatFileSize(bytes?: number | null) {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function inputDate(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
}

function RecordBadges({ item }: { item: ArchiveItem }) {
  if (item.kind === 'Template') return <span className="rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-600">Template</span>;
  return <div className="flex flex-wrap gap-1.5">
    {item.status === 'DISPOSED' && <span className="rounded-full bg-slate-200 px-2 py-1 text-xs font-medium text-slate-700">Disposed</span>}
    {item.legalHoldAt && <span className="rounded-full bg-red-100 px-2 py-1 text-xs font-medium text-red-700">Legal hold</span>}
    {item.disposition?.status === 'PENDING' && <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-800">Disposition review</span>}
    {item.disposition?.status === 'REJECTED' && <span className="rounded-full bg-rose-100 px-2 py-1 text-xs font-medium text-rose-700">Disposition rejected</span>}
    {item.status === 'ARCHIVED' && !item.legalHoldAt && item.disposition?.status !== 'PENDING' && <span className="rounded-full bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700">Retained</span>}
  </div>;
}

export function ArchivePage() {
  const currentUser = useAuthStore((state) => state.user);
  const dialog = useAppDialog();
  const canRestoreDocuments = hasCapability(currentUser, 'documents.restore');
  const canExportDocuments = hasCapability(currentUser, 'documents.export');
  const canReadTemplates = hasCapability(currentUser, 'templates.read');
  const canManageTemplates = hasCapability(currentUser, 'templates.manage');
  const canManageRecords = hasCapability(currentUser, 'records.manage');
  const canRequestDisposition = hasCapability(currentUser, 'records.disposition.request');
  const canApproveDisposition = hasCapability(currentUser, 'records.disposition.approve');
  const [items, setItems] = useState<ArchiveItem[]>([]);
  const [policies, setPolicies] = useState<RetentionPolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [moduleFilter, setModuleFilter] = useState<'ALL' | ArchiveKind>('ALL');
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [showPolicyModal, setShowPolicyModal] = useState(false);
  const [savingPolicy, setSavingPolicy] = useState(false);
  const [policyForm, setPolicyForm] = useState({ name: '', retentionDays: 2555, category: '', description: '', isDefault: false });
  const [stats, setStats] = useState({ total: 0, documents: 0, templates: 0, storageBytes: 0, thisMonth: 0, legalHolds: 0, pendingDispositions: 0, disposed: 0 });

  useEffect(() => { const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300); return () => clearTimeout(timer); }, [search]);

  const loadItems = useCallback(() => {
    setLoading(true); setError('');
    Promise.all([api.getArchive({ search: debouncedSearch || undefined, module: moduleFilter, page, limit: LIMIT }), api.getRetentionPolicies()])
      .then(([response, policyRows]) => {
        setItems(response.data); setPolicies(policyRows); setTotal(response.pagination.total);
        setTotalPages(Math.max(1, response.pagination.totalPages)); setStats(response.stats);
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : 'Archive could not be loaded'))
      .finally(() => setLoading(false));
  }, [debouncedSearch, moduleFilter, page]);
  useEffect(() => { loadItems(); }, [loadItems]);
  const modules = useMemo(() => ['ALL', 'Document', ...(canReadTemplates ? ['Template'] : [])] as const, [canReadTemplates]);

  const runAction = async (item: ArchiveItem, action: () => Promise<unknown>) => {
    setBusyId(item.id);
    try { await action(); loadItems(); }
    catch (reason) { await dialog.alert(reason instanceof Error ? reason.message : 'Records action failed', { title: 'Action failed' }); }
    finally { setBusyId(''); }
  };

  const handleRestore = (item: ArchiveItem) => runAction(item, () => item.kind === 'Document' ? api.restoreDocument(item.id) : api.restoreTemplate(item.id));
  const handleLegalHold = async (item: ArchiveItem) => {
    if (item.legalHoldAt) {
      if (await dialog.confirm(`Release legal hold for “${item.name}”?`, { title: 'Release legal hold', confirmLabel: 'Release hold' })) await runAction(item, () => api.setDocumentLegalHold(item.id, false, 'Legal hold released'));
      return;
    }
    const reason = await dialog.prompt(`Explain why “${item.name}” must be preserved beyond normal disposition.`, { title: 'Apply legal hold', placeholder: 'Legal case, investigation, claim…', required: true, confirmLabel: 'Apply hold' });
    if (reason) await runAction(item, () => api.setDocumentLegalHold(item.id, true, reason));
  };
  const handleRetention = async (item: ArchiveItem) => {
    const value = await dialog.prompt('Enter the retention end date as YYYY-MM-DD.', { title: `Retention — ${item.code}`, defaultValue: inputDate(item.retentionUntil), placeholder: '2033-08-26', required: true, confirmLabel: 'Save date' });
    if (value) await runAction(item, () => api.updateDocumentRetention(item.id, value, item.retentionPolicy?.id ?? policies.find((policy) => policy.isDefault && !policy.category)?.id ?? null));
  };
  const handleRequestDisposition = async (item: ArchiveItem) => {
    const reason = await dialog.prompt('State the business and records reason for permanent content disposition. A different authorized person must approve.', { title: `Request disposition — ${item.code}`, placeholder: 'Retention expired; no active operational or legal need…', required: true, confirmLabel: 'Send for review', tone: 'danger' });
    if (reason) await runAction(item, () => api.requestDocumentDisposition(item.id, reason));
  };
  const handleReviewDisposition = async (item: ArchiveItem, decision: 'APPROVE' | 'REJECT') => {
    if (!item.disposition) return;
    if (decision === 'APPROVE') {
      const confirmed = await dialog.confirm(`Approve disposition of “${item.name}”? Content and stored files will be purged; metadata and audit evidence will remain.`, { title: 'Independent disposition approval', confirmLabel: 'Approve & purge', tone: 'danger' });
      if (confirmed) await runAction(item, () => api.reviewDocumentDisposition(item.disposition!.id, 'APPROVE'));
      return;
    }
    const comment = await dialog.prompt('Explain why this disposition request is rejected.', { title: 'Reject disposition', required: true, confirmLabel: 'Reject request' });
    if (comment) await runAction(item, () => api.reviewDocumentDisposition(item.disposition!.id, 'REJECT', comment));
  };
  const handleExport = async () => {
    setExporting(true); try { await api.exportDocuments({ status: 'ARCHIVED' }); }
    catch (reason) { await dialog.alert(reason instanceof Error ? reason.message : 'Export failed', { title: 'Export failed' }); }
    finally { setExporting(false); }
  };
  const savePolicy = async (event: React.FormEvent) => {
    event.preventDefault(); setSavingPolicy(true);
    try {
      await api.saveRetentionPolicy({ ...policyForm, category: policyForm.category || null });
      setShowPolicyModal(false); setPolicyForm({ name: '', retentionDays: 2555, category: '', description: '', isDefault: false }); loadItems();
    } catch (reason) { await dialog.alert(reason instanceof Error ? reason.message : 'Policy could not be saved', { title: 'Policy failed' }); }
    finally { setSavingPolicy(false); }
  };

  const actions = (item: ArchiveItem) => <div className="flex flex-wrap gap-2">
    {((item.kind === 'Document' && canRestoreDocuments && item.status !== 'DISPOSED') || (item.kind === 'Template' && canManageTemplates)) && <button disabled={busyId === item.id} onClick={() => handleRestore(item)} className="btn-secondary min-h-10 border-green-200 bg-green-50 py-1.5 text-xs text-green-700"><RotateCcw className="h-3.5 w-3.5" />Restore</button>}
    {item.kind === 'Document' && item.status !== 'DISPOSED' && canManageRecords && <>
      <button disabled={busyId === item.id} onClick={() => handleRetention(item)} className="btn-secondary min-h-10 py-1.5 text-xs"><Clock className="h-3.5 w-3.5" />Retention</button>
      <button disabled={busyId === item.id} onClick={() => handleLegalHold(item)} className={`btn-secondary min-h-10 py-1.5 text-xs ${item.legalHoldAt ? 'border-red-200 bg-red-50 text-red-700' : ''}`}><LockKeyhole className="h-3.5 w-3.5" />{item.legalHoldAt ? 'Release hold' : 'Legal hold'}</button>
    </>}
    {item.kind === 'Document' && canRequestDisposition && item.canRequestDisposition && <button disabled={busyId === item.id} onClick={() => handleRequestDisposition(item)} className="btn-secondary min-h-10 border-amber-200 bg-amber-50 py-1.5 text-xs text-amber-800"><Gavel className="h-3.5 w-3.5" />Request disposition</button>}
    {item.kind === 'Document' && canApproveDisposition && item.canReviewDisposition && <>
      <button disabled={busyId === item.id} onClick={() => handleReviewDisposition(item, 'APPROVE')} className="btn-secondary min-h-10 border-red-200 bg-red-50 py-1.5 text-xs text-red-700"><CheckCircle2 className="h-3.5 w-3.5" />Approve & purge</button>
      <button disabled={busyId === item.id} onClick={() => handleReviewDisposition(item, 'REJECT')} className="btn-secondary min-h-10 py-1.5 text-xs"><X className="h-3.5 w-3.5" />Reject</button>
    </>}
  </div>;

  return <div className="flex flex-1 flex-col overflow-hidden bg-hoterra-page">
    <Header title="Archive & Records" subtitle="Retention, legal hold, restore and controlled disposition" action={<div className="flex flex-wrap gap-2">{canManageRecords && <button onClick={() => setShowPolicyModal(true)} className="btn-secondary"><Settings2 className="h-4 w-4" />Policies</button>}{canExportDocuments && <button onClick={handleExport} disabled={exporting} className="btn-secondary"><Download className="h-4 w-4" />{exporting ? 'Exporting…' : 'Export'}</button>}</div>} />
    <div className="page-stats"><div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-7">
      <DashStatCard label="Archived records" value={stats.total} icon={Archive} iconColor="text-blue-600" iconBg="bg-blue-50" />
      <DashStatCard label="Documents" value={stats.documents} icon={FileText} iconColor="text-purple-600" iconBg="bg-purple-50" />
      <DashStatCard label="Templates" value={stats.templates} icon={LayoutTemplate} iconColor="text-orange-600" iconBg="bg-orange-50" />
      <DashStatCard label="Storage" value={`${(stats.storageBytes / (1024 ** 3)).toFixed(2)} GB`} icon={HardDrive} iconColor="text-gray-600" iconBg="bg-gray-100" />
      <DashStatCard label="Legal holds" value={stats.legalHolds} icon={ShieldAlert} iconColor="text-red-600" iconBg="bg-red-50" />
      <DashStatCard label="Awaiting review" value={stats.pendingDispositions} icon={Gavel} iconColor="text-amber-700" iconBg="bg-amber-50" />
      <DashStatCard label="Disposed" value={stats.disposed} icon={CheckCircle2} iconColor="text-slate-600" iconBg="bg-slate-100" />
    </div></div>
    <div className="border-b border-gray-200 bg-white px-4 py-3 sm:px-6"><div className="flex flex-col gap-3 sm:flex-row"><div className="relative flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" /><input type="search" placeholder="Search name, code, person or reason…" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} className="w-full rounded-lg border border-gray-200 py-2.5 pl-10 pr-4 text-sm" /></div><select value={moduleFilter} onChange={(event) => { setModuleFilter(event.target.value as typeof moduleFilter); setPage(1); }} className="filter-select sm:w-48">{modules.map((module) => <option key={module} value={module}>{module === 'ALL' ? 'All available types' : `${module}s`}</option>)}</select></div>{error && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}</div>
    <div className="flex-1 overflow-auto bg-white">
      <div className="space-y-3 p-4 md:hidden">{loading ? <p className="py-12 text-center text-sm text-gray-500">Loading archive…</p> : items.length === 0 ? <p className="py-12 text-center text-sm text-gray-500">No archived items match your access and filters</p> : items.map((item) => <article key={`${item.kind}-${item.id}`} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate font-semibold text-hoterra-navy">{item.name}</p><p className="mt-1 font-mono text-xs text-gray-500">{item.code}</p></div><RecordBadges item={item} /></div><dl className="mt-4 grid grid-cols-2 gap-3 text-xs"><div><dt className="text-gray-500">Archived</dt><dd className="mt-1">{formatDate(item.archivedAt)}</dd></div><div><dt className="text-gray-500">Retention until</dt><dd className="mt-1">{item.kind === 'Document' ? formatDate(item.retentionUntil) : '—'}</dd></div><div><dt className="text-gray-500">Archived by</dt><dd className="mt-1 truncate">{item.archivedBy ?? '—'}</dd></div><div><dt className="text-gray-500">Size</dt><dd className="mt-1">{formatFileSize(item.size)}</dd></div></dl>{item.retentionPolicy && <p className="mt-3 text-xs text-gray-500">Policy: {item.retentionPolicy.name}</p>}{item.disposition && <p className="mt-2 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">Latest disposition: {item.disposition.status.toLowerCase()} · {item.disposition.requestedByName}</p>}<div className="mt-4 border-t border-gray-100 pt-3">{actions(item)}</div></article>)}</div>
      <table className="hidden w-full min-w-[1180px] text-sm md:table"><thead className="sticky top-0 bg-gray-50 text-left text-xs font-medium uppercase text-gray-500"><tr><th className="px-6 py-3">Record</th><th className="px-4 py-3">State</th><th className="px-4 py-3">Archived</th><th className="px-4 py-3">Retention</th><th className="px-4 py-3">Policy / hold</th><th className="px-4 py-3">Disposition</th><th className="px-4 py-3">Actions</th></tr></thead><tbody className="divide-y divide-gray-100">{loading ? <tr><td colSpan={7} className="px-6 py-12 text-center text-gray-500">Loading archive…</td></tr> : items.length === 0 ? <tr><td colSpan={7} className="px-6 py-12 text-center text-gray-500">No archived items match your access and filters</td></tr> : items.map((item) => <tr key={`${item.kind}-${item.id}`} className="align-top hover:bg-gray-50"><td className="px-6 py-3"><p className="font-medium text-hoterra-navy">{item.name}</p><p className="mt-1 font-mono text-xs text-gray-500">{item.code} · {formatFileSize(item.size)}</p></td><td className="px-4 py-3"><RecordBadges item={item} /></td><td className="px-4 py-3 text-gray-600"><p>{formatDate(item.archivedAt)}</p><p className="mt-1 text-xs text-gray-500">{item.archivedBy ?? '—'}</p></td><td className="px-4 py-3">{item.kind === 'Document' ? formatDate(item.retentionUntil) : '—'}</td><td className="max-w-[220px] px-4 py-3 text-gray-600">{item.kind === 'Document' ? <><p>{item.retentionPolicy?.name ?? 'Manual / no policy'}</p>{item.legalHoldAt && <p className="mt-1 text-xs text-red-700">Held by {item.legalHoldByName ?? 'authorized user'}</p>}</> : '—'}</td><td className="max-w-[230px] px-4 py-3 text-gray-600">{item.disposition ? <><p className="font-medium">{item.disposition.status}</p><p className="mt-1 text-xs text-gray-500">{item.disposition.requestedByName} · {formatDate(item.disposition.requestedAt)}</p></> : '—'}</td><td className="px-4 py-3">{actions(item)}</td></tr>)}</tbody></table>
    </div>
    <Pagination page={page} totalPages={totalPages} total={total} limit={LIMIT} onPageChange={setPage} label="items" />
    {showPolicyModal && canManageRecords && <div className="fixed inset-0 z-50 flex items-end justify-center bg-hoterra-navy/55 sm:items-center sm:p-4"><div role="dialog" aria-modal="true" aria-labelledby="retention-policy-title" className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white shadow-2xl sm:max-w-xl sm:rounded-2xl"><form onSubmit={savePolicy}><div className="flex items-center justify-between border-b px-5 py-4"><div><h2 id="retention-policy-title" className="text-lg font-semibold text-hoterra-navy">New retention policy</h2><p className="mt-1 text-sm text-gray-500">Applied automatically when records are archived.</p></div><button type="button" onClick={() => setShowPolicyModal(false)} className="flex h-11 w-11 items-center justify-center rounded-lg hover:bg-gray-100" aria-label="Close"><X className="h-5 w-5" /></button></div><div className="grid gap-4 px-5 py-5 sm:grid-cols-2"><label className="sm:col-span-2"><span className="mb-1.5 block text-sm font-medium">Policy name</span><input required maxLength={120} value={policyForm.name} onChange={(event) => setPolicyForm((value) => ({ ...value, name: event.target.value }))} className="input" /></label><label><span className="mb-1.5 block text-sm font-medium">Retention days</span><input required min={1} max={36500} type="number" value={policyForm.retentionDays} onChange={(event) => setPolicyForm((value) => ({ ...value, retentionDays: Number(event.target.value) }))} className="input" /></label><label><span className="mb-1.5 block text-sm font-medium">Category</span><select value={policyForm.category} onChange={(event) => setPolicyForm((value) => ({ ...value, category: event.target.value }))} className="input"><option value="">All categories</option>{CATEGORY_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="sm:col-span-2"><span className="mb-1.5 block text-sm font-medium">Description</span><textarea rows={3} maxLength={1000} value={policyForm.description} onChange={(event) => setPolicyForm((value) => ({ ...value, description: event.target.value }))} className="input resize-none" /></label><label className="flex min-h-11 items-center gap-3 sm:col-span-2"><input type="checkbox" checked={policyForm.isDefault} onChange={(event) => setPolicyForm((value) => ({ ...value, isDefault: event.target.checked }))} className="h-4 w-4" /><span className="text-sm">Use as default for the selected category</span></label></div><div className="flex flex-col-reverse gap-2 border-t bg-gray-50 px-5 py-4 sm:flex-row sm:justify-end"><button type="button" onClick={() => setShowPolicyModal(false)} className="btn-secondary">Cancel</button><button disabled={savingPolicy} className="btn-primary disabled:opacity-50">{savingPolicy ? 'Saving…' : 'Create policy'}</button></div></form></div></div>}
  </div>;
}
