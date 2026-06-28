import { useEffect, useMemo, useState } from 'react';
import {
  Archive,
  FileText,
  HardDrive,
  Clock,
  Search,
  Filter,
  RotateCcw,
  Trash2,
  Download,
} from 'lucide-react';
import { Header } from '@/components/layout/Sidebar';
import { StatCard } from '@/components/ui/StatCard';
import { Pagination } from '@/components/ui/Pagination';
import { api } from '@/lib/api';
import { buildArchiveItems, type ArchiveItem } from '@/data/mock';
import { formatDate } from '@/lib/utils';

const DEMO_ARCHIVE_EXTRAS: ArchiveItem[] = [
  {
    id: 'demo-1',
    name: 'Legacy Guest Registration Form',
    code: 'FO-FRM-099',
    type: 'Document',
    module: 'Documents',
    archivedBy: 'Nigar Rustamova',
    archivedAt: '2024-11-15T10:30:00Z',
    reason: 'Replaced by new digital form',
    size: '1.2 MB',
  },
  {
    id: 'demo-2',
    name: '2019 Fire Safety Manual',
    code: 'SC-POL-012',
    type: 'Document',
    module: 'Documents',
    archivedBy: 'Fuad Ahmadov',
    archivedAt: '2024-09-20T14:00:00Z',
    reason: 'Superseded by 2024 edition',
    size: '4.8 MB',
  },
  {
    id: 'demo-3',
    name: 'Old Vendor Contract Template',
    code: 'PR-CON-003',
    type: 'Template',
    module: 'Templates',
    archivedBy: 'Elnur Mahmudov',
    archivedAt: '2024-08-05T09:15:00Z',
    reason: 'Legal review required update',
    size: '856 KB',
  },
  {
    id: 'demo-4',
    name: 'Q1 2024 Budget Report',
    code: 'FI-RPT-001',
    type: 'Report',
    module: 'Reports',
    archivedBy: 'Elnur Mahmudov',
    archivedAt: '2024-04-30T16:45:00Z',
    reason: 'Reporting period closed',
    size: '3.1 MB',
  },
];

const MODULES = ['ALL', 'Documents', 'Templates', 'Reports'];
const LIMIT = 20;

export function ArchivePage() {
  const [items, setItems] = useState<ArchiveItem[]>([]);
  const [restored, setRestored] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [moduleFilter, setModuleFilter] = useState('ALL');
  const [page, setPage] = useState(1);

  useEffect(() => {
    setLoading(true);
    api
      .getDocuments({ status: 'ARCHIVED', limit: '50' })
      .then((res) => {
        const fromApi = buildArchiveItems(res.data);
        const merged = [...fromApi];
        for (const extra of DEMO_ARCHIVE_EXTRAS) {
          if (!merged.some((i) => i.code === extra.code)) {
            merged.push(extra);
          }
        }
        setItems(merged);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const visible = useMemo(() => {
    const q = search.toLowerCase();
    return items.filter((item) => {
      if (restored.has(item.id)) return false;
      const matchesModule = moduleFilter === 'ALL' || item.module === moduleFilter;
      const matchesSearch =
        !q ||
        item.name.toLowerCase().includes(q) ||
        item.code.toLowerCase().includes(q) ||
        item.archivedBy.toLowerCase().includes(q);
      return matchesModule && matchesSearch;
    });
  }, [items, search, moduleFilter, restored]);

  const stats = useMemo(() => {
    const active = items.filter((i) => !restored.has(i.id));
    const docs = active.filter((i) => i.module === 'Documents').length;
    const totalSize = active.length * 2.4;
    const thisMonth = active.filter((i) => {
      const d = new Date(i.archivedAt);
      const now = new Date();
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }).length;
    return { total: active.length, docs, totalSize: totalSize.toFixed(1), thisMonth };
  }, [items, restored]);

  const totalPages = Math.max(1, Math.ceil(visible.length / LIMIT));
  const paginated = visible.slice((page - 1) * LIMIT, page * LIMIT);

  const handleRestore = (id: string) => {
    setRestored((prev) => new Set(prev).add(id));
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <Header
        title="Archive"
        subtitle="Browse and restore archived documents, templates and reports"
        action={
          <button className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium hover:bg-gray-50">
            <Download className="h-4 w-4" />
            Export Archive
          </button>
        }
      />

      <div className="grid grid-cols-2 gap-4 border-b border-gray-200 bg-gray-50 px-6 py-4 lg:grid-cols-4">
        <StatCard label="Archived Items" value={stats.total} icon={Archive} color="blue" />
        <StatCard label="Documents" value={stats.docs} icon={FileText} color="purple" />
        <StatCard label="Storage Used" value={`${stats.totalSize} GB`} icon={HardDrive} color="gray" />
        <StatCard label="Archived This Month" value={stats.thisMonth} icon={Clock} color="orange" />
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
              className="w-full rounded-lg border border-gray-200 py-2 pl-10 pr-4 text-sm focus:border-hoterra-steel focus:outline-none"
            />
          </div>
          <select
            value={moduleFilter}
            onChange={(e) => {
              setModuleFilter(e.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
          >
            {MODULES.map((m) => (
              <option key={m} value={m}>
                {m === 'ALL' ? 'All Modules' : m}
              </option>
            ))}
          </select>
          <button className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm hover:bg-gray-50">
            <Filter className="h-4 w-4" />
            Filter
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
              paginated.map((item) => (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="px-6 py-3">
                    <input type="checkbox" />
                  </td>
                  <td className="px-4 py-3 font-medium text-hoterra-navy">{item.name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">{item.code}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-md bg-gray-100 px-2 py-0.5 text-xs">{item.type}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{item.module}</td>
                  <td className="px-4 py-3 text-gray-700">{item.archivedBy}</td>
                  <td className="px-4 py-3 text-gray-500">{formatDate(item.archivedAt)}</td>
                  <td className="max-w-[180px] truncate px-4 py-3 text-gray-500" title={item.reason}>
                    {item.reason}
                  </td>
                  <td className="px-4 py-3 text-gray-500">{item.size ?? '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleRestore(item.id)}
                        className="inline-flex items-center gap-1 rounded-lg border border-green-200 bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700 hover:bg-green-100"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        Restore
                      </button>
                      <button className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500">
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
