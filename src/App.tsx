import { useEffect } from 'react';
import { BrowserRouter, HashRouter, Routes, Route, Navigate } from 'react-router-dom';
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
import { useAuthStore } from '@/store/auth';

const isFileProtocol =
  typeof window !== 'undefined' &&
  (window.location.protocol === 'file:' || !!window.hoterra);

const Router = isFileProtocol ? HashRouter : BrowserRouter;

export default function App() {
  const checkAuth = useAuthStore((s) => s.checkAuth);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  return (
    <Router>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<AppLayout />}>
          <Route path="/" element={<DashboardPage />} />
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
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}
