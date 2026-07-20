import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Search,
  Bookmark,
  Lightbulb,
  FileText,
  User,
  Building2,
  GitBranch,
  LayoutTemplate,
  MoreHorizontal,
  List,
  LayoutGrid,
} from 'lucide-react';
import { Header, DepartmentBadge, StatusBadge } from '@/components/layout/Sidebar';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { api } from '@/lib/api';
import type { Document, User as UserType, Department, Template, WorkflowItem } from '@/types';
import { CATEGORY_LABELS } from '@/types';
import { countWorkflowSteps } from '@/lib/workflows';
import { formatDateTime } from '@/lib/utils';

const RESULT_TABS = [
  { id: 'all', label: 'All Results' },
  { id: 'documents', label: 'Documents' },
  { id: 'users', label: 'Users' },
  { id: 'departments', label: 'Departments' },
  { id: 'workflows', label: 'Workflows' },
  { id: 'templates', label: 'Templates' },
];

const SAVED_SEARCHES = [
  { id: '1', query: 'Q2 Financial Reports', count: 12 },
  { id: '2', query: 'Front Office SOPs', count: 28 },
  { id: '3', query: 'Pending Approvals', count: 5 },
  { id: '4', query: 'Housekeeping Checklists', count: 8 },
];

type SearchResults = {
  documents: Document[];
  users: UserType[];
  departments: Department[];
  templates: Template[];
  workflows: WorkflowItem[];
  total: number;
};

const EMPTY_RESULTS: SearchResults = {
  documents: [],
  users: [],
  departments: [],
  templates: [],
  workflows: [],
  total: 0,
};

export function SearchPage() {
  const [searchParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [results, setResults] = useState<SearchResults>(EMPTY_RESULTS);
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [filters, setFilters] = useState({
    searchIn: 'all',
    fileType: 'all',
    module: 'all',
    dateRange: 'custom',
    createdBy: 'all',
    department: 'all',
    includeArchived: false,
  });

  useEffect(() => {
    const q = searchParams.get('q');
    if (q) setQuery(q);
  }, [searchParams]);

  const buildFilterParams = (): Record<string, string> => {
    const params: Record<string, string> = {};
    if (filters.searchIn !== 'all') params.searchIn = filters.searchIn;
    if (filters.fileType !== 'all') params.fileType = filters.fileType;
    if (filters.module !== 'all') params.module = filters.module;
    if (filters.dateRange !== 'custom') params.dateRange = filters.dateRange;
    if (filters.createdBy !== 'all') params.createdBy = filters.createdBy;
    if (filters.department !== 'all') params.department = filters.department;
    if (filters.includeArchived) params.includeArchived = 'true';
    return params;
  };

  useEffect(() => {
    if (!query.trim()) {
      setResults(EMPTY_RESULTS);
      return;
    }

    const timer = setTimeout(() => {
      setLoading(true);
      api
        .search(query.trim(), activeTab)
        .then(setResults)
        .catch(console.error)
        .finally(() => setLoading(false));
    }, 300);

    return () => clearTimeout(timer);
  }, [query, activeTab]);

  const tabCounts: Record<string, number> = {
    all: results.total,
    documents: results.documents.length,
    users: results.users.length,
    departments: results.departments.length,
    workflows: results.workflows.length,
    templates: results.templates.length,
  };

  const handleApplyFilters = () => {
    if (query.trim()) {
      setLoading(true);
      api
        .search(query.trim(), activeTab, buildFilterParams())
        .then(setResults)
        .catch(console.error)
        .finally(() => setLoading(false));
    }
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-hoterra-page">
      <Header
        title="Search"
        subtitle="Find documents, users, departments, workflows and more"
        action={
          <div className="flex items-center gap-3">
            <button className="inline-flex items-center gap-2 text-sm text-hoterra-steel hover:underline">
              <Lightbulb className="h-4 w-4" />
              Search Tips
            </button>
            <button className="btn-secondary">
              <Bookmark className="h-4 w-4" />
              Save Search
            </button>
          </div>
        }
      />

      <div className="flex flex-1 overflow-hidden">
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="border-b border-gray-200 bg-white px-6 py-6">
            <div className="relative mx-auto max-w-4xl">
              <Search className="absolute left-4 top-1/2 h-6 w-6 -translate-y-1/2 text-gray-400" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search documents, users, departments, workflows..."
                className="w-full rounded-xl border border-gray-200 py-4 pl-14 pr-4 text-base shadow-sm focus:border-hoterra-steel focus:outline-none focus:ring-1 focus:ring-hoterra-steel"
              />
            </div>

            <div className="mx-auto mt-4 flex max-w-4xl flex-wrap gap-4 border-b border-gray-100">
              {RESULT_TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 border-b-2 pb-3 text-sm transition-colors ${
                    activeTab === tab.id
                      ? 'border-hoterra-gold font-medium text-hoterra-navy'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {tab.label}
                  {query.trim() && tabCounts[tab.id] !== undefined && (
                    <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
                      {tabCounts[tab.id]}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-3">
            <p className="text-sm text-gray-600">
              {loading
                ? 'Searching...'
                : query.trim()
                  ? `Found ${results.total} results for "${query}"`
                  : 'Enter a search query'}
            </p>
            <div className="flex items-center gap-3">
              <select className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs">
                <option>Sort by: Relevance</option>
                <option>Sort by: Date</option>
                <option>Sort by: Name</option>
              </select>
              <div className="flex rounded-lg border border-gray-200">
                <button
                  onClick={() => setViewMode('list')}
                  className={`rounded-l-lg p-1.5 ${viewMode === 'list' ? 'bg-hoterra-navy text-white' : 'text-gray-500 hover:bg-gray-50'}`}
                >
                  <List className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setViewMode('grid')}
                  className={`rounded-r-lg p-1.5 ${viewMode === 'grid' ? 'bg-hoterra-navy text-white' : 'text-gray-500 hover:bg-gray-50'}`}
                >
                  <LayoutGrid className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto bg-hoterra-page p-6">
            {!query.trim() ? (
              <div className="flex h-48 items-center justify-center text-sm text-gray-400">
                Type a query to search across the system
              </div>
            ) : loading ? (
              <div className="flex h-48 items-center justify-center text-sm text-gray-500">
                Loading results...
              </div>
            ) : results.total === 0 ? (
              <div className="flex h-48 items-center justify-center text-sm text-gray-500">
                No results found for "{query}"
              </div>
            ) : (
              <div className={viewMode === 'grid' ? 'grid grid-cols-2 gap-4' : 'space-y-3'}>
                {(activeTab === 'all' || activeTab === 'documents') &&
                  results.documents.map((doc) => (
                    <ResultCard
                      key={`doc-${doc.id}`}
                      icon={FileText}
                      iconColor="text-red-500"
                      title={doc.title}
                      breadcrumb={`Documents › ${doc.department.name} › ${CATEGORY_LABELS[doc.category]}`}
                      description={doc.description || 'No description available'}
                      tags={[doc.category, doc.code]}
                      meta={
                        <div className="flex items-center gap-2">
                          <UserAvatar firstName={doc.author.firstName} lastName={doc.author.lastName} size="sm" />
                          <span className="text-xs text-gray-500">{formatDateTime(doc.updatedAt)}</span>
                          <StatusBadge status={doc.status} />
                        </div>
                      }
                      link={`/documents/${doc.id}`}
                    />
                  ))}

                {(activeTab === 'all' || activeTab === 'users') &&
                  results.users.map((user) => (
                    <ResultCard
                      key={`user-${user.id}`}
                      icon={User}
                      iconColor="text-blue-500"
                      title={`${user.firstName} ${user.lastName}`}
                      breadcrumb={`Users › ${user.department?.name || 'No Department'}`}
                      description={user.email}
                      tags={[user.role.replace('_', ' ')]}
                      meta={
                        <div className="flex items-center gap-2">
                          <UserAvatar firstName={user.firstName} lastName={user.lastName} size="sm" />
                        </div>
                      }
                      link={`/users/${user.id}`}
                    />
                  ))}

                {(activeTab === 'all' || activeTab === 'departments') &&
                  results.departments.map((dept) => (
                    <ResultCard
                      key={`dept-${dept.id}`}
                      icon={Building2}
                      iconColor="text-green-500"
                      title={dept.name}
                      breadcrumb="Departments"
                      description={`Department code: ${dept.code}`}
                      tags={[dept.code]}
                      meta={
                        <DepartmentBadge name={dept.name} color={dept.color} />
                      }
                      link={`/departments/${dept.id}`}
                    />
                  ))}

                {(activeTab === 'all' || activeTab === 'workflows') &&
                  results.workflows.map((wf) => (
                    <ResultCard
                      key={`wf-${wf.id}`}
                      icon={GitBranch}
                      iconColor="text-purple-500"
                      title={wf.name}
                      breadcrumb="Workflows"
                      description={wf.description || wf.stepsSummary || `${countWorkflowSteps(wf.steps)} steps`}
                      tags={[
                        ...(wf.isDefault ? ['Default'] : []),
                        ...(wf.status ? [wf.status === 'ACTIVE' ? 'Active' : wf.status === 'DRAFT' ? 'Draft' : 'Archived'] : ['Custom']),
                      ]}
                      link={`/workflows/${wf.id}/designer`}
                    />
                  ))}

                {(activeTab === 'all' || activeTab === 'templates') &&
                  results.templates.map((tmpl) => (
                    <ResultCard
                      key={`tmpl-${tmpl.id}`}
                      icon={LayoutTemplate}
                      iconColor="text-orange-500"
                      title={tmpl.name}
                      breadcrumb="Templates"
                      description={tmpl.description || CATEGORY_LABELS[tmpl.category]}
                      tags={[CATEGORY_LABELS[tmpl.category]]}
                      link={`/templates/${tmpl.id}/edit`}
                    />
                  ))}
              </div>
            )}
          </div>
        </div>

        <aside className="card w-80 shrink-0 overflow-y-auto rounded-none border-l border-t-0 border-r-0 border-b-0 p-5 shadow-none">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-semibold text-hoterra-navy">Filter Results</h3>
            <button
              onClick={() =>
                setFilters({
                  searchIn: 'all',
                  fileType: 'all',
                  module: 'all',
                  dateRange: 'custom',
                  createdBy: 'all',
                  department: 'all',
                  includeArchived: false,
                })
              }
              className="text-xs text-hoterra-steel hover:underline"
            >
              Clear All
            </button>
          </div>

          <div className="space-y-4">
            <FilterField label="Search in">
              <select
                value={filters.searchIn}
                onChange={(e) => setFilters({ ...filters, searchIn: e.target.value })}
                className="input text-sm"
              >
                <option value="all">All Content</option>
                <option value="title">Title Only</option>
                <option value="content">Content Only</option>
              </select>
            </FilterField>

            <FilterField label="File Type">
              <select
                value={filters.fileType}
                onChange={(e) => setFilters({ ...filters, fileType: e.target.value })}
                className="input text-sm"
              >
                <option value="all">All Types</option>
                <option value="pdf">PDF</option>
                <option value="docx">Word</option>
                <option value="xlsx">Excel</option>
              </select>
            </FilterField>

            <FilterField label="Module">
              <select
                value={filters.module}
                onChange={(e) => setFilters({ ...filters, module: e.target.value })}
                className="input text-sm"
              >
                <option value="all">All Modules</option>
                <option value="documents">Documents</option>
                <option value="templates">Templates</option>
                <option value="workflows">Workflows</option>
              </select>
            </FilterField>

            <FilterField label="Date Range">
              <select
                value={filters.dateRange}
                onChange={(e) => setFilters({ ...filters, dateRange: e.target.value })}
                className="input text-sm"
              >
                <option value="custom">Custom Range</option>
                <option value="7d">Last 7 days</option>
                <option value="30d">Last 30 days</option>
                <option value="90d">Last 90 days</option>
              </select>
            </FilterField>

            <FilterField label="Created By">
              <select
                value={filters.createdBy}
                onChange={(e) => setFilters({ ...filters, createdBy: e.target.value })}
                className="input text-sm"
              >
                <option value="all">All Users</option>
                <option value="me">Me</option>
              </select>
            </FilterField>

            <FilterField label="Department">
              <select
                value={filters.department}
                onChange={(e) => setFilters({ ...filters, department: e.target.value })}
                className="input text-sm"
              >
                <option value="all">All Departments</option>
                <option value="fo">Front Office</option>
                <option value="fi">Finance</option>
                <option value="hk">Housekeeping</option>
              </select>
            </FilterField>

            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={filters.includeArchived}
                onChange={(e) => setFilters({ ...filters, includeArchived: e.target.checked })}
                className="rounded border-gray-300"
              />
              Include archived items
            </label>

            <button onClick={handleApplyFilters} className="btn-primary w-full py-2.5">
              Apply Filters
            </button>
          </div>

          <div className="mt-8">
            <div className="mb-3 flex items-center justify-between">
              <h4 className="text-sm font-semibold text-hoterra-navy">Saved Searches</h4>
              <button className="text-xs text-hoterra-steel hover:underline">Manage</button>
            </div>
            <div className="space-y-2">
              {SAVED_SEARCHES.map((saved) => (
                <button
                  key={saved.id}
                  onClick={() => setQuery(saved.query)}
                  className="flex w-full items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-left text-sm hover:border-hoterra-steel hover:bg-white"
                >
                  <span className="font-medium text-gray-700">{saved.query}</span>
                  <span className="flex items-center gap-1 text-xs text-gray-400">
                    {saved.count} results
                    <Bookmark className="h-3 w-3 text-hoterra-steel" />
                  </span>
                </button>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function ResultCard({
  icon: Icon,
  iconColor,
  title,
  breadcrumb,
  description,
  tags,
  meta,
  link,
}: {
  icon: React.ElementType;
  iconColor: string;
  title: string;
  breadcrumb: string;
  description: string;
  tags: string[];
  meta?: React.ReactNode;
  link?: string;
}) {
  const content = (
    <div className="flex gap-4 rounded-xl border border-gray-200 bg-white p-4 transition-colors hover:border-hoterra-steel hover:shadow-sm">
      <div className={`mt-0.5 shrink-0 ${iconColor}`}>
        <Icon className="h-8 w-8" />
      </div>
      <div className="min-w-0 flex-1">
        <h4 className="font-medium text-hoterra-navy">{title}</h4>
        <p className="text-xs text-gray-400">{breadcrumb}</p>
        <p className="mt-1 line-clamp-2 text-sm text-gray-600">{description}</p>
        <div className="mt-2 flex flex-wrap gap-1">
          {tags.map((tag) => (
            <span key={tag} className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
              {tag}
            </span>
          ))}
        </div>
        {meta && <div className="mt-2">{meta}</div>}
      </div>
      <button className="shrink-0 self-start text-gray-400 hover:text-gray-600">
        <MoreHorizontal className="h-4 w-4" />
      </button>
    </div>
  );

  return link ? <Link to={link}>{content}</Link> : content;
}

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-gray-600">{label}</label>
      {children}
    </div>
  );
}
