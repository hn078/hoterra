import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Eye, MoreHorizontal, Filter, Download, Search } from 'lucide-react';
import {
  Header,
  CreateDocumentButton,
  StatusBadge,
  DepartmentBadge,
} from '@/components/layout/Sidebar';
import { api } from '@/lib/api';
import type { Document, DocumentStatus } from '@/types';
import { STATUS_LABELS } from '@/types';
import { formatDate, getInitials } from '@/lib/utils';

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

export function DocumentsPage() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [total, setTotal] = useState(0);
  const [activeTab, setActiveTab] = useState<DocumentStatus | 'ALL'>('ALL');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const params: Record<string, string> = { limit: '20' };
    if (activeTab !== 'ALL') params.status = activeTab;
    if (search) params.search = search;

    api
      .getDocuments(params)
      .then((res) => {
        setDocuments(res.data);
        setTotal(res.pagination.total);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [activeTab, search]);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <Header
        title="Documents"
        subtitle="View, manage and control all hotel documents"
        action={<CreateDocumentButton />}
      />

      <div className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="relative min-w-[240px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              placeholder="Search documents... (Ctrl+K)"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
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
          <CreateDocumentButton />
        </div>

        <div className="flex flex-wrap gap-1">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                activeTab === tab
                  ? 'bg-hoterra-navy text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {tab === 'ALL' ? `All Documents (${total})` : STATUS_LABELS[tab]}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <table className="w-full min-w-[1000px]">
          <thead className="sticky top-0 bg-gray-50 text-left text-xs font-medium uppercase text-gray-500">
            <tr>
              <th className="px-6 py-3"><input type="checkbox" /></th>
              <th className="px-4 py-3">Document Title</th>
              <th className="px-4 py-3">Code</th>
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
              <tr>
                <td colSpan={11} className="px-6 py-12 text-center text-sm text-gray-500">
                  Loading documents...
                </td>
              </tr>
            ) : documents.length === 0 ? (
              <tr>
                <td colSpan={11} className="px-6 py-12 text-center text-sm text-gray-500">
                  No documents found
                </td>
              </tr>
            ) : (
              documents.map((doc) => (
                <tr key={doc.id} className="hover:bg-gray-50">
                  <td className="px-6 py-3"><input type="checkbox" /></td>
                  <td className="px-4 py-3">
                    <Link
                      to={`/documents/${doc.id}`}
                      className="font-medium text-hoterra-navy hover:text-hoterra-steel"
                    >
                      {doc.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-600">{doc.code}</td>
                  <td className="px-4 py-3">
                    <DepartmentBadge name={doc.department.name} color={doc.department.color} />
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">{doc.category.replace('_', ' ')}</td>
                  <td className="px-4 py-3 text-sm">{doc.version}</td>
                  <td className="px-4 py-3"><StatusBadge status={doc.status} /></td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {formatDate(doc.nextReviewDate)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-hoterra-steel text-[10px] font-semibold text-white">
                        {getInitials(doc.author.firstName, doc.author.lastName)}
                      </div>
                      <span className="text-sm text-gray-700">
                        {doc.author.firstName} {doc.author.lastName}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">{formatDate(doc.updatedAt)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <Link
                        to={`/documents/${doc.id}`}
                        className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-hoterra-steel"
                      >
                        <Eye className="h-4 w-4" />
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

      <div className="flex items-center justify-between border-t border-gray-200 bg-white px-6 py-3 text-sm text-gray-500">
        <span>Showing 1 to {documents.length} of {total} documents</span>
        <div className="flex items-center gap-2">
          <span>Rows per page: 20</span>
        </div>
      </div>
    </div>
  );
}
