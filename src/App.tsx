import { lazy, Suspense, useEffect, useState } from 'react';
import { BrowserRouter, HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Building2, ExternalLink, Loader2 } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { AppDialogProvider } from '@/components/ui/AppDialogProvider';
import { LoginPage } from '@/pages/LoginPage';
import { LandingPage } from '@/pages/LandingPage';
import { useAuthStore } from '@/store/auth';
import { api } from '@/lib/api';
import { CapabilityRoute, type Capability } from '@/modules/access-control';

const isFileProtocol =
  typeof window !== 'undefined' &&
  (window.location.protocol === 'file:' || !!window.hoterra);

const Router = isFileProtocol ? HashRouter : BrowserRouter;

const DashboardPage = lazy(() => import('@/pages/DashboardPage').then((m) => ({ default: m.DashboardPage })));
const DocumentsPage = lazy(() => import('@/pages/DocumentsPage').then((m) => ({ default: m.DocumentsPage })));
const CreateDocumentPage = lazy(() => import('@/pages/CreateDocumentPage').then((m) => ({ default: m.CreateDocumentPage })));
const DocumentDetailPage = lazy(() => import('@/pages/DocumentDetailPage').then((m) => ({ default: m.DocumentDetailPage })));
const SettingsPage = lazy(() => import('@/pages/SettingsPage').then((m) => ({ default: m.SettingsPage })));
const MyApprovalsPage = lazy(() => import('@/pages/MyApprovalsPage').then((m) => ({ default: m.MyApprovalsPage })));
const ApprovalReviewPage = lazy(() => import('@/pages/ApprovalReviewPage').then((m) => ({ default: m.ApprovalReviewPage })));
const ReportsPage = lazy(() => import('@/pages/ReportsPage').then((m) => ({ default: m.ReportsPage })));
const SearchPage = lazy(() => import('@/pages/SearchPage').then((m) => ({ default: m.SearchPage })));
const TemplatesPage = lazy(() => import('@/pages/TemplatesPage').then((m) => ({ default: m.TemplatesPage })));
const TemplateEditorPage = lazy(() => import('@/pages/TemplateEditorPage').then((m) => ({ default: m.TemplateEditorPage })));
const DepartmentsPage = lazy(() => import('@/pages/DepartmentsPage').then((m) => ({ default: m.DepartmentsPage })));
const DepartmentDetailPage = lazy(() => import('@/pages/DepartmentDetailPage').then((m) => ({ default: m.DepartmentDetailPage })));
const WorkflowsPage = lazy(() => import('@/pages/WorkflowsPage').then((m) => ({ default: m.WorkflowsPage })));
const WorkflowDesignerPage = lazy(() => import('@/pages/WorkflowDesignerPage').then((m) => ({ default: m.WorkflowDesignerPage })));
const UsersPage = lazy(() => import('@/pages/UsersPage').then((m) => ({ default: m.UsersPage })));
const UserProfilePage = lazy(() => import('@/pages/UserProfilePage').then((m) => ({ default: m.UserProfilePage })));
const RolesPermissionsPage = lazy(() => import('@/pages/RolesPermissionsPage').then((m) => ({ default: m.RolesPermissionsPage })));
const ArchivePage = lazy(() => import('@/pages/ArchivePage').then((m) => ({ default: m.ArchivePage })));
const AuditLogPage = lazy(() => import('@/pages/AuditLogPage').then((m) => ({ default: m.AuditLogPage })));
const NotificationsPage = lazy(() => import('@/pages/NotificationsPage').then((m) => ({ default: m.NotificationsPage })));
const MessagesPage = lazy(() => import('@/pages/MessagesPage').then((m) => ({ default: m.MessagesPage })));
const WorkforcePage = lazy(() => import('@/pages/WorkforcePage').then((m) => ({ default: m.WorkforcePage })));
const WorkforceRequestPage = lazy(() => import('@/pages/WorkforceRequestPage').then((m) => ({ default: m.WorkforceRequestPage })));
const VendorPortalPage = lazy(() => import('@/pages/VendorPortalPage').then((m) => ({ default: m.VendorPortalPage })));

function RouteFallback() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center text-hoterra-navy">
      <Loader2 className="h-6 w-6 animate-spin text-hoterra-gold" aria-label="Loading page" />
    </div>
  );
}

function protectedPage(capability: Capability, page: React.ReactNode) {
  return <CapabilityRoute require={capability}>{page}</CapabilityRoute>;
}

type TenantState =
  | { status: 'checking' }
  | { status: 'valid'; name: string }
  | { status: 'not-found'; slug: string }
  | { status: 'unavailable'; slug: string };

function requestedSubdomain(): string | null {
  if (typeof window === 'undefined') return null;
  const hostname = window.location.hostname.toLowerCase();
  if (!hostname.endsWith('.hoterra.net')) return null;
  const slug = hostname.slice(0, -'.hoterra.net'.length);
  if (!slug || slug.includes('.') || ['www', 'app'].includes(slug)) return null;
  return slug;
}

function TenantGuard({ children }: { children: React.ReactNode }) {
  const slug = requestedSubdomain();
  const [state, setState] = useState<TenantState>(slug ? { status: 'checking' } : { status: 'valid', name: 'HOTERRA' });

  useEffect(() => {
    if (!slug) return;
    let active = true;
    api.getCurrentTenant()
      .then((tenant) => {
        if (active) setState({ status: 'valid', name: tenant.name });
      })
      .catch((error) => {
        if (!active) return;
        const message = error instanceof Error ? error.message : '';
        setState({ status: /workspace.*not found/i.test(message) ? 'not-found' : 'unavailable', slug });
      });
    return () => { active = false; };
  }, [slug]);

  if (state.status === 'valid') return children;
  if (state.status === 'checking') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-hoterra-offwhite">
        <div className="text-center text-hoterra-navy">
          <Loader2 className="mx-auto mb-3 h-7 w-7 animate-spin text-hoterra-gold" />
          <p className="text-sm text-gray-500">Checking hotel workspace...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-hoterra-offwhite bg-dot-grid p-6">
      <div className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-login">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-hoterra-navy text-hoterra-gold">
          <Building2 className="h-7 w-7" />
        </div>
        <h1 className="text-2xl font-bold text-hoterra-navy">
          {state.status === 'not-found' ? 'Hotel workspace not found' : 'Hotel workspace unavailable'}
        </h1>
        <p className="mt-3 text-sm leading-6 text-gray-500">
          {state.status === 'not-found'
            ? `There is no active HOTERRA hotel with the “${state.slug}” subdomain.`
            : 'We could not verify this hotel workspace. Please try again shortly.'}
        </p>
        <a href="https://hoterra.net" className="btn-primary mt-6 inline-flex px-5 py-2.5">
          Go to HOTERRA
          <ExternalLink className="h-4 w-4" />
        </a>
      </div>
    </div>
  );
}

export default function App() {
  const checkAuth = useAuthStore((s) => s.checkAuth);
  const tenantSubdomain = requestedSubdomain();

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  return (
    <AppDialogProvider>
      <TenantGuard>
        <Router>
        <Suspense fallback={<RouteFallback />}>
          <Routes>
        <Route
          path="/"
          element={
            isFileProtocol
              ? <Navigate to="/app" replace />
              : tenantSubdomain
                ? <Navigate to="/login" replace />
                : <LandingPage />
          }
        />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/vendor/order/:token" element={<VendorPortalPage />} />
        <Route element={<AppLayout />}>
          <Route path="/app" element={protectedPage('dashboard.view', <DashboardPage />)} />
          <Route path="/documents" element={protectedPage('documents.read', <DocumentsPage />)} />
          <Route path="/documents/create" element={protectedPage('documents.create', <CreateDocumentPage />)} />
          <Route path="/documents/:id" element={protectedPage('documents.read', <DocumentDetailPage />)} />
          <Route path="/approvals" element={protectedPage('approvals.read', <MyApprovalsPage />)} />
          <Route path="/approvals/:id/review" element={protectedPage('approvals.read', <ApprovalReviewPage />)} />
          <Route path="/search" element={protectedPage('search.use', <SearchPage />)} />
          <Route path="/templates" element={protectedPage('templates.read', <TemplatesPage />)} />
          <Route path="/templates/create" element={protectedPage('templates.manage', <Navigate to="/templates/new/edit" replace />)} />
          <Route path="/templates/new/edit" element={protectedPage('templates.manage', <TemplateEditorPage />)} />
          <Route path="/templates/:id/edit" element={protectedPage('templates.manage', <TemplateEditorPage />)} />
          <Route path="/departments" element={protectedPage('departments.read', <DepartmentsPage />)} />
          <Route path="/departments/:id" element={protectedPage('departments.read', <DepartmentDetailPage />)} />
          <Route path="/workflows" element={protectedPage('workflows.read', <WorkflowsPage />)} />
          <Route path="/workflows/:id/designer" element={protectedPage('workflows.manage', <WorkflowDesignerPage />)} />
          <Route path="/users" element={protectedPage('users.directory.read', <UsersPage />)} />
          <Route path="/users/roles" element={protectedPage('roles.read', <RolesPermissionsPage />)} />
          <Route path="/users/:id" element={<UserProfilePage />} />
          <Route path="/reports" element={protectedPage('reports.read', <ReportsPage />)} />
          <Route path="/archive" element={protectedPage('documents.archive', <ArchivePage />)} />
          <Route path="/audit" element={protectedPage('audit.read', <AuditLogPage />)} />
          <Route path="/notifications" element={protectedPage('notifications.read', <NotificationsPage />)} />
          <Route path="/messages" element={protectedPage('messages.use', <MessagesPage />)} />
          <Route path="/workforce" element={protectedPage('workforce.read', <WorkforcePage />)} />
          <Route path="/workforce/:id" element={protectedPage('workforce.read', <WorkforceRequestPage />)} />
          <Route path="/settings" element={protectedPage('settings.read', <SettingsPage />)} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
        </Router>
      </TenantGuard>
    </AppDialogProvider>
  );
}
