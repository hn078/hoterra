import { useEffect, useRef, useState } from 'react';
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
  List,
  LayoutGrid,
  BriefcaseBusiness,
  X,
} from 'lucide-react';
import { Header, DepartmentBadge, StatusBadge } from '@/components/layout/Sidebar';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { api } from '@/lib/api';
import type { Document, User as UserType, Department, Template, WorkflowItem, WorkforceSearchResult } from '@/types';
import { CATEGORY_LABELS, WORKFORCE_STATUS_LABELS } from '@/types';
import { countWorkflowSteps } from '@/lib/workflows';
import { formatDateTime } from '@/lib/utils';
import { useAuthStore } from '@/store/auth';
import { hasCapability } from '@/modules/access-control';

const RESULT_TABS = [
  { id: 'all', label: 'All Results' },
  { id: 'documents', label: 'Documents' },
  { id: 'users', label: 'Users' },
  { id: 'departments', label: 'Departments' },
  { id: 'workflows', label: 'Workflows' },
  { id: 'templates', label: 'Templates' },
  { id: 'workforce', label: 'Casual Workforce' },
];

type SavedSearch = { id: string; query: string; count: number };

type SearchResults = {
  documents: Document[];
  users: UserType[];
  departments: Department[];
  templates: Template[];
  workflows: WorkflowItem[];
  workforce: WorkforceSearchResult[];
  total: number;
};

const EMPTY_RESULTS: SearchResults = {
  documents: [],
  users: [],
  departments: [],
  templates: [],
  workflows: [],
  workforce: [],
  total: 0,
};

export function SearchPage() {
  const currentUser = useAuthStore((state) => state.user);
  const canManageTemplates = hasCapability(currentUser, 'templates.manage');
  const canManageTemplatesHotelWide = hasCapability(currentUser, 'documents.read.all');
  const canManageWorkflows = hasCapability(currentUser, 'workflows.manage');
  const canReadDocuments = hasCapability(currentUser, 'documents.read');
  const canReadUsers = hasCapability(currentUser, 'users.directory.read');
  const canReadDepartments = hasCapability(currentUser, 'departments.read');
  const canReadWorkflows = hasCapability(currentUser, 'workflows.read');
  const canReadTemplates = hasCapability(currentUser, 'templates.read');
  const canReadWorkforce = hasCapability(currentUser, 'workforce.read');
  const [searchParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [results, setResults] = useState<SearchResults>(EMPTY_RESULTS);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [sort, setSort] = useState('relevance');
  const [appliedFilterParams, setAppliedFilterParams] = useState<Record<string, string>>({});
  const [departments, setDepartments] = useState<Department[]>([]);
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
  const [manageSaved, setManageSaved] = useState(false);
  const [showTips, setShowTips] = useState(false);
  const searchSequence = useRef(0);
  const [filters, setFilters] = useState({
    searchIn: 'all',
    fileType: 'all',
    module: 'all',
    dateRange: 'all',
    createdBy: 'all',
    departmentId: 'all',
    includeArchived: false,
  });

  useEffect(() => {
    const q = searchParams.get('q');
    if (q) setQuery(q);
  }, [searchParams]);

  const savedSearchKey = `hoterra:saved-searches:${currentUser?.id ?? 'anonymous'}`;

  useEffect(() => {
    if (canReadDepartments) api.getDepartments().then(setDepartments).catch(() => setDepartments([]));
  }, [canReadDepartments]);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(savedSearchKey) || '[]');
      setSavedSearches(Array.isArray(saved) ? saved.slice(0, 20) : []);
    } catch {
      setSavedSearches([]);
    }
  }, [savedSearchKey]);

  const buildFilterParams = (): Record<string, string> => {
    const params: Record<string, string> = {};
    if (filters.searchIn !== 'all') params.searchIn = filters.searchIn;
    if (filters.fileType !== 'all') params.fileType = filters.fileType;
    if (filters.module !== 'all') params.module = filters.module;
    if (filters.dateRange !== 'all') params.dateRange = filters.dateRange;
    if (filters.createdBy !== 'all') params.createdBy = filters.createdBy;
    if (filters.departmentId !== 'all') params.departmentId = filters.departmentId;
    if (filters.includeArchived) params.includeArchived = 'true';
    return params;
  };

  useEffect(() => {
    const sequence = ++searchSequence.current;
    if (!query.trim()) {
      setResults(EMPTY_RESULTS);
      setSearchError(null);
      setLoading(false);
      return;
    }

    const timer = setTimeout(() => {
      setLoading(true);
      setSearchError(null);
      api
        .search(query.trim(), activeTab, { ...appliedFilterParams, sort })
        .then((nextResults) => {
          if (searchSequence.current === sequence) setResults(nextResults);
        })
        .catch((error) => {
          if (searchSequence.current !== sequence) return;
          setResults(EMPTY_RESULTS);
          setSearchError(error instanceof Error ? error.message : 'Search failed');
        })
        .finally(() => {
          if (searchSequence.current === sequence) setLoading(false);
        });
    }, 300);

    return () => clearTimeout(timer);
  }, [query, activeTab, appliedFilterParams, sort]);

  const tabCounts: Record<string, number> = {
    all: results.total,
    documents: results.documents.length,
    users: results.users.length,
    departments: results.departments.length,
    workflows: results.workflows.length,
    templates: results.templates.length,
    workforce: results.workforce.length,
  };

  const handleApplyFilters = () => {
    setAppliedFilterParams(buildFilterParams());
  };

  const clearFilters = () => {
    setFilters({ searchIn: 'all', fileType: 'all', module: 'all', dateRange: 'all', createdBy: 'all', departmentId: 'all', includeArchived: false });
    setAppliedFilterParams({});
  };

  const saveCurrentSearch = () => {
    const value = query.trim();
    if (!value) return;
    const next = [
      { id: crypto.randomUUID(), query: value, count: results.total },
      ...savedSearches.filter((saved) => saved.query.toLowerCase() !== value.toLowerCase()),
    ].slice(0, 20);
    setSavedSearches(next);
    localStorage.setItem(savedSearchKey, JSON.stringify(next));
  };

  const removeSavedSearch = (id: string) => {
    const next = savedSearches.filter((saved) => saved.id !== id);
    setSavedSearches(next);
    localStorage.setItem(savedSearchKey, JSON.stringify(next));
  };

  const visibleTabs = RESULT_TABS.filter((tab) => tab.id === 'all' || (
    (tab.id === 'documents' && canReadDocuments)
    || (tab.id === 'users' && canReadUsers)
    || (tab.id === 'departments' && canReadDepartments)
    || (tab.id === 'workflows' && canReadWorkflows)
    || (tab.id === 'templates' && canReadTemplates)
    || (tab.id === 'workforce' && canReadWorkforce)
  ));

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-hoterra-page">
      <Header
        title="Search"
        subtitle="Find documents, people, workflows and workforce requests"
        action={
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setShowTips((value) => !value)} className="inline-flex items-center gap-2 text-sm text-hoterra-steel hover:underline">
              <Lightbulb className="h-4 w-4" />
              Search Tips
            </button>
            <button type="button" onClick={saveCurrentSearch} disabled={!query.trim()} className="btn-secondary disabled:opacity-50">
              <Bookmark className="h-4 w-4" />
              Save Search
            </button>
          </div>
        }
      />

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
        <div className="flex min-h-[480px] flex-1 flex-col overflow-hidden">
          <div className="border-b border-gray-200 bg-white px-6 py-6">
            <div className="relative mx-auto max-w-4xl">
              <Search className="absolute left-4 top-1/2 h-6 w-6 -translate-y-1/2 text-gray-400" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                maxLength={200}
                placeholder="Search documents, people, request codes, services or vendors..."
                className="w-full rounded-xl border border-gray-200 py-4 pl-14 pr-4 text-base shadow-sm focus:border-hoterra-steel focus:outline-none focus:ring-1 focus:ring-hoterra-steel"
              />
            </div>

            {showTips && (
              <div className="mx-auto mt-3 flex max-w-4xl items-start justify-between rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-xs text-blue-800">
                <span>Use a title, document code, employee name, department, workflow, or template name. Filters are applied server-side inside your access scope.</span>
                <button type="button" onClick={() => setShowTips(false)}><X className="h-4 w-4" /></button>
              </div>
            )}

            <div className="mx-auto mt-4 flex max-w-4xl flex-wrap gap-4 border-b border-gray-100">
              {visibleTabs.map((tab) => (
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
              <select value={sort} onChange={(event) => setSort(event.target.value)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs">
                <option value="relevance">Sort by: Relevance</option>
                <option value="date">Sort by: Date</option>
                <option value="name">Sort by: Name</option>
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
            ) : searchError ? (
              <div className="flex h-48 items-center justify-center text-sm text-red-600">{searchError}</div>
            ) : results.total === 0 ? (
              <div className="flex h-48 items-center justify-center text-sm text-gray-500">
                No results found for "{query}"
              </div>
            ) : (
              <div className={viewMode === 'grid' ? 'grid grid-cols-1 gap-4 sm:grid-cols-2' : 'space-y-3'}>
                {(activeTab === 'all' || activeTab === 'documents') &&
                  results.documents.map((doc) => (
                    <ResultCard
                      key={`doc-${doc.id}`}
                      icon={FileText}
                      iconColor="text-red-500"
                      title={doc.title}
                      breadcrumb={`Documents › ${doc.department.name} › ${CATEGORY_LABELS[doc.category]}`}
                      description={doc.description || 'No description available'}
                      tags={[
                        doc.category,
                        doc.code,
                        ...(doc.matchedInAttachment
                          ? [`Matched attachment${doc.matchedFileNames?.[0] ? `: ${doc.matchedFileNames[0]}` : ''}`]
                          : doc.matchedInUploadedFile ? ['Matched in primary file'] : []),
                        ...(doc.searchIndexStatus === 'OCR_REQUIRED' ? ['OCR required'] : []),
                      ]}
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
                      link={canManageTemplatesHotelWide || dept.id === currentUser?.department?.id ? `/departments/${dept.id}` : '/departments'}
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
                      link={canManageWorkflows ? `/workflows/${wf.id}/designer` : '/workflows'}
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
                      link={canManageTemplates && (canManageTemplatesHotelWide || tmpl.departmentId === currentUser?.department?.id) ? `/templates/${tmpl.id}/edit` : '/templates'}
                    />
                  ))}

                {(activeTab === 'all' || activeTab === 'workforce') &&
                  results.workforce.map((request) => (
                    <ResultCard
                      key={`workforce-${request.id}`}
                      icon={BriefcaseBusiness}
                      iconColor="text-cyan-600"
                      title={request.code}
                      breadcrumb={`Casual Workforce › ${request.department.name}`}
                      description={`${request.services.join(', ') || 'Workforce services'} · ${formatDateTime(request.workDate)} – ${formatDateTime(request.endDate)}`}
                      tags={[
                        WORKFORCE_STATUS_LABELS[request.status],
                        `${request.quantity} staff`,
                        ...request.vendorNames.slice(0, 2),
                      ]}
                      link={`/workforce/${request.id}`}
                    />
                  ))}
              </div>
            )}
          </div>
        </div>

        <aside className="card order-first w-full shrink-0 overflow-y-auto rounded-none border-x-0 border-t-0 p-4 shadow-none lg:order-none lg:w-80 lg:border-l lg:border-b-0 lg:p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-semibold text-hoterra-navy">Filter Results</h3>
            <button
              onClick={clearFilters}
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
                <option value="txt">Text</option>
                <option value="csv">CSV</option>
              </select>
            </FilterField>

            <FilterField label="Module">
              <select
                value={filters.module}
                onChange={(e) => setFilters({ ...filters, module: e.target.value })}
                className="input text-sm"
              >
                <option value="all">All Modules</option>
                {canReadDocuments && <option value="documents">Documents</option>}
                {canReadTemplates && <option value="templates">Templates</option>}
                {canReadWorkflows && <option value="workflows">Workflows</option>}
                {canReadWorkforce && <option value="workforce">Casual Workforce</option>}
              </select>
            </FilterField>

            <FilterField label="Date Range">
              <select
                value={filters.dateRange}
                onChange={(e) => setFilters({ ...filters, dateRange: e.target.value })}
                className="input text-sm"
              >
                <option value="all">All time</option>
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
                value={filters.departmentId}
                onChange={(e) => setFilters({ ...filters, departmentId: e.target.value })}
                className="input text-sm"
              >
                <option value="all">All Departments</option>
                {departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
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
              {savedSearches.length > 0 && <button type="button" onClick={() => setManageSaved((value) => !value)} className="text-xs text-hoterra-steel hover:underline">{manageSaved ? 'Done' : 'Manage'}</button>}
            </div>
            <div className="space-y-2">
              {savedSearches.map((saved) => (
                <div
                  key={saved.id}
                  className="flex w-full items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-left text-sm hover:border-hoterra-steel hover:bg-white"
                >
                  <button type="button" onClick={() => setQuery(saved.query)} className="min-w-0 flex-1 truncate text-left font-medium text-gray-700">{saved.query}</button>
                  <span className="flex items-center gap-1 text-xs text-gray-400">
                    {saved.count} results
                    {manageSaved ? <button type="button" onClick={() => removeSavedSearch(saved.id)} className="text-red-500"><X className="h-3.5 w-3.5" /></button> : <Bookmark className="h-3 w-3 text-hoterra-steel" />}
                  </span>
                </div>
              ))}
              {savedSearches.length === 0 && <p className="text-xs text-gray-400">No saved searches yet.</p>}
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
