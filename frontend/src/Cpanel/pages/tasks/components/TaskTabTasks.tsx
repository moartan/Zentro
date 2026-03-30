import { useEffect, useState } from 'react';
import { updateTask } from '../../../../shared/api/tasks';
import { useApp } from '../../../../shared/AppProvider';
import { formatDate, priorityLabel, statusLabel, type TaskStatus } from '../mockTasks';
import { useTaskDetailsContext } from '../taskDetailsContext';

function getMemberStatusOptions(currentStatus: TaskStatus): TaskStatus[] {
  if (currentStatus === 'todo') return ['todo', 'in_progress'];
  if (currentStatus === 'in_progress') return ['in_progress', 'on_hold', 'done'];
  if (currentStatus === 'on_hold') return ['on_hold', 'in_progress'];
  if (currentStatus === 'done') return ['done'];
  return ['canceled'];
}

export default function TaskTabTasks() {
  const { user } = useApp();
  const { task, refresh } = useTaskDetailsContext();
  const isMember = user?.role === 'employee';
  const [status, setStatus] = useState<TaskStatus>(task.status);
  const [statusNote, setStatusNote] = useState(task.statusNote ?? '');
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    setStatus(task.status);
    setStatusNote(task.statusNote ?? '');
  }, [task.id, task.status, task.statusNote]);

  const statusOptions: TaskStatus[] = isMember
    ? getMemberStatusOptions(task.status)
    : ['todo', 'in_progress', 'on_hold', 'done', 'canceled'];
  const isStatusLocked = isMember && statusOptions.length === 1 && statusOptions[0] === task.status;
  const statusChanged = status !== task.status;
  const shouldShowReason = status === 'on_hold' || status === 'canceled' || status === 'done';
  const requiresReason = status === 'on_hold' || status === 'canceled';
  const canSubmit = statusChanged || (task.statusNote ?? '') !== statusNote;

  async function save() {
    if (requiresReason && !statusNote.trim()) {
      setErrorMessage('Reason is required for this status.');
      return;
    }

    try {
      setIsSaving(true);
      setErrorMessage(null);
      await updateTask(task.id, {
        status,
        statusNote: shouldShowReason ? (statusNote.trim() || null) : null,
      });
      refresh();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to save task');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-4 rounded-xl border border-border bg-background p-4 shadow-sm">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Task</h2>
        <p className="mt-1 text-sm text-muted-foreground">Update core fields for this task.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Title" value={task.title} />
        <Field label="Assignment" value={task.assignmentType === 'individual' ? 'Individual' : 'Team'} />
        <Field label="Assignee" value={task.assignmentType === 'individual' ? task.assigneeName ?? '-' : task.assigneeTeamName ?? '-'} />
        <Field label="Created by" value={task.createdByName} />
        <Field label="Priority" value={priorityLabel(task.priority)} />
        <Field label="Due at" value={formatDate(task.dueAt ?? task.dueDate)} />
      </div>

      <div className="grid gap-4 md:grid-cols-1">
        <label className="grid gap-2 text-sm font-semibold text-foreground">
          Status
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as TaskStatus)}
            disabled={isStatusLocked}
            className="h-11 rounded-xl border border-border bg-background px-3 text-sm font-medium"
          >
            {statusOptions.map((option) => (
              <option key={option} value={option}>
                {statusLabel(option)}
              </option>
            ))}
          </select>
        </label>

        {!isStatusLocked && (
          <div className="flex flex-wrap gap-2">
            {statusOptions.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setStatus(option)}
                className={
                  status === option
                    ? 'rounded-xl bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary'
                    : 'rounded-xl border border-border px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-secondary/20'
                }
              >
                {statusLabel(option)}
              </button>
            ))}
          </div>
        )}

        {shouldShowReason && (
          <label className="grid gap-2 text-sm font-semibold text-foreground">
            {requiresReason ? 'Reason (required)' : 'Reason / Note (optional)'}
            <textarea
              rows={3}
              value={statusNote}
              onChange={(e) => setStatusNote(e.target.value)}
              placeholder={
                status === 'on_hold'
                  ? 'Why is this task on hold?'
                  : status === 'canceled'
                    ? 'Why is this task canceled?'
                    : 'Completion note'
              }
              className="rounded-xl border border-border bg-background px-3 py-2 text-sm font-medium outline-none"
            />
          </label>
        )}
      </div>
      {errorMessage ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{errorMessage}</div> : null}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={save}
          disabled={isSaving || !canSubmit}
          className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary-dark"
        >
          {isSaving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-background px-3 py-2.5">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-semibold text-foreground">{value}</div>
    </div>
  );
}
