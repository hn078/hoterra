import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuthStore } from '@/store/auth';
import { api } from '@/lib/api';
import { hasCapability } from '@/modules/access-control';

export function useNavBadges() {
  const { user } = useAuthStore();
  const location = useLocation();
  const [badges, setBadges] = useState({ approvals: 0, notifications: 0, messages: 0 });
  const canReadApprovals = hasCapability(user, 'approvals.read');
  const canReadNotifications = hasCapability(user, 'notifications.read');
  const canUseMessages = hasCapability(user, 'messages.use');

  const refresh = useCallback(() => {
    if (!user) {
      setBadges({ approvals: 0, notifications: 0, messages: 0 });
      return;
    }
    Promise.all([
      canReadApprovals
        ? api.getApprovals('pending', 1).then((r) => r.counts.pending).catch(() => 0)
        : Promise.resolve(0),
      canReadNotifications
        ? api.getUnreadCount().then((r) => r.count).catch(() => 0)
        : Promise.resolve(0),
      canUseMessages
        ? api.getMessagesUnreadCount().then((r) => r.count).catch(() => 0)
        : Promise.resolve(0),
    ]).then(([approvals, notifications, messages]) =>
      setBadges({ approvals, notifications, messages })
    );
  }, [user, canReadApprovals, canReadNotifications, canUseMessages]);

  useEffect(() => {
    refresh();
  }, [refresh, location.pathname]);

  useEffect(() => {
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refresh]);

  return { ...badges, refresh };
}
