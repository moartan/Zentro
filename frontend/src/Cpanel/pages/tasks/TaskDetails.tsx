import { Activity, ClipboardList, MessageSquare, Paperclip } from 'lucide-react';
import { Link, NavLink, Outlet, useNavigate, useParams } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { getMembers } from '../../../shared/api/members';
import { getTasks } from '../../../shared/api/tasks';
import { getTeams } from '../../../shared/api/teams';
import {
  formatDate,
  isTaskOverdue,
  priorityLabel,
  priorityPillClass,
  statusLabel,
  statusPillClass,
  type TaskRecord,
} from './mockTasks';
import { TaskDetailsProvider } from './taskDetailsContext';
import { mapApiTaskToTaskRecord } from './taskAdapter';

function TabLink({ to, icon, label }: { to: string; icon: ReactNode; label: string }) {
  return (
    <NavLink
      to={to}
      end
      className={({ isActive }) =>
        `inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold ${
          isActive
            ? 'border-primary bg-primary/10 text-primary'
            : 'border-border bg-background text-muted-foreground hover:bg-secondary/20 hover:text-foreground'
        }`
      }
    >
      {icon}
      <span>{label}</span>
    </NavLink>
  );
}

function getWorkflowProgress(task: TaskRecord, overdue: boolean) {
  if (overdue) {
    return {
      label: 'Overdue',
      percent: 100,
      badgeClass: 'bg-rose-100 text-rose-700',
      barClass: 'bg-rose-500',
    };
  }

  if (task.status === 'canceled') {
    return {
      label: 'Canceled',
      percent: 100,
      badgeClass: 'bg-rose-100 text-rose-700',
      barClass: 'bg-rose-500',
    };
  }

  if (task.status === 'done') {
    return {
      label: 'Completed',
      percent: 100,
      badgeClass: 'bg-emerald-100 text-emerald-700',
      barClass: 'bg-emerald-500',
    };
  }

  if (task.status === 'in_progress') {
    return {
      label: 'In Progress',
      percent: task.progressPercent ?? 65,
      badgeClass: 'bg-sky-100 text-sky-700',
      barClass: 'bg-sky-500',
    };
  }

  if (task.status === 'on_hold') {
    return {
      label: 'On Hold',
      percent: task.progressPercent ?? 65,
      badgeClass: 'bg-amber-100 text-amber-700',
      barClass: 'bg-amber-500',
    };
  }

  return {
    label: 'To Do',
    percent: task.progressPercent ?? 20,
    badgeClass: 'bg-sky-100 text-sky-700',
    barClass: 'bg-sky-500',
  };
}

export default function TaskDetailsPage() {
  const navigate = useNavigate();
  const { taskId } = useParams();
  const [task, setTask] = useState<TaskRecord | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    async function loadTask() {
      if (!taskId) {
        setTask(null);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setErrorMessage(null);

      try {
        const [tasksRes, membersRes, teamsRes] = await Promise.all([
          getTasks(),
          getMembers().catch(() => ({ success: true, members: [] })),
          getTeams({ pageSize: 500 }).catch(() => ({ success: true, teams: [] })),
        ]);

        const memberMap = new Map<string, string>();
        for (const row of membersRes.members ?? []) {
          memberMap.set(row.id, row.fullName?.trim() || row.email?.trim() || row.id);
        }

        const teamMap = new Map<string, string>();
        for (const row of teamsRes.teams ?? []) {
          teamMap.set(row.id, row.name?.trim() || row.id);
        }

        const found = (tasksRes.tasks ?? []).find((row) => row.id === taskId) ?? null;
        setTask(found ? mapApiTaskToTaskRecord(found, { memberNameById: memberMap, teamNameById: teamMap }) : null);
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : 'Failed to load task');
        setTask(null);
      } finally {
        setIsLoading(false);
      }
    }

    void loadTask();
  }, [taskId, refreshKey]);

  const overdue = useMemo(() => (task ? isTaskOverdue(task) : false), [task]);
  const workflow = useMemo(() => (task ? getWorkflowProgress(task, overdue) : null), [task, overdue]);

  if (isLoading) {
    return (
      <div className="rounded-xl border border-border bg-background p-6">
        <h1 className="text-2xl font-semibold">Task Details</h1>
        <p className="mt-2 text-muted-foreground">Loading task...</p>
      </div>
    );
  }

  if (errorMessage) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-rose-700">
        {errorMessage}
      </div>
    );
  }

  if (!task || !workflow) {
    return (
      <div className="rounded-xl border border-border bg-background p-6">
        <h1 className="text-2xl font-semibold">Task not found</h1>
        <p className="mt-2 text-muted-foreground">This task may have been removed.</p>
        <button
          type="button"
          onClick={() => navigate('/cpanel/tasks')}
          className="mt-4 rounded-xl border border-border px-4 py-2 text-sm font-semibold text-foreground"
        >
          Back to tasks
        </button>
      </div>
    );
  }

  return (
    <TaskDetailsProvider
      value={{
        task,
        overdue,
        refresh: () => setRefreshKey((v) => v + 1),
      }}
    >
      <div className="rounded-xl border border-border bg-background p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Task Details</h1>
          </div>
          <Link to="/cpanel/tasks" className="text-sm font-semibold text-primary hover:underline">
            Back to tasks
          </Link>
        </div>

        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[320px_1fr]">
          <aside className="self-start rounded-xl border border-border bg-background p-5 shadow-sm">
            <div className="text-xl font-semibold text-foreground">{task.title}</div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className={`inline-flex rounded-full px-3 py-1 text-sm font-semibold ${priorityPillClass(task.priority)}`}>
                {priorityLabel(task.priority)}
              </span>
              <span className={`inline-flex rounded-full px-3 py-1 text-sm font-semibold ${statusPillClass(task.status, overdue)}`}>
                {overdue ? 'Overdue' : statusLabel(task.status)}
              </span>
            </div>

            <div className="mt-6 space-y-2">
              <Field label="Assignment" value={task.assignmentType === 'individual' ? 'Individual' : 'Team'} />
              <Field
                label="Assignee"
                value={task.assignmentType === 'individual' ? task.assigneeName ?? task.assigneeUserId ?? '-' : task.assigneeTeamName ?? task.assigneeTeamId ?? '-'}
              />
              <Field label="Due date" value={formatDate(task.dueAt ?? task.dueDate)} />
              <Field label="Created by" value={task.createdByName} />
              <Field label="Created" value={formatDate(task.createdAt)} />
              <Field label="Updated" value={formatDate(task.updatedAt)} />
            </div>

            <div className="mt-6 rounded-xl border border-border bg-background p-3">
              <div className="flex justify-center">
                <span className={`inline-flex rounded-full px-3 py-1 text-sm font-semibold ${workflow.badgeClass}`}>
                  {workflow.label}
                </span>
              </div>
              <div className="mt-3 h-3 w-full overflow-hidden rounded-xl bg-secondary/40">
                <div className={`h-full rounded-xl transition-all ${workflow.barClass}`} style={{ width: `${workflow.percent}%` }} />
              </div>
            </div>
          </aside>

          <div className="min-w-0">
            <div className="rounded-xl border border-border bg-background p-4 shadow-sm">
              <div className="flex items-center gap-3 overflow-x-auto whitespace-nowrap">
                <TabLink to="tasks" icon={<ClipboardList className="h-4 w-4" />} label="Tasks" />
                <TabLink to="comments" icon={<MessageSquare className="h-4 w-4" />} label="Comments" />
                <TabLink to="files" icon={<Paperclip className="h-4 w-4" />} label="Files" />
                <TabLink to="activity" icon={<Activity className="h-4 w-4" />} label="Activity" />
              </div>
            </div>

            <div className="mt-4">
              <Outlet />
            </div>
          </div>
        </div>
      </div>
    </TaskDetailsProvider>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-secondary/10 px-3 py-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-right text-sm font-semibold text-foreground">{value}</span>
    </div>
  );
}
