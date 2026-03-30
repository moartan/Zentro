import { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useApp } from '../../../shared/AppProvider';
import { getMembers } from '../../../shared/api/members';
import { getTasks, createTask } from '../../../shared/api/tasks';
import { getTeams } from '../../../shared/api/teams';
import CreateTaskModal from './components/CreateTaskModal';
import TaskFiltersBar from './components/TaskFiltersBar';
import TasksTopNav from './components/TasksTopNav';
import {
  formatDate,
  getTaskSummary,
  isTaskOverdue,
  priorityLabel,
  priorityPillClass,
  statusLabel,
  statusPillClass,
  taskMatchesStatusFilter,
  type TaskPriority,
  type TaskRecord,
  type TaskStatusFilter,
} from './mockTasks';
import { mapApiTaskToTaskRecord } from './taskAdapter';

type Option = {
  id: string;
  label: string;
};

type TaskViewMode = 'list' | 'board';

const VIEW_STORAGE_KEY = 'zentro.tasks.viewMode.v1';

const BOARD_COLUMNS: Array<{ key: TaskRecord['status']; label: string }> = [
  { key: 'todo', label: 'To Do' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'on_hold', label: 'On Hold' },
  { key: 'done', label: 'Done' },
  { key: 'canceled', label: 'Canceled' },
];

export default function TasksListPage() {
  const navigate = useNavigate();
  const { user } = useApp();
  const canCreate = user?.role === 'business_owner' || user?.role === 'super_admin';
  const canViewAll = user?.role !== 'employee';

  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [memberOptions, setMemberOptions] = useState<Option[]>([]);
  const [teamOptions, setTeamOptions] = useState<Option[]>([]);
  const [statusFilter, setStatusFilter] = useState<TaskStatusFilter>('all');
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority | null>(null);
  const [query, setQuery] = useState('');
  const [viewMode, setViewMode] = useState<TaskViewMode>(() => {
    if (typeof window === 'undefined') return 'list';
    const stored = window.localStorage.getItem(VIEW_STORAGE_KEY);
    return stored === 'board' ? 'board' : 'list';
  });
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function loadTasksAndMeta() {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const [tasksRes, membersRes, teamsRes] = await Promise.all([
        getTasks(),
        canCreate ? getMembers() : Promise.resolve({ success: true, members: [] }),
        canCreate ? getTeams({ pageSize: 500 }) : Promise.resolve({ success: true, teams: [] }),
      ]);

      const memberMap = new Map<string, string>();
      const nextMemberOptions: Option[] = [];
      for (const row of membersRes.members ?? []) {
        const label = row.fullName?.trim() || row.email?.trim() || row.id;
        memberMap.set(row.id, label);
        nextMemberOptions.push({ id: row.id, label });
      }

      const teamMap = new Map<string, string>();
      const nextTeamOptions: Option[] = [];
      for (const row of teamsRes.teams ?? []) {
        const label = row.name?.trim() || row.id;
        teamMap.set(row.id, label);
        nextTeamOptions.push({ id: row.id, label });
      }

      setMemberOptions(nextMemberOptions);
      setTeamOptions(nextTeamOptions);
      setTasks((tasksRes.tasks ?? []).map((task) => mapApiTaskToTaskRecord(task, { memberNameById: memberMap, teamNameById: teamMap })));
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to load tasks');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadTasksAndMeta();
  }, [canCreate]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(VIEW_STORAGE_KEY, viewMode);
  }, [viewMode]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tasks.filter((task) => {
      if (!taskMatchesStatusFilter(task, statusFilter)) return false;
      if (priorityFilter && task.priority !== priorityFilter) return false;
      if (!q) return true;

      const hay = [
        task.title,
        task.description,
        task.assigneeName ?? '',
        task.assigneeTeamName ?? '',
        priorityLabel(task.priority),
        statusLabel(task.status),
      ]
        .join(' ')
        .toLowerCase();

      return hay.includes(q);
    });
  }, [tasks, statusFilter, priorityFilter, query]);

  const summary = useMemo(() => getTaskSummary(tasks), [tasks]);
  const boardRowsByStatus = useMemo(
    () =>
      BOARD_COLUMNS.map((column) => ({
        ...column,
        tasks: filtered.filter((task) => task.status === column.key),
      })),
    [filtered],
  );

  if (!canViewAll) {
    return <Navigate to="/cpanel/tasks/my" replace />;
  }

  return (
    <>
      <div className="space-y-5 rounded-xl border border-border bg-background p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Tasks</h1>
            <p className="mt-1 text-muted-foreground">Manage and track your workspace tasks.</p>
          </div>
          <TasksTopNav canCreate={canCreate} canViewAll={canViewAll} onCreateClick={() => setIsCreateModalOpen(true)} />
        </div>

        <div className="grid gap-3 sm:grid-cols-4">
          <SummaryCard label="Total" value={summary.total} />
          <SummaryCard label="To Do" value={summary.open} />
          <SummaryCard label="In Progress" value={summary.inProgress} />
          <SummaryCard label="Completed" value={summary.completed} />
        </div>

        <div className="max-w-full overflow-hidden rounded-xl border border-border bg-background p-2.5">
          <TaskFiltersBar
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
            priorityFilter={priorityFilter}
            onPriorityFilterChange={setPriorityFilter}
            query={query}
            onQueryChange={setQuery}
            hideStatusTabs={viewMode === 'board'}
            hidePriorityTabs={viewMode === 'list'}
            withContainer={false}
            beforeFilters={
              <div className="inline-flex items-center rounded-lg border border-border bg-secondary/10 p-1">
                <button
                  type="button"
                  onClick={() => setViewMode('list')}
                  className={
                    viewMode === 'list'
                      ? 'rounded-md bg-background px-3 py-1.5 text-sm font-semibold text-foreground shadow-sm'
                      : 'rounded-md px-3 py-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground'
                  }
                >
                  List View
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('board')}
                  className={
                    viewMode === 'board'
                      ? 'rounded-md bg-background px-3 py-1.5 text-sm font-semibold text-foreground shadow-sm'
                      : 'rounded-md px-3 py-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground'
                  }
                >
                  Board View
                </button>
              </div>
            }
          />
        </div>

        {errorMessage ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{errorMessage}</div> : null}

        {viewMode === 'list' ? (
          <div className="overflow-hidden rounded-xl border border-border">
            <table className="w-full border-separate border-spacing-0">
              <thead className="bg-secondary/10">
                <tr>
                  <th className="border-b border-border px-5 py-4 text-left text-sm font-bold uppercase tracking-wide text-muted-foreground">Task</th>
                  <th className="border-b border-border px-5 py-4 text-left text-sm font-bold uppercase tracking-wide text-muted-foreground">Assigned To</th>
                  <th className="border-b border-border px-5 py-4 text-left text-sm font-bold uppercase tracking-wide text-muted-foreground">Due Date</th>
                  <th className="border-b border-border px-5 py-4 text-left text-sm font-bold uppercase tracking-wide text-muted-foreground">Priority</th>
                  <th className="border-b border-border px-5 py-4 text-left text-sm font-bold uppercase tracking-wide text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-8 text-center text-sm text-muted-foreground">
                      Loading tasks...
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-8 text-center text-sm text-muted-foreground">
                      No tasks match your filters.
                    </td>
                  </tr>
                ) : (
                  filtered.map((task, index) => {
                    const overdue = isTaskOverdue(task);
                    return (
                      <tr key={task.id} className={index % 2 ? 'bg-secondary/10' : 'bg-background'}>
                        <td className="cursor-pointer border-b border-border px-5 py-4 align-middle" onClick={() => navigate(`/cpanel/tasks/${task.id}`)}>
                          <div className="font-semibold text-foreground">{task.title}</div>
                          <div className="mt-1 text-xs text-muted-foreground line-clamp-1">{task.description || '-'}</div>
                        </td>
                        <td className="border-b border-border px-5 py-4 text-sm text-foreground">
                          {task.assignmentType === 'individual' ? task.assigneeName ?? task.assigneeUserId ?? '-' : task.assigneeTeamName ?? task.assigneeTeamId ?? '-'}
                        </td>
                        <td className="border-b border-border px-5 py-4 text-sm text-foreground">{formatDate(task.dueAt ?? task.dueDate)}</td>
                        <td className="border-b border-border px-5 py-4">
                          <span className={`inline-flex rounded-full px-3 py-1 text-sm font-semibold ${priorityPillClass(task.priority)}`}>
                            {priorityLabel(task.priority)}
                          </span>
                        </td>
                        <td className="border-b border-border px-5 py-4">
                          <span className={`inline-flex rounded-full px-3 py-1 text-sm font-semibold ${statusPillClass(task.status, overdue)}`}>
                            {overdue ? 'Overdue' : statusLabel(task.status)}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="max-w-full overflow-x-auto rounded-xl border border-border bg-secondary/10 p-3">
            {isLoading ? (
              <div className="rounded-xl border border-border bg-background px-5 py-8 text-center text-sm text-muted-foreground">Loading tasks...</div>
            ) : filtered.length === 0 ? (
              <div className="rounded-xl border border-border bg-background px-5 py-8 text-center text-sm text-muted-foreground">
                No tasks match your filters.
              </div>
            ) : (
              <div className="grid w-max min-w-full grid-cols-5 gap-3">
                {boardRowsByStatus.map((column) => (
                  <div key={column.key} className="w-[240px] rounded-xl border border-border bg-background p-2.5">
                    <div className="mb-2 flex items-center justify-between rounded-lg bg-secondary/10 px-2.5 py-2">
                      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{column.label}</div>
                      <div className="rounded-full bg-background px-2 py-0.5 text-xs font-semibold text-foreground">{column.tasks.length}</div>
                    </div>
                    <div className="space-y-2">
                      {column.tasks.length === 0 ? (
                        <div className="rounded-lg border border-dashed border-border px-2.5 py-4 text-center text-xs text-muted-foreground">No tasks</div>
                      ) : (
                        column.tasks.map((task) => {
                          const overdue = isTaskOverdue(task);
                          return (
                            <button
                              key={task.id}
                              type="button"
                              onClick={() => navigate(`/cpanel/tasks/${task.id}`)}
                              className="w-full rounded-lg border border-border bg-background px-2.5 py-2 text-left hover:bg-secondary/10"
                            >
                              <div className="line-clamp-2 text-sm font-semibold text-foreground">{task.title}</div>
                              <div className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                                {task.assignmentType === 'individual'
                                  ? `Assignee: ${task.assigneeName ?? task.assigneeUserId ?? '-'}`
                                  : `Team: ${task.assigneeTeamName ?? task.assigneeTeamId ?? '-'}`}
                              </div>
                              <div className="mt-2 flex items-center justify-between gap-2">
                                <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${priorityPillClass(task.priority)}`}>
                                  {priorityLabel(task.priority)}
                                </span>
                                <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${statusPillClass(task.status, overdue)}`}>
                                  {overdue ? 'Overdue' : statusLabel(task.status)}
                                </span>
                              </div>
                              <div className="mt-2 text-xs text-muted-foreground">Due: {formatDate(task.dueAt ?? task.dueDate)}</div>
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <CreateTaskModal
        open={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        tasks={tasks}
        memberOptions={memberOptions}
        teamOptions={teamOptions}
        currentUserId={user?.id ?? 'u-owner'}
        currentUserName={user?.fullName ?? 'Workspace Owner'}
        onCreate={async (input) => {
          await createTask({
            title: input.title,
            description: input.description,
            assignmentType: input.assignmentType,
            assigneeUserId: input.assigneeUserId,
            assigneeTeamId: input.assigneeTeamId,
            status: input.status,
            priority: input.priority,
            progressPercent: input.progressPercent ?? undefined,
            startAt: input.startAt ?? null,
            dueAt: input.dueAt ?? null,
            estimatedAt: input.estimatedAt ?? null,
            completedAt: input.completedAt ?? null,
            holdReason: input.holdReason ?? null,
            cancelReason: input.cancelReason ?? null,
            completionNote: input.completionNote ?? null,
          });
          await loadTasksAndMeta();
        }}
      />
    </>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-semibold text-foreground">{value}</div>
    </div>
  );
}
