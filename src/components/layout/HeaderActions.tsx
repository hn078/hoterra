import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Bell,
  Calendar,
  Clock,
  FileText,
  Mail,
  Settings,
  Shield,
  Workflow,
} from 'lucide-react';
import { CountBadge } from '@/components/ui/CountBadge';
import { useNavBadges } from '@/hooks/useNavBadges';
import { api } from '@/lib/api';
import type { DashboardStats, Notification } from '@/types';
import { CATEGORY_LABELS } from '@/types';
import { cn, formatDate, timeAgo } from '@/lib/utils';

type Panel = 'calendar' | 'notifications' | 'messages';

const NOTIFICATION_TYPE_ICONS: Record<string, typeof Bell> = {
  document: FileText,
  workflow: Workflow,
  system: Settings,
  security: Shield,
  template: FileText,
};

const NOTIFICATION_TYPE_COLORS: Record<string, string> = {
  document: 'bg-blue-100 text-blue-600',
  workflow: 'bg-purple-100 text-purple-600',
  system: 'bg-gray-100 text-gray-600',
  security: 'bg-red-100 text-red-600',
  template: 'bg-green-100 text-green-600',
};

function DropdownShell({
  title,
  footer,
  children,
}: {
  title: string;
  footer: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
      <div className="border-b border-gray-100 px-4 py-3">
        <h3 className="text-sm font-semibold text-hoterra-navy">{title}</h3>
      </div>
      <div className="max-h-80 overflow-y-auto">{children}</div>
      <div className="border-t border-gray-100 bg-gray-50 px-4 py-2.5">{footer}</div>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return <p className="px-4 py-8 text-center text-sm text-gray-400">{message}</p>;
}

export function HeaderActions() {
  const navigate = useNavigate();
  const { notifications: notifCount, messages: msgCount, refresh: refreshBadges } = useNavBadges();
  const [openPanel, setOpenPanel] = useState<Panel | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [notifLoading, setNotifLoading] = useState(false);

  const [conversations, setConversations] = useState<import('@/types').Conversation[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);

  const [upcomingReviews, setUpcomingReviews] = useState<
    NonNullable<DashboardStats['upcomingReviews']>
  >([]);
  const [calendarLoading, setCalendarLoading] = useState(false);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpenPanel(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (openPanel !== 'notifications') return;
    setNotifLoading(true);
    api
      .getNotifications()
      .then((items) => setNotifications(items.slice(0, 5)))
      .catch(console.error)
      .finally(() => setNotifLoading(false));
  }, [openPanel]);

  useEffect(() => {
    if (openPanel !== 'calendar') return;
    setCalendarLoading(true);
    api
      .getDashboardStats()
      .then((stats) => setUpcomingReviews((stats.upcomingReviews ?? []).slice(0, 5)))
      .catch(console.error)
      .finally(() => setCalendarLoading(false));
  }, [openPanel]);

  useEffect(() => {
    if (openPanel !== 'messages') return;
    setMessagesLoading(true);
    api
      .getConversations()
      .then((items) => setConversations(items.slice(0, 5)))
      .catch(console.error)
      .finally(() => setMessagesLoading(false));
  }, [openPanel]);

  const togglePanel = (panel: Panel) => {
    setOpenPanel((current) => (current === panel ? null : panel));
  };

  const closePanel = () => setOpenPanel(null);

  const handleNotificationClick = async (n: Notification) => {
    if (!n.isRead) {
      try {
        await api.markNotificationRead(n.id);
        setNotifications((prev) =>
          prev.map((item) => (item.id === n.id ? { ...item, isRead: true } : item))
        );
        refreshBadges();
      } catch (err) {
        console.error(err);
      }
    }
    closePanel();
    if (n.link) {
      navigate(n.link);
    }
  };

  return (
    <div ref={containerRef} className="hidden items-center gap-2 lg:flex">
      <div className="relative">
        <button
          type="button"
          onClick={() => togglePanel('calendar')}
          aria-expanded={openPanel === 'calendar'}
          aria-label="Upcoming reviews"
          className={cn(
            'rounded-lg p-2 text-gray-500 hover:bg-gray-100',
            openPanel === 'calendar' && 'bg-gray-100 text-hoterra-navy'
          )}
        >
          <Calendar className="h-5 w-5" />
        </button>
        {openPanel === 'calendar' && (
          <DropdownShell
            title="Upcoming Reviews"
            footer={
              <Link
                to="/documents"
                onClick={closePanel}
                className="block text-center text-xs font-medium text-hoterra-steel hover:underline"
              >
                View all documents →
              </Link>
            }
          >
            {calendarLoading ? (
              <EmptyState message="Loading..." />
            ) : upcomingReviews.length === 0 ? (
              <EmptyState message="No upcoming reviews" />
            ) : (
              <ul className="divide-y divide-gray-100">
                {upcomingReviews.map((item) => (
                  <li key={item.id}>
                    <Link
                      to={`/documents/${item.id}`}
                      onClick={closePanel}
                      className="block px-4 py-3 hover:bg-gray-50"
                    >
                      <div className="text-sm font-medium text-hoterra-navy">{item.title}</div>
                      <div className="mt-0.5 text-xs text-gray-500">
                        {item.department} · {CATEGORY_LABELS[item.category]}
                      </div>
                      <div className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-orange-700">
                        <Clock className="h-3 w-3" />
                        {formatDate(item.nextReviewDate)}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </DropdownShell>
        )}
      </div>

      <div className="relative">
        <button
          type="button"
          onClick={() => togglePanel('notifications')}
          aria-expanded={openPanel === 'notifications'}
          aria-label="Notifications"
          className={cn(
            'relative rounded-lg p-2 text-gray-500 hover:bg-gray-100',
            openPanel === 'notifications' && 'bg-gray-100 text-hoterra-navy'
          )}
        >
          <Bell className="h-5 w-5" />
          {notifCount > 0 && (
            <CountBadge count={notifCount} max={9} className="absolute -right-0.5 -top-0.5" />
          )}
        </button>
        {openPanel === 'notifications' && (
          <DropdownShell
            title="Notifications"
            footer={
              <Link
                to="/notifications"
                onClick={closePanel}
                className="block text-center text-xs font-medium text-hoterra-steel hover:underline"
              >
                View all notifications →
              </Link>
            }
          >
            {notifLoading ? (
              <EmptyState message="Loading..." />
            ) : notifications.length === 0 ? (
              <EmptyState message="No notifications" />
            ) : (
              <ul className="divide-y divide-gray-100">
                {notifications.map((n) => {
                  const Icon = NOTIFICATION_TYPE_ICONS[n.type] ?? Bell;
                  return (
                    <li key={n.id}>
                      <button
                        type="button"
                        onClick={() => handleNotificationClick(n)}
                        className={cn(
                          'flex w-full gap-3 px-4 py-3 text-left hover:bg-gray-50',
                          !n.isRead && 'bg-hoterra-gold/5'
                        )}
                      >
                        <div
                          className={cn(
                            'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                            NOTIFICATION_TYPE_COLORS[n.type] || NOTIFICATION_TYPE_COLORS.system
                          )}
                        >
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <span
                              className={cn(
                                'truncate text-sm',
                                !n.isRead
                                  ? 'font-semibold text-hoterra-navy'
                                  : 'font-medium text-gray-700'
                              )}
                            >
                              {n.title}
                            </span>
                            <span className="shrink-0 text-[10px] text-gray-400">
                              {timeAgo(n.createdAt)}
                            </span>
                          </div>
                          <p className="mt-0.5 line-clamp-2 text-xs text-gray-500">{n.message}</p>
                        </div>
                        {!n.isRead && (
                          <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-hoterra-gold" />
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </DropdownShell>
        )}
      </div>

      <div className="relative">
        <button
          type="button"
          onClick={() => togglePanel('messages')}
          aria-expanded={openPanel === 'messages'}
          aria-label="Messages"
          className={cn(
            'relative rounded-lg p-2 text-gray-500 hover:bg-gray-100',
            openPanel === 'messages' && 'bg-gray-100 text-hoterra-navy'
          )}
        >
          <Mail className="h-5 w-5" />
          {msgCount > 0 && (
            <CountBadge count={msgCount} max={9} className="absolute -right-0.5 -top-0.5" />
          )}
        </button>
        {openPanel === 'messages' && (
          <DropdownShell
            title="Messages"
            footer={
              <Link
                to="/messages"
                onClick={closePanel}
                className="block text-center text-xs font-medium text-hoterra-steel hover:underline"
              >
                Open all messages →
              </Link>
            }
          >
            {messagesLoading ? (
              <EmptyState message="Loading..." />
            ) : conversations.length === 0 ? (
              <EmptyState message="No conversations yet" />
            ) : (
              <ul className="divide-y divide-gray-100">
                {conversations.map((conv) => (
                  <li key={conv.id}>
                    <Link
                      to="/messages"
                      onClick={closePanel}
                      className={cn(
                        'block px-4 py-3 hover:bg-gray-50',
                        conv.unreadCount > 0 && 'bg-hoterra-gold/5'
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span
                          className={cn(
                            'truncate text-sm',
                            conv.unreadCount > 0
                              ? 'font-semibold text-hoterra-navy'
                              : 'font-medium text-gray-700'
                          )}
                        >
                          {conv.name}
                        </span>
                        {conv.lastMessage && (
                          <span className="shrink-0 text-[10px] text-gray-400">
                            {timeAgo(conv.lastMessage.createdAt)}
                          </span>
                        )}
                      </div>
                      {conv.lastMessage && (
                        <p className="mt-0.5 line-clamp-2 text-xs text-gray-500">
                          {conv.lastMessage.senderName}: {conv.lastMessage.content}
                        </p>
                      )}
                      {conv.unreadCount > 0 && (
                        <div className="mt-1.5">
                          <CountBadge count={conv.unreadCount} max={9} />
                        </div>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </DropdownShell>
        )}
      </div>
    </div>
  );
}
