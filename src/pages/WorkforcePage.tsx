import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  Briefcase,
  CheckCircle2,
  Clock,
  Download,
  DollarSign,
  Plus,
  ReceiptText,
  RefreshCw,
  Search,
  Send,
  Users,
  WalletCards,
  X,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Header, DepartmentBadge } from '@/components/layout/Sidebar';
import { Breadcrumbs } from '@/components/ui/Breadcrumbs';
import { PageTabs } from '@/components/ui/PageTabs';
import { DashStatCard } from '@/components/ui/DashStatCard';
import { api } from '@/lib/api';
import { formatDate, cn } from '@/lib/utils';
import type {
  Department,
  WorkforceMeta,
  WorkforceApprovalStep,
  WorkforceReport,
  WorkforceRequest,
  WorkforceShift,
  WorkforceVendorMode,
  WorkforceRateUnit,
  Vendor,
  VendorServiceRate,
} from '@/types';
import { useAuthStore } from '@/store/auth';
import {
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

const REPORT_MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const money = (value: number) =>
  `${new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)} AZN`;

const reportUnitLabel = (unit: string) =>
  ({ HOURLY: 'Hourly', DAILY_9: 'Daily 9 hours', DAILY_12: 'Daily 12 hours' })[unit] || unit;

const paymentStatusLabel = (status: string) =>
  ({
    NOT_INVOICED: 'Not invoiced',
    PARTIALLY_INVOICED: 'Partially invoiced',
    PENDING_PAYMENT: 'Pending payment',
    PAID: 'Paid',
    OVER_INVOICED: 'Over invoiced',
  })[status] || status;

export function WorkforcePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAuthStore((state) => state.user);
  const isProcurementUser = user?.department?.code === 'PR';
  const visibleTabs = useMemo(() => TABS.filter((item) => {
    if (isProcurementUser || ['SYSTEM_ADMINISTRATOR', 'GENERAL_MANAGER', 'FINANCE_DIRECTOR'].includes(user?.role || '')) return true;
    return item.id === 'requests' || item.id === 'templates' || item.id === 'reports';
  }), [isProcurementUser, user?.role]);
  const [tab, setTab] = useState(() => new URLSearchParams(window.location.search).get('tab') || 'requests');
  const [requests, setRequests] = useState<WorkforceRequest[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [meta, setMeta] = useState<WorkforceMeta | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [report, setReport] = useState<WorkforceReport | null>(null);
  const [reportPeriod, setReportPeriod] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  });
  const [reportLoading, setReportLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newPosition, setNewPosition] = useState('');
  const [newPositionDepartmentId, setNewPositionDepartmentId] = useState('');
  const [newVendor, setNewVendor] = useState({ name: '', contactEmail: '', phone: '', insuranceNotes: 'Indemnity and liability insurance; staff medical check every 6 months; mandatory health insurance.' });
  const [newRate, setNewRate] = useState({ vendorId: '', positionId: '', unit: 'HOURLY' as WorkforceRateUnit, price: '', requirements: '' });
  const [catalogFilters, setCatalogFilters] = useState({ departmentId: '', vendorId: '', positionId: '', unit: '', query: '', priceSort: '' as '' | 'asc' | 'desc' });
  const [comparisonPositionId, setComparisonPositionId] = useState('');
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);
  const [vendorEditForm, setVendorEditForm] = useState({ name: '', contactEmail: '', phone: '', insuranceNotes: '' });
  const [editingRate, setEditingRate] = useState<VendorServiceRate | null>(null);
  const [rateEditForm, setRateEditForm] = useState({ price: '', requirements: '' });
  const [savingEdit, setSavingEdit] = useState(false);

  const [form, setForm] = useState({
    hotelName: '',
    departmentId: '',
    positionId: '',
    rateUnit: 'HOURLY' as WorkforceRateUnit,
    workDate: '',
    endDate: '',
    shift: 'MORNING' as WorkforceShift,
    startTime: '',
    endTime: '',
    quantity: 1,
    comment: '',
    vendorMode: 'DIRECT' as WorkforceVendorMode,
    vendorId: '',
    broadcastVendorIds: [] as string[],
    isUrgentOverride: false,
    items: [{ positionId: '', rateUnit: 'HOURLY' as WorkforceRateUnit, quantity: 1, hours: 1 }],
  });

  const load = () => {
    api.getWorkforceRequests().then((res) => {
      setRequests(res.data);
      setCounts(res.counts || {});
    }).catch(console.error);
    api.getWorkforceMeta().then(setMeta).catch(console.error);
  };

  const loadReport = () => {
    setReportLoading(true);
    api.getWorkforceReport(reportPeriod)
      .then(setReport)
      .catch((error) => alert(error.message))
      .finally(() => setReportLoading(false));
  };

  useEffect(() => {
    load();
    api.getDepartments().then(setDepartments).catch(console.error);
  }, []);

  useEffect(() => {
    const requestedTab = new URLSearchParams(location.search).get('tab');
    if (requestedTab && visibleTabs.some((item) => item.id === requestedTab)) setTab(requestedTab);
    else if (!visibleTabs.some((item) => item.id === tab)) setTab('requests');
  }, [location.search, tab, visibleTabs]);

  useEffect(() => {
    if (tab !== 'catalog') return;
    const refreshCatalog = () => api.getWorkforceMeta().then(setMeta).catch(console.error);
    refreshCatalog();
    const timer = window.setInterval(refreshCatalog, 10_000);
    window.addEventListener('focus', refreshCatalog);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refreshCatalog);
    };
  }, [tab]);

  useEffect(() => {
    if (tab === 'reports') {
      loadReport();
    }
  }, [tab, reportPeriod.year, reportPeriod.month]);

  useEffect(() => {
    if (meta && !form.hotelName) {
      setForm((f) => ({
        ...f,
        hotelName: meta.settings.hotels?.[0] || meta.settings.hotelName,
        departmentId: f.departmentId || user?.department?.id || '',
      }));
    }
  }, [meta, form.hotelName, user?.department?.id]);

  const serviceOptions = useMemo(() => {
    if (!meta) return [];
    const options = new Map<string, { positionId: string; positionName: string; unit: WorkforceRateUnit; rates: VendorServiceRate[] }>();
    for (const rate of meta.catalogRates) {
      const key = `${rate.positionId}:${rate.unit}`;
      const existing = options.get(key);
      if (existing) existing.rates.push(rate);
      else options.set(key, { positionId: rate.positionId, positionName: rate.position.name, unit: rate.unit, rates: [rate] });
    }
    return [...options.values()].sort((a, b) => a.positionName.localeCompare(b.positionName) || a.unit.localeCompare(b.unit));
  }, [meta]);

  const departmentServiceOptions = useMemo(
    () => serviceOptions.filter((option) => option.rates[0]?.position.departmentId === form.departmentId),
    [serviceOptions, form.departmentId]
  );

  const catalogRows = useMemo(() => {
    if (!meta) return [];
    return meta.vendors
      .flatMap((vendor) => (vendor.serviceRates || []).filter((rate) => rate.isActive).map((rate) => ({ vendor, rate })))
      .sort((a, b) => {
        const departmentA = departments.find((department) => department.id === a.rate.position.departmentId)?.name || '';
        const departmentB = departments.find((department) => department.id === b.rate.position.departmentId)?.name || '';
        return departmentA.localeCompare(departmentB) || a.vendor.name.localeCompare(b.vendor.name) || a.rate.position.name.localeCompare(b.rate.position.name) || a.rate.unit.localeCompare(b.rate.unit);
      });
  }, [meta, departments]);

  const filteredCatalogRows = useMemo(() => {
    const query = catalogFilters.query.trim().toLowerCase();
    const rows = catalogRows.filter(({ vendor, rate }) => {
      const department = departments.find((item) => item.id === rate.position.departmentId);
      return (!catalogFilters.departmentId || rate.position.departmentId === catalogFilters.departmentId)
        && (!catalogFilters.vendorId || vendor.id === catalogFilters.vendorId)
        && (!catalogFilters.positionId || rate.positionId === catalogFilters.positionId)
        && (!catalogFilters.unit || rate.unit === catalogFilters.unit)
        && (!query || [department?.name, vendor.name, rate.position.name, rate.requirements, rate.currency, rate.price.toFixed(2)].some((value) => String(value || '').toLowerCase().includes(query)));
    });
    if (!catalogFilters.priceSort) return rows;
    const direction = catalogFilters.priceSort === 'asc' ? 1 : -1;
    return rows.sort((a, b) => direction * (a.rate.price - b.rate.price) || a.vendor.name.localeCompare(b.vendor.name));
  }, [catalogRows, catalogFilters, departments]);

  const catalogFilterPositions = useMemo(
    () => (meta?.positions || []).filter((position) => position.isActive && (!catalogFilters.departmentId || position.departmentId === catalogFilters.departmentId)),
    [meta, catalogFilters.departmentId]
  );

  const vendorComparisonData = useMemo(() => {
    if (!comparisonPositionId) return [];
    const vendors = new Map<string, { vendor: string; HOURLY?: number; DAILY_9?: number; DAILY_12?: number; lowestPrice: number }>();
    for (const { vendor, rate } of catalogRows) {
      if (rate.positionId !== comparisonPositionId || !vendor.isActive || vendor.approvalStatus !== 'APPROVED') continue;
      const current = vendors.get(vendor.id) || { vendor: vendor.name, lowestPrice: Number.POSITIVE_INFINITY };
      current[rate.unit] = rate.price;
      current.lowestPrice = Math.min(current.lowestPrice, rate.price);
      vendors.set(vendor.id, current);
    }
    return [...vendors.values()].sort((a, b) => a.lowestPrice - b.lowestPrice || a.vendor.localeCompare(b.vendor));
  }, [catalogRows, comparisonPositionId]);

  const filtered = useMemo(() => {
    return requests.filter((r) => {
      const q = search.toLowerCase();
      const matchesSearch =
        !q ||
        r.code.toLowerCase().includes(q) ||
        r.position.name.toLowerCase().includes(q) ||
        r.department.name.toLowerCase().includes(q);
      const matchesStatus = !statusFilter
        || (statusFilter === 'VENDOR_CORRECTION_REVIEW'
          ? ['PENDING_FD', 'PENDING_GM'].includes(r.vendorCorrectionReviewStatus || '')
          : r.status === statusFilter);
      return matchesSearch && matchesStatus;
    });
  }, [requests, search, statusFilter]);

  const pendingCount =
    (counts.PENDING || 0) + (counts.AWAITING_EXTRA_APPROVAL || 0) + (counts.RETURNED_FOR_REVISION || 0);
  const pendingVendorCorrectionReviewCount = requests.filter((request) => request.canReviewVendorCorrectionReview).length;

  const applyTemplate = (templateId: string) => {
    const t = meta?.templates.find((x) => x.id === templateId);
    if (!t) return;
    const date = new Date();
    date.setDate(date.getDate() + ((t.dayOfWeek ?? date.getDay()) - date.getDay() + 7) % 7 || 7);
    setForm((f) => ({
      ...f,
      departmentId: t.departmentId || f.departmentId,
      positionId: t.positionId || f.positionId,
      items: t.positionId ? [{ positionId: t.positionId, rateUnit: 'HOURLY' as WorkforceRateUnit, quantity: t.quantity, hours: 8 }] : f.items,
      shift: t.shift,
      quantity: t.quantity,
      comment: t.comment || '',
      vendorMode: t.vendorMode,
      vendorId: t.vendorId || '',
      workDate: date.toISOString().slice(0, 10),
      endDate: date.toISOString().slice(0, 10),
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
    if (!newPosition.trim() || !newPositionDepartmentId) return;
    try {
      await api.createWorkforcePosition(newPosition.trim(), newPositionDepartmentId);
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
      setNewVendor({ name: '', contactEmail: '', phone: '', insuranceNotes: 'Indemnity and liability insurance; staff medical check every 6 months; mandatory health insurance.' });
      load();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to add vendor');
    }
  };

  const handleAddRate = async () => {
    if (!newRate.vendorId || !newRate.positionId || !newRate.price) return;
    try {
      await api.createWorkforceRate({ ...newRate, price: Number(newRate.price), currency: 'AZN', uom: 'Each' });
      setNewRate((rate) => ({ ...rate, price: '', requirements: '' }));
      load();
    } catch (err) { alert(err instanceof Error ? err.message : 'Failed to save rate'); }
  };

  const unitLabel = (unit: WorkforceRateUnit) => unit === 'HOURLY' ? 'Hourly' : unit === 'DAILY_9' ? 'Daily 9 hours' : 'Daily 12 hours';

  const vendorApprovalSteps = (vendor: Vendor): WorkforceApprovalStep[] => {
    if (Array.isArray(vendor.approvalSteps)) return vendor.approvalSteps;
    try {
      const parsed = JSON.parse(vendor.approvalSteps || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };

  const currentVendorApprovalStep = (vendor: Vendor) => vendorApprovalSteps(vendor)[vendor.currentStepIndex || 0];
  const canCurrentUserApproveVendor = (vendor: Vendor) => {
    const step = currentVendorApprovalStep(vendor);
    return Boolean(user && (user.role === 'SYSTEM_ADMINISTRATOR' || step?.role === user.role));
  };

  const updateRequestItem = (index: number, changes: Partial<(typeof form.items)[number]>) => {
    setForm((current) => ({ ...current, items: current.items.map((item, itemIndex) => itemIndex === index ? { ...item, ...changes } : item) }));
  };

  const addRequestItem = () => setForm((current) => ({ ...current, items: [...current.items, { positionId: '', rateUnit: 'HOURLY', quantity: 1, hours: 1 }] }));
  const removeRequestItem = (index: number) => setForm((current) => ({ ...current, items: current.items.filter((_, itemIndex) => itemIndex !== index) }));

  const openVendorEdit = (vendor: Vendor) => {
    setEditingVendor(vendor);
    setVendorEditForm({ name: vendor.name, contactEmail: vendor.contactEmail || '', phone: vendor.phone || '', insuranceNotes: vendor.insuranceNotes || '' });
  };

  const saveVendorEdit = async (e: React.FormEvent) => {
    e.preventDefault(); if (!editingVendor) return; setSavingEdit(true);
    try { await api.updateWorkforceVendor(editingVendor.id, vendorEditForm); setEditingVendor(null); load(); }
    catch (err) { alert(err instanceof Error ? err.message : 'Failed to update vendor'); }
    finally { setSavingEdit(false); }
  };

  const openRateEdit = (rate: VendorServiceRate) => {
    setEditingRate(rate);
    setRateEditForm({ price: rate.price.toFixed(2), requirements: rate.requirements || '' });
  };

  const saveRateEdit = async (e: React.FormEvent) => {
    e.preventDefault(); if (!editingRate) return; setSavingEdit(true);
    try { await api.updateWorkforceRate(editingRate.id, { price: Number(rateEditForm.price), requirements: rateEditForm.requirements }); setEditingRate(null); load(); }
    catch (err) { alert(err instanceof Error ? err.message : 'Failed to update price'); }
    finally { setSavingEdit(false); }
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
        <PageTabs tabs={visibleTabs} active={tab} onChange={setTab} />
      </div>

      <div className="page-content">
        {tab === 'requests' && (
          <>
            <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
              <DashStatCard
                label="Pending actions"
                value={pendingCount + pendingVendorCorrectionReviewCount}
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
                label="Vendors confirmed"
                value={(counts.VENDOR_ACCEPTED || 0) + (counts.VENDORS_FULLY_APPROVED || 0)}
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
                <option value="VENDOR_CORRECTION_REVIEW">Vendor changes pending review</option>
                {Object.entries(WORKFORCE_STATUS_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>

            <div className="space-y-3 md:hidden">
              {filtered.map((r) => (
                <Link key={r.id} to={`/workforce/${r.id}`} className={cn('card block p-4', r.canReviewVendorCorrectionReview && 'border-amber-200 bg-amber-50/60')}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold text-hoterra-navy">{r.code}</div>
                      <div className="mt-1 line-clamp-2 text-sm text-gray-700">{r.items?.length ? r.items.map((item) => item.position.name).join(', ') : r.position.name}</div>
                    </div>
                    <DepartmentBadge name={r.department.name} color={r.department.color} />
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3 border-y border-gray-100 py-3 text-xs">
                    <div><span className="text-gray-400">Period</span><p className="mt-0.5 font-medium text-gray-700">{formatDate(r.workDate)}–{formatDate(r.endDate)}</p></div>
                    <div><span className="text-gray-400">Quantity</span><p className="mt-0.5 font-medium text-gray-700">{r.quantity}</p></div>
                    <div className="col-span-2"><span className="text-gray-400">Vendor</span><p className="mt-0.5 font-medium text-gray-700">{[...new Set((r.items || []).map((item) => item.vendor?.name).filter(Boolean))].join(', ') || r.acceptedVendor?.name || r.vendor?.name || (r.vendorMode === 'BROADCAST' ? 'Broadcast' : '—')}</p></div>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-2">
                    {r.vendorCorrectionReviewStatus && r.vendorCorrectionReviewStatus !== 'DRAFT' ? (
                      <span className="rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800">Awaiting {r.vendorCorrectionReviewStatus === 'PENDING_FD' ? 'Finance Director' : 'General Manager'}</span>
                    ) : (
                      <span className={cn('inline-flex rounded-full border px-2.5 py-1 text-xs font-medium', WORKFORCE_STATUS_COLORS[r.status])}>{WORKFORCE_STATUS_LABELS[r.status]}</span>
                    )}
                    <span className="text-sm font-semibold text-hoterra-steel">{r.canReviewVendorCorrectionReview ? 'Review →' : 'Open →'}</span>
                  </div>
                </Link>
              ))}
              {filtered.length === 0 && <div className="card p-8 text-center text-sm text-gray-400">No workforce requests yet</div>}
            </div>

            <div className="card hidden overflow-hidden md:block">
              <table className="w-full text-sm">
                <thead className="border-b border-gray-100 bg-gray-50 text-left text-xs text-gray-500">
                  <tr>
                    <th className="px-4 py-3 font-medium">Code</th>
                    <th className="px-4 py-3 font-medium">Department</th>
                    <th className="px-4 py-3 font-medium">Services</th>
                    <th className="px-4 py-3 font-medium">Period</th>
                    <th className="px-4 py-3 font-medium">Qty</th>
                    <th className="px-4 py-3 font-medium">Vendor</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr key={r.id} className={cn('border-b border-gray-50 hover:bg-gray-50', r.canReviewVendorCorrectionReview && 'bg-amber-50/60')}>
                      <td className="px-4 py-3 font-medium text-hoterra-navy">{r.code}</td>
                      <td className="px-4 py-3">
                        <DepartmentBadge name={r.department.name} color={r.department.color} />
                      </td>
                      <td className="px-4 py-3">{r.items?.length ? r.items.map((item) => item.position.name).join(', ') : r.position.name}</td>
                      <td className="px-4 py-3 text-gray-600">
                        {formatDate(r.workDate)}–{formatDate(r.endDate)}
                      </td>
                      <td className="px-4 py-3">{r.quantity}</td>
                      <td className="px-4 py-3 text-gray-600">
                        {[...new Set((r.items || []).map((item) => item.vendor?.name).filter(Boolean))].join(', ') || r.acceptedVendor?.name || r.vendor?.name || (r.vendorMode === 'BROADCAST' ? 'Broadcast' : '—')}
                      </td>
                      <td className="px-4 py-3">
                        {r.vendorCorrectionReviewStatus && r.vendorCorrectionReviewStatus !== 'DRAFT' ? (
                          <div className="space-y-1">
                            <span className="inline-flex rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-800">
                              Vendor changes · {r.vendorCorrectionReviewStatus === 'PENDING_FD' ? 'Awaiting Finance Director' : 'Awaiting General Manager'}
                            </span>
                            <div className="text-xs text-gray-500">{r.vendorCorrectionReviewCount || 0} change{r.vendorCorrectionReviewCount === 1 ? '' : 's'}{r.canReviewVendorCorrectionReview ? ' · Your review required' : ''}</div>
                          </div>
                        ) : (
                          <span
                            className={cn(
                              'inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium',
                              WORKFORCE_STATUS_COLORS[r.status]
                            )}
                          >
                            {WORKFORCE_STATUS_LABELS[r.status]}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          to={`/workforce/${r.id}`}
                          className="text-sm font-medium text-hoterra-steel hover:underline"
                        >
                          {r.canReviewVendorCorrectionReview ? 'Review' : 'Open'}
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
          <div className="space-y-6">
            <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900">
              Procurement creates vendors and rates here. New vendors stay pending until every approval-route signer approves them; only then do their rates appear in New Request.
            </div>
            <div className="grid gap-6 lg:grid-cols-2">
            <div className="card p-5">
              <h3 className="mb-3 text-sm font-semibold text-hoterra-navy">Positions</h3>
              <div className="mb-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                <input
                  value={newPosition}
                  onChange={(e) => setNewPosition(e.target.value)}
                  placeholder="Add position (e.g. Banquet Captain)"
                  className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm"
                />
                <select value={newPositionDepartmentId} onChange={(e) => setNewPositionDepartmentId(e.target.value)} className="rounded-lg border border-gray-200 px-3 py-2 text-sm">
                  <option value="">Department…</option>
                  {departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
                </select>
                <button onClick={handleAddPosition} className="btn-secondary">Add</button>
              </div>
              <ul className="max-h-80 space-y-1 overflow-y-auto text-sm">
                {meta.positions.map((p) => (
                  <li key={p.id} className="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-gray-50">
                    <span>{p.name} <span className="text-xs text-gray-400">· {departments.find((department) => department.id === p.departmentId)?.name || 'Unassigned'}</span></span>
                    {!p.isActive && <span className="text-xs text-gray-400">Inactive</span>}
                  </li>
                ))}
              </ul>
            </div>
            <div className="card p-5">
              <h3 className="mb-3 text-sm font-semibold text-hoterra-navy">Vendors & approval</h3>
              <div className="mb-3 grid gap-2 sm:grid-cols-2">
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
                <input value={newVendor.phone} onChange={(e) => setNewVendor((v) => ({ ...v, phone: e.target.value }))} placeholder="Phone" className="rounded-lg border border-gray-200 px-3 py-2 text-sm" />
                <button onClick={handleAddVendor} className="btn-secondary">Create & submit</button>
              </div>
              <textarea value={newVendor.insuranceNotes} onChange={(e) => setNewVendor((v) => ({ ...v, insuranceNotes: e.target.value }))} rows={2} className="input mb-3" placeholder="Insurance, medical and compliance requirements" />
              <ul className="space-y-2 text-sm">
                {meta.vendors.map((v) => (
                  <li key={v.id} className="rounded-lg border border-gray-100 px-3 py-2">
                    <div className="flex items-start justify-between gap-3">
                      <div><div className="font-medium text-hoterra-navy">{v.name}</div><div className="text-xs text-gray-500">{v.contactEmail || 'No email'} · {v.approvalStatus}</div></div>
                      <div className="flex gap-1">
                        {v.approvalStatus === 'PENDING_APPROVAL' && canCurrentUserApproveVendor(v) && <><button onClick={() => api.approveWorkforceVendor(v.id).then(load).catch((e) => alert(e.message))} className="rounded bg-green-50 px-2 py-1 text-xs text-green-700">Sign / Approve</button><button onClick={() => api.rejectWorkforceVendor(v.id, prompt('Reason') || undefined).then(load).catch((e) => alert(e.message))} className="rounded bg-red-50 px-2 py-1 text-xs text-red-700">Reject</button></>}
                        {(user?.role === 'SYSTEM_ADMINISTRATOR' || user?.role === 'GENERAL_MANAGER' || user?.department?.code === 'PR') && <><button onClick={() => openVendorEdit(v)} className="rounded px-2 py-1 text-xs text-hoterra-steel">Edit</button><button onClick={() => api.deleteWorkforceVendor(v.id).then(load).catch((e) => alert(e.message))} className="rounded px-2 py-1 text-xs text-gray-500">Disable</button></>}
                      </div>
                    </div>
                    {v.approvalStatus === 'PENDING_APPROVAL' && <div className="mt-1 text-[11px] font-medium text-amber-700">Awaiting: {currentVendorApprovalStep(v)?.label || 'Configured approver'}</div>}
                    {v.approvalEvents && v.approvalEvents.length > 0 && <div className="mt-2 text-[11px] text-gray-500">Latest: {v.approvalEvents[0].action} · {v.approvalEvents[0].userName || 'System'}</div>}
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-xs text-gray-500">
                Lead time rule: min {meta.settings.minLeadHours}h · Est. rate {meta.settings.estimatedHourlyRate.toFixed(2)} AZN/h
              </p>
            </div>
            </div>

            <div className="card p-5">
              <h3 className="mb-3 text-sm font-semibold text-hoterra-navy">Add vendor service price</h3>
              <div className="mb-4 grid gap-2 md:grid-cols-6">
                <select value={newRate.vendorId} onChange={(e) => setNewRate((r) => ({ ...r, vendorId: e.target.value }))} className="input"><option value="">Vendor…</option>{meta.vendors.filter((v) => v.isActive).map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select>
                <select value={newRate.positionId} onChange={(e) => setNewRate((r) => ({ ...r, positionId: e.target.value }))} className="input"><option value="">Service…</option>{meta.positions.filter((p) => p.isActive).map((p) => <option key={p.id} value={p.id}>{departments.find((department) => department.id === p.departmentId)?.name || 'Unassigned'} · {p.name}</option>)}</select>
                <select value={newRate.unit} onChange={(e) => setNewRate((r) => ({ ...r, unit: e.target.value as WorkforceRateUnit }))} className="input"><option value="HOURLY">Hourly</option><option value="DAILY_9">Daily 9 hours</option><option value="DAILY_12">Daily 12 hours</option></select>
                <input type="number" step="0.01" min="0" value={newRate.price} onChange={(e) => setNewRate((r) => ({ ...r, price: e.target.value }))} placeholder="Price AZN" className="input" />
                <input value={newRate.requirements} onChange={(e) => setNewRate((r) => ({ ...r, requirements: e.target.value }))} placeholder="Requirements / notes" className="input" />
                <button onClick={handleAddRate} className="btn-secondary">Save rate</button>
              </div>
              <div className="mb-4 rounded-xl border border-gray-100 bg-gray-50 p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div><h4 className="text-sm font-semibold text-hoterra-navy">Filter catalog</h4><p className="text-xs text-gray-500">{filteredCatalogRows.length} of {catalogRows.length} rates shown</p></div>
                  <button type="button" onClick={() => setCatalogFilters({ departmentId: '', vendorId: '', positionId: '', unit: '', query: '', priceSort: '' })} className="text-xs font-medium text-hoterra-steel hover:underline">Clear filters</button>
                </div>
                <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-6">
                  <select value={catalogFilters.departmentId} onChange={(e) => setCatalogFilters((filters) => ({ ...filters, departmentId: e.target.value, positionId: filters.positionId && meta.positions.find((position) => position.id === filters.positionId)?.departmentId !== e.target.value ? '' : filters.positionId }))} className="input"><option value="">All departments</option>{departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select>
                  <select value={catalogFilters.vendorId} onChange={(e) => setCatalogFilters((filters) => ({ ...filters, vendorId: e.target.value }))} className="input"><option value="">All vendors</option>{meta.vendors.filter((vendor) => vendor.isActive).map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.name}</option>)}</select>
                  <select value={catalogFilters.positionId} onChange={(e) => { setCatalogFilters((filters) => ({ ...filters, positionId: e.target.value })); if (e.target.value) setComparisonPositionId(e.target.value); }} className="input"><option value="">All services</option>{catalogFilterPositions.map((position) => <option key={position.id} value={position.id}>{position.name}</option>)}</select>
                  <select value={catalogFilters.unit} onChange={(e) => setCatalogFilters((filters) => ({ ...filters, unit: e.target.value }))} className="input"><option value="">All units</option><option value="HOURLY">Hourly</option><option value="DAILY_9">Daily 9 hours</option><option value="DAILY_12">Daily 12 hours</option></select>
                  <select value={catalogFilters.priceSort} onChange={(e) => setCatalogFilters((filters) => ({ ...filters, priceSort: e.target.value as '' | 'asc' | 'desc' }))} className="input"><option value="">Default order</option><option value="asc">Price: low to high</option><option value="desc">Price: high to low</option></select>
                  <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" /><input value={catalogFilters.query} onChange={(e) => setCatalogFilters((filters) => ({ ...filters, query: e.target.value }))} placeholder="Search catalog…" className="input pl-9" /></div>
                </div>
              </div>
              <div className="mb-4 rounded-xl border border-gray-100 bg-white p-4">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-semibold text-hoterra-navy">Vendor comparison by selected position</h4>
                    <p className="text-xs text-gray-500">Compare approved catalog prices across vendors and service units.</p>
                  </div>
                  <select value={comparisonPositionId} onChange={(e) => setComparisonPositionId(e.target.value)} className="input w-full sm:w-80">
                    <option value="">Select position…</option>
                    {meta.positions.filter((position) => position.isActive).map((position) => <option key={position.id} value={position.id}>{departments.find((department) => department.id === position.departmentId)?.name || 'Unassigned'} · {position.name}</option>)}
                  </select>
                </div>
                {!comparisonPositionId ? (
                  <div className="flex h-64 items-center justify-center rounded-lg bg-gray-50 text-sm text-gray-400">Select a position to compare vendor prices.</div>
                ) : vendorComparisonData.length === 0 ? (
                  <div className="flex h-64 items-center justify-center rounded-lg bg-gray-50 text-sm text-gray-400">No active vendor prices are available for this position.</div>
                ) : (
                  <div className="h-80 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={vendorComparisonData} margin={{ top: 8, right: 12, left: 4, bottom: 16 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis dataKey="vendor" tick={{ fontSize: 11 }} interval={0} height={54} angle={-10} textAnchor="end" />
                        <YAxis tick={{ fontSize: 11 }} tickFormatter={(value) => `${value} AZN`} />
                        <Tooltip formatter={(value, name) => [`${Number(value).toFixed(2)} AZN`, unitLabel(name as WorkforceRateUnit)]} />
                        <Legend formatter={(value) => unitLabel(value as WorkforceRateUnit)} />
                        <Bar dataKey="HOURLY" name="HOURLY" fill="#0f2740" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="DAILY_9" name="DAILY_9" fill="#d9a514" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="DAILY_12" name="DAILY_12" fill="#4b87c5" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b text-left text-xs text-gray-500"><th className="py-2">Department</th><th>Vendor</th><th>Service</th><th>Unit</th><th>Price</th><th>Requirements</th><th></th></tr></thead>
                  <tbody>
                    {filteredCatalogRows.map(({ vendor, rate }) => (
                      <tr key={rate.id} className="border-b border-gray-50">
                        <td className="py-2">{departments.find((department) => department.id === rate.position.departmentId)?.name || 'Unassigned'}</td>
                        <td>{vendor.name}</td><td>{rate.position.name}</td><td>{unitLabel(rate.unit)}</td><td className="font-medium">{rate.price.toFixed(2)} {rate.currency}</td><td className="max-w-xs truncate text-xs text-gray-500">{rate.requirements || '—'}</td>
                        <td className="text-right"><button onClick={() => openRateEdit({ ...rate, vendor })} className="mr-2 text-xs text-hoterra-steel">Edit</button><button onClick={() => api.deleteWorkforceRate(rate.id).then(load).catch((e) => alert(e.message))} className="text-xs text-red-600">Delete</button></td>
                      </tr>
                    ))}
                    {filteredCatalogRows.length === 0 && <tr><td colSpan={7} className="py-10 text-center text-sm text-gray-400">No catalog rates match the selected filters.</td></tr>}
                  </tbody>
                </table>
              </div>
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
              .map((r) => {
                const vendors = new Map<string, { id: string; name: string }>();
                r.items.forEach((item) => {
                  const vendor = item.vendor || item.vendorRate?.vendor;
                  if (vendor) vendors.set(vendor.id, { id: vendor.id, name: vendor.name });
                });
                const legacyVendor = r.acceptedVendor || r.vendor;
                if (vendors.size === 0 && legacyVendor) vendors.set(legacyVendor.id, { id: legacyVendor.id, name: legacyVendor.name });
                return { id: r.id, code: r.code, vendors: [...vendors.values()] };
              })}
          />
        )}

        {tab === 'settings' && meta && <SettingsPanel meta={meta} onSaved={load} />}

        {tab === 'reports' && report && (
          <div className={`space-y-6 ${reportLoading ? 'opacity-60' : ''}`}>
            <div className="card flex flex-wrap items-end justify-between gap-3 p-4">
              <div>
                <h2 className="font-semibold text-hoterra-navy">Workforce financial & operational report</h2>
                <p className="mt-1 text-xs text-gray-500">Commitments, vendor payments, department demand and audit findings</p>
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <Field label="Month">
                  <select
                    value={reportPeriod.month}
                    onChange={(event) => setReportPeriod((period) => ({ ...period, month: Number(event.target.value) }))}
                    className="input min-w-36"
                  >
                    {REPORT_MONTHS.map((month, index) => <option key={month} value={index + 1}>{month}</option>)}
                  </select>
                </Field>
                <Field label="Year">
                  <input
                    type="number"
                    min="2020"
                    max="2100"
                    value={reportPeriod.year}
                    onChange={(event) => setReportPeriod((period) => ({ ...period, year: Number(event.target.value) }))}
                    className="input w-28"
                  />
                </Field>
                <button className="btn-secondary" onClick={loadReport} disabled={reportLoading} title="Refresh report">
                  <RefreshCw className={`h-4 w-4 ${reportLoading ? 'animate-spin' : ''}`} />
                </button>
                <button
                  className="btn-secondary flex items-center gap-2"
                  onClick={() => api.downloadWorkforceReportCsv(reportPeriod).catch((error) => alert(error.message))}
                >
                  <Download className="h-4 w-4" /> Export payment CSV
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 xl:grid-cols-6">
              <DashStatCard
                label="All requests"
                value={report.summary.totalRequests}
                icon={Briefcase}
                iconColor="text-hoterra-steel"
                iconBg="bg-slate-100"
              />
              <DashStatCard
                label="Committed"
                value={money(report.summary.committedCost)}
                icon={DollarSign}
                iconColor="text-emerald-600"
                iconBg="bg-emerald-50"
              />
              <DashStatCard
                label="Amount to pay"
                value={money(report.summary.amountPayable)}
                icon={WalletCards}
                iconColor="text-amber-700"
                iconBg="bg-amber-50"
              />
              <DashStatCard
                label="Invoiced / Paid"
                value={`${money(report.summary.invoicedAmount)} / ${money(report.summary.paidAmount)}`}
                icon={ReceiptText}
                iconColor="text-blue-600"
                iconBg="bg-blue-50"
              />
              <DashStatCard
                label="Workers ordered"
                value={report.summary.totalHeadcount}
                icon={Users}
                iconColor="text-violet-600"
                iconBg="bg-violet-50"
              />
              <DashStatCard
                label="Planned / actual hours"
                value={`${report.summary.totalHours.toLocaleString()}h`}
                icon={Clock}
                iconColor="text-cyan-700"
                iconBg="bg-cyan-50"
              />
            </div>

            <div className="grid gap-4 xl:grid-cols-3">
              <div className="card p-4 xl:col-span-2">
                <div className="mb-4 flex items-start justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-hoterra-navy">Vendor payment exposure</h3>
                    <p className="text-xs text-gray-500">Committed, invoiced and paid amounts by selected service-line vendor</p>
                  </div>
                  <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">To pay: {money(report.summary.amountPayable)}</span>
                </div>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={report.byVendor} margin={{ top: 5, right: 20, left: 20, bottom: 45 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="name" angle={-20} textAnchor="end" interval={0} height={70} tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(value) => money(Number(value))} />
                      <Legend />
                      <Bar dataKey="committedCost" name="Committed" fill="#0f2942" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="invoicedAmount" name="Invoiced" fill="#d9a514" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="paidAmount" name="Paid" fill="#16a34a" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="card overflow-hidden">
                <div className="border-b border-gray-100 px-4 py-3">
                  <h3 className="text-sm font-semibold text-hoterra-navy">Audit & control findings</h3>
                  <p className="mt-1 text-xs text-gray-500">Items requiring Finance or Procurement attention</p>
                </div>
                <div className="divide-y divide-gray-100">
                  {report.audit.alerts.length === 0 ? (
                    <div className="flex items-center gap-3 p-5 text-sm text-emerald-700">
                      <CheckCircle2 className="h-5 w-5" /> No exceptions found for this period.
                    </div>
                  ) : report.audit.alerts.map((alert) => (
                    <div key={alert.title} className="flex gap-3 p-4">
                      <AlertTriangle className={`mt-0.5 h-4 w-4 shrink-0 ${alert.severity === 'critical' ? 'text-red-600' : alert.severity === 'warning' ? 'text-amber-600' : 'text-blue-600'}`} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-medium text-gray-800">{alert.title}</p>
                          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold">{alert.count}</span>
                        </div>
                        <p className="mt-1 text-xs leading-5 text-gray-500">{alert.detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <ReportTable
                title="Department demand & spend"
                rows={report.byDepartment.map((row) => [row.name, row.requests, row.quantity, `${row.hours}h`, money(row.committedCost), `${row.sharePct}%`])}
                headers={['Department', 'Orders', 'Workers', 'Hours', 'Spend', 'Share']}
              />
              <ReportTable
                title="Vendor payment summary"
                rows={report.byVendor.map((row) => [row.name, row.requests, row.quantity, money(row.committedCost), money(row.invoicedAmount), money(row.paidAmount), money(row.amountPayable)])}
                headers={['Vendor', 'Orders', 'Workers', 'Committed', 'Invoiced', 'Paid', 'To pay']}
              />
            </div>

            <div className="card overflow-hidden">
              <div className="border-b border-gray-100 px-4 py-3">
                <h3 className="text-sm font-semibold text-hoterra-navy">Vendor payment breakdown</h3>
                <p className="mt-1 text-xs text-gray-500">One row per request and selected vendor; multi-vendor requests are split correctly</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1200px] text-sm">
                  <thead className="bg-gray-50 text-left text-xs text-gray-500">
                    <tr>{['Request', 'Department', 'Vendor', 'Period', 'Services', 'Qty', 'Hours', 'Committed', 'Invoiced', 'Paid', 'To pay', 'Payment status'].map((header) => <th key={header} className="px-4 py-2 font-medium">{header}</th>)}</tr>
                  </thead>
                  <tbody>
                    {report.paymentDetails.map((row) => (
                      <tr key={`${row.requestId}:${row.vendor}`} className="border-t border-gray-100 align-top">
                        <td className="px-4 py-3 font-medium text-hoterra-steel"><Link to={`/workforce/${row.requestId}`}>{row.requestCode}</Link></td>
                        <td className="px-4 py-3">{row.department}</td>
                        <td className="px-4 py-3 font-medium">{row.vendor}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-500">{row.period}</td>
                        <td className="max-w-xs px-4 py-3 text-xs text-gray-600">{row.services}</td>
                        <td className="px-4 py-3">{row.quantity}</td>
                        <td className="px-4 py-3">{row.hours}h</td>
                        <td className="whitespace-nowrap px-4 py-3">{money(row.committedAmount)}</td>
                        <td className="whitespace-nowrap px-4 py-3">{money(row.invoicedAmount)}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-emerald-700">{money(row.paidAmount)}</td>
                        <td className="whitespace-nowrap px-4 py-3 font-semibold text-amber-700">{money(row.amountPayable)}</td>
                        <td className="px-4 py-3"><span className={`whitespace-nowrap rounded-full px-2 py-1 text-xs font-medium ${row.paymentStatus === 'PAID' ? 'bg-emerald-50 text-emerald-700' : row.paymentStatus === 'OVER_INVOICED' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}`}>{paymentStatusLabel(row.paymentStatus)}</span></td>
                      </tr>
                    ))}
                    {report.paymentDetails.length === 0 && <tr><td colSpan={12} className="px-4 py-8 text-center text-gray-400">No active orders in this period.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <ReportTable
                title="Service / position analysis"
                rows={report.byPosition.map((row) => [row.name, row.requests, row.quantity, `${row.hours}h`, money(row.committedCost), money(row.averageCostPerWorker)])}
                headers={['Position', 'Orders', 'Workers', 'Hours', 'Spend', 'Avg / worker']}
              />
              <ReportTable
                title="Rate unit analysis"
                rows={report.byUnit.map((row) => [reportUnitLabel(row.name), row.serviceLines, row.quantity, `${row.hours}h`, money(row.committedCost)])}
                headers={['Unit', 'Lines', 'Workers', 'Hours', 'Spend']}
              />
              <ReportTable
                title="Request status analysis"
                rows={report.byStatus.map((row) => [WORKFORCE_STATUS_LABELS[row.status], row.requests, row.quantity, money(row.requestedCost)])}
                headers={['Status', 'Requests', 'Requested workers', 'Requested value']}
              />
              <ReportTable
                title="Budget vs Actual"
                rows={report.budgetVsActual.map((row) => [
                  row.department,
                  row.budgetConfigured ? money(row.budget) : 'Not configured',
                  money(row.actual),
                  row.budgetConfigured ? money(row.variance) : '—',
                  row.budgetConfigured ? `${row.utilizationPct}%` : '—',
                ])}
                headers={['Department', 'Budget', 'Actual', 'Variance', 'Used']}
              />
            </div>

            <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900">
              <span className="font-semibold">Calculation note:</span> service-line commitments use the selected vendor and locked rate. Daily services are converted to 9 or 12 hours; hourly services use the entered duration across the inclusive work period. Actual cost/hours replace estimates when recorded. “To pay” equals the higher of committed or invoiced amount, less paid invoices.
            </div>
          </div>
        )}
      </div>

      {editingVendor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form onSubmit={saveVendorEdit} className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-5 flex items-center justify-between"><div><h2 className="text-lg font-bold text-hoterra-navy">Edit vendor</h2><p className="text-sm text-gray-500">Update Procurement vendor information</p></div><button type="button" onClick={() => setEditingVendor(null)} className="rounded-lg p-2 hover:bg-gray-100"><X className="h-5 w-5" /></button></div>
            <div className="space-y-4">
              <Field label="Vendor name"><input required value={vendorEditForm.name} onChange={(e) => setVendorEditForm((form) => ({ ...form, name: e.target.value }))} className="input" /></Field>
              <div className="grid gap-3 sm:grid-cols-2"><Field label="Email"><input type="email" value={vendorEditForm.contactEmail} onChange={(e) => setVendorEditForm((form) => ({ ...form, contactEmail: e.target.value }))} className="input" /></Field><Field label="Phone"><input value={vendorEditForm.phone} onChange={(e) => setVendorEditForm((form) => ({ ...form, phone: e.target.value }))} className="input" /></Field></div>
              <Field label="Compliance notes"><textarea rows={4} value={vendorEditForm.insuranceNotes} onChange={(e) => setVendorEditForm((form) => ({ ...form, insuranceNotes: e.target.value }))} className="input" /></Field>
            </div>
            <div className="mt-6 flex justify-end gap-2"><button type="button" onClick={() => setEditingVendor(null)} className="btn-secondary">Cancel</button><button type="submit" disabled={savingEdit} className="btn-primary disabled:opacity-50">{savingEdit ? 'Saving…' : 'Save vendor'}</button></div>
          </form>
        </div>
      )}

      {editingRate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form onSubmit={saveRateEdit} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-5 flex items-center justify-between"><div><h2 className="text-lg font-bold text-hoterra-navy">Edit service price</h2><p className="text-sm text-gray-500">{editingRate.vendor?.name || 'Vendor'} · {editingRate.position?.name || 'Service'} · {unitLabel(editingRate.unit)}</p></div><button type="button" onClick={() => setEditingRate(null)} className="rounded-lg p-2 hover:bg-gray-100"><X className="h-5 w-5" /></button></div>
            <div className="space-y-4"><Field label="Price (AZN)"><input required type="number" min="0" step="0.01" value={rateEditForm.price} onChange={(e) => setRateEditForm((form) => ({ ...form, price: e.target.value }))} className="input" /></Field><Field label="Requirements / notes"><textarea rows={4} value={rateEditForm.requirements} onChange={(e) => setRateEditForm((form) => ({ ...form, requirements: e.target.value }))} className="input" /></Field></div>
            <div className="mt-6 flex justify-end gap-2"><button type="button" onClick={() => setEditingRate(null)} className="btn-secondary">Cancel</button><button type="submit" disabled={savingEdit} className="btn-primary disabled:opacity-50">{savingEdit ? 'Saving…' : 'Save price'}</button></div>
          </form>
        </div>
      )}

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
                  onChange={(e) => setForm((f) => ({ ...f, departmentId: e.target.value, items: [{ positionId: '', rateUnit: 'HOURLY', quantity: 1, hours: 1 }] }))}
                  disabled={user?.role === 'HOD' && !!user.department}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                >
                  <option value="">Select…</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Start date">
                <input
                  type="date"
                  required
                  value={form.workDate}
                  onChange={(e) => setForm((f) => ({ ...f, workDate: e.target.value }))}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                />
              </Field>
              <Field label="End date">
                <input
                  type="date"
                  required
                  min={form.workDate || undefined}
                  value={form.endDate}
                  onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                />
              </Field>
            </div>

            <div className="mt-5">
              <div className="mb-2 flex items-center justify-between"><h3 className="text-sm font-semibold text-hoterra-navy">Service list</h3><button type="button" onClick={addRequestItem} className="btn-secondary"><Plus className="h-4 w-4" /> Add service</button></div>
              {!form.departmentId && <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Select a department first.</div>}
              {form.departmentId && departmentServiceOptions.length === 0 && <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">No approved services are assigned to this department.</div>}
              <div className="space-y-3">
                {form.items.map((item, index) => {
                  const selectedOption = departmentServiceOptions.find((option) => option.positionId === item.positionId && option.unit === item.rateUnit);
                  const prices = selectedOption?.rates.map((rate) => rate.price) || [];
                  return <div key={index} className="rounded-xl border border-gray-200 p-3">
                    <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr_auto]">
                      <Field label="Service / unit"><select required value={item.positionId ? `${item.positionId}:${item.rateUnit}` : ''} onChange={(e) => { const [positionId, rateUnit] = e.target.value.split(':'); updateRequestItem(index, { positionId, rateUnit: rateUnit as WorkforceRateUnit }); }} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"><option value="">Select…</option>{departmentServiceOptions.map((option) => <option key={`${option.positionId}:${option.unit}`} value={`${option.positionId}:${option.unit}`}>{option.positionName} · {unitLabel(option.unit)}</option>)}</select></Field>
                      <Field label="Quantity"><input required type="number" min={1} value={item.quantity} onChange={(e) => updateRequestItem(index, { quantity: Number(e.target.value) })} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" /></Field>
                      {item.rateUnit === 'HOURLY' ? <Field label="Hours"><input required type="number" min="0.5" step="0.5" value={item.hours} onChange={(e) => updateRequestItem(index, { hours: Number(e.target.value) })} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" /></Field> : <div className="self-end rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-600">{item.rateUnit === 'DAILY_9' ? '9 hours' : '12 hours'}</div>}
                      <button type="button" disabled={form.items.length === 1} onClick={() => removeRequestItem(index)} className="self-end rounded-lg p-2 text-red-500 hover:bg-red-50 disabled:opacity-30"><X className="h-5 w-5" /></button>
                    </div>
                    {!!prices.length && <div className="mt-2 text-xs text-blue-700">{prices.length} approved offers · {Math.min(...prices).toFixed(2)}–{Math.max(...prices).toFixed(2)} AZN. Lowest offer will be selected automatically after GM approval.</div>}
                  </div>;
                })}
              </div>
            </div>

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
      <div className="overflow-x-auto">
      <table className="w-full min-w-max text-sm">
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
    </div>
  );
}
