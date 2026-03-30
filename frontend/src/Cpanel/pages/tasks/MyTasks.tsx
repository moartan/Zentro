import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../../shared/AppProvider';
import { getMembers } from '../../../shared/api/members';
import { createTask, getTasks } from '../../../shared/api/tasks';
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

export default function MyTasksPage() {
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

  const myTasks = useMemo(() => {
    if (!user?.id) return [];
    if (user.role === 'employee') {
      // Backend already scopes employee tasks to direct + team assignments.
      return tasks;
    }
    return tasks.filter((task) => task.assignmentType === 'individual' && task.assigneeUserId === user.id);
  }, [tasks, user?.id, user?.role]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return myTasks.filter((task) => {
      if (!taskMatchesStatusFilter(task, statusFilter)) return false;
      if (priorityFilter && task.priority !== priorityFilter) return false;
      if (!q) return true;

      const hay = [task.title, task.description, priorityLabel(task.priority), statusLabel(task.status)].join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [myTasks, statusFilter, priorityFilter, query]);

  const summary = useMemo(() => getTaskSummary(myTasks), [myTasks]);
  return (
    <>
      <div className="space-y-5 rounded-xl border border-border bg-background p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">My Tasks</h1>
            <p className="mt-1 text-muted-foreground">Your personal task list with quick status visibility.</p>
          </div>
          <TasksTopNav canCreate={canCreate} canViewAll={canViewAll} onCreateClick={() => setIsCreateModalOpen(true)} />
        </div>

        <div className="grid gap-3 sm:grid-cols-4">
          <SummaryCard label="Ongoing" value={summary.open + summary.inProgress} />
          <SummaryCard label="Done" value={summary.completed} />
          <SummaryCard label="Overdue" value={summary.overdue} />
          <SummaryCard label="Total" value={summary.total} />
        </div>

        <TaskFiltersBar
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          priorityFilter={priorityFilter}
          onPriorityFilterChange={setPriorityFilter}
          query={query}
          onQueryChange={setQuery}
        />

        {errorMessage ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{errorMessage}</div> : null}

        <div className="overflow-hidden rounded-xl border border-border">
          <table className="w-full border-separate border-spacing-0">
            <thead className="bg-secondary/10">
              <tr>
                <th className="border-b border-border px-5 py-4 text-left text-sm font-bold uppercase tracking-wide text-muted-foreground">Task</th>
                <th className="border-b border-border px-5 py-4 text-left text-sm font-bold uppercase tracking-wide text-muted-foreground">Due Date</th>
                <th className="border-b border-border px-5 py-4 text-left text-sm font-bold uppercase tracking-wide text-muted-foreground">Priority</th>
                <th className="border-b border-border px-5 py-4 text-left text-sm font-bold uppercase tracking-wide text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={4} className="px-5 py-8 text-center text-sm text-muted-foreground">
                    Loading tasks...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-5 py-8 text-center text-sm text-muted-foreground">
                    No personal tasks yet.
                  </td>
                </tr>
              ) : (
                filtered.map((task, index) => {
                  const overdue = isTaskOverdue(task);
                  return (
                    <tr key={task.id} className={index % 2 ? 'bg-secondary/10' : 'bg-background'}>
                      <td className="cursor-pointer border-b border-border px-5 py-4 align-middle" onClick={() => navigate(`/cpanel/tasks/${task.id}`)}>
                        <div className="font-semibold text-foreground">{task.title}</div>
                        <div className="mt-1 line-clamp-1 text-xs text-muted-foreground">{task.description || '-'}</div>
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
