import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  LayoutTemplate,
  CheckCircle,
  Clock,
  FileEdit,
  Archive,
  Plus,
  Search,
  Download,
  MoreHorizontal,
  Pencil,
} from 'lucide-react';
import { Header, DepartmentBadge } from '@/components/layout/Sidebar';
import { DashStatCard } from '@/components/ui/DashStatCard';
import { CategoryBadge } from '@/components/ui/Badges';
import { PageTabs } from '@/components/ui/PageTabs';
import { Pagination } from '@/components/ui/Pagination';
import { useAppDialog } from '@/components/ui/AppDialogProvider';
import { api } from '@/lib/api';
import type { DocumentCategory, Template } from '@/types';
import { formatDate } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/auth';
import { hasCapability } from '@/modules/access-control';

const CATEGORY_TABS: { id: DocumentCategory | 'ALL'; label: string }[] = [
  { id: 'ALL', label: 'All Templates' },
  { id: 'SOP', label: 'SOP' },
  { id: 'POLICIES', label: 'Policies' },
  { id: 'FORMS', label: 'Forms' },
  { id: 'CHECKLISTS', label: 'Checklists' },
  { id: 'CONTRACTS', label: 'Contracts' },
  { id: 'TEMPLATES', label: 'Templates' },
  { id: 'REPORTS', label: 'Reports' },
  { id: 'TRAINING_MATERIALS', label: 'Training Materials' },
  { id: 'ARCHIVE', label: 'Archive' },
];

const STATUS_STYLE: Record<string, string> = {
  ACTIVE: 'bg-green-100 text-green-700 border-green-300',
  UNDER_REVIEW: 'bg-orange-100 text-orange-700 border-orange-300',
  DRAFT: 'bg-gray-100 text-gray-600 border-gray-300',
  ARCHIVED: 'bg-slate-100 text-slate-600 border-slate-300',
};

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'Active',
  UNDER_REVIEW: 'Under Review',
  DRAFT: 'Draft',
  ARCHIVED: 'Archived',
};

function templateStatus(t: Template): string {
  if (t.status) return t.status.trim().toUpperCase().replaceAll(' ', '_');
  return t.isActive === false ? 'DRAFT' : 'ACTIVE';
}

const LIMIT = 20;

export function TemplatesPage() {
  const currentUser = useAuthStore((state) => state.user);
  const dialog = useAppDialog();
  const canManage = hasCapability(currentUser, 'templates.manage');
  const canManageAll = hasCapability(currentUser, 'documents.read.all');
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<DocumentCategory | 'ALL'>('ALL');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [filterStatus, setFilterStatus] = useState('');
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    api
      .getTemplates()
      .then(setTemplates)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    return templates.filter((t) => {
      const matchesTab = activeTab === 'ALL' || t.category === activeTab;
      const q = search.toLowerCase();
      const deptName = t.department?.name ?? '';
      const matchesSearch =
        !q ||
        t.name.toLowerCase().includes(q) ||
        deptName.toLowerCase().includes(q);
      const status = templateStatus(t);
      const matchesStatus =
        !filterStatus ||
        status === filterStatus.trim().toUpperCase().replaceAll(' ', '_');
      return matchesTab && matchesSearch && matchesStatus;
    });
  }, [templates, activeTab, search, filterStatus]);

  const stats = useMemo(() => {
    const active = templates.filter((t) => {
      const s = templateStatus(t);
      return s === 'ACTIVE';
    }).length;
    const underReview = templates.filter((t) => templateStatus(t) === 'UNDER_REVIEW').length;
    const draft = templates.filter((t) => {
      const s = templateStatus(t);
      return s === 'DRAFT';
    }).length;
    const archived = templates.filter((t) => {
      const s = templateStatus(t);
      return s === 'ARCHIVED';
    }).length;
    return { total: templates.length, active, underReview, draft, archived };
  }, [templates]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / LIMIT));
  const paginated = filtered.slice((page - 1) * LIMIT, page * LIMIT);

  const handleArchive = async (id: string) => {
    const template = templates.find((item) => item.id === id);
    if (!await dialog.confirm(`Archive “${template?.name || 'this template'}”? Existing documents will keep their template reference.`, {
      title: 'Archive template',
      confirmLabel: 'Archive',
      tone: 'danger',
    })) return;
    setOpenMenuId(null);
    try {
      await api.deleteTemplate(id);
      setTemplates((prev) => prev.map((t) => t.id === id ? { ...t, status: 'ARCHIVED', isActive: false } : t));
    } catch (err) {
      await dialog.alert(err instanceof Error ? err.message : 'Delete failed', { title: 'Archive failed' });
    }
  };

  const handleExport = () => {
    const safeCell = (value: unknown) => {
      let text = String(value ?? '');
      if (/^[=+\-@]/.test(text)) text = `'${text}`;
      return `"${text.replaceAll('"', '""')}"`;
    };
    const rows = [
      ['Name', 'Category', 'Department', 'Version', 'Status', 'Updated'],
      ...filtered.map((template) => [
        template.name,
        template.category,
        template.department?.name ?? 'Global',
        template.version ?? '1.0',
        templateStatus(template),
        template.updatedAt ?? '',
      ]),
    ];
    const blob = new Blob([`\uFEFF${rows.map((row) => row.map(safeCell).join(',')).join('\r\n')}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'templates.csv';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const tabs = CATEGORY_TABS.map((tab) => ({
    id: tab.id,
    label: tab.label,
    count:
      tab.id === 'ALL'
        ? templates.length
        : templates.filter((t) => t.category === tab.id).length,
  }));

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-hoterra-page">
      <Header
        title="Templates"
        subtitle="Create and manage document templates for your organization"
        action={canManage ? (
          <Link to="/templates/new/edit" className="btn-primary">
            <Plus className="h-4 w-4" />
            New Template
          </Link>
        ) : undefined}
      />

      <div className="page-stats page-stats--tabs">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <DashStatCard label="Total Templates" value={stats.total} icon={LayoutTemplate} iconColor="text-blue-600" iconBg="bg-blue-50" />
          <DashStatCard label="Active" value={stats.active} icon={CheckCircle} iconColor="text-green-600" iconBg="bg-green-50" />
          <DashStatCard label="Under Review" value={stats.underReview} icon={Clock} iconColor="text-orange-600" iconBg="bg-orange-50" />
          <DashStatCard label="Draft" value={stats.draft} icon={FileEdit} iconColor="text-gray-600" iconBg="bg-gray-100" />
          <DashStatCard label="Archived" value={stats.archived} icon={Archive} iconColor="text-slate-600" iconBg="bg-slate-100" />
        </div>
      </div>

      <PageTabs
        tabs={tabs}
        active={activeTab}
        onChange={(id) => {
          setActiveTab(id as DocumentCategory | 'ALL');
          setPage(1);
        }}
      />

      <div className="border-b border-gray-200 bg-white px-6 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[280px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              placeholder="Search templates by name or department..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-lg border border-gray-200 py-2.5 pl-10 pr-4 text-sm focus:border-hoterra-steel focus:outline-none focus:ring-1 focus:ring-hoterra-steel"
            />
          </div>
          <select value={filterStatus} onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }} className="filter-select">
            <option value="">All Status</option>
            <option value="Active">Active</option>
            <option value="Draft">Draft</option>
            <option value="Under Review">Under Review</option>
            <option value="Archived">Archived</option>
          </select>
          <button type="button" onClick={handleExport} className="btn-secondary py-2.5">
            <Download className="h-4 w-4" />
            Export
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-white">
        <table className="w-full min-w-[1100px] text-sm">
          <thead className="sticky top-0 bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-3">Template Name</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Department</th>
              <th className="px-4 py-3">Version</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Last Updated</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {loading ? (
              <tr>
                <td colSpan={7} className="px-6 py-12 text-center text-gray-500">Loading templates...</td>
              </tr>
            ) : paginated.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-12 text-center text-gray-500">No templates found</td>
              </tr>
            ) : (
              paginated.map((t) => {
                const status = templateStatus(t);
                const canManageItem = canManage && (canManageAll || (!!currentUser?.department?.id && t.departmentId === currentUser.department.id));
                return (
                  <tr key={t.id} className="hover:bg-gray-50/80">
                    <td className="px-4 py-3">
                      {canManageItem ? (
                        <Link to={`/templates/${t.id}/edit`} className="font-medium text-hoterra-navy hover:text-hoterra-steel">{t.name}</Link>
                      ) : <span className="font-medium text-hoterra-navy">{t.name}</span>}
                      {t.description && (
                        <p className="mt-0.5 line-clamp-1 text-xs text-gray-400">{t.description}</p>
                      )}
                    </td>
                    <td className="px-4 py-3"><CategoryBadge category={t.category} /></td>
                    <td className="px-4 py-3">
                      {t.department ? (
                        <DepartmentBadge name={t.department.name} color={t.department.color} />
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-700">{t.version ?? '1.0'}</td>
                    <td className="px-4 py-3">
                      <span className={cn('inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium', STATUS_STYLE[status] || STATUS_STYLE.Draft)}>
                        {STATUS_LABEL[status] ?? status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{formatDate(t.updatedAt)}</td>
                    <td className="px-4 py-3">
                      {canManageItem ? <div className="relative flex items-center gap-1">
                        <Link to={`/templates/${t.id}/edit`} className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-hoterra-steel" title="Edit template">
                          <Pencil className="h-4 w-4" />
                        </Link>
                        <button onClick={() => setOpenMenuId(openMenuId === t.id ? null : t.id)} className="rounded p-1.5 text-gray-400 hover:bg-gray-100">
                          <MoreHorizontal className="h-4 w-4" />
                        </button>
                        {openMenuId === t.id && (
                          <div className="absolute right-0 top-full z-20 mt-1 w-36 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
                            <Link to={`/templates/${t.id}/edit`} className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50" onClick={() => setOpenMenuId(null)}>Export / Edit</Link>
                            {status !== 'ARCHIVED' && <button onClick={() => handleArchive(t.id)} className="block w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-gray-50">Archive</button>}
                          </div>
                        )}
                      </div> : <span className="text-xs text-gray-400">View only</span>}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <Pagination page={page} totalPages={totalPages} total={filtered.length} limit={LIMIT} onPageChange={setPage} label="templates" />
    </div>
  );
}
