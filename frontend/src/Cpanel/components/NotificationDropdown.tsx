import { useEffect, useMemo, useRef, useState } from 'react';
import { Bell } from 'lucide-react';
import {
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationItem,
} from '../../shared/api/notifications';

const priorityStyles = {
  urgent: 'text-red-500',
  high: 'text-orange-500',
  medium: 'text-yellow-500',
  general: 'text-primary',
} as const;

const priorityLabels = {
  urgent: 'Urgent',
  high: 'High',
  medium: 'Medium',
  general: 'General',
} as const;

export default function NotificationDropdown() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  async function loadNotifications() {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const payload = await getNotifications(20);
      setItems(payload.notifications ?? []);
      setUnreadCount(payload.unreadCount ?? 0);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to load notifications');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadNotifications();
    const timer = window.setInterval(() => {
      void loadNotifications();
    }, 30000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (open) {
      void loadNotifications();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const handleClick = (event: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);

    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  async function handleMarkAllRead() {
    try {
      await markAllNotificationsRead();
      setItems((current) => current.map((item) => ({ ...item, isRead: true, readAt: item.readAt ?? new Date().toISOString() })));
      setUnreadCount(0);
    } catch {
      // no-op for fast UI path
    }
  }

  async function handleItemClick(item: NotificationItem) {
    if (!item.isRead) {
      setItems((current) =>
        current.map((row) => (row.id === item.id ? { ...row, isRead: true, readAt: row.readAt ?? new Date().toISOString() } : row)),
      );
      setUnreadCount((count) => Math.max(0, count - 1));
      try {
        await markNotificationRead(item.id);
      } catch {
        // no-op for fast UI path
      }
    }
  }

  const hasItems = items.length > 0;
  const notificationRows = useMemo(() => items, [items]);

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-border hover:bg-secondary/50"
        aria-label="Notifications"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 inline-flex h-2.5 w-2.5 rounded-full bg-pink-500" />
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-3 w-80 rounded-2xl border border-border bg-background shadow-lg" role="menu">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="text-sm font-semibold text-foreground">Notifications</div>
            <button type="button" className="text-xs font-semibold text-primary" onClick={() => void handleMarkAllRead()}>
              Mark all as read
            </button>
          </div>
          <div className="flex flex-col">
            {isLoading ? (
              <div className="px-4 py-6 text-center text-sm text-muted-foreground">Loading notifications...</div>
            ) : errorMessage ? (
              <div className="px-4 py-6 text-center text-sm text-rose-600">{errorMessage}</div>
            ) : !hasItems ? (
              <div className="px-4 py-6 text-center text-sm text-muted-foreground">No notifications yet.</div>
            ) : (
              notificationRows.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => void handleItemClick(item)}
                  className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors ${
                    item.isRead
                      ? 'hover:bg-secondary/50'
                      : 'border-l-2 border-pink-500 bg-pink-500/6 hover:bg-pink-500/10'
                  }`}
                  role="menuitem"
                >
                  <div
                    className={`mt-1 h-2.5 w-2.5 rounded-full ${
                      item.isRead ? 'bg-border' : 'bg-pink-500 shadow-[0_0_0_3px_rgba(236,72,153,0.18)]'
                    }`}
                  />
                  <div className="flex-1">
                    <div className={`text-sm font-medium ${item.isRead ? 'text-foreground/90' : 'text-foreground'}`}>
                      {item.title}
                    </div>
                    {item.message ? <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{item.message}</div> : null}
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">{formatRelativeTime(item.createdAt)}</span>
                      <span className={`font-semibold ${priorityStyles[item.priority]}`}>
                        {priorityLabels[item.priority]}
                      </span>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
          <div className="border-t border-border px-4 py-3">
            <button type="button" className="w-full text-sm font-semibold text-primary">
              View all notifications
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function formatRelativeTime(value: string) {
  const created = new Date(value).getTime();
  if (Number.isNaN(created)) return 'Now';
  const diffMs = Date.now() - created;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Date(value).toLocaleDateString();
}
