import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Users,
  UserCheck,
  Shield,
  FileText,
  Search,
  Plus,
  MoreHorizontal,
  Settings2,
} from 'lucide-react';
import { Header, DepartmentBadge } from '@/components/layout/Sidebar';
import { DashStatCard } from '@/components/ui/DashStatCard';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { Pagination } from '@/components/ui/Pagination';
import { api } from '@/lib/api';
import type { User, Role, Department } from '@/types';
import { ROLE_LABELS } from '@/types';
import { cn } from '@/lib/utils';

type UserRow = User & {
  _count?: { documents: number; signatures?: number };
};

const ROLE_BADGE_STYLE: Record<string, string> = {
  SYSTEM_ADMINISTRATOR: 'bg-purple-100 text-purple-800',
  GENERAL_MANAGER: 'bg-hoterra-navy/10 text-hoterra-navy',
  FINANCE_DIRECTOR: 'bg-blue-100 text-blue-800',
  HOD: 'bg-green-100 text-green-800',
  SUPERVISOR: 'bg-amber-100 text-amber-800',
  EMPLOYEE: 'bg-gray-100 text-gray-700',
};

const LIMIT = 20;

export function UsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [page, setPage] = useState(1);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingUser, setEditingUser] = useState<UserRow | null>(null);
  const [editForm, setEditForm] = useState({ role: 'EMPLOYEE' as Role, departmentId: '', isActive: true });
  const [savingEdit, setSavingEdit] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newUser, setNewUser] = useState({
    email: '',
    password: '',
    firstName: '',
    lastName: '',
    role: 'EMPLOYEE' as Role,
    departmentId: '',
  });

  const loadUsers = () => {
    setLoading(true);
    api
      .getUsers()
      .then((data) => setUsers(data as UserRow[]))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadUsers();
    api.getDepartments().then(setDepartments).catch(console.error);
  }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return users.filter((u) => {
      const matchesSearch =
        !q ||
        u.firstName.toLowerCase().includes(q) ||
        u.lastName.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        ROLE_LABELS[u.role].toLowerCase().includes(q) ||
        u.department?.name.toLowerCase().includes(q);
      const matchesRole = !filterRole || u.role === filterRole;
      const isActive = u.isActive !== false;
      const matchesStatus =
        !filterStatus ||
        (filterStatus === 'active' && isActive) ||
        (filterStatus === 'inactive' && !isActive);
      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [users, search, filterRole, filterStatus]);

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

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      await api.createUser({
        ...newUser,
        departmentId: newUser.departmentId || undefined,
      });
      setShowAddModal(false);
      setNewUser({ email: '', password: '', firstName: '', lastName: '', role: 'EMPLOYEE', departmentId: '' });
      loadUsers();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to create user');
    } finally {
      setCreating(false);
    }
  };

  const openEditModal = (user: UserRow) => {
    setEditingUser(user);
    setEditForm({
      role: user.role,
      departmentId: user.department?.id ?? '',
      isActive: user.isActive !== false,
    });
    setShowEditModal(true);
    setOpenMenuId(null);
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setSavingEdit(true);
    try {
      await api.updateUser(editingUser.id, {
        role: editForm.role,
        departmentId: editForm.departmentId || null,
        isActive: editForm.isActive,
      });
      setShowEditModal(false);
      loadUsers();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update user');
    } finally {
      setSavingEdit(false);
    }
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-hoterra-page">
      <Header
        title="Users & Roles"
        subtitle="Manage user accounts, access levels and permissions"
        action={
          <div className="flex items-center gap-2">
            <Link to="/users/roles" className="btn-secondary">
              <Settings2 className="h-4 w-4" />
              Manage Roles
            </Link>
            <button onClick={() => setShowAddModal(true)} className="btn-primary">
              <Plus className="h-4 w-4" />
              Add User
            </button>
          </div>
        }
      />

      <div className="page-stats">
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <DashStatCard label="Total Users" value={stats.total} icon={Users} iconColor="text-blue-600" iconBg="bg-blue-50" />
          <DashStatCard label="Administrators" value={stats.admins} icon={Shield} iconColor="text-purple-600" iconBg="bg-purple-50" />
          <DashStatCard label="Managers & HODs" value={stats.managers} icon={UserCheck} iconColor="text-green-600" iconBg="bg-green-50" />
          <DashStatCard label="Documents Authored" value={stats.totalDocs} icon={FileText} iconColor="text-cyan-600" iconBg="bg-cyan-50" />
        </div>
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
              className="w-full rounded-lg border border-gray-200 py-2.5 pl-10 pr-4 text-sm focus:border-hoterra-steel focus:outline-none focus:ring-1 focus:ring-hoterra-steel"
            />
          </div>
          <select value={filterRole} onChange={(e) => { setFilterRole(e.target.value); setPage(1); }} className="filter-select">
            <option value="">All Roles</option>
            {Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select value={filterStatus} onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }} className="filter-select">
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-white">
        <table className="w-full min-w-[1000px] text-sm">
          <thead className="sticky top-0 bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-6 py-3"><input type="checkbox" className="rounded" /></th>
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
                <td colSpan={8} className="px-6 py-12 text-center text-gray-500">Loading users...</td>
              </tr>
            ) : paginated.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-6 py-12 text-center text-gray-500">No users found</td>
              </tr>
            ) : (
              paginated.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50/80">
                  <td className="px-6 py-3"><input type="checkbox" className="rounded" /></td>
                  <td className="px-4 py-3">
                    <Link to={`/users/${user.id}`} className="flex items-center gap-3">
                      <UserAvatar firstName={user.firstName} lastName={user.lastName} size="sm" />
                      <div>
                        <span className="font-medium text-hoterra-navy hover:text-hoterra-steel">
                          {user.firstName} {user.lastName}
                        </span>
                      </div>
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{user.email}</td>
                  <td className="px-4 py-3">
                    <span className={cn('badge-pill', ROLE_BADGE_STYLE[user.role] ?? ROLE_BADGE_STYLE.EMPLOYEE)}>
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
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      user.isActive !== false ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'
                    }`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${user.isActive !== false ? 'bg-green-500' : 'bg-gray-400'}`} />
                      {user.isActive !== false ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium text-hoterra-navy">{user._count?.documents ?? 0}</td>
                  <td className="px-4 py-3">
                    <div className="relative flex items-center gap-1">
                      <Link to={`/users/${user.id}`} className="rounded px-2 py-1 text-xs font-medium text-hoterra-steel hover:bg-gray-100">
                        View
                      </Link>
                      <button onClick={() => setOpenMenuId(openMenuId === user.id ? null : user.id)} className="rounded p-1.5 text-gray-400 hover:bg-gray-100">
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                      {openMenuId === user.id && (
                        <div className="absolute right-0 top-full z-20 mt-1 w-36 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
                          <button onClick={() => openEditModal(user)} className="block w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50">Edit User</button>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Pagination page={page} totalPages={totalPages} total={filtered.length} limit={LIMIT} onPageChange={setPage} label="users" />

      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h2 className="mb-4 text-lg font-bold text-hoterra-navy">Add User</h2>
            <form onSubmit={handleCreateUser} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">First Name</label>
                  <input
                    required
                    value={newUser.firstName}
                    onChange={(e) => setNewUser({ ...newUser, firstName: e.target.value })}
                    className="input"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Last Name</label>
                  <input
                    required
                    value={newUser.lastName}
                    onChange={(e) => setNewUser({ ...newUser, lastName: e.target.value })}
                    className="input"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Email</label>
                <input
                  required
                  type="email"
                  value={newUser.email}
                  onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                  className="input"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Password</label>
                <input
                  required
                  type="password"
                  value={newUser.password}
                  onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                  className="input"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Role</label>
                <select
                  value={newUser.role}
                  onChange={(e) => setNewUser({ ...newUser, role: e.target.value as Role })}
                  className="input"
                >
                  {Object.entries(ROLE_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Department</label>
                <select
                  value={newUser.departmentId}
                  onChange={(e) => setNewUser({ ...newUser, departmentId: e.target.value })}
                  className="input"
                >
                  <option value="">None</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowAddModal(false)} className="btn-secondary">
                  Cancel
                </button>
                <button type="submit" disabled={creating} className="btn-primary disabled:opacity-50">
                  {creating ? 'Creating...' : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showEditModal && editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h2 className="mb-4 text-lg font-bold text-hoterra-navy">Edit User</h2>
            <p className="mb-4 text-sm text-gray-600">{editingUser.firstName} {editingUser.lastName} · {editingUser.email}</p>
            <form onSubmit={handleUpdateUser} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Role</label>
                <select value={editForm.role} onChange={(e) => setEditForm({ ...editForm, role: e.target.value as Role })} className="input">
                  {Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Department</label>
                <select value={editForm.departmentId} onChange={(e) => setEditForm({ ...editForm, departmentId: e.target.value })} className="input">
                  <option value="">None</option>
                  {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="editActive" checked={editForm.isActive} onChange={(e) => setEditForm({ ...editForm, isActive: e.target.checked })} className="rounded" />
                <label htmlFor="editActive" className="text-sm text-gray-700">Active account</label>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowEditModal(false)} className="btn-secondary">Cancel</button>
                <button type="submit" disabled={savingEdit} className="btn-primary disabled:opacity-50">{savingEdit ? 'Saving...' : 'Save Changes'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
