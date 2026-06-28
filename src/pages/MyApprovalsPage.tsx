import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Clock, CheckCircle, XCircle, RotateCcw, History, MoreHorizontal, Search,
} from 'lucide-react';
import { Header, DepartmentBadge, StatusBadge } from '@/components/layout/Sidebar';
import { DashStatCard } from '@/components/ui/DashStatCard';
import { CategoryBadge } from '@/components/ui/Badges';
import { PageTabs } from '@/components/ui/PageTabs';
import { Pagination } from '@/components/ui/Pagination';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { api } from '@/lib/api';
import type { Document, DocumentPriority, Department } from '@/types';
import { formatDate } from '@/lib/utils';

const PRIORITY_STYLE: Record<DocumentPriority, string> = {
  HIGH: 'text-red-600 bg-red-50',
  MEDIUM: 'text-yellow-700 bg-yellow-50',
  LOW: 'text-green-600 bg-green-50',
};

const TABS = [
  { id: 'pending', label: 'Pending Approval' },
  { id: 'approved', label: 'Approved' },
  { id: 'rejected', label: 'Rejected' },
  { id: 'returned', label: 'Returned' },
  { id: 'completed', label: 'All Completed' },
];

export function MyApprovalsPage() {
  const [tab, setTab] = useState('pending');
  const [docs, setDocs] = useState<Document[]>([]);
  const [counts, setCounts] = useState({ pending: 0, approved: 0, rejected: 0, returned: 0, completed: 0 });
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [filterDept, setFilterDept] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [departments, setDepartments] = useState<Department[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showBulkMenu, setShowBulkMenu] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);

  useEffect(() => {
    api.getDepartments().then(setDepartments).catch(console.error);
  }, []);

  useEffect(() => {
    api.getApprovals(tab, page).then((res) => {
      setDocs(res.data);
      setCounts(res.counts);
      setTotal(res.pagination.total);
      setTotalPages(res.pagination.totalPages);
    }).catch(console.error);
  }, [tab, page]);

  const filtered = useMemo(() => {
    return docs.filter((d) => {
      const q = search.toLowerCase();
      const matchesSearch =
        !q ||
        d.title.toLowerCase().includes(q) ||
        d.code.toLowerCase().includes(q) ||
        `${d.author.firstName} ${d.author.lastName}`.toLowerCase().includes(q);
      const matchesDept = !filterDept || d.departmentId === filterDept;
      const matchesPriority = !filterPriority || (d.priority ?? 'MEDIUM') === filterPriority;
      return matchesSearch && matchesDept && matchesPriority;
    });
  }, [docs, search, filterDept, filterPriority]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBulkArchive = async () => {
    if (selected.size === 0) return alert('Select documents first');
    setBulkLoading(true);
    try {
      await api.bulkArchiveDocuments([...selected]);
      setSelected(new Set());
      const res = await api.getApprovals(tab, page);
      setDocs(res.data);
      setCounts(res.counts);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Bulk archive failed');
    } finally {
      setBulkLoading(false);
      setShowBulkMenu(false);
    }
  };

  const handleBulkApprove = async () => {
    const first = [...selected][0];
    if (!first) return alert('Select a document first');
    setBulkLoading(true);
    try {
      await api.approveDocument(first, 'approve');
      setSelected(new Set());
      const res = await api.getApprovals(tab, page);
      setDocs(res.data);
      setCounts(res.counts);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Approve failed');
    } finally {
      setBulkLoading(false);
      setShowBulkMenu(false);
    }
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-hoterra-page">
      <Header title="My Approvals" subtitle="Review and take action on documents requiring your approval" />

      <div className="page-stats">
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <DashStatCard label="Pending Approval" value={counts.pending} sub="Requires your action" icon={Clock} iconColor="text-orange-600" iconBg="bg-orange-50" accentBorder="border-l-orange-500" />
          <DashStatCard label="Approved" value={counts.approved} sub="By you" icon={CheckCircle} iconColor="text-green-600" iconBg="bg-green-50" />
          <DashStatCard label="Rejected" value={counts.rejected} sub="By you" icon={XCircle} iconColor="text-red-600" iconBg="bg-red-50" />
          <DashStatCard label="Returned" value={counts.returned} sub="Changes requested" icon={RotateCcw} iconColor="text-blue-600" iconBg="bg-blue-50" />
          <DashStatCard label="All Completed" value={counts.completed} sub="Last 90 days" icon={History} iconColor="text-purple-600" iconBg="bg-purple-50" />
        </div>
      </div>

      <PageTabs
        tabs={TABS.map((t) => ({ ...t, count: counts[t.id as keyof typeof counts] }))}
        active={tab}
        onChange={(id) => { setTab(id); setPage(1); }}
      />

      <div className="border-b border-gray-200 bg-white px-6 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[280px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              placeholder="Search by document title, code or author..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-gray-200 py-2.5 pl-10 pr-4 text-sm focus:border-hoterra-steel focus:outline-none focus:ring-1 focus:ring-hoterra-steel"
            />
          </div>
          <select value={filterDept} onChange={(e) => setFilterDept(e.target.value)} className="filter-select">
            <option value="">All Departments</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <select value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)} className="filter-select">
            <option value="">All Priority</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>
          <div className="relative">
            <button onClick={() => setShowBulkMenu(!showBulkMenu)} disabled={bulkLoading} className="btn-primary disabled:opacity-50">
              Bulk Actions ▾
            </button>
            {showBulkMenu && (
              <div className="absolute right-0 top-full z-20 mt-1 w-44 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
                <button onClick={handleBulkArchive} className="block w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50">Archive Selected</button>
                {tab === 'pending' && (
                  <button onClick={handleBulkApprove} className="block w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50">Approve First Selected</button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-white">
        <table className="w-full min-w-[1100px] text-sm">
          <thead className="sticky top-0 bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-6 py-3"><input type="checkbox" className="rounded" checked={filtered.length > 0 && selected.size === filtered.length} onChange={() => {
                if (selected.size === filtered.length) setSelected(new Set());
                else setSelected(new Set(filtered.map((d) => d.id)));
              }} /></th>
              <th className="px-4 py-3">Document Title</th>
              <th className="px-4 py-3">Code</th>
              <th className="px-4 py-3">Department</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Priority</th>
              <th className="px-4 py-3">Submitted By</th>
              <th className="px-4 py-3">Submitted On</th>
              <th className="px-4 py-3">Due Date</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {filtered.map((doc) => {
              const priority = doc.priority ?? 'MEDIUM';
              return (
                <tr key={doc.id} className="hover:bg-gray-50/80">
                  <td className="px-6 py-3"><input type="checkbox" className="rounded" checked={selected.has(doc.id)} onChange={() => toggleSelect(doc.id)} /></td>
                  <td className="px-4 py-3">
                    <Link to={`/approvals/${doc.id}/review`} className="font-medium text-hoterra-navy hover:text-hoterra-steel">
                      {doc.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-600">{doc.code}</td>
                  <td className="px-4 py-3"><DepartmentBadge name={doc.department.name} color={doc.department.color} /></td>
                  <td className="px-4 py-3"><CategoryBadge category={doc.category} /></td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${PRIORITY_STYLE[priority]}`}>
                      {priority.charAt(0) + priority.slice(1).toLowerCase()}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <UserAvatar firstName={doc.author.firstName} lastName={doc.author.lastName} size="sm" />
                      <span className="text-gray-700">{doc.author.firstName} {doc.author.lastName}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{formatDate(doc.createdAt)}</td>
                  <td className="px-4 py-3">
                    <span className="text-sm font-medium text-orange-600">{formatDate(doc.nextReviewDate)}</span>
                  </td>
                  <td className="px-4 py-3"><StatusBadge status={doc.status} /></td>
                  <td className="px-4 py-3">
                    <button className="rounded p-1.5 text-gray-400 hover:bg-gray-100"><MoreHorizontal className="h-4 w-4" /></button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Pagination page={page} totalPages={totalPages} total={total} limit={20} onPageChange={setPage} label="documents" />
    </div>
  );
}
