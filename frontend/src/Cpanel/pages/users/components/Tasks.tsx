import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getUserTasks,
  updateUserTaskStatus,
  type UserTask,
} from "../../../../shared/api/users";
import { useApp } from "../../../../shared/AppProvider";
import { useToast } from "../../../../shared/toast/ToastProvider";
import { useUserDetailsContext } from "../userDetailsContext";

type StatusFilter = "all" | "todo" | "in_progress" | "done";

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  }).format(d);
}

function statusLabel(status: UserTask["status"]) {
  if (status === "todo") return "To do";
  if (status === "in_progress") return "In progress";
  return "Done";
}

function statusPill(status: UserTask["status"]) {
  if (status === "done") return "bg-emerald-100 text-emerald-800";
  if (status === "in_progress") return "bg-amber-100 text-amber-800";
  return "bg-slate-100 text-slate-700";
}

function priorityLabel(priority: UserTask["priority"]) {
  if (priority === "high") return "High";
  if (priority === "medium") return "Medium";
  return "Low";
}

function priorityPill(priority: UserTask["priority"]) {
  if (priority === "high") return "bg-rose-100 text-rose-700";
  if (priority === "medium") return "bg-amber-100 text-amber-800";
  return "bg-emerald-100 text-emerald-800";
}

function SummaryCard({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-xl border border-border bg-background p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold text-foreground">{value}</div>
    </div>
  );
}

export default function UserDetailsTasksTab() {
  const toast = useToast();
  const { user: actor } = useApp();
  const { user } = useUserDetailsContext();

  const [tasks, setTasks] = useState<UserTask[]>([]);
  const [summary, setSummary] = useState({
    total: 0,
    todo: 0,
    inProgress: 0,
    done: 0,
    overdue: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [actionTaskId, setActionTaskId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const canQuickAct = Boolean(actor?.isPlatformSuperAdmin);

  const loadTasks = useCallback(async () => {
    setIsLoading(true);

    try {
      const res = await getUserTasks(user.id);
      setTasks(res.tasks ?? []);
      setSummary(
        res.summary ?? {
          total: 0,
          todo: 0,
          inProgress: 0,
          done: 0,
          overdue: 0,
        },
      );
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to load tasks");
    } finally {
      setIsLoading(false);
    }
  }, [user.id]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  const filteredTasks = useMemo(() => {
    if (statusFilter === "all") return tasks;
    return tasks.filter((task) => task.status === statusFilter);
  }, [statusFilter, tasks]);

  async function handleQuickStatusToggle(task: UserTask) {
    const nextDone = !task.isDone;
    setErrorMessage(null);
    const ok = window.confirm(
      nextDone ? "Mark this task as done?" : "Reopen this task?",
    );
    if (!ok) return;

    try {
      setActionTaskId(task.id);
      await updateUserTaskStatus(user.id, task.id, { isDone: nextDone });
      await loadTasks();
      toast.success(nextDone ? "Task marked as done." : "Task reopened.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Task update failed");
    } finally {
      setActionTaskId(null);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-background p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Tasks</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Tasks assigned to this user.
          </p>
        </div>
        <select
          value={statusFilter}
          onChange={(event) =>
            setStatusFilter(event.target.value as StatusFilter)
          }
          className="rounded-xl border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground"
        >
          <option value="all">All status</option>
          <option value="todo">To do</option>
          <option value="in_progress">In progress</option>
          <option value="done">Done</option>
        </select>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <SummaryCard label="Total" value={summary.total} />
        <SummaryCard label="To do" value={summary.todo} />
        <SummaryCard label="In progress" value={summary.inProgress} />
        <SummaryCard label="Done" value={summary.done} />
        <SummaryCard label="Overdue" value={summary.overdue} />
      </div>

      {isLoading && (
        <div className="mt-5 text-sm text-muted-foreground">Loading tasks...</div>
      )}
      {!isLoading && errorMessage && (
        <div className="mt-5 text-sm font-semibold text-rose-700">
          {errorMessage}
        </div>
      )}

      {!isLoading && !errorMessage && (
        <div className="mt-5 overflow-hidden rounded-2xl border border-border">
          <table className="w-full border-separate border-spacing-0">
            <thead className="bg-secondary/10">
              <tr>
                <th className="border-b border-border px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  Task
                </th>
                <th className="border-b border-border px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  Status
                </th>
                <th className="border-b border-border px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  Priority
                </th>
                <th className="border-b border-border px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  Due date
                </th>
                <th className="border-b border-border px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  Updated
                </th>
                {canQuickAct && (
                  <th className="border-b border-border px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    Action
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {filteredTasks.map((task) => (
                <tr key={task.id} className="bg-background">
                  <td className="border-b border-border px-4 py-4 align-top">
                    <div className="text-sm font-semibold text-foreground">
                      {task.title}
                    </div>
                    <div className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                      {task.description || "-"}
                    </div>
                  </td>
                  <td className="border-b border-border px-4 py-4 align-top">
                    <span
                      className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${statusPill(
                        task.status,
                      )}`}
                    >
                      {statusLabel(task.status)}
                    </span>
                  </td>
                  <td className="border-b border-border px-4 py-4 align-top">
                    <span
                      className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${priorityPill(
                        task.priority,
                      )}`}
                    >
                      {priorityLabel(task.priority)}
                    </span>
                  </td>
                  <td className="border-b border-border px-4 py-4 text-sm text-foreground align-top">
                    {formatDate(task.dueDate)}
                  </td>
                  <td className="border-b border-border px-4 py-4 text-sm text-muted-foreground align-top">
                    {formatDate(task.updatedAt)}
                  </td>
                  {canQuickAct && (
                    <td className="border-b border-border px-4 py-4 align-top">
                      <button
                        type="button"
                        onClick={() => handleQuickStatusToggle(task)}
                        disabled={actionTaskId === task.id}
                        className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-secondary/20 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {actionTaskId === task.id
                          ? "Saving..."
                          : task.isDone
                            ? "Reopen"
                            : "Mark done"}
                      </button>
                    </td>
                  )}
                </tr>
              ))}

              {filteredTasks.length === 0 && (
                <tr>
                  <td
                    colSpan={canQuickAct ? 6 : 5}
                    className="px-4 py-8 text-center text-sm text-muted-foreground"
                  >
                    No tasks found for this filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
