import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  FileText,
  PenLine,
  Activity,
  Mail,
  Building2,
  Shield,
  GitBranch,
  Calendar,
} from 'lucide-react';
import { Header, DepartmentBadge } from '@/components/layout/Sidebar';
import { Breadcrumbs } from '@/components/ui/Breadcrumbs';
import { StatCard } from '@/components/ui/StatCard';
import { PageTabs } from '@/components/ui/PageTabs';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { api } from '@/lib/api';
import type { AuditLog, Document, User } from '@/types';
import { ROLE_LABELS } from '@/types';
import { mapAuditAction, ROLE_DEFINITIONS } from '@/data/mock';
import { formatDate, formatDateTime, timeAgo } from '@/lib/utils';

type UserDetail = User & {
  createdAt: string;
  counts: { documents: number; signatures: number; auditLogs: number };
  recentActivity: AuditLog[];
  recentDocs: Document[];
};

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'roles', label: 'Roles' },
  { id: 'activity', label: 'Activity' },
  { id: 'documents', label: 'Documents' },
];

function roleToDefinitionId(role: User['role']): string {
  const map: Record<User['role'], string> = {
    SYSTEM_ADMINISTRATOR: 'super-admin',
    GENERAL_MANAGER: 'manager',
    FINANCE_DIRECTOR: 'approver',
    HOD: 'hod',
    SUPERVISOR: 'editor',
    EMPLOYEE: 'viewer',
  };
  return map[role] ?? 'viewer';
}

export function UserProfilePage() {
  const { id } = useParams<{ id: string }>();
  const [user, setUser] = useState<UserDetail | null>(null);
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    if (id) {
      api.getUser(id).then(setUser).catch(console.error);
    }
  }, [id]);

  if (!user) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-gray-500">Loading user profile...</p>
      </div>
    );
  }

  const roleDef = ROLE_DEFINITIONS.find((r) => r.id === roleToDefinitionId(user.role));
  const permissionModules = roleDef
    ? Object.entries(roleDef.permissions).filter(([, perms]) => perms.some(Boolean))
    : [];

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <Header
        title={`${user.firstName} ${user.lastName}`}
        subtitle={ROLE_LABELS[user.role]}
      />

      <div className="border-b border-gray-200 bg-white px-6 pb-2 pt-2">
        <Breadcrumbs
          items={[
            { label: 'Users & Roles', to: '/users' },
            { label: `${user.firstName} ${user.lastName}` },
          ]}
        />
      </div>

      <div className="grid grid-cols-2 gap-4 border-b border-gray-200 bg-gray-50 px-6 py-4 lg:grid-cols-4">
        <StatCard label="Documents Created" value={user.counts.documents} icon={FileText} color="blue" />
        <StatCard label="Signatures" value={user.counts.signatures} icon={PenLine} color="green" />
        <StatCard label="Audit Events" value={user.counts.auditLogs} icon={Activity} color="purple" />
        <StatCard
          label="Member Since"
          value={formatDate(user.createdAt)}
          icon={Calendar}
          color="gray"
        />
      </div>

      <PageTabs tabs={TABS} active={activeTab} onChange={setActiveTab} />

      <div className="flex flex-1 overflow-hidden">
        <aside className="w-72 shrink-0 overflow-y-auto border-r border-gray-200 bg-white p-5">
          <div className="flex flex-col items-center text-center">
            <UserAvatar firstName={user.firstName} lastName={user.lastName} size="lg" />
            <h2 className="mt-3 text-lg font-bold text-hoterra-navy">
              {user.firstName} {user.lastName}
            </h2>
            <p className="text-sm text-gray-500">{ROLE_LABELS[user.role]}</p>
            {user.department && (
              <div className="mt-2">
                <DepartmentBadge name={user.department.name} color={user.department.color} />
              </div>
            )}
          </div>

          <dl className="mt-6 space-y-3 text-sm">
            <InfoItem icon={Mail} label="Email" value={user.email} />
            {user.department && (
              <InfoItem icon={Building2} label="Department" value={user.department.name} />
            )}
            <InfoItem icon={Shield} label="Role" value={ROLE_LABELS[user.role]} />
            <InfoItem icon={Calendar} label="Joined" value={formatDate(user.createdAt)} />
          </dl>
        </aside>

        <div className="flex-1 overflow-y-auto bg-gray-50 p-6">
          {activeTab === 'overview' && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <ProfileWidget title="User Information" icon={Shield}>
                <dl className="space-y-2 text-sm">
                  <Row label="Full Name" value={`${user.firstName} ${user.lastName}`} />
                  <Row label="Email" value={user.email} />
                  <Row label="Role" value={ROLE_LABELS[user.role]} />
                  <Row label="Department" value={user.department?.name ?? '—'} />
                  <Row label="Account Created" value={formatDateTime(user.createdAt)} />
                </dl>
              </ProfileWidget>

              <ProfileWidget title="Permissions Summary" icon={Shield}>
                {roleDef ? (
                  <div className="space-y-2">
                    <p className="text-sm text-gray-600">{roleDef.description}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {permissionModules.map(([module]) => (
                        <span
                          key={module}
                          className="rounded-full bg-hoterra-steel/10 px-2.5 py-0.5 text-xs font-medium text-hoterra-steel"
                        >
                          {module}
                        </span>
                      ))}
                    </div>
                    <Link
                      to="/users/roles"
                      className="mt-2 inline-block text-xs text-hoterra-steel hover:underline"
                    >
                      View full permissions matrix →
                    </Link>
                  </div>
                ) : (
                  <p className="text-sm text-gray-400">No role definition found</p>
                )}
              </ProfileWidget>

              <ProfileWidget title="Recent Activity" icon={Activity}>
                <div className="space-y-3">
                  {user.recentActivity.slice(0, 5).map((log) => {
                    const mapped = mapAuditAction(log.action);
                    return (
                      <div key={log.id} className="flex gap-3">
                        <span className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${mapped.color}`}>
                          {mapped.module}
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm text-gray-700">{mapped.label}</p>
                          <p className="text-xs text-gray-400">{timeAgo(log.createdAt)}</p>
                        </div>
                      </div>
                    );
                  })}
                  {user.recentActivity.length === 0 && (
                    <p className="text-sm text-gray-400">No recent activity</p>
                  )}
                </div>
              </ProfileWidget>

              <ProfileWidget title="Assigned Workflows" icon={GitBranch}>
                <div className="space-y-2">
                  {['Standard Document Approval', 'SOP Review Process'].map((name) => (
                    <div
                      key={name}
                      className="flex items-center justify-between rounded-lg border border-gray-100 p-3"
                    >
                      <p className="text-sm font-medium text-gray-800">{name}</p>
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">
                        Active
                      </span>
                    </div>
                  ))}
                </div>
              </ProfileWidget>
            </div>
          )}

          {activeTab === 'roles' && roleDef && (
            <div className="rounded-xl border border-gray-200 bg-white p-6">
              <h3 className="mb-1 font-semibold text-hoterra-navy">{roleDef.name}</h3>
              <p className="mb-4 text-sm text-gray-600">{roleDef.description}</p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(roleDef.permissions).map(([module, perms]) => {
                  const active = perms.some(Boolean);
                  if (!active) return null;
                  return (
                    <span
                      key={module}
                      className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700"
                    >
                      {module}
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {activeTab === 'activity' && (
            <div className="rounded-xl border border-gray-200 bg-white">
              <table className="w-full text-sm">
                <thead className="border-b border-gray-100 bg-gray-50 text-left text-xs text-gray-500">
                  <tr>
                    <th className="px-4 py-3 font-medium">Action</th>
                    <th className="px-4 py-3 font-medium">Module</th>
                    <th className="px-4 py-3 font-medium">Severity</th>
                    <th className="px-4 py-3 font-medium">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {user.recentActivity.map((log) => {
                    const mapped = mapAuditAction(log.action);
                    return (
                      <tr key={log.id} className="border-b border-gray-50">
                        <td className="px-4 py-3 font-medium text-gray-800">{mapped.label}</td>
                        <td className="px-4 py-3 text-gray-600">{mapped.module}</td>
                        <td className="px-4 py-3">
                          <span className="text-xs text-gray-500">{mapped.severity}</span>
                        </td>
                        <td className="px-4 py-3 text-gray-500">{formatDateTime(log.createdAt)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'documents' && (
            <div className="rounded-xl border border-gray-200 bg-white">
              <table className="w-full text-sm">
                <thead className="border-b border-gray-100 bg-gray-50 text-left text-xs text-gray-500">
                  <tr>
                    <th className="px-4 py-3 font-medium">Title</th>
                    <th className="px-4 py-3 font-medium">Code</th>
                    <th className="px-4 py-3 font-medium">Department</th>
                    <th className="px-4 py-3 font-medium">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {user.recentDocs.map((doc) => (
                    <tr key={doc.id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <Link to={`/documents/${doc.id}`} className="font-medium text-hoterra-steel hover:underline">
                          {doc.title}
                        </Link>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-500">{doc.code}</td>
                      <td className="px-4 py-3 text-gray-600">{doc.department.name}</td>
                      <td className="px-4 py-3 text-gray-500">{formatDate(doc.updatedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ProfileWidget({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <Icon className="h-4 w-4 text-hoterra-steel" />
        <h3 className="font-semibold text-hoterra-navy">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function InfoItem({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
      <div>
        <dt className="text-xs text-gray-500">{label}</dt>
        <dd className="text-sm font-medium text-gray-800">{value}</dd>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-gray-500">{label}</dt>
      <dd className="text-right font-medium text-gray-800">{value}</dd>
    </div>
  );
}
