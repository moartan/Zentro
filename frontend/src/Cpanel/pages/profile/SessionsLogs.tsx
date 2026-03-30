import { useEffect, useMemo, useState } from 'react';
import { getProfileSessions, type ProfileActivityEntry, type ProfileSession } from '../../../shared/api/profile';
import { useToast } from '../../../shared/toast/ToastProvider';

function formatWhen(value: string) {
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return value;

  const diffMs = Date.now() - timestamp;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;

  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;

  return new Date(value).toLocaleDateString();
}

function eventDetail(entry: ProfileActivityEntry) {
  if (entry.description) return entry.description;
  if (entry.type === 'login') {
    const parts = [entry.userAgent, entry.ipAddress].filter(Boolean);
    return parts.join(' • ') || 'Login event';
  }
  return 'Audit event';
}

export default function SessionsLogsPage() {
  const toast = useToast();
  const [sessions, setSessions] = useState<ProfileSession[]>([]);
  const [activity, setActivity] = useState<ProfileActivityEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const otherSessionsCount = useMemo(() => sessions.filter((s) => !s.current).length, [sessions]);

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      try {
        setIsLoading(true);
        const response = await getProfileSessions();
        if (cancelled) return;

        setSessions(response.sessions ?? []);
        setActivity(response.activity ?? []);
      } catch (error) {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : 'Failed to load sessions');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    loadData();
    return () => {
      cancelled = true;
    };
  }, [toast]);

  function handleRevokeComingSoon() {
    toast.info('Session revoke endpoint is not implemented yet.');
  }

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-border bg-background p-5 text-sm text-muted-foreground">
        Loading sessions and activity...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-foreground">Sessions and Logs</h2>
          <p className="mt-2 text-muted-foreground">Review active sessions and recent security events.</p>
        </div>
        <button
          type="button"
          disabled={otherSessionsCount === 0}
          onClick={handleRevokeComingSoon}
          className="rounded-full border border-border bg-background px-5 py-2.5 text-sm font-semibold text-foreground transition hover:bg-secondary/30 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Revoke All Other Sessions
        </button>
      </div>

      <section className="rounded-2xl border border-border bg-background p-5">
        <h3 className="text-base font-semibold text-foreground">Active Sessions</h3>
        <div className="mt-4 space-y-3">
          {sessions.length === 0 ? (
            <div className="rounded-xl border border-border p-4 text-sm text-muted-foreground">No session history yet.</div>
          ) : null}

          {sessions.map((session) => (
            <div key={session.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-4">
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  {session.device}
                  {session.current ? (
                    <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary">Current</span>
                  ) : null}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {session.location} • IP {session.ip} • Last seen {formatWhen(session.lastSeenAt)}
                </div>
              </div>
              {!session.current ? (
                <button
                  type="button"
                  onClick={handleRevokeComingSoon}
                  className="rounded-full border border-border bg-background px-4 py-2 text-xs font-semibold text-foreground transition hover:bg-secondary/30"
                >
                  Revoke
                </button>
              ) : null}
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-background p-5">
        <h3 className="text-base font-semibold text-foreground">Recent Security Activity</h3>
        <div className="mt-4 space-y-3">
          {activity.length === 0 ? (
            <div className="rounded-xl border border-border p-4 text-sm text-muted-foreground">No activity yet.</div>
          ) : null}

          {activity.slice(0, 20).map((event) => (
            <div key={event.id} className="rounded-xl border border-border p-4">
              <div className="text-sm font-semibold text-foreground">{event.title}</div>
              <div className="mt-1 text-sm text-muted-foreground">{eventDetail(event)}</div>
              <div className="mt-2 text-xs text-muted-foreground">{formatWhen(event.occurredAt)}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
