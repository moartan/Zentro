import { useMemo, useState, type FormEvent } from 'react';
import type { AssignmentType, CreateTaskInput, TaskPriority, TaskRecord } from '../mockTasks';

type Option = {
  id: string;
  label: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onCreate: (input: CreateTaskInput) => Promise<void> | void;
  tasks: TaskRecord[];
  memberOptions?: Option[];
  teamOptions?: Option[];
  currentUserId: string;
  currentUserName: string;
};

function uniqById(rows: Option[]) {
  const map = new Map<string, Option>();
  for (const row of rows) {
    if (!map.has(row.id)) map.set(row.id, row);
  }
  return [...map.values()];
}

function toIso(localDateTime: string) {
  if (!localDateTime) return null;
  const d = new Date(localDateTime);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export default function CreateTaskModal({
  open,
  onClose,
  onCreate,
  tasks,
  memberOptions,
  teamOptions,
  currentUserId,
  currentUserName,
}: Props) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [assignmentType, setAssignmentType] = useState<AssignmentType>('individual');
  const [assigneeUserId, setAssigneeUserId] = useState('');
  const [assigneeTeamId, setAssigneeTeamId] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [startAt, setStartAt] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [estimatedAt, setEstimatedAt] = useState('');
  const [createAnother, setCreateAnother] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fallbackMemberOptions = useMemo(
    () =>
      uniqById(
        tasks
          .filter((task) => task.assigneeUserId && task.assigneeName)
          .map((task) => ({ id: task.assigneeUserId as string, label: task.assigneeName as string })),
      ),
    [tasks],
  );

  const fallbackTeamOptions = useMemo(
    () =>
      uniqById(
        tasks
          .filter((task) => task.assigneeTeamId && task.assigneeTeamName)
          .map((task) => ({ id: task.assigneeTeamId as string, label: task.assigneeTeamName as string })),
      ),
    [tasks],
  );
  const resolvedMemberOptions = memberOptions ?? fallbackMemberOptions;
  const resolvedTeamOptions = teamOptions ?? fallbackTeamOptions;

  function resetForm() {
    setTitle('');
    setDescription('');
    setAssignmentType('individual');
    setAssigneeUserId('');
    setAssigneeTeamId('');
    setPriority('medium');
    setStartAt('');
    setDueAt('');
    setEstimatedAt('');
    setCreateAnother(false);
    setIsSaving(false);
    setErrorMessage(null);
  }

  function handleClose() {
    resetForm();
    onClose();
  }

  async function submit(e: FormEvent) {
    e.preventDefault();

    if (!title.trim()) return;
    if (assignmentType === 'individual' && !assigneeUserId) return;
    if (assignmentType === 'team' && !assigneeTeamId) return;

    const assignee = resolvedMemberOptions.find((member) => member.id === assigneeUserId) ?? null;
    const team = resolvedTeamOptions.find((item) => item.id === assigneeTeamId) ?? null;
    try {
      setIsSaving(true);
      setErrorMessage(null);
      await onCreate({
        title: title.trim(),
        description: description.trim(),
        assignmentType,
        assigneeUserId: assignmentType === 'individual' ? assigneeUserId : null,
        assigneeName: assignmentType === 'individual' ? assignee?.label ?? null : null,
        assigneeTeamId: assignmentType === 'team' ? assigneeTeamId : null,
        assigneeTeamName: assignmentType === 'team' ? team?.label ?? null : null,
        status: 'todo',
        priority,
        progressPercent: 20,
        startAt: toIso(startAt),
        dueAt: toIso(dueAt),
        estimatedAt: toIso(estimatedAt),
        completedAt: null,
        holdReason: null,
        cancelReason: null,
        completionNote: null,
        createdByUserId: currentUserId,
        createdByName: currentUserName,
      });

      if (createAnother) {
        setTitle('');
        setDescription('');
        setAssigneeUserId('');
        setAssigneeTeamId('');
        return;
      }

      handleClose();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to create task');
    } finally {
      setIsSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/40"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div className="ml-auto flex h-full w-full max-w-3xl flex-col border-l border-border bg-background shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-border px-6 py-5">
          <div>
            <h2 className="text-2xl font-semibold text-foreground">Create task</h2>
            <p className="mt-1 text-sm text-muted-foreground">Right drawer form mapped to task DB fields.</p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-xl border border-border px-5 py-2 text-base font-semibold text-muted-foreground hover:bg-secondary/20"
          >
            Close
          </button>
        </div>

        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
            <label className="grid gap-2">
              <span className="text-base font-semibold text-foreground">Task title *</span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Call client about contract renewal"
                className="h-12 rounded-xl border border-border bg-background px-4 text-sm outline-none"
              />
            </label>

            <label className="grid gap-2">
              <span className="text-base font-semibold text-foreground">Description</span>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Add context"
                rows={4}
                className="rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none"
              />
            </label>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-2">
                <span className="text-sm font-semibold text-foreground">Assignment type</span>
                <select
                  value={assignmentType}
                  onChange={(e) => setAssignmentType(e.target.value as AssignmentType)}
                  className="h-11 rounded-xl border border-border bg-background px-3 text-sm"
                >
                  <option value="individual">Individual</option>
                  <option value="team">Team</option>
                </select>
              </label>

              {assignmentType === 'individual' ? (
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-foreground">Assign to *</span>
                  <select
                    value={assigneeUserId}
                    onChange={(e) => setAssigneeUserId(e.target.value)}
                    className="h-11 rounded-xl border border-border bg-background px-3 text-sm"
                  >
                    <option value="">Select assignee</option>
                    {resolvedMemberOptions.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-foreground">Assign to team *</span>
                  <select
                    value={assigneeTeamId}
                    onChange={(e) => setAssigneeTeamId(e.target.value)}
                    className="h-11 rounded-xl border border-border bg-background px-3 text-sm"
                  >
                    <option value="">Select team</option>
                    {resolvedTeamOptions.map((team) => (
                      <option key={team.id} value={team.id}>
                        {team.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-2">
                <span className="text-sm font-semibold text-foreground">Priority</span>
                <select value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)} className="h-11 rounded-xl border border-border bg-background px-3 text-sm">
                  <option value="urgent">Urgent</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-semibold text-foreground">Start at</span>
                <input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} className="h-11 rounded-xl border border-border bg-background px-3 text-sm" />
              </label>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-2">
                <span className="text-sm font-semibold text-foreground">Due at</span>
                <input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} className="h-11 rounded-xl border border-border bg-background px-3 text-sm" />
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-semibold text-foreground">Estimated at</span>
                <input
                  type="datetime-local"
                  value={estimatedAt}
                  onChange={(e) => setEstimatedAt(e.target.value)}
                  className="h-11 rounded-xl border border-border bg-background px-3 text-sm"
                />
              </label>

            </div>
          </div>
          {errorMessage ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{errorMessage}</div> : null}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-6 py-4">
            <label className="inline-flex items-center gap-3 text-sm font-semibold text-foreground">
              <input
                type="checkbox"
                checked={createAnother}
                onChange={(e) => setCreateAnother(e.target.checked)}
                className="h-5 w-5 rounded border-border"
              />
              Create another task
            </label>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleClose}
                className="rounded-xl border border-border px-6 py-2.5 text-base font-semibold text-muted-foreground hover:bg-secondary/20"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="rounded-xl bg-primary px-7 py-2.5 text-base font-semibold text-primary-foreground hover:bg-primary-dark"
              >
                {isSaving ? 'Creating...' : 'Create Task'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
