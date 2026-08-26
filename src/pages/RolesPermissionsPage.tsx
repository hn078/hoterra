import { useEffect, useState } from 'react';
import { Shield, Users, Lock, Plus, RotateCcw, Save, Trash2, X } from 'lucide-react';
import { Header } from '@/components/layout/Sidebar';
import { Breadcrumbs } from '@/components/ui/Breadcrumbs';
import { useAppDialog } from '@/components/ui/AppDialogProvider';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { Role } from '@/types';
import { ROLE_LABELS } from '@/types';
import { useAuthStore } from '@/store/auth';
import { hasCapability } from '@/modules/access-control';

type RoleData = {
  id: string;
  name: string;
  description: string;
  userCount: number;
  isSystem: boolean;
  isActive: boolean;
  baseRole?: Role;
  permissions: Record<string, boolean[]>;
};

export function RolesPermissionsPage() {
  const dialog = useAppDialog();
  const [roles, setRoles] = useState<RoleData[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showDeactivate, setShowDeactivate] = useState(false);
  const [deactivating, setDeactivating] = useState(false);
  const [activating, setActivating] = useState(false);
  const [draftPermissions, setDraftPermissions] = useState<Record<string, boolean[]>>({});
  const [newRole, setNewRole] = useState({ name: '', description: '', baseRole: 'EMPLOYEE' as Role });
  const currentUser = useAuthStore((state) => state.user);
  const canManage = hasCapability(currentUser, 'roles.manage');
  const canReadUsers = hasCapability(currentUser, 'users.directory.read');
  const canAssignPrivileged = hasCapability(currentUser, 'roles.assign.privileged');
  const assignableBaseRoles = Object.entries(ROLE_LABELS).filter(([role]) =>
    canAssignPrivileged || !['SYSTEM_ADMINISTRATOR', 'GENERAL_MANAGER'].includes(role)
  );

  const loadRoles = async (preferredId?: string) => {
    const data = await api.getRoles();
    setRoles(data.roles);
    setColumns(data.columns);
    setSelectedId(
      preferredId && data.roles.some((role) => role.id === preferredId)
        ? preferredId
        : data.roles.some((role) => role.id === selectedId)
          ? selectedId
          : data.roles[0]?.id || ''
    );
  };

  useEffect(() => {
    api.getRoles()
      .then((data) => {
        setRoles(data.roles); setColumns(data.columns); setSelectedId(data.roles[0]?.id || '');
      })
      .catch((error) => setLoadError(error instanceof Error ? error.message : 'Roles could not be loaded'))
      .finally(() => setLoading(false));
  }, []);

  const selected = roles.find((r) => r.id === selectedId) ?? roles[0];

  useEffect(() => {
    if (selected) setDraftPermissions(Object.fromEntries(Object.entries(selected.permissions).map(([key, row]) => [key, [...row]])));
  }, [selectedId, roles]);

  const createRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManage) return;
    setCreating(true);
    try {
      const created = await api.createRole(newRole) as { id: string };
      await loadRoles(created.id); setShowCreate(false);
      setNewRole({ name: '', description: '', baseRole: 'EMPLOYEE' });
    } catch (error) { await dialog.alert(error instanceof Error ? error.message : 'Failed to create role', { title: 'Role not created' }); }
    finally { setCreating(false); }
  };

  const savePermissions = async () => {
    if (!canManage || !selected || selected.isSystem) return; setSaving(true);
    try { await api.updateRole(selected.id, { permissions: draftPermissions }); await loadRoles(selected.id); }
    catch (error) { await dialog.alert(error instanceof Error ? error.message : 'Failed to save permissions', { title: 'Permissions not saved' }); }
    finally { setSaving(false); }
  };

  const updatePermission = (module: string, index: number, checked: boolean) => {
    setDraftPermissions((current) => {
      const next = [...current[module]];
      const readIndex = columns.indexOf('Read');
      const fullAccessIndex = columns.indexOf('Full Access');
      if (index === fullAccessIndex) {
        next.fill(checked);
      } else if (index === readIndex && !checked) {
        next.fill(false);
      } else {
        next[index] = checked;
        if (checked && readIndex >= 0) next[readIndex] = true;
        if (!checked && fullAccessIndex >= 0) next[fullAccessIndex] = false;
      }
      return { ...current, [module]: next };
    });
  };

  const deactivateRole = async () => {
    if (!canManage || !selected || selected.isSystem || selected.userCount > 0) return;
    setDeactivating(true);
    try {
      await api.deactivateRole(selected.id);
      setShowDeactivate(false);
      await loadRoles();
    } catch (error) {
      await dialog.alert(error instanceof Error ? error.message : 'Failed to deactivate role', { title: 'Role not deactivated' });
    } finally {
      setDeactivating(false);
    }
  };

  const reactivateRole = async () => {
    if (!canManage || !selected || selected.isSystem || selected.isActive) return;
    if (!await dialog.confirm(
      `Reactivate “${selected.name}”? It will become available for new user assignments.`,
      { title: 'Reactivate role', confirmLabel: 'Reactivate' },
    )) return;
    setActivating(true);
    try {
      await api.reactivateRole(selected.id);
      await loadRoles(selected.id);
    } catch (error) {
      await dialog.alert(error instanceof Error ? error.message : 'Failed to reactivate role', { title: 'Role not reactivated' });
    } finally {
      setActivating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-gray-500">Loading roles...</p>
      </div>
    );
  }

  if (!selected) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="max-w-md px-6 text-center">
          <p className="font-medium text-hoterra-navy">{loadError ? 'Roles unavailable' : 'No roles found'}</p>
          {loadError && <p className="mt-2 text-sm text-gray-500">{loadError}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-hoterra-page">
      <Header
        title="Roles & Permissions"
        subtitle="Configure role-based access control for the system"
        action={canManage ? <button onClick={() => setShowCreate(true)} className="btn-primary"><Plus className="h-4 w-4" />New Role</button> : undefined}
      />

      <div className="border-b border-gray-200 bg-white px-6 pb-4 pt-2">
        <Breadcrumbs
          items={canReadUsers
            ? [{ label: 'Users & Roles', to: '/users' }, { label: 'Roles & Permissions' }]
            : [{ label: 'Roles & Permissions' }]}
        />
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-white md:flex-row md:overflow-hidden">
        <aside className="max-h-72 w-full shrink-0 overflow-y-auto border-b border-gray-200 md:max-h-none md:w-72 md:border-b-0 md:border-r">
          <div className="border-b border-gray-100 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
              Available roles
            </p>
          </div>
          <div className="p-2">
            {roles.map((role) => (
              <button
                key={role.id}
                onClick={() => setSelectedId(role.id)}
                className={cn(
                  'mb-1 w-full rounded-lg px-3 py-3 text-left transition-colors',
                  selectedId === role.id
                    ? 'nav-active'
                    : 'hover:bg-gray-50 text-gray-700'
                )}
              >
                <div className="flex items-center gap-2">
                  <Shield
                    className={cn(
                      'h-4 w-4 shrink-0',
                      selectedId === role.id ? 'text-hoterra-gold' : 'text-gray-400'
                    )}
                  />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{role.name}</span>
                  {!role.isActive && (
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                      Inactive
                    </span>
                  )}
                </div>
                <p
                  className={cn(
                    'mt-0.5 pl-6 text-xs',
                    selectedId === role.id ? 'text-hoterra-navy/70' : 'text-gray-500'
                  )}
                >
                  {role.description}
                </p>
                <div
                  className={cn(
                    'mt-1.5 flex items-center gap-1 pl-6 text-xs',
                    selectedId === role.id ? 'text-hoterra-navy/60' : 'text-gray-400'
                  )}
                >
                  <Users className="h-3 w-3" />
                  {role.userCount} users
                  {role.isSystem && (
                    <span className="ml-2 flex items-center gap-0.5">
                      <Lock className="h-3 w-3" />
                      System
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </aside>

        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="border-b border-gray-200 bg-white px-6 py-4">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-bold text-hoterra-navy">{selected.name}</h2>
              {!selected.isActive && <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-600">Inactive</span>}
            </div>
            <p className="text-sm text-gray-500">{selected.description}</p>
          </div>

          <div className="flex-1 overflow-auto bg-hoterra-page p-6">
            <div className="card hidden overflow-x-auto md:block">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Module
                    </th>
                    {columns.map((col) => (
                      <th
                        key={col}
                        className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-wide text-gray-500"
                      >
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(selected.permissions).map(([module, perms]) => (
                    <tr key={module} className="border-b border-gray-50 hover:bg-gray-50/50">
                      <td className="px-4 py-3 font-medium text-gray-800">{module}</td>
                      {perms.map((checked, i) => (
                        <td key={i} className="px-3 py-3 text-center">
                          <input
                            type="checkbox"
                            checked={draftPermissions[module]?.[i] ?? checked}
                            onChange={(e) => updatePermission(module, i, e.target.checked)}
                            disabled={selected.isSystem || !selected.isActive || !canManage}
                            className="h-4 w-4 rounded border-gray-300 text-hoterra-steel focus:ring-hoterra-steel disabled:opacity-100"
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="space-y-3 md:hidden">
              {Object.entries(selected.permissions).map(([module, perms]) => (
                <section key={module} className="card p-4">
                  <h3 className="font-semibold text-hoterra-navy">{module}</h3>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {perms.map((checked, index) => (
                      <label
                        key={columns[index] ?? index}
                        className={cn(
                          'flex min-h-11 items-center gap-2 rounded-lg border px-3 py-2 text-sm',
                          draftPermissions[module]?.[index] ?? checked
                            ? 'border-hoterra-steel/30 bg-blue-50 text-hoterra-navy'
                            : 'border-gray-200 bg-white text-gray-600',
                          (selected.isSystem || !selected.isActive || !canManage) && 'cursor-default opacity-75',
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={draftPermissions[module]?.[index] ?? checked}
                          onChange={(event) => updatePermission(module, index, event.target.checked)}
                          disabled={selected.isSystem || !selected.isActive || !canManage}
                          className="h-5 w-5 rounded border-gray-300 text-hoterra-steel focus:ring-hoterra-steel"
                        />
                        <span>{columns[index]}</span>
                      </label>
                    ))}
                  </div>
                </section>
              ))}
            </div>

            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-gray-400">{selected.isSystem ? 'System roles are protected. Create a custom role to change permissions.' : !selected.isActive ? 'Inactive roles are read-only until reactivated.' : 'Read access is required automatically for create, update, delete, export, and manage permissions.'}</p>
              {!selected.isSystem && canManage && selected.isActive && <div className="grid grid-cols-1 gap-2 sm:flex sm:items-center">
                <button
                  onClick={() => setShowDeactivate(true)}
                  disabled={selected.userCount > 0}
                  title={selected.userCount > 0 ? 'Reassign all users before deactivating this role' : 'Deactivate role'}
                  className="btn-secondary min-h-11 justify-center text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Trash2 className="h-4 w-4" />Deactivate
                </button>
                <button onClick={savePermissions} disabled={saving} className="btn-primary min-h-11 justify-center"><Save className="h-4 w-4" />{saving ? 'Saving...' : 'Save Permissions'}</button>
              </div>}
              {!selected.isSystem && canManage && !selected.isActive && (
                <button onClick={() => void reactivateRole()} disabled={activating || selected.userCount > 0} className="btn-primary min-h-11 justify-center disabled:cursor-not-allowed disabled:opacity-40" title={selected.userCount > 0 ? 'Reassign all users before reactivating this role' : 'Reactivate role'}>
                  <RotateCcw className="h-4 w-4" />{activating ? 'Reactivating...' : 'Reactivate role'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
          <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:max-w-md sm:rounded-xl sm:p-6">
            <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-bold text-hoterra-navy">Create New Role</h2><button onClick={() => setShowCreate(false)}><X className="h-5 w-5" /></button></div>
            <form onSubmit={createRole} className="space-y-4">
              <div><label className="mb-1 block text-sm font-medium">Role Name</label><input required value={newRole.name} onChange={(e) => setNewRole({ ...newRole, name: e.target.value })} className="input" /></div>
              <div><label className="mb-1 block text-sm font-medium">Description</label><textarea value={newRole.description} onChange={(e) => setNewRole({ ...newRole, description: e.target.value })} className="input min-h-20" /></div>
              <div><label className="mb-1 block text-sm font-medium">Base Access Level</label><select value={newRole.baseRole} onChange={(e) => setNewRole({ ...newRole, baseRole: e.target.value as Role })} className="input">{assignableBaseRoles.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><p className="mt-1 text-xs text-gray-500">Copies initial permissions and controls existing workflow compatibility.</p></div>
              <div className="flex justify-end gap-2"><button type="button" onClick={() => setShowCreate(false)} className="btn-secondary">Cancel</button><button disabled={creating} className="btn-primary">{creating ? 'Creating...' : 'Create Role'}</button></div>
            </form>
          </div>
        </div>
      )}
      {showDeactivate && !selected.isSystem && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
          <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:max-w-md sm:rounded-xl sm:p-6">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-bold text-hoterra-navy">Deactivate role</h2>
              <button onClick={() => setShowDeactivate(false)} disabled={deactivating}><X className="h-5 w-5" /></button>
            </div>
            <p className="text-sm leading-6 text-gray-600">
              <strong>{selected.name}</strong> will no longer be available for new assignments. This action is blocked while any user is assigned to it.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setShowDeactivate(false)} disabled={deactivating} className="btn-secondary">Cancel</button>
              <button onClick={() => void deactivateRole()} disabled={deactivating} className="btn-primary bg-red-600 hover:bg-red-700">
                {deactivating ? 'Deactivating...' : 'Deactivate role'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
