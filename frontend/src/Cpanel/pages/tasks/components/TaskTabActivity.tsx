import { useEffect, useState } from 'react';
import { getTaskActivity, type TaskActivityEntry } from '../../../../shared/api/tasks';
import { formatDate } from '../mockTasks';
import { useTaskDetailsContext } from '../taskDetailsContext';

export default function TaskTabActivity() {
  const { task } = useTaskDetailsContext();
  const [rows, setRows] = useState<TaskActivityEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setIsLoading(true);
    setErrorMessage(null);

    getTaskActivity(task.id)
      .then((res) => {
        if (!alive) return;
        setRows(res.activity ?? []);
      })
      .catch((err) => {
        if (!alive) return;
        setErrorMessage(err instanceof Error ? err.message : 'Failed to load activity');
        setRows([]);
      })
      .finally(() => {
        if (!alive) return;
        setIsLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [task.id]);

  return (
    <div className="space-y-4 rounded-xl border border-border bg-background p-4 shadow-sm">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Activity</h2>
        <p className="mt-1 text-sm text-muted-foreground">Timeline of notable changes on this task.</p>
      </div>

      <div className="space-y-3">
        {isLoading ? (
          <div className="rounded-xl border border-border p-3 text-sm text-muted-foreground">Loading activity...</div>
        ) : null}

        {!isLoading && errorMessage ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{errorMessage}</div>
        ) : null}

        {!isLoading && !errorMessage && rows.length === 0 ? (
          <div className="rounded-xl border border-border p-3 text-sm text-muted-foreground">No activity yet.</div>
        ) : null}

        {!isLoading &&
          !errorMessage &&
          rows.map((row) => (
            <div key={row.id} className="rounded-xl border border-border p-3">
              <div className="text-sm font-semibold text-foreground">{row.title}</div>
              <div className="mt-1 text-sm text-muted-foreground">{row.description ?? '-'}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                {row.actorName ? `${row.actorName} • ` : ''}
                {formatDate(row.createdAt)}
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}
