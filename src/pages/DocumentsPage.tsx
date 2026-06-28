import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Eye,
  MoreHorizontal,
  Filter,
  Download,
  Search,
  ChevronDown,
  Settings2,
  LayoutList,
  LayoutGrid,
  Archive,
  Printer,
  Plus,
} from 'lucide-react';
import {
  Header,
  StatusBadge,
  DepartmentBadge,
} from '@/components/layout/Sidebar';
import { Pagination } from '@/components/ui/Pagination';
import { CategoryBadge, FileTypeIcon } from '@/components/ui/Badges';
import { api } from '@/lib/api';
import type { Department, Document, DocumentCategory, DocumentStatus, User } from '@/types';
import { CATEGORY_LABELS, STATUS_LABELS } from '@/types';
import { formatDate, getInitials } from '@/lib/utils';
import { cn } from '@/lib/utils';

const STATUS_TABS: (DocumentStatus | 'ALL')[] = [
  'ALL',
  'DRAFT',
  'IN_REVIEW',
  'SIGNED_HOD',
  'SIGNED_FINANCE',
  'SIGNED_GM',
  'PUBLISHED',
  'ARCHIVED',
];

const LIMIT = 10;

export function DocumentsPage() {
  const navigate = useNavigate();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [activeTab, setActiveTab] = useState<DocumentStatus | 'ALL'>('ALL');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [tabCounts, setTabCounts] = useState<Record<string, number>>({});
  const [exporting, setExporting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filterDept, setFilterDept] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterAuthor, setFilterAuthor] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [showCreateMenu, setShowCreateMenu] = useState(false);
  const createMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.getDepartments().then(setDepartments).catch(console.error);
    api.getUsers().then(setUsers).catch(console.error);
  }, []);

  useEffect(() => {
    setLoading(true);
    const params: Record<string, string> = { limit: String(LIMIT), page: String(page) };
    const status = filterStatus || (activeTab !== 'ALL' ? activeTab : '');
    if (status) params.status = status;
    if (search) params.search = search;
    if (filterDept) params.departmentId = filterDept;
    if (filterCategory) params.category = filterCategory;
    if (filterAuthor) params.authorId = filterAuthor;

    api
      .getDocuments(params)
      .then((res) => {
        setDocuments(res.data);
        setTotal(res.pagination.total);
        setTotalPages(res.pagination.totalPages);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [activeTab, search, page, filterDept, filterCategory, filterAuthor, filterStatus]);

  useEffect(() => {
    api.getDashboardStats().then((s) => {
      const counts: Record<string, number> = { ALL: s.byStatus.reduce((a, b) => a + b.count, 0) };
      for (const item of s.byStatus) counts[item.status] = item.count;
      setTabCounts(counts);
    }).catch(console.error);
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (createMenuRef.current && !createMenuRef.current.contains(e.target as Node)) {
        setShowCreateMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleExport = async () => {
    setExporting(true);
    try {
      const params: Record<string, string> = {};
      if (activeTab !== 'ALL') params.status = activeTab;
      if (search) params.search = search;
      await api.exportDocuments(params);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === documents.length) setSelected(new Set());
    else setSelected(new Set(documents.map((d) => d.id)));
  };

  const handleBulkArchive = async () => {
    if (selected.size === 0) return alert('Select documents first');
    if (!confirm(`Archive ${selected.size} document(s)?`)) return;
    try {
      await api.bulkArchiveDocuments([...selected]);
      setSelected(new Set());
      setPage(1);
      const params: Record<string, string> = { limit: String(LIMIT), page: '1' };
      if (activeTab !== 'ALL') params.status = activeTab;
      const res = await api.getDocuments(params);
      setDocuments(res.data);
      setTotal(res.pagination.total);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Bulk archive failed');
    }
  };

  const handleArchiveOne = async (id: string) => {
    setOpenMenuId(null);
    try {
      await api.archiveDocument(id);
      setDocuments((prev) => prev.filter((d) => d.id !== id));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Archive failed');
    }
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-hoterra-page">
      <Header
        title="Documents"
        subtitle="View, manage and control all hotel documents"
        action={
          <div className="flex items-center gap-2">
            {selected.size > 0 && (
              <button onClick={handleBulkArchive} className="btn-secondary py-2.5">
                <Archive className="h-4 w-4" />
                Archive ({selected.size})
              </button>
            )}
            <button onClick={handleExport} disabled={exporting} className="btn-secondary py-2.5 disabled:opacity-50">
              <Download className="h-4 w-4" />
              {exporting ? 'Exporting...' : 'Export'}
            </button>
            <div className="relative" ref={createMenuRef}>
              <div className="flex">
                <Link to="/documents/create" className="btn-primary rounded-r-none">
                  <Plus className="h-4 w-4" />
                  Create Document
                </Link>
                <button onClick={() => setShowCreateMenu(!showCreateMenu)} className="btn-primary rounded-l-none border-l border-white/20 px-3">
                  <ChevronDown className="h-4 w-4" />
                </button>
              </div>
              {showCreateMenu && (
                <div className="absolute right-0 top-full z-20 mt-1 w-48 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
                  <Link to="/documents/create" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50" onClick={() => setShowCreateMenu(false)}>
                    New Blank Document
                  </Link>
                  <Link to="/templates" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50" onClick={() => setShowCreateMenu(false)}>
                    From Template
                  </Link>
                </div>
              )}
            </div>
          </div>
        }
      />

      <div className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="relative mb-4 max-w-2xl">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            placeholder="Search documents..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="w-full rounded-lg border border-gray-200 py-2.5 pl-10 pr-20 text-sm focus:border-hoterra-steel focus:outline-none focus:ring-1 focus:ring-hoterra-steel"
          />
        </div>

        <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-5">
          <div>
            <label className="mb-1 block text-[10px] font-medium uppercase text-gray-400">Department</label>
            <select value={filterDept} onChange={(e) => { setFilterDept(e.target.value); setPage(1); }} className="filter-select w-full">
              <option value="">All Departments</option>
              {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-medium uppercase text-gray-400">Category</label>
            <select value={filterCategory} onChange={(e) => { setFilterCategory(e.target.value); setPage(1); }} className="filter-select w-full">
              <option value="">All Categories</option>
              {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-medium uppercase text-gray-400">Status</label>
            <select value={filterStatus} onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }} className="filter-select w-full">
              <option value="">All Statuses</option>
              {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-medium uppercase text-gray-400">Author</label>
            <select value={filterAuthor} onChange={(e) => { setFilterAuthor(e.target.value); setPage(1); }} className="filter-select w-full">
              <option value="">All Authors</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>)}
            </select>
          </div>
          <div className="flex items-end">
            <button
              onClick={() => { setFilterDept(''); setFilterCategory(''); setFilterAuthor(''); setFilterStatus(''); setPage(1); }}
              className="btn-secondary w-full py-2 text-xs"
            >
              <Filter className="h-3.5 w-3.5" />
              Clear Filters
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-4 border-b border-gray-100">
          {STATUS_TABS.map((tab) => {
            const count = tab === 'ALL' ? tabCounts.ALL : tabCounts[tab];
            const label = tab === 'ALL' ? 'All Documents' : STATUS_LABELS[tab];
            return (
              <button
                key={tab}
                onClick={() => { setActiveTab(tab); setFilterStatus(''); setPage(1); }}
                className={cn(
                  'flex items-center gap-2 border-b-2 pb-3 text-sm transition-colors',
                  activeTab === tab && !filterStatus
                    ? 'border-hoterra-gold font-medium text-hoterra-navy'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                )}
              >
                {label}
                {count !== undefined && (
                  <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">{count}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-2 text-sm text-gray-500">
        <span>{total} documents</span>
        <div className="flex items-center gap-2">
          <button className="rounded p-1.5 text-hoterra-steel hover:bg-gray-100"><LayoutList className="h-4 w-4" /></button>
          <button className="rounded p-1.5 text-gray-400 hover:bg-gray-100"><LayoutGrid className="h-4 w-4" /></button>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <table className="w-full min-w-[1100px] text-sm">
          <thead className="sticky top-0 bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-6 py-3">
                <input type="checkbox" className="rounded" checked={documents.length > 0 && selected.size === documents.length} onChange={toggleSelectAll} />
              </th>
              <th className="px-4 py-3">Document Title</th>
              <th className="px-4 py-3">Document Code</th>
              <th className="px-4 py-3">Department</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Version</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Next Review</th>
              <th className="px-4 py-3">Author</th>
              <th className="px-4 py-3">Updated</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {loading ? (
              <tr><td colSpan={11} className="px-6 py-12 text-center text-gray-500">Loading documents...</td></tr>
            ) : documents.length === 0 ? (
              <tr><td colSpan={11} className="px-6 py-12 text-center text-gray-500">No documents found</td></tr>
            ) : (
              documents.map((doc) => (
                <tr key={doc.id} className="hover:bg-gray-50/80">
                  <td className="px-6 py-3">
                    <input type="checkbox" className="rounded" checked={selected.has(doc.id)} onChange={() => toggleSelect(doc.id)} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <FileTypeIcon category={doc.category} />
                      <Link to={`/documents/${doc.id}`} className="font-medium text-hoterra-navy hover:text-hoterra-steel">{doc.title}</Link>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-600">{doc.code}</td>
                  <td className="px-4 py-3"><DepartmentBadge name={doc.department.name} color={doc.department.color} /></td>
                  <td className="px-4 py-3"><CategoryBadge category={doc.category} /></td>
                  <td className="px-4 py-3 text-gray-700">{doc.version}</td>
                  <td className="px-4 py-3"><StatusBadge status={doc.status} /></td>
                  <td className="px-4 py-3 text-sm font-medium text-orange-600">{formatDate(doc.nextReviewDate)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-hoterra-steel text-[10px] font-semibold text-white">
                        {getInitials(doc.author.firstName, doc.author.lastName)}
                      </div>
                      <span className="text-gray-700">{doc.author.firstName} {doc.author.lastName}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{formatDate(doc.updatedAt)}</td>
                  <td className="px-4 py-3">
                    <div className="relative flex items-center gap-1">
                      <Link to={`/documents/${doc.id}`} className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-hoterra-steel">
                        <Eye className="h-4 w-4" />
                      </Link>
                      <button onClick={() => setOpenMenuId(openMenuId === doc.id ? null : doc.id)} className="rounded p-1.5 text-gray-400 hover:bg-gray-100">
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                      {openMenuId === doc.id && (
                        <div className="absolute right-0 top-full z-20 mt-1 w-40 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
                          <button onClick={() => handleArchiveOne(doc.id)} className="flex w-full items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                            <Archive className="h-4 w-4" /> Archive
                          </button>
                          <button onClick={() => { setOpenMenuId(null); navigate(`/documents/${doc.id}`); window.print(); }} className="flex w-full items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                            <Printer className="h-4 w-4" /> Export
                          </button>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Pagination page={page} totalPages={totalPages} total={total} limit={LIMIT} onPageChange={setPage} label="documents" />
    </div>
  );
}
