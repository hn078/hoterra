import {
  LayoutDashboard,
  FileText,
  CheckSquare,
  LayoutTemplate,
  Building2,
  GitBranch,
  Users,
  BarChart3,
  Archive,
  ScrollText,
  Bell,
  Settings,
  HelpCircle,
  ChevronLeft,
  Search,
  Plus,
} from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { useAuthStore, useUIStore } from '@/store/auth';
import { ROLE_LABELS, STATUS_LABELS, STATUS_COLORS, type DocumentStatus } from '@/types';
import { cn, getInitials } from '@/lib/utils';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/documents', icon: FileText, label: 'Documents' },
  { to: '/approvals', icon: CheckSquare, label: 'My Approvals', badge: 12 },
  { to: '/templates', icon: LayoutTemplate, label: 'Templates' },
  { to: '/departments', icon: Building2, label: 'Departments' },
  { to: '/workflows', icon: GitBranch, label: 'Workflows' },
  { to: '/users', icon: Users, label: 'Users & Roles' },
  { to: '/reports', icon: BarChart3, label: 'Reports' },
  { to: '/archive', icon: Archive, label: 'Archive' },
  { to: '/audit', icon: ScrollText, label: 'Audit Log' },
  { to: '/notifications', icon: Bell, label: 'Notifications', badge: 8 },
  { to: '/settings', icon: Settings, label: 'Settings' },
];

export function Sidebar() {
  const { user } = useAuthStore();
  const { sidebarCollapsed, toggleSidebar } = useUIStore();

  if (!user) return null;

  return (
    <aside
      className={cn(
        'flex flex-col bg-hoterra-navy text-white transition-all duration-300',
        sidebarCollapsed ? 'w-[72px]' : 'w-64'
      )}
    >
      <div className="flex items-center gap-3 border-b border-white/10 px-4 py-5">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-hoterra-gold font-bold text-hoterra-navy">
          H
        </div>
        {!sidebarCollapsed && (
          <div>
            <div className="text-sm font-bold tracking-wide">HOTERRA</div>
            <div className="text-[10px] text-white/60">Document Management</div>
          </div>
        )}
      </div>

      <div className="border-b border-white/10 px-4 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-hoterra-steel text-xs font-semibold">
            {getInitials(user.firstName, user.lastName)}
          </div>
          {!sidebarCollapsed && (
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">
                {user.firstName} {user.lastName}
              </div>
              <div className="truncate text-xs text-white/60">
                {ROLE_LABELS[user.role]}
              </div>
              <div className="mt-0.5 flex items-center gap-1 text-[10px] text-green-400">
                <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
                Online
              </div>
            </div>
          )}
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-3">
        {navItems.map(({ to, icon: Icon, label, badge }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              cn(
                'mb-0.5 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors',
                isActive
                  ? 'bg-hoterra-gold/20 text-hoterra-gold'
                  : 'text-white/70 hover:bg-white/5 hover:text-white'
              )
            }
          >
            <Icon className="h-5 w-5 shrink-0" />
            {!sidebarCollapsed && (
              <>
                <span className="flex-1 truncate">{label}</span>
                {badge && (
                  <span className="rounded-full bg-hoterra-gold px-1.5 py-0.5 text-[10px] font-bold text-hoterra-navy">
                    {badge}
                  </span>
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-white/10 p-3">
        <button className="mb-1 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-white/60 hover:bg-white/5 hover:text-white">
          <HelpCircle className="h-5 w-5 shrink-0" />
          {!sidebarCollapsed && <span>Help & Support</span>}
        </button>
        <button
          onClick={toggleSidebar}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-white/60 hover:bg-white/5 hover:text-white"
        >
          <ChevronLeft
            className={cn('h-5 w-5 shrink-0 transition-transform', sidebarCollapsed && 'rotate-180')}
          />
          {!sidebarCollapsed && <span>Collapse</span>}
        </button>
        {!sidebarCollapsed && (
          <div className="mt-2 px-3 text-[10px] text-white/40">v1.0.0</div>
        )}
      </div>
    </aside>
  );
}

interface HeaderProps {
  title: string;
  subtitle?: string;
  showSearch?: boolean;
  action?: React.ReactNode;
}

export function Header({ title, subtitle, showSearch, action }: HeaderProps) {
  const { user } = useAuthStore();

  return (
    <header className="border-b border-gray-200 bg-white px-6 py-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-hoterra-navy">{title}</h1>
          {subtitle && <p className="mt-0.5 text-sm text-gray-500">{subtitle}</p>}
        </div>

        <div className="flex flex-1 items-center justify-end gap-4">
          {showSearch && (
            <div className="relative max-w-md flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="search"
                placeholder="Search documents, departments, users..."
                className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pl-10 pr-4 text-sm focus:border-hoterra-steel focus:outline-none focus:ring-1 focus:ring-hoterra-steel"
              />
            </div>
          )}
          {action}
          {user && (
            <div className="hidden items-center gap--2 md:flex">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-hoterra-steel text-xs font-semibold text-white">
                {getInitials(user.firstName, user.lastName)}
              </div>
              <div className="text-right">
                <div className="text-sm font-medium text-hoterra-navy">
                  {user.firstName} {user.lastName}
                </div>
                <div className="text-xs text-gray-500">{ROLE_LABELS[user.role]}</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

export function CreateDocumentButton() {
  return (
    <NavLink
      to="/documents/create"
      className="inline-flex items-center gap-2 rounded-lg bg-hoterra-navy px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-hoterra-steel"
    >
      <Plus className="h-4 w-4" />
      Create Document
    </NavLink>
  );
}

export function StatusBadge({ status }: { status: DocumentStatus }) {
  return (
    <span
      className={cn(
        'inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium',
        STATUS_COLORS[status]
      )}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

export function DepartmentBadge({
  name,
  color,
}: {
  name: string;
  color?: string;
}) {
  return (
    <span
      className="inline-flex rounded-md px-2 py-0.5 text-xs font-medium text-white"
      style={{ backgroundColor: color || '#294660' }}
    >
      {name}
    </span>
  );
}
