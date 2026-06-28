import { useEffect, useState } from 'react';
import { Shield, Users, Lock } from 'lucide-react';
import { Header } from '@/components/layout/Sidebar';
import { Breadcrumbs } from '@/components/ui/Breadcrumbs';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

type RoleData = {
  id: string;
  name: string;
  description: string;
  userCount: number;
  isSystem: boolean;
  permissions: Record<string, boolean[]>;
};

export function RolesPermissionsPage() {
  const [roles, setRoles] = useState<RoleData[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .getRoles()
      .then((data) => {
        setRoles(data.roles);
        setColumns(data.columns);
        if (data.roles.length > 0) {
          setSelectedId(data.roles[0].id);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const selected = roles.find((r) => r.id === selectedId) ?? roles[0];

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
      />

      <div className="border-b border-gray-200 bg-white px-6 pb-4 pt-2">
        <Breadcrumbs
          items={[
            { label: 'Users & Roles', to: '/users' },
            { label: 'Roles & Permissions' },
          ]}
        />
      </div>

      <div className="flex flex-1 overflow-hidden bg-white">
        <aside className="w-72 shrink-0 overflow-y-auto border-r border-gray-200">
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
                            checked={checked}
                            readOnly
                            disabled
                            className="h-4 w-4 rounded border-gray-300 text-hoterra-steel focus:ring-hoterra-steel disabled:opacity-100"
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="mt-4 text-xs text-gray-400">
              Permissions are read-only in this view. Contact a system administrator to modify role assignments.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
