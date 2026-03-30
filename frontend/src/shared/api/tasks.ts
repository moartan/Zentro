import { apiDelete, apiGet, apiPatch, apiPost } from './http';

export type TaskStatus = 'todo' | 'in_progress' | 'on_hold' | 'done' | 'canceled';
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';
export type TaskAssignmentType = 'individual' | 'team';

export type Task = {
  id: string;
  businessId: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  progressPercent: number | null;
  assignmentType: TaskAssignmentType;
  assigneeUserId: string | null;
  assigneeTeamId: string | null;
  assigneeName?: string | null;
  assigneeTeamName?: string | null;
  startAt: string | null;
  dueAt: string | null;
  completedAt: string | null;
  estimatedAt: string | null;
  holdReason: string | null;
  cancelReason: string | null;
  completionNote: string | null;
  statusNote?: string | null;
  dueDate: string | null;
  createdByUserId: string;
  createdByName?: string | null;
  createdAt: string;
  updatedAt: string;
  isDone: boolean;
};

type TasksListResponse = {
  success: boolean;
  tasks: Task[];
};

type TaskResponse = {
  success: boolean;
  task: Task;
};

export type TaskComment = {
  id: string;
  taskId: string;
  businessId: string;
  authorUserId: string;
  authorName: string | null;
  body: string;
  createdAt: string;
};

export type TaskActivityEntry = {
  id: string;
  action: string;
  title: string;
  description: string | null;
  actorUserId: string | null;
  actorName: string | null;
  entityType: string | null;
  entityId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export function getTasks() {
  return apiGet<TasksListResponse>('/api/tasks');
}

export function createTask(input: {
  title: string;
  description?: string;
  assignmentType?: TaskAssignmentType;
  assigneeUserId?: string | null;
  assigneeTeamId?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  progressPercent?: number;
  startAt?: string | null;
  dueAt?: string | null;
  completedAt?: string | null;
  estimatedAt?: string | null;
  dueDate?: string | null;
  holdReason?: string | null;
  cancelReason?: string | null;
  completionNote?: string | null;
  statusNote?: string | null;
}) {
  return apiPost<TaskResponse>('/api/tasks', input);
}

export function updateTask(
  id: string,
  input: {
    title?: string;
    description?: string;
    status?: TaskStatus;
    isDone?: boolean;
    priority?: TaskPriority;
    progressPercent?: number;
    assignmentType?: TaskAssignmentType;
    assigneeUserId?: string | null;
    assigneeTeamId?: string | null;
    startAt?: string | null;
    dueAt?: string | null;
    completedAt?: string | null;
    estimatedAt?: string | null;
    dueDate?: string | null;
    holdReason?: string | null;
    cancelReason?: string | null;
    completionNote?: string | null;
    statusNote?: string | null;
  },
) {
  return apiPatch<TaskResponse>(`/api/tasks/${id}`, input);
}

export function deleteTask(id: string) {
  return apiDelete<{ success: boolean }>(`/api/tasks/${id}`);
}

export function getTaskComments(id: string) {
  return apiGet<{ success: boolean; comments: TaskComment[] }>(`/api/tasks/${id}/comments`);
}

export function createTaskComment(id: string, input: { body: string }) {
  return apiPost<{ success: boolean; comment: TaskComment }>(`/api/tasks/${id}/comments`, input);
}

export function getTaskActivity(id: string) {
  return apiGet<{ success: boolean; activity: TaskActivityEntry[] }>(`/api/tasks/${id}/activity`);
}
