import { useMemo } from 'react';
import { useWorkspaceDetailsContext } from '../workspaceDetailsContext';

function formatDate(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
  }).format(d);
}

export default function WorkspaceActivityTab() {
  const { details } = useWorkspaceDetailsContext();

  const timeline = useMemo(() => {
    return details.members
      .map((member) => ({
        id: member.id,
        title: `${member.fullName ?? member.email ?? 'User'} joined/updated`,
        status: member.status ?? '-',
        date: member.createdAt,
      }))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 20);
  }, [details.members]);

  return (
    <div className="rounded-xl border border-border bg-background p-6 shadow-sm">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Activity</h2>
        <p className="mt-1 text-sm text-muted-foreground">Recent workspace-related member events.</p>
      </div>

      <div className="mt-5 space-y-3">
        {timeline.map((item) => (
          <article key={item.id} className="rounded-xl border border-border bg-background p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-semibold text-foreground">{item.title}</div>
              <div className="text-xs text-muted-foreground">{formatDate(item.date)}</div>
            </div>
            <div className="mt-1 text-xs text-muted-foreground">Status: {item.status}</div>
          </article>
        ))}

        {timeline.length === 0 && (
          <div className="rounded-xl border border-border bg-background p-6 text-center text-sm text-muted-foreground">
            No activity found yet.
          </div>
        )}
      </div>
    </div>
  );
}
