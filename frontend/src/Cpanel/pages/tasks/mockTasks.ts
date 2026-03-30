export type TaskStatus = 'todo' | 'in_progress' | 'on_hold' | 'done' | 'canceled';
export type TaskPriority = 'high' | 'medium' | 'low' | 'urgent';
export type AssignmentType = 'individual' | 'team';

export type TaskRecord = {
  id: string;
  title: string;
  description: string;
  assignmentType: AssignmentType;
  assigneeUserId: string | null;
  assigneeName: string | null;
  assigneeTeamId: string | null;
  assigneeTeamName: string | null;
  dueDate: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  progressPercent: number | null;
  startAt: string | null;
  dueAt: string | null;
  completedAt: string | null;
  estimatedAt: string | null;
  holdReason: string | null;
  cancelReason: string | null;
  completionNote: string | null;
  statusNote?: string | null;
  createdByUserId: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
};

export type TaskStatusFilter = 'all' | 'todo' | 'in_progress' | 'on_hold' | 'completed' | 'overdue' | 'canceled';

export type CreateTaskInput = {
  title: string;
  description: string;
  assignmentType: AssignmentType;
  assigneeUserId: string | null;
  assigneeName: string | null;
  assigneeTeamId: string | null;
  assigneeTeamName: string | null;
  status?: TaskStatus;
  priority: TaskPriority;
  progressPercent?: number | null;
  startAt?: string | null;
  dueAt?: string | null;
  completedAt?: string | null;
  estimatedAt?: string | null;
  holdReason?: string | null;
  cancelReason?: string | null;
  completionNote?: string | null;
  statusNote?: string | null;
  dueDate?: string | null;
  createdByUserId: string;
  createdByName: string;
};

const STORAGE_KEY = 'zentro.tasks.mock.v1';

const seedTasks: TaskRecord[] = [
  {
    id: 'task-001',
    title: 'Finalize onboarding email copy',
    description: 'Review tone and CTA, then send final copy to marketing.',
    assignmentType: 'individual',
    assigneeUserId: 'u-amina',
    assigneeName: 'Amina Hassan',
    assigneeTeamId: null,
    assigneeTeamName: null,
    dueDate: '2026-01-13',
    dueAt: '2026-01-13T17:00:00.000Z',
    priority: 'high',
    status: 'in_progress',
    progressPercent: 65,
    startAt: '2026-01-06T09:00:00.000Z',
    completedAt: null,
    estimatedAt: null,
    holdReason: null,
    cancelReason: null,
    completionNote: null,
    createdByUserId: 'u-owner',
    createdByName: 'Workspace Owner',
    createdAt: '2026-01-03T10:10:00.000Z',
    updatedAt: '2026-01-08T11:20:00.000Z',
  },
  {
    id: 'task-002',
    title: 'Client rollout checklist',
    description: 'Prepare checklist for support and engineering handoff.',
    assignmentType: 'individual',
    assigneeUserId: 'u-noah',
    assigneeName: 'Noah Parker',
    assigneeTeamId: null,
    assigneeTeamName: null,
    dueDate: '2026-01-15',
    dueAt: '2026-01-15T16:00:00.000Z',
    priority: 'medium',
    status: 'on_hold',
    progressPercent: 45,
    startAt: '2026-01-08T10:00:00.000Z',
    completedAt: null,
    estimatedAt: '2026-01-17T16:00:00.000Z',
    holdReason: 'Waiting for client legal feedback.',
    cancelReason: null,
    completionNote: null,
    createdByUserId: 'u-owner',
    createdByName: 'Workspace Owner',
    createdAt: '2026-01-04T12:30:00.000Z',
    updatedAt: '2026-01-05T08:00:00.000Z',
  },
  {
    id: 'task-003',
    title: 'Update pricing FAQ',
    description: 'Add latest discount policy and enterprise billing notes.',
    assignmentType: 'individual',
    assigneeUserId: 'u-lina',
    assigneeName: 'Lina Patel',
    assigneeTeamId: null,
    assigneeTeamName: null,
    dueDate: '2026-01-10',
    dueAt: '2026-01-10T13:00:00.000Z',
    priority: 'high',
    status: 'todo',
    progressPercent: 20,
    startAt: null,
    completedAt: null,
    estimatedAt: null,
    holdReason: null,
    cancelReason: null,
    completionNote: null,
    createdByUserId: 'u-owner',
    createdByName: 'Workspace Owner',
    createdAt: '2026-01-02T08:00:00.000Z',
    updatedAt: '2026-01-02T08:00:00.000Z',
  },
  {
    id: 'task-004',
    title: 'Security policy refresh',
    description: 'Update outdated policy sections and publish changelog.',
    assignmentType: 'team',
    assigneeUserId: null,
    assigneeName: null,
    assigneeTeamId: 'team-platform',
    assigneeTeamName: 'Platform Team',
    dueDate: '2026-01-20',
    dueAt: '2026-01-20T10:00:00.000Z',
    priority: 'low',
    status: 'done',
    progressPercent: 100,
    startAt: '2026-01-02T09:00:00.000Z',
    completedAt: '2026-01-09T09:00:00.000Z',
    estimatedAt: null,
    holdReason: null,
    cancelReason: null,
    completionNote: 'Published and shared in #announcements.',
    createdByUserId: 'u-owner',
    createdByName: 'Workspace Owner',
    createdAt: '2026-01-01T09:00:00.000Z',
    updatedAt: '2026-01-09T09:00:00.000Z',
  },
  {
    id: 'task-005',
    title: 'Write launch announcement draft',
    description: 'Draft first version for internal review.',
    assignmentType: 'individual',
    assigneeUserId: 'u-member-b',
    assigneeName: 'Member B',
    assigneeTeamId: null,
    assigneeTeamName: null,
    dueDate: '2026-01-12',
    dueAt: '2026-01-12T17:30:00.000Z',
    priority: 'medium',
    status: 'in_progress',
    progressPercent: 55,
    startAt: '2026-01-05T09:00:00.000Z',
    completedAt: null,
    estimatedAt: null,
    holdReason: null,
    cancelReason: null,
    completionNote: null,
    createdByUserId: 'u-owner',
    createdByName: 'Workspace Owner',
    createdAt: '2026-01-04T10:00:00.000Z',
    updatedAt: '2026-01-06T15:00:00.000Z',
  },
  {
    id: 'task-006',
    title: 'QA regression on billing screens',
    description: 'Run smoke suite and collect blockers.',
    assignmentType: 'team',
    assigneeUserId: null,
    assigneeName: null,
    assigneeTeamId: 'team-qa',
    assigneeTeamName: 'QA Team',
    dueDate: '2026-01-18',
    dueAt: '2026-01-18T14:00:00.000Z',
    priority: 'high',
    status: 'todo',
    progressPercent: 20,
    startAt: null,
    completedAt: null,
    estimatedAt: null,
    holdReason: null,
    cancelReason: null,
    completionNote: null,
    createdByUserId: 'u-owner',
    createdByName: 'Workspace Owner',
    createdAt: '2026-01-07T10:00:00.000Z',
    updatedAt: '2026-01-07T10:00:00.000Z',
  },
];

function inferProgressForStatus(status: TaskStatus) {
  if (status === 'done' || status === 'canceled') return 100;
  if (status === 'in_progress' || status === 'on_hold') return 65;
  return 20;
}

function coerceDueDate(dueDate: string | null | undefined, dueAt: string | null | undefined) {
  if (dueDate) return dueDate;
  if (!dueAt) return null;
  const d = new Date(dueAt);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function normalizeTask(raw: Partial<TaskRecord> & { id: string; title: string }): TaskRecord {
  const status = raw.status ?? 'todo';
  return {
    id: raw.id,
    title: raw.title,
    description: raw.description ?? '',
    assignmentType: raw.assignmentType ?? 'individual',
    assigneeUserId: raw.assigneeUserId ?? null,
    assigneeName: raw.assigneeName ?? null,
    assigneeTeamId: raw.assigneeTeamId ?? null,
    assigneeTeamName: raw.assigneeTeamName ?? null,
    dueDate: coerceDueDate(raw.dueDate, raw.dueAt),
    dueAt: raw.dueAt ?? null,
    priority: raw.priority ?? 'medium',
    status,
    progressPercent: typeof raw.progressPercent === 'number' ? raw.progressPercent : inferProgressForStatus(status),
    startAt: raw.startAt ?? null,
    completedAt: raw.completedAt ?? null,
    estimatedAt: raw.estimatedAt ?? null,
    holdReason: raw.holdReason ?? null,
    cancelReason: raw.cancelReason ?? null,
    completionNote: raw.completionNote ?? null,
    statusNote: raw.statusNote ?? null,
    createdByUserId: raw.createdByUserId ?? 'u-owner',
    createdByName: raw.createdByName ?? 'Workspace Owner',
    createdAt: raw.createdAt ?? new Date().toISOString(),
    updatedAt: raw.updatedAt ?? new Date().toISOString(),
  };
}

function sortTasks(rows: TaskRecord[]) {
  return [...rows].sort((a, b) => {
    const ad = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
    const bd = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
    return bd - ad;
  });
}

function fallbackRead(): TaskRecord[] {
  if (typeof window === 'undefined') return sortTasks(seedTasks);

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seedTasks));
      return sortTasks(seedTasks);
    }

    const parsed = JSON.parse(raw) as Array<Partial<TaskRecord>>;
    if (!Array.isArray(parsed) || parsed.length === 0) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seedTasks));
      return sortTasks(seedTasks);
    }

    const normalized = parsed
      .filter((row): row is Partial<TaskRecord> & { id: string; title: string } => Boolean(row?.id && row?.title))
      .map((row) => normalizeTask(row));

    if (normalized.length === 0) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seedTasks));
      return sortTasks(seedTasks);
    }

    return sortTasks(normalized);
  } catch {
    return sortTasks(seedTasks);
  }
}

export function readMockTasks() {
  return fallbackRead();
}

export function writeMockTasks(rows: TaskRecord[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
  } catch {
    // ignore storage errors
  }
}

export function createMockTask(input: CreateTaskInput): TaskRecord {
  const now = new Date().toISOString();
  const status = input.status ?? 'todo';
  const dueAt = input.dueAt ?? (input.dueDate ? new Date(input.dueDate).toISOString() : null);
  const task: TaskRecord = {
    id: `task-${Math.random().toString(36).slice(2, 10)}`,
    title: input.title,
    description: input.description,
    assignmentType: input.assignmentType,
    assigneeUserId: input.assigneeUserId,
    assigneeName: input.assigneeName,
    assigneeTeamId: input.assigneeTeamId,
    assigneeTeamName: input.assigneeTeamName,
    dueDate: coerceDueDate(input.dueDate ?? null, dueAt),
    dueAt,
    priority: input.priority,
    status,
    progressPercent:
      typeof input.progressPercent === 'number' ? Math.max(0, Math.min(100, input.progressPercent)) : inferProgressForStatus(status),
    startAt: input.startAt ?? null,
    completedAt: input.completedAt ?? (status === 'done' ? now : null),
    estimatedAt: input.estimatedAt ?? null,
    holdReason: input.holdReason ?? null,
    cancelReason: input.cancelReason ?? null,
    completionNote: input.completionNote ?? null,
    statusNote:
      status === 'on_hold'
        ? (input.statusNote ?? input.holdReason ?? null)
        : status === 'canceled'
          ? (input.statusNote ?? input.cancelReason ?? null)
          : status === 'done'
            ? (input.statusNote ?? input.completionNote ?? null)
            : null,
    createdByUserId: input.createdByUserId,
    createdByName: input.createdByName,
    createdAt: now,
    updatedAt: now,
  };

  const next = sortTasks([task, ...readMockTasks()]);
  writeMockTasks(next);
  return task;
}

export function updateMockTask(
  taskId: string,
  patch: Partial<Pick<TaskRecord, 'status' | 'priority' | 'dueDate' | 'dueAt' | 'progressPercent' | 'completedAt' | 'holdReason' | 'cancelReason' | 'completionNote'>>,
) {
  const next = readMockTasks().map((task) => {
    if (task.id !== taskId) return task;

    const dueAt = typeof patch.dueAt !== 'undefined' ? patch.dueAt : task.dueAt;
    const dueDate =
      typeof patch.dueDate !== 'undefined'
        ? patch.dueDate
        : coerceDueDate(task.dueDate, dueAt);

    return {
      ...task,
      ...patch,
      dueAt,
      dueDate,
      updatedAt: new Date().toISOString(),
    };
  });
  writeMockTasks(next);
}

export function getMockTaskById(taskId: string) {
  return readMockTasks().find((task) => task.id === taskId) ?? null;
}

export function isTaskOverdue(task: Pick<TaskRecord, 'dueDate' | 'dueAt' | 'status'>, now = new Date()) {
  if (task.status === 'done' || task.status === 'canceled') return false;
  const raw = task.dueAt ?? task.dueDate;
  if (!raw) return false;
  const due = new Date(raw);
  if (Number.isNaN(due.getTime())) return false;
  return due.getTime() < now.getTime();
}

export function statusLabel(status: TaskStatus) {
  if (status === 'todo') return 'To Do';
  if (status === 'in_progress') return 'In Progress';
  if (status === 'on_hold') return 'On Hold';
  if (status === 'canceled') return 'Canceled';
  return 'Completed';
}

export function statusPillClass(status: TaskStatus, isOverdue: boolean) {
  if (isOverdue) return 'bg-rose-100 text-rose-700';
  if (status === 'canceled') return 'bg-rose-100 text-rose-700';
  if (status === 'done') return 'bg-emerald-100 text-emerald-700';
  if (status === 'on_hold') return 'bg-amber-100 text-amber-700';
  if (status === 'in_progress') return 'bg-sky-100 text-sky-700';
  return 'bg-sky-100 text-sky-700';
}

export function priorityPillClass(priority: TaskPriority) {
  if (priority === 'urgent') return 'bg-rose-200 text-rose-800';
  if (priority === 'high') return 'bg-rose-100 text-rose-700';
  if (priority === 'medium') return 'bg-amber-100 text-amber-700';
  return 'bg-emerald-100 text-emerald-700';
}

export function priorityLabel(priority: TaskPriority) {
  if (priority === 'urgent') return 'Urgent';
  if (priority === 'high') return 'High';
  if (priority === 'medium') return 'Medium';
  return 'Low';
}

export function taskMatchesStatusFilter(task: TaskRecord, filter: TaskStatusFilter) {
  if (filter === 'all') return true;
  if (filter === 'todo') return task.status === 'todo';
  if (filter === 'in_progress') return task.status === 'in_progress';
  if (filter === 'on_hold') return task.status === 'on_hold';
  if (filter === 'completed') return task.status === 'done';
  if (filter === 'canceled') return task.status === 'canceled';
  return isTaskOverdue(task);
}

export function formatDate(value: string | null | undefined) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function getTaskSummary(tasks: TaskRecord[]) {
  return tasks.reduce(
    (acc, task) => {
      acc.total += 1;
      if (task.status === 'done') acc.completed += 1;
      if (task.status === 'canceled') acc.canceled += 1;
      if (task.status === 'in_progress') acc.inProgress += 1;
      if (task.status === 'on_hold') acc.onHold += 1;
      if (task.status === 'todo') acc.open += 1;
      if (isTaskOverdue(task)) acc.overdue += 1;
      return acc;
    },
    { total: 0, open: 0, inProgress: 0, onHold: 0, completed: 0, overdue: 0, canceled: 0 },
  );
}
