import { apiGet, apiPatch } from './http';

export type NotificationPriority = 'urgent' | 'high' | 'medium' | 'general';

export type NotificationItem = {
  id: string;
  businessId: string | null;
  recipientUserId: string;
  actorUserId: string | null;
  type: string;
  title: string;
  message: string | null;
  priority: NotificationPriority;
  entityType: string | null;
  entityId: string | null;
  metadata: Record<string, unknown>;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
};

type NotificationsResponse = {
  success: boolean;
  notifications: NotificationItem[];
  unreadCount: number;
};

export function getNotifications(limit = 20) {
  return apiGet<NotificationsResponse>(`/api/notifications?limit=${encodeURIComponent(String(limit))}`);
}

export function markNotificationRead(id: string) {
  return apiPatch<{ success: boolean }>(`/api/notifications/${id}/read`, {});
}

export function markAllNotificationsRead() {
  return apiPatch<{ success: boolean }>('/api/notifications/read-all', {});
}

export type NotificationPreferences = {
  inAppEnabled: boolean;
  emailEnabled: boolean;
  urgentOnlyEmail: boolean;
};

export function getNotificationPreferences() {
  return apiGet<{ success: boolean; preferences: NotificationPreferences }>('/api/notifications/preferences');
}

export function updateNotificationPreferences(input: Partial<NotificationPreferences>) {
  return apiPatch<{ success: boolean; preferences: NotificationPreferences }>('/api/notifications/preferences', input);
}
