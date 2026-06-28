import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Clock, CheckCircle, XCircle, RotateCcw, History, Filter, MoreHorizontal, Search,
} from 'lucide-react';
import { Header, DepartmentBadge, StatusBadge } from '@/components/layout/Sidebar';
import { StatCard } from '@/components/ui/StatCard';
import { PageTabs } from '@/components/ui/PageTabs';
import { Pagination } from '@/components/ui/Pagination';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { api } from '@/lib/api';
import type { Document } from '@/types';
import { CATEGORY_LABELS } from '@/types';
import { formatDate } from '@/lib/utils';
import { getPriority as getDocPriority } from '@/data/mock';

const TABS = [
  { id: 'pending', label: 'Pending Approval' },
  { id: 'approved', label: 'Approved' },
  { id: 'rejected', label: 'Rejected' },
  { id: 'returned', label: 'Returned' },
  { id: 'completed', label: 'All Completed' },
];

const PRIORITY_STYLE = {
  high: 'text-red-600',
  medium: 'text-yellow-600',
  low: 'text-green-600',
};

export function MyApprovalsPage() {
  const [tab, setTab] = useState('pending');
  const [docs, setDocs] = useState<Document[]>([]);
  const [counts, setCounts] = useState({ pending: 0, approved: 0, rejected: 0, returned: 0, completed: 0 });
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');

  useEffect(() => {
    api.getApprovals(tab, page).then((res) => {
      setDocs(res.data);
      setCounts(res.counts);
      setTotal(res.pagination.total);
      setTotalPages(res.pagination.totalPages);
    }).catch(console.error);
  }, [tab, page]);

  const filtered = search
    ? docs.filter((d) =>
        d.title.toLowerCase().includes(search.toLowerCase()) ||
        d.code.toLowerCase().includes(search.toLowerCase())
      )
    : docs;

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <Header title="My Approvals" subtitle="Review and take action on documents requiring your approval" />

      <div className="grid grid-cols-2 gap-4 border-b border-gray-200 bg-gray-50 px-6 py-4 lg:grid-cols-5">
        <StatCard label="Pending Approval" value={counts.pending} icon={Clock} color="orange" />
        <StatCard label="Approved" value={counts.approved} icon={CheckCircle} color="green" />
        <StatCard label="Rejected" value={counts.rejected} icon={XCircle} color="red" />
        <StatCard label="Returned" value={counts.returned} icon={RotateCcw} color="blue" />
        <StatCard label="All Completed" value={counts.completed} sub="Last 90 days" icon={History} color="purple" />
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
              className="w-full rounded-lg border border-gray-200 py-2 pl-10 pr-4 text-sm focus:border-hoterra-steel focus:outline-none"
            />
          </div>
          <button className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm hover:bg-gray-50">
            <Filter className="h-4 w-4" /> Filter
          </button>
          <button className="rounded-lg bg-hoterra-navy px-4 py-2 text-sm font-medium text-white">
            Bulk Actions ▾
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-gray-50 text-left text-xs font-medium uppercase text-gray-500">
            <tr>
              <th className="px-6 py-3"><input type="checkbox" /></th>
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
            {filtered.map((doc, i) => {
              const priority = getDocPriority(i);
              return (
                <tr key={doc.id} className="hover:bg-gray-50">
                  <td className="px-6 py-3"><input type="checkbox" /></td>
                  <td className="px-4 py-3">
                    <Link to={`/approvals/${doc.id}/review`} className="font-medium text-hoterra-navy hover:underline">
                      {doc.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{doc.code}</td>
                  <td className="px-4 py-3"><DepartmentBadge name={doc.department.name} color={doc.department.color} /></td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs">{CATEGORY_LABELS[doc.category]}</span>
                  </td>
                  <td className={`px-4 py-3 text-xs font-medium capitalize ${PRIORITY_STYLE[priority]}`}>{priority}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <UserAvatar firstName={doc.author.firstName} lastName={doc.author.lastName} size="sm" />
                      <span>{doc.author.firstName} {doc.author.lastName}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{formatDate(doc.createdAt)}</td>
                  <td className="px-4 py-3 text-gray-500">
                    {formatDate(doc.nextReviewDate)}
                    {doc.nextReviewDate && <span className="ml-1 text-orange-500">(2 days left)</span>}
                  </td>
                  <td className="px-4 py-3"><StatusBadge status={doc.status} /></td>
                  <td className="px-4 py-3">
                    <button className="text-gray-400 hover:text-gray-600"><MoreHorizontal className="h-4 w-4" /></button>
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
