import { useEffect } from 'react';
import { BrowserRouter, HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { LoginPage } from '@/pages/LoginPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { DocumentsPage } from '@/pages/DocumentsPage';
import { CreateDocumentPage } from '@/pages/CreateDocumentPage';
import { DocumentDetailPage } from '@/pages/DocumentDetailPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { PlaceholderPage } from '@/pages/PlaceholderPage';
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
          <Route path="/approvals" element={<PlaceholderPage title="My Approvals" subtitle="Documents awaiting your signature" />} />
          <Route path="/templates" element={<PlaceholderPage title="Templates" subtitle="Manage document templates" />} />
          <Route path="/departments" element={<PlaceholderPage title="Departments" subtitle="Manage hotel departments" />} />
          <Route path="/workflows" element={<PlaceholderPage title="Workflows" subtitle="Configure approval routes" />} />
          <Route path="/users" element={<PlaceholderPage title="Users & Roles" subtitle="Manage users and permissions" />} />
          <Route path="/reports" element={<PlaceholderPage title="Reports" subtitle="Analytics and reporting" />} />
          <Route path="/archive" element={<PlaceholderPage title="Archive" subtitle="Archived documents" />} />
          <Route path="/audit" element={<PlaceholderPage title="Audit Log" subtitle="System activity log" />} />
          <Route path="/notifications" element={<PlaceholderPage title="Notifications" subtitle="Your notifications" />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}
