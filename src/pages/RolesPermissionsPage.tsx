import { useEffect, useState } from 'react';
import { Shield, Users, Lock, Plus, Save, X } from 'lucide-react';
import { Header } from '@/components/layout/Sidebar';
import { Breadcrumbs } from '@/components/ui/Breadcrumbs';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { Role } from '@/types';
import { ROLE_LABELS } from '@/types';
import { useAuthStore } from '@/store/auth';

type RoleData = {
  id: string;
  name: string;
  description: string;
  userCount: number;
  isSystem: boolean;
  baseRole?: Role;
  permissions: Record<string, boolean[]>;
};

export function RolesPermissionsPage() {
  const [roles, setRoles] = useState<RoleData[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draftPermissions, setDraftPermissions] = useState<Record<string, boolean[]>>({});
  const [newRole, setNewRole] = useState({ name: '', description: '', baseRole: 'EMPLOYEE' as Role });
  const currentUser = useAuthStore((state) => state.user);
  const canManage = currentUser?.role === 'SYSTEM_ADMINISTRATOR' || currentUser?.role === 'GENERAL_MANAGER';

  const loadRoles = async (preferredId?: string) => {
    const data = await api.getRoles();
    setRoles(data.roles);
    setColumns(data.columns);
    setSelectedId(preferredId && data.roles.some((r) => r.id === preferredId) ? preferredId : (selectedId || data.roles[0]?.id || ''));
  };

  useEffect(() => {
    api.getRoles()
      .then((data) => {
        setRoles(data.roles); setColumns(data.columns); setSelectedId(data.roles[0]?.id || '');
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const selected = roles.find((r) => r.id === selectedId) ?? roles[0];

  useEffect(() => {
    if (selected) setDraftPermissions(Object.fromEntries(Object.entries(selected.permissions).map(([key, row]) => [key, [...row]])));
  }, [selectedId, roles]);

  const createRole = async (e: React.FormEvent) => {
    e.preventDefault(); setCreating(true);
    try {
      const created = await api.createRole(newRole) as { id: string };
      await loadRoles(created.id); setShowCreate(false);
      setNewRole({ name: '', description: '', baseRole: 'EMPLOYEE' });
    } catch (error) { alert(error instanceof Error ? error.message : 'Failed to create role'); }
    finally { setCreating(false); }
  };

  const savePermissions = async () => {
    if (!selected || selected.isSystem) return; setSaving(true);
    try { await api.updateRole(selected.id, { permissions: draftPermissions }); await loadRoles(selected.id); }
    catch (error) { alert(error instanceof Error ? error.message : 'Failed to save permissions'); }
    finally { setSaving(false); }
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
        <p className="text-gray-500">No roles found</p>
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
          items={[
            { label: 'Users & Roles', to: '/users' },
            { label: 'Roles & Permissions' },
          ]}
        />
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-white md:flex-row md:overflow-hidden">
        <aside className="max-h-72 w-full shrink-0 overflow-y-auto border-b border-gray-200 md:max-h-none md:w-72 md:border-b-0 md:border-r">
          <div className="border-b border-gray-100 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
              System Roles
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
                  <span className="text-sm font-medium">{role.name}</span>
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
            <h2 className="text-lg font-bold text-hoterra-navy">{selected.name}</h2>
            <p className="text-sm text-gray-500">{selected.description}</p>
          </div>

          <div className="flex-1 overflow-auto bg-hoterra-page p-6">
            <div className="card overflow-x-auto">
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
                            onChange={(e) => setDraftPermissions((current) => ({ ...current, [module]: current[module].map((value, index) => index === i ? e.target.checked : value) }))}
                            disabled={selected.isSystem || !canManage}
                            className="h-4 w-4 rounded border-gray-300 text-hoterra-steel focus:ring-hoterra-steel disabled:opacity-100"
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex items-center justify-between">
              <p className="text-xs text-gray-400">{selected.isSystem ? 'System roles are protected. Create a custom role to change permissions.' : 'Custom-role permissions can be managed by administrators.'}</p>
              {!selected.isSystem && canManage && <button onClick={savePermissions} disabled={saving} className="btn-primary"><Save className="h-4 w-4" />{saving ? 'Saving...' : 'Save Permissions'}</button>}
            </div>
          </div>
        </div>
      </div>
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-bold text-hoterra-navy">Create New Role</h2><button onClick={() => setShowCreate(false)}><X className="h-5 w-5" /></button></div>
            <form onSubmit={createRole} className="space-y-4">
              <div><label className="mb-1 block text-sm font-medium">Role Name</label><input required value={newRole.name} onChange={(e) => setNewRole({ ...newRole, name: e.target.value })} className="input" /></div>
              <div><label className="mb-1 block text-sm font-medium">Description</label><textarea value={newRole.description} onChange={(e) => setNewRole({ ...newRole, description: e.target.value })} className="input min-h-20" /></div>
              <div><label className="mb-1 block text-sm font-medium">Base Access Level</label><select value={newRole.baseRole} onChange={(e) => setNewRole({ ...newRole, baseRole: e.target.value as Role })} className="input">{Object.entries(ROLE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><p className="mt-1 text-xs text-gray-500">Copies initial permissions and controls existing workflow compatibility.</p></div>
              <div className="flex justify-end gap-2"><button type="button" onClick={() => setShowCreate(false)} className="btn-secondary">Cancel</button><button disabled={creating} className="btn-primary">{creating ? 'Creating...' : 'Create Role'}</button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
