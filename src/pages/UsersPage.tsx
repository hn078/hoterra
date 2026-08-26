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
  TriangleAlert,
} from 'lucide-react';
import { Header, DepartmentBadge } from '@/components/layout/Sidebar';
import { DashStatCard } from '@/components/ui/DashStatCard';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { Pagination } from '@/components/ui/Pagination';
import { useAppDialog } from '@/components/ui/AppDialogProvider';
import { api } from '@/lib/api';
import type { User, Role, Department } from '@/types';
import { ROLE_LABELS } from '@/types';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/auth';
import { hasCapability } from '@/modules/access-control';

type UserRow = User & {
  _count?: { documents: number; signatures?: number };
};
type CustomRoleOption = { id: string; name: string; baseRole?: Role; isSystem: boolean };

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
  const currentUser = useAuthStore((state) => state.user);
  const dialog = useAppDialog();
  const canCreateUser = hasCapability(currentUser, 'users.create');
  const canUpdateUser = hasCapability(currentUser, 'users.update');
  const canManageRoles = hasCapability(currentUser, 'roles.manage');
  const canReadRoles = hasCapability(currentUser, 'roles.read');
  const canReadDocuments = hasCapability(currentUser, 'documents.read');
  const canAssignPrivileged = hasCapability(currentUser, 'roles.assign.privileged');
  const canEditUser = (target: UserRow) =>
    canUpdateUser && (canAssignPrivileged || !['SYSTEM_ADMINISTRATOR', 'GENERAL_MANAGER'].includes(target.role));
  const [users, setUsers] = useState<UserRow[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [customRoles, setCustomRoles] = useState<CustomRoleOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [page, setPage] = useState(1);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingUser, setEditingUser] = useState<UserRow | null>(null);
  const [editForm, setEditForm] = useState({ jobTitle: '', role: 'EMPLOYEE' as Role, customRoleId: '', departmentId: '', isActive: true });
  const [savingEdit, setSavingEdit] = useState(false);
  const [responsibilities, setResponsibilities] = useState<{
    total: number;
    actionNotifications: number;
    documentRevisions: number;
  } | null>(null);
  const [loadingResponsibilities, setLoadingResponsibilities] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newUser, setNewUser] = useState({
    email: '',
    password: '',
    firstName: '',
    lastName: '',
    jobTitle: '',
    role: 'EMPLOYEE' as Role,
    customRoleId: '',
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
    if (canReadRoles) {
      api.getRoles().then((data) => setCustomRoles(data.roles.filter((role) => !role.isSystem))).catch(console.error);
    }
  }, [canReadRoles]);

  const assignableSystemRoles = useMemo(
    () => Object.entries(ROLE_LABELS).filter(([role]) =>
      canAssignPrivileged || !['SYSTEM_ADMINISTRATOR', 'GENERAL_MANAGER'].includes(role)
    ),
    [canAssignPrivileged]
  );

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return users.filter((u) => {
      const matchesSearch =
        !q ||
        u.firstName.toLowerCase().includes(q) ||
        u.lastName.toLowerCase().includes(q) ||
        (u.jobTitle ?? '').toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.customRole?.name ?? ROLE_LABELS[u.role]).toLowerCase().includes(q) ||
        u.department?.name.toLowerCase().includes(q);
      const matchesRole = !filterRole || (
        filterRole.startsWith('custom:')
          ? u.customRole?.id === filterRole.slice('custom:'.length)
          : u.role === filterRole && !u.customRole
      );
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
    const totalDocs = canReadDocuments
      ? users.reduce((s, u) => s + (u._count?.documents ?? 0), 0)
      : 0;
    return { total: users.length, admins, managers, totalDocs };
  }, [users, canReadDocuments]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / LIMIT));
  const paginated = filtered.slice((page - 1) * LIMIT, page * LIMIT);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canCreateUser) return;
    setCreating(true);
    try {
      await api.createUser({
        ...newUser,
        departmentId: newUser.departmentId || undefined,
      });
      setShowAddModal(false);
      setNewUser({ email: '', password: '', firstName: '', lastName: '', jobTitle: '', role: 'EMPLOYEE', customRoleId: '', departmentId: '' });
      loadUsers();
    } catch (err) {
      await dialog.alert(err instanceof Error ? err.message : 'Failed to create user', { title: 'User not created' });
    } finally {
      setCreating(false);
    }
  };

  const openEditModal = (user: UserRow) => {
    if (!canEditUser(user)) return;
    setEditingUser(user);
    setEditForm({
      jobTitle: user.jobTitle ?? '',
      role: user.role,
      customRoleId: user.customRole?.id ?? '',
      departmentId: user.department?.id ?? '',
      isActive: user.isActive !== false,
    });
    setShowEditModal(true);
    setOpenMenuId(null);
    setResponsibilities(null);
    setLoadingResponsibilities(true);
    api.getUserResponsibilities(user.id)
      .then(setResponsibilities)
      .catch(console.error)
      .finally(() => setLoadingResponsibilities(false));
  };

  const changesResponsibilityScope = Boolean(editingUser && (
    editForm.isActive === false ||
    editForm.role !== editingUser.role ||
    editForm.customRoleId !== (editingUser.customRole?.id ?? '') ||
    editForm.departmentId !== (editingUser.department?.id ?? '')
  ));
  const responsibilityBlocked = Boolean(changesResponsibilityScope && responsibilities?.total);

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser || !canUpdateUser) return;
    setSavingEdit(true);
    try {
      await api.updateUser(editingUser.id, {
        jobTitle: editForm.jobTitle,
        role: editForm.role,
        customRoleId: editForm.customRoleId || null,
        departmentId: editForm.departmentId || null,
        isActive: editForm.isActive,
      });
      setShowEditModal(false);
      loadUsers();
    } catch (err) {
      await dialog.alert(err instanceof Error ? err.message : 'Failed to update user', { title: 'User not updated' });
    } finally {
      setSavingEdit(false);
    }
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-hoterra-page">
      <Header
        title={canReadRoles ? 'Users & Roles' : 'Department Users'}
        subtitle={canReadRoles
          ? 'Manage user accounts, access levels and permissions'
          : 'View active employees in your department'}
        action={(canManageRoles || canCreateUser) ?
          <div className="flex items-center gap-2">
            {canManageRoles && <Link to="/users/roles" className="btn-secondary">
              <Settings2 className="h-4 w-4" />
              Manage Roles
            </Link>}
            {canCreateUser && <button onClick={() => setShowAddModal(true)} className="btn-primary">
              <Plus className="h-4 w-4" />
              Add User
            </button>}
          </div>
        : undefined}
      />

      <div className="page-stats">
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <DashStatCard label="Total Users" value={stats.total} icon={Users} iconColor="text-blue-600" iconBg="bg-blue-50" />
          <DashStatCard label="Administrators" value={stats.admins} icon={Shield} iconColor="text-purple-600" iconBg="bg-purple-50" />
          <DashStatCard label="Managers & HODs" value={stats.managers} icon={UserCheck} iconColor="text-green-600" iconBg="bg-green-50" />
          {canReadDocuments && <DashStatCard label="Documents Authored" value={stats.totalDocs} icon={FileText} iconColor="text-cyan-600" iconBg="bg-cyan-50" />}
        </div>
      </div>

      <div className="border-b border-gray-200 bg-white px-6 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-full min-w-0 flex-1 sm:min-w-[280px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              placeholder="Search by name, job title, email, role or department..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-lg border border-gray-200 py-2.5 pl-10 pr-4 text-sm focus:border-hoterra-steel focus:outline-none focus:ring-1 focus:ring-hoterra-steel"
            />
          </div>
          <select value={filterRole} onChange={(e) => { setFilterRole(e.target.value); setPage(1); }} className="filter-select w-full sm:w-auto">
            <option value="">All Roles</option>
            {Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            {canReadRoles && customRoles.length > 0 && (
              <optgroup label="Custom Roles">
                {customRoles.map((role) => <option key={role.id} value={`custom:${role.id}`}>{role.name}</option>)}
              </optgroup>
            )}
          </select>
          <select value={filterStatus} onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }} className="filter-select w-full sm:w-auto">
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </div>

      <div className="hidden flex-1 overflow-auto bg-white md:block">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="sticky top-0 bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Department</th>
              <th className="px-4 py-3">Status</th>
              {canReadDocuments && <th className="px-4 py-3">Documents</th>}
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {loading ? (
              <tr>
                <td colSpan={canReadDocuments ? 7 : 6} className="px-6 py-12 text-center text-gray-500">Loading users...</td>
              </tr>
            ) : paginated.length === 0 ? (
              <tr>
                <td colSpan={canReadDocuments ? 7 : 6} className="px-6 py-12 text-center text-gray-500">No users found</td>
              </tr>
            ) : (
              paginated.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50/80">
                  <td className="px-4 py-3">
                    <Link to={`/users/${user.id}`} className="flex items-center gap-3">
                      <UserAvatar firstName={user.firstName} lastName={user.lastName} size="sm" />
                      <div>
                        <span className="font-medium text-hoterra-navy hover:text-hoterra-steel">
                          {user.firstName} {user.lastName}
                        </span>
                        {user.jobTitle && <p className="mt-0.5 text-xs text-gray-500">{user.jobTitle}</p>}
                      </div>
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{user.email}</td>
                  <td className="px-4 py-3">
                    <span className={cn('badge-pill', ROLE_BADGE_STYLE[user.role] ?? ROLE_BADGE_STYLE.EMPLOYEE)}>
                      {user.customRole?.name ?? ROLE_LABELS[user.role]}
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
                  {canReadDocuments && <td className="px-4 py-3 font-medium text-hoterra-navy">{user._count?.documents ?? 0}</td>}
                  <td className="px-4 py-3">
                    <div className="relative flex items-center gap-1">
                      <Link to={`/users/${user.id}`} className="rounded px-2 py-1 text-xs font-medium text-hoterra-steel hover:bg-gray-100">
                        View
                      </Link>
                      {canEditUser(user) && <button onClick={() => setOpenMenuId(openMenuId === user.id ? null : user.id)} className="rounded p-1.5 text-gray-400 hover:bg-gray-100">
                        <MoreHorizontal className="h-4 w-4" />
                      </button>}
                      {canEditUser(user) && openMenuId === user.id && (
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

      <div className="flex-1 space-y-3 overflow-y-auto bg-hoterra-page p-3 md:hidden">
        {loading ? (
          <div className="card p-8 text-center text-sm text-gray-500">Loading users...</div>
        ) : paginated.length === 0 ? (
          <div className="card p-8 text-center text-sm text-gray-500">No users found</div>
        ) : paginated.map((user) => (
          <article key={user.id} className="card p-4">
            <div className="flex items-start gap-3">
              <Link to={`/users/${user.id}`} aria-label={`Open ${user.firstName} ${user.lastName} profile`}>
                <UserAvatar firstName={user.firstName} lastName={user.lastName} size="sm" />
              </Link>
              <div className="min-w-0 flex-1">
                <Link to={`/users/${user.id}`} className="block truncate font-semibold text-hoterra-navy">
                  {user.firstName} {user.lastName}
                </Link>
                <p className="truncate text-sm text-gray-500">{user.email}</p>
                {user.jobTitle && <p className="mt-0.5 truncate text-xs font-medium text-gray-600">{user.jobTitle}</p>}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className={cn('badge-pill', ROLE_BADGE_STYLE[user.role] ?? ROLE_BADGE_STYLE.EMPLOYEE)}>
                    {user.customRole?.name ?? ROLE_LABELS[user.role]}
                  </span>
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${
                    user.isActive !== false ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'
                  }`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${user.isActive !== false ? 'bg-green-500' : 'bg-gray-400'}`} />
                    {user.isActive !== false ? 'Active' : 'Inactive'}
                  </span>
                </div>
              </div>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-gray-100 pt-3 text-sm">
              <div>
                <dt className="text-xs text-gray-400">Department</dt>
                <dd className="mt-1 font-medium text-gray-700">{user.department?.name ?? 'Unassigned'}</dd>
              </div>
              {canReadDocuments && <div>
                <dt className="text-xs text-gray-400">Documents</dt>
                <dd className="mt-1 font-medium text-gray-700">{user._count?.documents ?? 0}</dd>
              </div>}
            </dl>
            <div className="mt-4 flex gap-2">
              <Link to={`/users/${user.id}`} className="btn-secondary min-h-11 flex-1 justify-center">View Profile</Link>
              {canEditUser(user) && (
                <button type="button" onClick={() => openEditModal(user)} className="btn-primary min-h-11 flex-1 justify-center">Edit User</button>
              )}
            </div>
          </article>
        ))}
      </div>

      <Pagination page={page} totalPages={totalPages} total={filtered.length} limit={LIMIT} onPageChange={setPage} label="users" />

      {canCreateUser && showAddModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
          <div className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-xl sm:p-6">
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
                <label className="mb-1 block text-sm font-medium text-gray-700">Job Title</label>
                <input
                  required
                  maxLength={120}
                  value={newUser.jobTitle}
                  onChange={(e) => setNewUser({ ...newUser, jobTitle: e.target.value })}
                  className="input"
                  placeholder="e.g. Executive Housekeeper"
                />
                <p className="mt-1 text-xs text-gray-500">Operational position shown in the directory and captured on future signatures.</p>
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
                <p className="mt-1 text-xs text-gray-500">Must satisfy the hotel password policy configured in Security Settings.</p>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Role</label>
                <select
                  value={newUser.customRoleId || newUser.role}
                  onChange={(e) => {
                    const custom = customRoles.find((role) => role.id === e.target.value);
                    setNewUser({ ...newUser, role: custom?.baseRole ?? e.target.value as Role, customRoleId: custom?.id ?? '' });
                  }}
                  className="input"
                >
                  {assignableSystemRoles.map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                  {customRoles.length > 0 && <optgroup label="Custom Roles">{customRoles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</optgroup>}
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

      {showEditModal && editingUser && canEditUser(editingUser) && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
          <div className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-xl sm:p-6">
            <h2 className="mb-4 text-lg font-bold text-hoterra-navy">Edit User</h2>
            <p className="mb-4 text-sm text-gray-600">{editingUser.firstName} {editingUser.lastName} · {editingUser.email}</p>
            <form onSubmit={handleUpdateUser} className="space-y-4">
              {loadingResponsibilities && (
                <p className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-500">Checking open responsibilities…</p>
              )}
              {responsibilities && responsibilities.total > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  <div className="flex items-start gap-2">
                    <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                    <div>
                      <p className="font-semibold">{responsibilities.total} open responsibilities</p>
                      <p className="mt-1 text-xs leading-5">
                        {responsibilities.actionNotifications} approval/action tasks · {responsibilities.documentRevisions} document revisions.
                        Complete or formally reassign them before deactivation or changing role/department access.
                      </p>
                    </div>
                  </div>
                </div>
              )}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Job Title</label>
                <input required maxLength={120} value={editForm.jobTitle} onChange={(e) => setEditForm({ ...editForm, jobTitle: e.target.value })} className="input" placeholder="e.g. Executive Housekeeper" />
                <p className="mt-1 text-xs text-gray-500">Changing a title does not change access permissions.</p>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Role</label>
                <select value={editForm.customRoleId || editForm.role} onChange={(e) => { const custom = customRoles.find((role) => role.id === e.target.value); setEditForm({ ...editForm, role: custom?.baseRole ?? e.target.value as Role, customRoleId: custom?.id ?? '' }); }} className="input">
                  {assignableSystemRoles.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  {customRoles.length > 0 && <optgroup label="Custom Roles">{customRoles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</optgroup>}
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
                <button type="submit" disabled={savingEdit || responsibilityBlocked} className="btn-primary disabled:opacity-50">
                  {savingEdit ? 'Saving...' : responsibilityBlocked ? 'Resolve Open Tasks First' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
