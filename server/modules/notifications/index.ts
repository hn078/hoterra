export { resolveNotificationDestination } from './application/resolveNotificationDestination';
export {
  openNotification,
  type NotificationOpenResult,
} from './application/openNotification';
export {
  readNotificationPreferences,
  updateNotificationPreferences,
  type NotificationPreferences,
} from './application/manageNotificationPreferences';
export {
  countUnreadNotifications,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from './application/manageNotifications';
