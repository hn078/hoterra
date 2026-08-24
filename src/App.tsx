import { useEffect, useState } from 'react';
import { BrowserRouter, HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Building2, ExternalLink, Loader2 } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { LoginPage } from '@/pages/LoginPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { DocumentsPage } from '@/pages/DocumentsPage';
import { CreateDocumentPage } from '@/pages/CreateDocumentPage';
import { DocumentDetailPage } from '@/pages/DocumentDetailPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { MyApprovalsPage } from '@/pages/MyApprovalsPage';
import { ApprovalReviewPage } from '@/pages/ApprovalReviewPage';
import { ReportsPage } from '@/pages/ReportsPage';
import { SearchPage } from '@/pages/SearchPage';
import { TemplatesPage } from '@/pages/TemplatesPage';
import { TemplateEditorPage } from '@/pages/TemplateEditorPage';
import { DepartmentsPage } from '@/pages/DepartmentsPage';
import { DepartmentDetailPage } from '@/pages/DepartmentDetailPage';
import { WorkflowsPage } from '@/pages/WorkflowsPage';
import { WorkflowDesignerPage } from '@/pages/WorkflowDesignerPage';
import { UsersPage } from '@/pages/UsersPage';
import { UserProfilePage } from '@/pages/UserProfilePage';
import { RolesPermissionsPage } from '@/pages/RolesPermissionsPage';
import { ArchivePage } from '@/pages/ArchivePage';
import { AuditLogPage } from '@/pages/AuditLogPage';
import { NotificationsPage } from '@/pages/NotificationsPage';
import { MessagesPage } from '@/pages/MessagesPage';
import { WorkforcePage } from '@/pages/WorkforcePage';
import { WorkforceRequestPage } from '@/pages/WorkforceRequestPage';
import { VendorPortalPage } from '@/pages/VendorPortalPage';
import { LandingPage } from '@/pages/LandingPage';
import { useAuthStore } from '@/store/auth';
import { api } from '@/lib/api';

const isFileProtocol =
  typeof window !== 'undefined' &&
  (window.location.protocol === 'file:' || !!window.hoterra);

const Router = isFileProtocol ? HashRouter : BrowserRouter;

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
    <TenantGuard>
      <Router>
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
          <Route path="/app" element={<DashboardPage />} />
          <Route path="/documents" element={<DocumentsPage />} />
          <Route path="/documents/create" element={<CreateDocumentPage />} />
          <Route path="/documents/:id" element={<DocumentDetailPage />} />
          <Route path="/approvals" element={<MyApprovalsPage />} />
          <Route path="/approvals/:id/review" element={<ApprovalReviewPage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/templates" element={<TemplatesPage />} />
          <Route path="/templates/create" element={<Navigate to="/templates/new/edit" replace />} />
          <Route path="/templates/new/edit" element={<TemplateEditorPage />} />
          <Route path="/templates/:id/edit" element={<TemplateEditorPage />} />
          <Route path="/departments" element={<DepartmentsPage />} />
          <Route path="/departments/:id" element={<DepartmentDetailPage />} />
          <Route path="/workflows" element={<WorkflowsPage />} />
          <Route path="/workflows/:id/designer" element={<WorkflowDesignerPage />} />
          <Route path="/users" element={<UsersPage />} />
          <Route path="/users/roles" element={<RolesPermissionsPage />} />
          <Route path="/users/:id" element={<UserProfilePage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/archive" element={<ArchivePage />} />
          <Route path="/audit" element={<AuditLogPage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/messages" element={<MessagesPage />} />
          <Route path="/workforce" element={<WorkforcePage />} />
          <Route path="/workforce/:id" element={<WorkforceRequestPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
    </TenantGuard>
  );
}
