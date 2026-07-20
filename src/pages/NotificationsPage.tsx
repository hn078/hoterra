import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Bell,
  BellOff,
  CheckCheck,
  FileText,
  AlertTriangle,
  Workflow,
  Shield,
  Mail,
  Smartphone,
  MessageSquare,
  Settings,
} from 'lucide-react';
import { Header } from '@/components/layout/Sidebar';
import { DashStatCard } from '@/components/ui/DashStatCard';
import { PageTabs } from '@/components/ui/PageTabs';
import { Switch, SwitchRow } from '@/components/ui/Switch';
import { api } from '@/lib/api';
import type { Notification } from '@/types';
import { timeAgo } from '@/lib/utils';
import { cn } from '@/lib/utils';

const TYPE_TABS = [
  { id: 'ALL', label: 'All' },
  { id: 'document', label: 'Documents' },
  { id: 'workflow', label: 'Workflows' },
  { id: 'system', label: 'System' },
  { id: 'security', label: 'Security' },
  { id: 'template', label: 'Templates' },
];

const TYPE_ICONS: Record<string, typeof Bell> = {
  document: FileText,
  workflow: Workflow,
  system: Settings,
  security: Shield,
  template: FileText,
};

const TYPE_COLORS: Record<string, string> = {
  document: 'bg-blue-100 text-blue-600',
  workflow: 'bg-purple-100 text-purple-600',
  system: 'bg-gray-100 text-gray-600',
  security: 'bg-red-100 text-red-600',
  template: 'bg-green-100 text-green-600',
};

export function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('ALL');
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);
  const [markingRead, setMarkingRead] = useState(false);
  const [channels, setChannels] = useState({
    email: true,
    push: true,
    inApp: true,
    sms: false,
  });

  const load = () => {
    setLoading(true);
    api
      .getNotifications()
      .then(setNotifications)
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    api.getSettings().then((s) => {
      setChannels({
        email: s.notifyEmail ?? true,
        push: s.notifyPush ?? true,
        inApp: s.notifyInApp ?? true,
        sms: false,
      });
    }).catch(console.error);
  }, []);

  const filtered = useMemo(() => {
    return notifications.filter((n) => {
      const matchesTab = activeTab === 'ALL' || n.type === activeTab;
      const matchesUnread = !showUnreadOnly || !n.isRead;
      return matchesTab && matchesUnread;
    });
  }, [notifications, activeTab, showUnreadOnly]);

  const stats = useMemo(() => {
    const unread = notifications.filter((n) => !n.isRead).length;
    const today = notifications.filter((n) => {
      const d = new Date(n.createdAt);
      const now = new Date();
      return d.toDateString() === now.toDateString();
    }).length;
    const urgent = notifications.filter((n) => n.type === 'security' && !n.isRead).length;
    return { total: notifications.length, unread, today, urgent };
  }, [notifications]);

  const tabs = TYPE_TABS.map((tab) => ({
    ...tab,
    count:
      tab.id === 'ALL'
        ? notifications.length
        : notifications.filter((n) => n.type === tab.id).length,
  }));

  const handleMarkAllRead = async () => {
    setMarkingRead(true);
    try {
      await api.markAllNotificationsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    } catch (err) {
      console.error(err);
    } finally {
      setMarkingRead(false);
    }
  };

  const handleNotificationClick = async (n: Notification) => {
    if (!n.isRead) {
      try {
        await api.markNotificationRead(n.id);
        setNotifications((prev) =>
          prev.map((item) => (item.id === n.id ? { ...item, isRead: true } : item))
        );
      } catch (err) {
        console.error(err);
      }
    }
  };

  const toggleChannel = async (key: keyof typeof channels) => {
    const next = { ...channels, [key]: !channels[key] };
    setChannels(next);
    if (key === 'sms') return;
    try {
      await api.updateSettings({
        notifyEmail: next.email,
        notifyPush: next.push,
        notifyInApp: next.inApp,
      });
    } catch (err) {
      console.error(err);
      setChannels(channels);
    }
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-hoterra-page">
      <Header
        title="Notifications"
        subtitle="Stay updated on document activity, approvals and system alerts"
        action={
          <button
            onClick={handleMarkAllRead}
            disabled={markingRead || stats.unread === 0}
            className="btn-primary disabled:opacity-50"
          >
            <CheckCheck className="h-4 w-4" />
            {markingRead ? 'Marking...' : 'Mark All Read'}
          </button>
        }
      />

      <div className="page-stats page-stats--tabs">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <DashStatCard label="Total Notifications" value={stats.total} icon={Bell} iconColor="text-blue-600" iconBg="bg-blue-50" />
          <DashStatCard label="Unread" value={stats.unread} icon={BellOff} iconColor="text-orange-600" iconBg="bg-orange-50" />
          <DashStatCard label="Today" value={stats.today} icon={MessageSquare} iconColor="text-green-600" iconBg="bg-green-50" />
          <DashStatCard label="Security Alerts" value={stats.urgent} icon={AlertTriangle} iconColor="text-red-600" iconBg="bg-red-50" />
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden bg-hoterra-page">
        <div className="flex flex-1 flex-col overflow-hidden">
          <PageTabs
            tabs={tabs}
            active={activeTab}
            onChange={setActiveTab}
          />

          <div className="flex-1 overflow-y-auto bg-hoterra-page p-4">
            {loading ? (
              <div className="flex items-center justify-center py-16 text-gray-500">
                Loading notifications...
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Bell className="mb-3 h-10 w-10 text-gray-300" />
                <p className="text-sm font-medium text-gray-600">No notifications</p>
                <p className="mt-1 text-xs text-gray-400">You're all caught up!</p>
              </div>
            ) : (
              <div className="space-y-2">
                {filtered.map((n) => {
                  const Icon = TYPE_ICONS[n.type] ?? Bell;
                  return (
                    <div
                      key={n.id}
                      onClick={() => handleNotificationClick(n)}
                      className={cn(
                        'flex cursor-pointer gap-4 rounded-xl border bg-white p-4 transition-shadow hover:shadow-sm',
                        !n.isRead ? 'border-hoterra-gold/30 border-l-4 border-l-hoterra-gold' : 'border-gray-200'
                      )}
                    >
                      <div
                        className={cn(
                          'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
                          TYPE_COLORS[n.type] || TYPE_COLORS.system
                        )}
                      >
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <h4
                            className={cn(
                              'text-sm',
                              !n.isRead ? 'font-semibold text-hoterra-navy' : 'font-medium text-gray-700'
                            )}
                          >
                            {n.title}
                          </h4>
                          <span className="shrink-0 text-xs text-gray-400">{timeAgo(n.createdAt)}</span>
                        </div>
                        <p className="mt-1 text-sm text-gray-600">{n.message}</p>
                        {n.link && (
                          <Link
                            to={n.link}
                            onClick={(e) => e.stopPropagation()}
                            className="mt-2 inline-block text-xs font-medium text-hoterra-steel hover:underline"
                          >
                            View details →
                          </Link>
                        )}
                      </div>
                      {!n.isRead && (
                        <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-hoterra-gold" />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <aside className="card w-80 shrink-0 overflow-y-auto rounded-none border-l border-t-0 border-r-0 border-b-0 p-5 shadow-none">
          <h3 className="mb-4 text-sm font-semibold text-hoterra-navy">Notification Preferences</h3>

          <div className="mb-6">
            <h4 className="mb-2 text-xs font-medium uppercase text-gray-400">Filters</h4>
            <div className="rounded-lg border border-gray-100 p-3 hover:bg-gray-50">
              <SwitchRow
                label="Show unread only"
                checked={showUnreadOnly}
                onChange={setShowUnreadOnly}
              />
            </div>
          </div>

          <div className="mb-6">
            <h4 className="mb-3 text-xs font-medium uppercase text-gray-400">Notification Channels</h4>
            <div className="space-y-2">
              {(
                [
                  { key: 'inApp' as const, label: 'In-App', icon: Bell },
                  { key: 'email' as const, label: 'Email', icon: Mail },
                  { key: 'push' as const, label: 'Push', icon: Smartphone },
                  { key: 'sms' as const, label: 'SMS', icon: MessageSquare },
                ] as const
              ).map(({ key, label, icon: Icon }) => (
                <div
                  key={key}
                  className="flex items-center justify-between rounded-lg border border-gray-100 p-3 hover:bg-gray-50"
                >
                  <span className="flex items-center gap-2 text-sm text-gray-700">
                    <Icon className="h-4 w-4 text-gray-400" />
                    {label}
                  </span>
                  <Switch
                    checked={channels[key]}
                    onChange={() => toggleChannel(key)}
                    aria-label={label}
                  />
                </div>
              ))}
            </div>
          </div>

          <div>
            <h4 className="mb-3 text-xs font-medium uppercase text-gray-400">By Type</h4>
            <div className="space-y-1">
              {TYPE_TABS.filter((t) => t.id !== 'ALL').map((tab) => {
                const count = notifications.filter((n) => n.type === tab.id && !n.isRead).length;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={cn(
                      'flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors',
                      activeTab === tab.id
                        ? 'bg-hoterra-navy/10 font-medium text-hoterra-navy'
                        : 'text-gray-600 hover:bg-gray-50'
                    )}
                  >
                    {tab.label}
                    {count > 0 && (
                      <span className="rounded-full bg-hoterra-gold px-1.5 py-0.5 text-[10px] font-bold text-hoterra-navy">
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
