import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuthStore } from '@/store/auth';
import { api } from '@/lib/api';

export function useNavBadges() {
  const { user } = useAuthStore();
  const location = useLocation();
  const [badges, setBadges] = useState({ approvals: 0, notifications: 0, messages: 0 });

  const refresh = useCallback(() => {
    if (!user) {
      setBadges({ approvals: 0, notifications: 0, messages: 0 });
      return;
    }
    Promise.all([
      api.getApprovals('pending', 1).then((r) => r.counts.pending).catch(() => 0),
      api.getUnreadCount().then((r) => r.count).catch(() => 0),
      api.getMessagesUnreadCount().then((r) => r.count).catch(() => 0),
    ]).then(([approvals, notifications, messages]) =>
      setBadges({ approvals, notifications, messages })
    );
  }, [user]);

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
