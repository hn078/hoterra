import { Outlet, Navigate } from 'react-router-dom';
import { MobileBottomNav, Sidebar } from '@/components/layout/Sidebar';
import { useAuthStore, useUIStore } from '@/store/auth';

export function AppLayout() {
  const { isAuthenticated, isLoading } = useAuthStore();
  const { mobileSidebarOpen, closeMobileSidebar } = useUIStore();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-hoterra-offwhite">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-hoterra-navy text-2xl font-bold text-hoterra-gold">
            H
          </div>
          <p className="text-sm text-gray-500">Loading HOTERRA HDMS...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-hoterra-gray">
      {mobileSidebarOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={closeMobileSidebar}
          className="fixed inset-0 z-40 bg-hoterra-navy/55 backdrop-blur-sm md:hidden"
        />
      )}
      <Sidebar />
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0">
        <Outlet />
      </main>
      <MobileBottomNav />
    </div>
  );
}
