import type { Task as ApiTask } from '../../../shared/api/tasks';
import type { TaskRecord } from './mockTasks';

type Options = {
  memberNameById?: Map<string, string>;
  teamNameById?: Map<string, string>;
};

export function mapApiTaskToTaskRecord(task: ApiTask, opts?: Options): TaskRecord {
  const dueDate = task.dueDate ?? (task.dueAt ? task.dueAt.slice(0, 10) : null);
  const assigneeName =
    task.assigneeName ?? (task.assigneeUserId ? opts?.memberNameById?.get(task.assigneeUserId) ?? null : null);
  const assigneeTeamName =
    task.assigneeTeamName ?? (task.assigneeTeamId ? opts?.teamNameById?.get(task.assigneeTeamId) ?? null : null);
  const createdByName =
    task.createdByName ?? (task.createdByUserId ? opts?.memberNameById?.get(task.createdByUserId) ?? task.createdByUserId : 'Workspace Owner');

  return {
    id: task.id,
    title: task.title,
    description: task.description ?? '',
    assignmentType: task.assignmentType,
    assigneeUserId: task.assigneeUserId,
    assigneeName,
    assigneeTeamId: task.assigneeTeamId,
    assigneeTeamName,
    dueDate,
    priority: task.priority,
    status: task.status,
    progressPercent: task.progressPercent ?? null,
    startAt: task.startAt ?? null,
    dueAt: task.dueAt ?? null,
    completedAt: task.completedAt ?? null,
    estimatedAt: task.estimatedAt ?? null,
    holdReason: task.holdReason ?? null,
    cancelReason: task.cancelReason ?? null,
    completionNote: task.completionNote ?? null,
    statusNote: task.statusNote ?? null,
    createdByUserId: task.createdByUserId,
    createdByName,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  };
}
