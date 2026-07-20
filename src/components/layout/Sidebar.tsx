import { useEffect, useRef, useState } from 'react';
import { CountBadge } from '@/components/ui/CountBadge';
import { useNavBadges } from '@/hooks/useNavBadges';
import { HeaderActions } from '@/components/layout/HeaderActions';
import {
  LayoutDashboard,
  FileText,
  CheckSquare,
  LayoutTemplate,
  Building2,
  GitBranch,
  Users,
  Briefcase,
  BarChart3,
  Archive,
  ScrollText,
  Bell,
  Settings,
  HelpCircle,
  ChevronLeft,
  Search,
  Plus,
  ChevronDown,
  LogOut,
  User,
} from 'lucide-react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuthStore, useUIStore } from '@/store/auth';
import { ROLE_LABELS, STATUS_LABELS, STATUS_COLORS, type DocumentStatus } from '@/types';
import { cn, getInitials } from '@/lib/utils';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/documents', icon: FileText, label: 'Documents' },
  { to: '/approvals', icon: CheckSquare, label: 'My Approvals', badgeKey: 'approvals' as const },
  { to: '/templates', icon: LayoutTemplate, label: 'Templates' },
  { to: '/departments', icon: Building2, label: 'Departments' },
  { to: '/workflows', icon: GitBranch, label: 'Workflows' },
  { to: '/users', icon: Users, label: 'Users & Roles' },
  { to: '/workforce', icon: Briefcase, label: 'Casual Workforce' },
  { to: '/reports', icon: BarChart3, label: 'Reports' },
  { to: '/archive', icon: Archive, label: 'Archive' },
  { to: '/audit', icon: ScrollText, label: 'Audit Log' },
  { to: '/notifications', icon: Bell, label: 'Notifications', badgeKey: 'notifications' as const },
  { to: '/settings', icon: Settings, label: 'Settings' },
];

export function Sidebar() {
  const { user } = useAuthStore();
  const { sidebarCollapsed, toggleSidebar } = useUIStore();
  const navigate = useNavigate();
  const badges = useNavBadges();

  if (!user) return null;

  return (
    <aside
      className={cn(
        'flex flex-col bg-hoterra-navy text-white transition-all duration-300',
        sidebarCollapsed ? 'w-16' : 'w-64'
      )}
    >
      <div
        className={cn(
          'flex items-center border-b border-white/10 py-5',
          sidebarCollapsed ? 'justify-center px-0' : 'gap-3 px-4'
        )}
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-hoterra-gold font-bold text-hoterra-navy">
          H
        </div>
        {!sidebarCollapsed && (
          <div>
            <div className="text-sm font-bold tracking-wide">HOTERRA</div>
            <div className="text-[10px] leading-tight text-white/50">Document Management System</div>
          </div>
        )}
      </div>

      <div className={cn('border-b border-white/10 py-4', sidebarCollapsed ? 'px-0' : 'px-4')}>
        <div className={cn('flex items-center', sidebarCollapsed ? 'justify-center' : 'gap-3')}>
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

      <nav className={cn('flex-1 overflow-y-auto py-3', sidebarCollapsed ? 'px-1.5' : 'px-2')}>
        {navItems.map(({ to, icon: Icon, label, badgeKey }) => {
          const badge = badgeKey ? badges[badgeKey] : undefined;
          return (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              cn(
                'relative mb-0.5 flex items-center rounded-lg py-2.5 text-sm transition-colors',
                sidebarCollapsed ? 'justify-center px-0' : 'gap-3 px-3',
                isActive
                  ? 'nav-active shadow-sm'
                  : 'text-white/75 hover:bg-white/5 hover:text-white'
              )
            }
          >
            <Icon className="h-5 w-5 shrink-0" />
            {sidebarCollapsed && badge !== undefined && badge > 0 && (
              <CountBadge count={badge} className="absolute right-0.5 top-1" />
            )}
            {!sidebarCollapsed && (
              <>
                <span className="flex-1 truncate">{label}</span>
                {badge !== undefined && badge > 0 && <CountBadge count={badge} />}
              </>
            )}
          </NavLink>
        );})}
        {!sidebarCollapsed && (
          <button
            onClick={() => navigate('/search')}
            className="mb-0.5 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-white/70 hover:bg-white/5 hover:text-white"
          >
            <Search className="h-5 w-5 shrink-0" />
            <span>Search</span>
          </button>
        )}
      </nav>

      <div className={cn('border-t border-white/10', sidebarCollapsed ? 'p-1.5' : 'p-3')}>
        <button
          onClick={() => window.open('mailto:support@hoterra.az?subject=HOTERRA%20HDMS%20Support', '_blank')}
          className={cn(
            'mb-1 flex w-full items-center rounded-lg py-2 text-sm text-white/60 hover:bg-white/5 hover:text-white',
            sidebarCollapsed ? 'justify-center px-0' : 'gap-3 px-3'
          )}
        >
          <HelpCircle className="h-5 w-5 shrink-0" />
          {!sidebarCollapsed && <span>Help & Support</span>}
        </button>
        <button
          onClick={toggleSidebar}
          className={cn(
            'flex w-full items-center rounded-lg py-2 text-sm text-white/60 hover:bg-white/5 hover:text-white',
            sidebarCollapsed ? 'justify-center px-0' : 'gap-3 px-3'
          )}
        >
          <ChevronLeft
            className={cn('h-5 w-5 shrink-0 transition-transform', sidebarCollapsed && 'rotate-180')}
          />
          {!sidebarCollapsed && <span>Collapse</span>}
        </button>
        {!sidebarCollapsed && (
          <div className="mt-3 flex items-center gap-2 px-3">
            <div className="flex h-6 w-6 items-center justify-center rounded bg-hoterra-gold text-[10px] font-bold text-hoterra-navy">
              H
            </div>
            <span className="text-[10px] text-white/40">HOTERRA v1.0.3</span>
          </div>
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
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = async () => {
    setMenuOpen(false);
    await logout();
    navigate('/login');
  };

  const handleSearch = () => {
    const q = searchQuery.trim();
    if (q) {
      navigate(`/search?q=${encodeURIComponent(q)}`);
    } else {
      navigate('/search');
    }
  };

  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="flex items-center justify-between gap-4 px-6 py-4">
        <div className="min-w-[200px] shrink-0">
          <h1 className="text-xl font-bold text-hoterra-navy">{title}</h1>
          {subtitle && <p className="mt-0.5 text-sm text-gray-500">{subtitle}</p>}
        </div>

        {showSearch && (
          <div className="relative mx-4 hidden max-w-xl flex-1 md:block">
            <button
              type="button"
              onClick={handleSearch}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <Search className="h-4 w-4" />
            </button>
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="Search documents, departments, users..."
              className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2.5 pl-10 pr-4 text-sm focus:border-hoterra-steel focus:outline-none focus:ring-1 focus:ring-hoterra-steel"
            />
          </div>
        )}

        <div className="flex shrink-0 items-center gap-2">
          <HeaderActions />
          {action}
          {user && (
            <div ref={menuRef} className="relative ml-2 hidden md:block">
              <button
                type="button"
                onClick={() => setMenuOpen((o) => !o)}
                className="flex items-center gap-2 border-l border-gray-200 pl-4"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-hoterra-steel text-xs font-semibold text-white">
                  {getInitials(user.firstName, user.lastName)}
                </div>
                <div className="text-right">
                  <div className="text-sm font-medium text-hoterra-navy">
                    {user.firstName} {user.lastName}
                  </div>
                  <div className="text-xs text-gray-500">{ROLE_LABELS[user.role]}</div>
                </div>
                <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${menuOpen ? 'rotate-180' : ''}`} />
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-full z-50 mt-2 w-48 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
                  <button
                    type="button"
                    onClick={() => { setMenuOpen(false); navigate(`/users/${user.id}`); }}
                    className="flex w-full items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    <User className="h-4 w-4" />
                    My Profile
                  </button>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="flex w-full items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                  >
                    <LogOut className="h-4 w-4" />
                    Logout
                  </button>
                </div>
              )}
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
      className="inline-flex items-center gap-2 rounded-lg bg-hoterra-navy px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-hoterra-steel"
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

export function DepartmentBadge({ name, color }: { name: string; color?: string }) {
  const bg = color ? `${color}22` : '#29466022';
  const text = color || '#294660';
  return (
    <span
      className="badge-pill font-medium"
      style={{ backgroundColor: bg, color: text }}
    >
      {name}
    </span>
  );
}
