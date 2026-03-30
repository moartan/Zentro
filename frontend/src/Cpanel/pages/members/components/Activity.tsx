import { useEffect, useMemo, useState } from 'react';
import { getMemberActivity, type MemberActivityEntry } from '../../../../shared/api/members';
import { useMemberDetailsContext } from '../memberDetailsContext';

type ActivityFilter = 'all' | 'login' | 'audit';

function formatDateTime(value: string | null | undefined) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-background p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-foreground">{value}</div>
    </div>
  );
}

function entryTypePill(type: MemberActivityEntry['type']) {
  if (type === 'login') return 'bg-sky-100 text-sky-800';
  return 'bg-violet-100 text-violet-800';
}

function loginStatusPill(success: boolean) {
  return success ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-700';
}

export default function MemberDetailsActivityTab() {
  const { member } = useMemberDetailsContext();

  const [entries, setEntries] = useState<MemberActivityEntry[]>([]);
  const [summary, setSummary] = useState({ total: 0, loginSuccess: 0, loginFailed: 0, auditActions: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [filter, setFilter] = useState<ActivityFilter>('all');

  useEffect(() => {
    let alive = true;
    setIsLoading(true);
    setErrorMessage(null);

    getMemberActivity(member.id)
      .then((res) => {
        if (!alive) return;
        setEntries(res.entries ?? []);
        setSummary(res.summary ?? { total: 0, loginSuccess: 0, loginFailed: 0, auditActions: 0 });
      })
      .catch((err) => {
        if (!alive) return;
        setErrorMessage(err instanceof Error ? err.message : 'Failed to load activity');
      })
      .finally(() => {
        if (!alive) return;
        setIsLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [member.id]);

  const filteredEntries = useMemo(() => {
    if (filter === 'all') return entries;
    return entries.filter((entry) => entry.type === filter);
  }, [entries, filter]);

  return (
    <div className="rounded-xl border border-border bg-background p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Activity</h2>
          <p className="mt-1 text-sm text-muted-foreground">Sign-ins and audit trail for this member.</p>
        </div>
        <select
          value={filter}
          onChange={(event) => setFilter(event.target.value as ActivityFilter)}
          className="rounded-xl border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground"
        >
          <option value="all">All activity</option>
          <option value="login">Login events</option>
          <option value="audit">Audit actions</option>
        </select>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard label="Total events" value={summary.total} />
        <SummaryCard label="Login success" value={summary.loginSuccess} />
        <SummaryCard label="Login failed" value={summary.loginFailed} />
        <SummaryCard label="Audit actions" value={summary.auditActions} />
      </div>

      {isLoading && <div className="mt-5 text-sm text-muted-foreground">Loading activity...</div>}
      {!isLoading && errorMessage && <div className="mt-5 text-sm font-semibold text-rose-700">{errorMessage}</div>}

      {!isLoading && !errorMessage && (
        <div className="mt-5 space-y-3">
          {filteredEntries.map((entry) => (
            <article key={`${entry.type}-${entry.id}`} className="rounded-xl border border-border bg-background p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wide ${entryTypePill(entry.type)}`}>
                    {entry.type}
                  </span>
                  {entry.type === 'login' && (
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wide ${loginStatusPill(entry.success)}`}
                    >
                      {entry.success ? 'success' : 'failed'}
                    </span>
                  )}
                </div>
                <div className="text-xs font-medium text-muted-foreground">{formatDateTime(entry.occurredAt)}</div>
              </div>

              <div className="mt-2 text-sm font-semibold text-foreground">{entry.title}</div>

              {entry.description && <div className="mt-1 text-sm text-muted-foreground">{entry.description}</div>}

              {entry.type === 'login' && (
                <div className="mt-2 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                  <div>IP: {entry.ipAddress ?? '-'}</div>
                  <div className="truncate">Agent: {entry.userAgent ?? '-'}</div>
                </div>
              )}

              {entry.type === 'audit' && <div className="mt-2 text-xs text-muted-foreground">Workspace: {entry.businessId ?? '-'}</div>}
            </article>
          ))}

          {filteredEntries.length === 0 && (
            <div className="rounded-xl border border-border bg-background p-6 text-center text-sm text-muted-foreground">
              No activity found for this filter.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
