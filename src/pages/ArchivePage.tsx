import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Archive,
  FileText,
  HardDrive,
  Clock,
  LayoutTemplate,
  Search,
  Filter,
  RotateCcw,
  Trash2,
  Download,
} from 'lucide-react';
import { Header } from '@/components/layout/Sidebar';
import { DashStatCard } from '@/components/ui/DashStatCard';
import { Pagination } from '@/components/ui/Pagination';
import { api } from '@/lib/api';
import type { Document } from '@/types';
import { formatDate } from '@/lib/utils';

const MODULES = ['ALL', 'Documents', 'Templates', 'Reports'];
const LIMIT = 20;

function formatFileSize(bytes?: number | null): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ArchivePage() {
  const [items, setItems] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [moduleFilter, setModuleFilter] = useState('ALL');
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);

  const loadItems = useCallback(() => {
    setLoading(true);
    api
      .getDocuments({ status: 'ARCHIVED', limit: '200' })
      .then((res) => setItems(res.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  const visible = useMemo(() => {
    const q = search.toLowerCase();
    return items.filter((doc) => {
      const matchesModule = moduleFilter === 'ALL' || moduleFilter === 'Documents';
      const archivedBy = doc.archivedBy ?? '';
      const matchesSearch =
        !q ||
        doc.title.toLowerCase().includes(q) ||
        doc.code.toLowerCase().includes(q) ||
        archivedBy.toLowerCase().includes(q);
      return matchesModule && matchesSearch;
    });
  }, [items, search, moduleFilter]);

  const stats = useMemo(() => {
    const docs = items.length;
    const totalBytes = items.reduce((s, d) => s + (d.fileSize ?? 0), 0);
    const totalSize = totalBytes / (1024 * 1024 * 1024);
    const thisMonth = items.filter((d) => {
      if (!d.archivedAt) return false;
      const date = new Date(d.archivedAt);
      const now = new Date();
      return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
    }).length;
    return { total: items.length, docs, templates: 0, totalSize: totalSize.toFixed(2), thisMonth };
  }, [items]);

  const totalPages = Math.max(1, Math.ceil(visible.length / LIMIT));
  const paginated = visible.slice((page - 1) * LIMIT, page * LIMIT);

  const handleRestore = async (id: string) => {
    try {
      await api.restoreDocument(id);
      setItems((prev) => prev.filter((i) => i.id !== id));
      alert('Item restored successfully');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to restore item');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Permanently delete this archived document?')) return;
    try {
      await api.deleteDocument(id);
      setItems((prev) => prev.filter((i) => i.id !== id));
      alert('Document deleted');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete item');
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      await api.exportDocuments({ status: 'ARCHIVED' });
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-hoterra-page">
      <Header
        title="Archive"
        subtitle="Browse and restore archived documents, templates and reports"
        action={
          <button onClick={handleExport} disabled={exporting} className="btn-secondary disabled:opacity-50">
            <Download className="h-4 w-4" />
            {exporting ? 'Exporting...' : 'Export Archive'}
          </button>
        }
      />

      <div className="page-stats">
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <DashStatCard label="Archived Items" value={stats.total} icon={Archive} iconColor="text-blue-600" iconBg="bg-blue-50" />
          <DashStatCard label="Documents" value={stats.docs} icon={FileText} iconColor="text-purple-600" iconBg="bg-purple-50" />
          <DashStatCard label="Templates" value={stats.templates} icon={LayoutTemplate} iconColor="text-orange-600" iconBg="bg-orange-50" />
          <DashStatCard label="Storage Used" value={`${stats.totalSize} GB`} icon={HardDrive} iconColor="text-gray-600" iconBg="bg-gray-100" />
          <DashStatCard label="Archived This Month" value={stats.thisMonth} icon={Clock} iconColor="text-orange-600" iconBg="bg-orange-50" />
        </div>
      </div>

      <div className="border-b border-gray-200 bg-white px-6 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[280px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              placeholder="Search archived items by name, code or archived by..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-lg border border-gray-200 py-2.5 pl-10 pr-4 text-sm focus:border-hoterra-steel focus:outline-none focus:ring-1 focus:ring-hoterra-steel"
            />
          </div>
          <select
            value={moduleFilter}
            onChange={(e) => {
              setModuleFilter(e.target.value);
              setPage(1);
            }}
            className="filter-select"
          >
            {MODULES.map((m) => (
              <option key={m} value={m}>{m === 'ALL' ? 'All Modules' : m}</option>
            ))}
          </select>
          <button className="btn-secondary py-2.5">
            <Filter className="h-4 w-4" />
            Filter
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-white">
        <table className="w-full min-w-[1100px] text-sm">
          <thead className="sticky top-0 bg-gray-50 text-left text-xs font-medium uppercase text-gray-500">
            <tr>
              <th className="px-6 py-3">
                <input type="checkbox" />
              </th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Code</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Module</th>
              <th className="px-4 py-3">Archived By</th>
              <th className="px-4 py-3">Archived Date</th>
              <th className="px-4 py-3">Reason</th>
              <th className="px-4 py-3">Size</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {loading ? (
              <tr>
                <td colSpan={10} className="px-6 py-12 text-center text-gray-500">
                  Loading archive...
                </td>
              </tr>
            ) : paginated.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-6 py-12 text-center text-gray-500">
                  No archived items found
                </td>
              </tr>
            ) : (
              paginated.map((doc) => (
                <tr key={doc.id} className="hover:bg-gray-50">
                  <td className="px-6 py-3">
                    <input type="checkbox" />
                  </td>
                  <td className="px-4 py-3 font-medium text-hoterra-navy">{doc.title}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">{doc.code}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-md bg-gray-100 px-2 py-0.5 text-xs">Document</span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">Documents</td>
                  <td className="px-4 py-3 text-gray-700">{doc.archivedBy ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-500">{formatDate(doc.archivedAt)}</td>
                  <td className="max-w-[180px] truncate px-4 py-3 text-gray-500" title={doc.archiveReason ?? ''}>
                    {doc.archiveReason ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-500">{formatFileSize(doc.fileSize)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleRestore(doc.id)}
                        className="btn-secondary border-green-200 bg-green-50 py-1.5 text-xs text-green-700 hover:bg-green-100"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        Restore
                      </button>
                      <button
                        onClick={() => handleDelete(doc.id)}
                        className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500"
                      >
                        <Trash2 className="h-4 w-4" />
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
        total={visible.length}
        limit={LIMIT}
        onPageChange={setPage}
        label="items"
      />
    </div>
  );
}
