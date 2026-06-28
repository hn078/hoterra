import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  LayoutTemplate,
  CheckCircle,
  Clock,
  FileEdit,
  Plus,
  Search,
  Filter,
  Download,
  MoreHorizontal,
  Pencil,
} from 'lucide-react';
import { Header, DepartmentBadge } from '@/components/layout/Sidebar';
import { StatCard } from '@/components/ui/StatCard';
import { PageTabs } from '@/components/ui/PageTabs';
import { Pagination } from '@/components/ui/Pagination';
import { api } from '@/lib/api';
import type { DocumentCategory, Template } from '@/types';
import { CATEGORY_LABELS } from '@/types';
import { enrichTemplate } from '@/data/mock';
import { formatDate } from '@/lib/utils';
import { cn } from '@/lib/utils';

type EnrichedTemplate = ReturnType<typeof enrichTemplate>;

const CATEGORY_TABS: { id: DocumentCategory | 'ALL'; label: string }[] = [
  { id: 'ALL', label: 'All Templates' },
  { id: 'SOP', label: 'SOP' },
  { id: 'POLICIES', label: 'Policies' },
  { id: 'FORMS', label: 'Forms' },
  { id: 'CHECKLISTS', label: 'Checklists' },
  { id: 'CONTRACTS', label: 'Contracts' },
  { id: 'TEMPLATES', label: 'Templates' },
];

const STATUS_STYLE: Record<string, string> = {
  Active: 'bg-green-100 text-green-700 border-green-300',
  'Under Review': 'bg-orange-100 text-orange-700 border-orange-300',
  Draft: 'bg-gray-100 text-gray-600 border-gray-300',
};

const LIMIT = 20;

export function TemplatesPage() {
  const [templates, setTemplates] = useState<EnrichedTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<DocumentCategory | 'ALL'>('ALL');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    setLoading(true);
    api
      .getTemplates()
      .then((data: Template[]) => {
        setTemplates(data.map((t, i) => enrichTemplate(t, i)));
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    return templates.filter((t) => {
      const matchesTab = activeTab === 'ALL' || t.category === activeTab;
      const q = search.toLowerCase();
      const matchesSearch =
        !q ||
        t.name.toLowerCase().includes(q) ||
        t.department.toLowerCase().includes(q) ||
        t.updatedBy.toLowerCase().includes(q);
      return matchesTab && matchesSearch;
    });
  }, [templates, activeTab, search]);

  const stats = useMemo(() => {
    const active = templates.filter((t) => t.status === 'Active').length;
    const underReview = templates.filter((t) => t.status === 'Under Review').length;
    const draft = templates.filter((t) => t.status === 'Draft').length;
    return { total: templates.length, active, underReview, draft };
  }, [templates]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / LIMIT));
  const paginated = filtered.slice((page - 1) * LIMIT, page * LIMIT);

  const tabs = CATEGORY_TABS.map((tab) => ({
    id: tab.id,
    label: tab.label,
    count:
      tab.id === 'ALL'
        ? templates.length
        : templates.filter((t) => t.category === tab.id).length,
  }));

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <Header
        title="Document Templates"
        subtitle="Manage reusable templates for hotel documents and forms"
        action={
          <Link
            to="/templates/create"
            className="inline-flex items-center gap-2 rounded-lg bg-hoterra-navy px-4 py-2 text-sm font-medium text-white hover:bg-hoterra-steel"
          >
            <Plus className="h-4 w-4" />
            New Template
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-4 border-b border-gray-200 bg-gray-50 px-6 py-4 lg:grid-cols-4">
        <StatCard label="Total Templates" value={stats.total} icon={LayoutTemplate} color="blue" />
        <StatCard label="Active" value={stats.active} icon={CheckCircle} color="green" />
        <StatCard label="Under Review" value={stats.underReview} icon={Clock} color="orange" />
        <StatCard label="Draft" value={stats.draft} icon={FileEdit} color="gray" />
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
              placeholder="Search templates by name, department or author..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-lg border border-gray-200 py-2 pl-10 pr-4 text-sm focus:border-hoterra-steel focus:outline-none"
            />
          </div>
          <button className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm hover:bg-gray-50">
            <Filter className="h-4 w-4" />
            Filter
          </button>
          <button className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm hover:bg-gray-50">
            <Download className="h-4 w-4" />
            Export
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <table className="w-full min-w-[1100px] text-sm">
          <thead className="sticky top-0 bg-gray-50 text-left text-xs font-medium uppercase text-gray-500">
            <tr>
              <th className="px-6 py-3">
                <input type="checkbox" />
              </th>
              <th className="px-4 py-3">Template Name</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Department</th>
              <th className="px-4 py-3">Version</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Updated By</th>
              <th className="px-4 py-3">Last Updated</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {loading ? (
              <tr>
                <td colSpan={10} className="px-6 py-12 text-center text-gray-500">
                  Loading templates...
                </td>
              </tr>
            ) : paginated.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-6 py-12 text-center text-gray-500">
                  No templates found
                </td>
              </tr>
            ) : (
              paginated.map((t) => (
                <tr key={t.id} className="hover:bg-gray-50">
                  <td className="px-6 py-3">
                    <input type="checkbox" />
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      to={`/templates/${t.id}/edit`}
                      className="font-medium text-hoterra-navy hover:text-hoterra-steel"
                    >
                      {t.name}
                    </Link>
                    {t.description && (
                      <p className="mt-0.5 text-xs text-gray-400 line-clamp-1">{t.description}</p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-md bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
                      {t.type}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs">
                      {CATEGORY_LABELS[t.category]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <DepartmentBadge name={t.department} />
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{t.version}</td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        'inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium',
                        STATUS_STYLE[t.status] || STATUS_STYLE.Draft
                      )}
                    >
                      {t.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-700">{t.updatedBy}</td>
                  <td className="px-4 py-3 text-gray-500">{formatDate(t.updatedAt)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <Link
                        to={`/templates/${t.id}/edit`}
                        className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-hoterra-steel"
                        title="Edit template"
                      >
                        <Pencil className="h-4 w-4" />
                      </Link>
                      <button className="rounded p-1.5 text-gray-400 hover:bg-gray-100">
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                    </div>
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
        total={filtered.length}
        limit={LIMIT}
        onPageChange={setPage}
        label="templates"
      />
    </div>
  );
}
