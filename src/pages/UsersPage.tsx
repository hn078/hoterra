import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Users,
  UserCheck,
  Shield,
  FileText,
  Search,
  Filter,
  Plus,
  MoreHorizontal,
  Settings2,
} from 'lucide-react';
import { Header, DepartmentBadge } from '@/components/layout/Sidebar';
import { StatCard } from '@/components/ui/StatCard';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { Pagination } from '@/components/ui/Pagination';
import { api } from '@/lib/api';
import type { User } from '@/types';
import { ROLE_LABELS } from '@/types';
import { cn } from '@/lib/utils';

type UserRow = User & {
  _count?: { documents: number; signatures?: number };
};

const LIMIT = 20;

export function UsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    setLoading(true);
    api
      .getUsers()
      .then((data) => setUsers(data as UserRow[]))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.firstName.toLowerCase().includes(q) ||
        u.lastName.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        ROLE_LABELS[u.role].toLowerCase().includes(q) ||
        u.department?.name.toLowerCase().includes(q)
    );
  }, [users, search]);

  const stats = useMemo(() => {
    const admins = users.filter((u) => u.role === 'SYSTEM_ADMINISTRATOR').length;
    const managers = users.filter(
      (u) => u.role === 'GENERAL_MANAGER' || u.role === 'HOD' || u.role === 'FINANCE_DIRECTOR'
    ).length;
    const totalDocs = users.reduce((s, u) => s + (u._count?.documents ?? 0), 0);
    return { total: users.length, admins, managers, totalDocs };
  }, [users]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / LIMIT));
  const paginated = filtered.slice((page - 1) * LIMIT, page * LIMIT);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <Header
        title="Users & Roles"
        subtitle="Manage user accounts, access levels and permissions"
        action={
          <div className="flex items-center gap-2">
            <Link
              to="/users/roles"
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-hoterra-navy hover:bg-gray-50"
            >
              <Settings2 className="h-4 w-4" />
              Manage Roles
            </Link>
            <button className="inline-flex items-center gap-2 rounded-lg bg-hoterra-navy px-4 py-2 text-sm font-medium text-white hover:bg-hoterra-steel">
              <Plus className="h-4 w-4" />
              Add User
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-4 border-b border-gray-200 bg-gray-50 px-6 py-4 lg:grid-cols-4">
        <StatCard label="Total Users" value={stats.total} icon={Users} color="blue" />
        <StatCard label="Administrators" value={stats.admins} icon={Shield} color="purple" />
        <StatCard label="Managers & HODs" value={stats.managers} icon={UserCheck} color="green" />
        <StatCard label="Documents Authored" value={stats.totalDocs} icon={FileText} color="cyan" />
      </div>

      <div className="border-b border-gray-200 bg-white px-6 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[280px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              placeholder="Search by name, email, role or department..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-lg border border-gray-200 py-2 pl-10 pr-4 text-sm focus:border-hoterra-steel focus:outline-none"
            />
          </div>
          <button className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm hover:bg-gray-50">
            <Filter className="h-4 w-4" />
            Filter
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <table className="w-full min-w-[1000px] text-sm">
          <thead className="sticky top-0 bg-gray-50 text-left text-xs font-medium uppercase text-gray-500">
            <tr>
              <th className="px-6 py-3">
                <input type="checkbox" />
              </th>
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Department</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Documents</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {loading ? (
              <tr>
                <td colSpan={8} className="px-6 py-12 text-center text-gray-500">
                  Loading users...
                </td>
              </tr>
            ) : paginated.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-6 py-12 text-center text-gray-500">
                  No users found
                </td>
              </tr>
            ) : (
              paginated.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50">
                  <td className="px-6 py-3">
                    <input type="checkbox" />
                  </td>
                  <td className="px-4 py-3">
                    <Link to={`/users/${user.id}`} className="flex items-center gap-3">
                      <UserAvatar firstName={user.firstName} lastName={user.lastName} size="sm" />
                      <span className="font-medium text-hoterra-navy hover:text-hoterra-steel">
                        {user.firstName} {user.lastName}
                      </span>
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{user.email}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-md bg-hoterra-navy/10 px-2 py-0.5 text-xs font-medium text-hoterra-navy">
                      {ROLE_LABELS[user.role]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {user.department ? (
                      <DepartmentBadge name={user.department.name} color={user.department.color} />
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-green-700">
                      <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                      Active
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium text-hoterra-navy">
                    {user._count?.documents ?? 0}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <Link
                        to={`/users/${user.id}`}
                        className={cn(
                          'rounded px-2 py-1 text-xs font-medium text-hoterra-steel hover:bg-gray-100'
                        )}
                      >
                        View
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

      <Pagination
        page={page}
        totalPages={totalPages}
        total={filtered.length}
        limit={LIMIT}
        onPageChange={setPage}
        label="users"
      />
    </div>
  );
}
