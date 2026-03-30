import { Router } from 'express';
import { z } from 'zod';

import { supabaseService } from '../config/supabase.js';
import { sendDbError } from '../lib/supabaseError.js';
import { createRateLimiter } from '../middleware/rateLimit.js';
import { getActor, getActorWithOptions } from '../services/actor.js';
import { findIdempotentResponse, readIdempotencyKey, saveIdempotentResponse } from '../services/idempotency.js';
import {
  createNotification,
  createNotifications,
  getNotificationPreferences,
  getTeamMemberUserIds,
  getWorkspaceOwnerUserId,
  notifySafe,
} from '../services/notifications.js';
import { sendUrgentTaskEmail } from '../services/mailer.js';
import { getUserTeamIds } from '../services/team.js';
import { createTaskSchema, updateTaskSchema } from '../validators/tasks.js';

const router = Router();
const taskCommentLimiter = createRateLimiter({
  windowMs: 60_000,
  max: 40,
  message: 'Too many comments. Please wait a minute.',
});
const createTaskCommentSchema = z.object({
  body: z.string().trim().min(1, 'Comment is required.').max(1000, 'Comment is too long.'),
});

const TASK_SELECT_FIELDS =
  'id, business_id, title, description, status, priority, progress_percent, assignment_type, assignee_user_id, assignee_team_id, created_by_user_id, start_at, due_at, completed_at, estimated_at, hold_reason, cancel_reason, completion_note, due_date, created_at, updated_at';
const ACTIVE_TASK_STATUSES = ['todo', 'in_progress', 'on_hold'];
const FALLBACK_MAX_ACTIVE_TASKS_BY_PLAN = {
  free: 50,
  pro: 500,
  enterprise: null,
};

function isMissingSubscriptionPlansTableError(error) {
  const msg = `${error?.message ?? ''}`.toLowerCase();
  return msg.includes('subscription_plans') && (msg.includes('does not exist') || msg.includes('could not find'));
}

function isActiveTaskStatus(status) {
  return ACTIVE_TASK_STATUSES.includes(status);
}

async function buildTaskDisplayContext({ businessId, tasks }) {
  const userIds = Array.from(
    new Set(
      (tasks ?? [])
        .flatMap((task) => [task.assignee_user_id, task.created_by_user_id])
        .filter((id) => typeof id === 'string' && id.length > 0),
    ),
  );
  const teamIds = Array.from(
    new Set((tasks ?? []).map((task) => task.assignee_team_id).filter((id) => typeof id === 'string' && id.length > 0)),
  );

  const [usersResult, teamsResult] = await Promise.all([
    userIds.length > 0
      ? supabaseService.from('profiles').select('id, full_name, email').in('id', userIds)
      : Promise.resolve({ data: [], error: null }),
    teamIds.length > 0
      ? supabaseService.from('teams').select('id, name').eq('business_id', businessId).in('id', teamIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  return {
    usersError: usersResult.error ?? null,
    teamsError: teamsResult.error ?? null,
    userNameById: new Map((usersResult.data ?? []).map((row) => [row.id, row.full_name || row.email || row.id])),
    teamNameById: new Map((teamsResult.data ?? []).map((row) => [row.id, row.name || row.id])),
  };
}

function mapTaskToResponse(task, displayContext) {
  const assigneeName = task.assignee_user_id ? displayContext?.userNameById?.get(task.assignee_user_id) ?? null : null;
  const createdByName = task.created_by_user_id
    ? displayContext?.userNameById?.get(task.created_by_user_id) ?? task.created_by_user_id
    : null;
  const assigneeTeamName = task.assignee_team_id ? displayContext?.teamNameById?.get(task.assignee_team_id) ?? null : null;
  const statusNote =
    task.status === 'on_hold'
      ? task.hold_reason ?? null
      : task.status === 'canceled'
        ? task.cancel_reason ?? null
        : task.status === 'done'
          ? task.completion_note ?? null
          : null;

  return {
    id: task.id,
    businessId: task.business_id,
    title: task.title,
    description: task.description ?? '',
    status: task.status,
    priority: task.priority,
    progressPercent: typeof task.progress_percent === 'number' ? task.progress_percent : null,
    assignmentType: task.assignment_type,
    assigneeUserId: task.assignee_user_id,
    assigneeTeamId: task.assignee_team_id,
    assigneeName,
    assigneeTeamName,
    startAt: task.start_at ?? null,
    dueAt: task.due_at ?? null,
    completedAt: task.completed_at ?? null,
    estimatedAt: task.estimated_at ?? null,
    holdReason: task.hold_reason ?? null,
    cancelReason: task.cancel_reason ?? null,
    completionNote: task.completion_note ?? null,
    statusNote,
    dueDate: task.due_at ?? task.due_date ?? null, // legacy field for older clients
    createdByUserId: task.created_by_user_id,
    createdByName,
    createdAt: task.created_at,
    updatedAt: task.updated_at,
    isDone: task.status === 'done',
  };
}

function assertTaskAssignment({ assignmentType, assigneeUserId, assigneeTeamId }) {
  if (assignmentType === 'individual') {
    if (!assigneeUserId || assigneeTeamId) {
      return 'For individual tasks, assigneeUserId is required and assigneeTeamId must be null.';
    }
  }

  if (assignmentType === 'team') {
    if (!assigneeTeamId || assigneeUserId) {
      return 'For team tasks, assigneeTeamId is required and assigneeUserId must be null.';
    }
  }

  return null;
}

function inferredProgressForStatus(status) {
  if (status === 'todo') return 20;
  if (status === 'in_progress') return 65;
  if (status === 'on_hold') return 65;
  if (status === 'done') return 100;
  if (status === 'canceled') return 100;
  return 0;
}

function pickProvidedStatusNote(payload, status) {
  if (typeof payload.statusNote !== 'undefined') return payload.statusNote;
  if (status === 'on_hold' && typeof payload.holdReason !== 'undefined') return payload.holdReason;
  if (status === 'canceled' && typeof payload.cancelReason !== 'undefined') return payload.cancelReason;
  if (status === 'done' && typeof payload.completionNote !== 'undefined') return payload.completionNote;
  return undefined;
}

function pickTaskStatusNote(task, status) {
  if (status === 'on_hold') return task.hold_reason ?? null;
  if (status === 'canceled') return task.cancel_reason ?? null;
  if (status === 'done') return task.completion_note ?? null;
  return null;
}

async function resolveTaskRecipientUserIds({ assignmentType, assigneeUserId, assigneeTeamId }) {
  if (assignmentType === 'individual') {
    return { error: null, recipientUserIds: assigneeUserId ? [assigneeUserId] : [] };
  }
  if (!assigneeTeamId) {
    return { error: null, recipientUserIds: [] };
  }

  const { error, userIds } = await getTeamMemberUserIds(assigneeTeamId);
  if (error) return { error, recipientUserIds: [] };
  return { error: null, recipientUserIds: userIds };
}

async function sendUrgentTaskEmails({ businessId, actorUserId, task, recipientUserIds }) {
  if (task.priority !== 'urgent') return;
  const uniqueRecipients = [...new Set((recipientUserIds ?? []).filter((id) => id && id !== actorUserId))];
  if (uniqueRecipients.length === 0) return;

  const [businessResult, profilesResult] = await Promise.all([
    supabaseService.from('businesses').select('name').eq('id', businessId).maybeSingle(),
    supabaseService.from('profiles').select('id, full_name, email').in('id', [...uniqueRecipients, actorUserId]),
  ]);
  if (businessResult.error) {
    console.error('urgent_email_business_lookup_failed', businessResult.error);
    return;
  }
  if (profilesResult.error) {
    console.error('urgent_email_profiles_lookup_failed', profilesResult.error);
    return;
  }

  const profileById = new Map((profilesResult.data ?? []).map((row) => [row.id, row]));
  const actorName = profileById.get(actorUserId)?.full_name ?? profileById.get(actorUserId)?.email ?? 'Workspace owner';
  const workspaceName = businessResult.data?.name ?? 'Workspace';

  for (const recipientUserId of uniqueRecipients) {
    const recipient = profileById.get(recipientUserId);
    if (!recipient?.email) continue;

    const { error: prefError, preferences } = await getNotificationPreferences(recipientUserId);
    if (prefError) {
      console.error('urgent_email_pref_lookup_failed', prefError);
      continue;
    }
    if (!preferences.emailEnabled) continue;

    try {
      await sendUrgentTaskEmail({
        to: recipient.email,
        recipientName: recipient.full_name ?? null,
        workspaceName,
        taskId: task.id,
        taskTitle: task.title,
        dueAt: task.due_at ?? null,
        assignedByName: actorName,
      });
    } catch (err) {
      console.error('urgent_email_send_failed', err);
    }
  }
}

function normalizeTaskState({ status, progressPercent, startAt, dueAt, completedAt, statusNote, holdReason, cancelReason, completionNote }) {
  const preferredStatusNote = typeof statusNote === 'string' || statusNote === null ? statusNote : null;
  const fallbackLegacyNote =
    status === 'on_hold'
      ? holdReason
      : status === 'canceled'
        ? cancelReason
        : status === 'done'
          ? completionNote
          : null;
  const resolvedNote = preferredStatusNote ?? fallbackLegacyNote ?? null;
  const trimmedNote = typeof resolvedNote === 'string' ? resolvedNote.trim() : null;

  const normalized = {
    status,
    progressPercent: typeof progressPercent === 'number' ? progressPercent : inferredProgressForStatus(status),
    startAt: startAt ?? null,
    dueAt: dueAt ?? null,
    completedAt: completedAt ?? null,
    holdReason: null,
    cancelReason: null,
    completionNote: null,
    statusNote: trimmedNote || null,
  };

  if (status === 'in_progress' && !normalized.startAt) {
    normalized.startAt = new Date().toISOString();
  }

  if (status === 'done') {
    if (!normalized.completedAt) {
      normalized.completedAt = new Date().toISOString();
    }
    normalized.completionNote = normalized.statusNote;
  }

  if (status === 'on_hold') {
    if (!normalized.statusNote) {
      return { error: 'Reason is required when status is on_hold.', normalized: null };
    }
    normalized.holdReason = normalized.statusNote;
    normalized.completedAt = null;
  }

  if (status === 'canceled') {
    if (!normalized.statusNote) {
      return { error: 'Reason is required when status is canceled.', normalized: null };
    }
    normalized.cancelReason = normalized.statusNote;
    normalized.completedAt = null;
  }

  if (status !== 'done' && status !== 'on_hold' && status !== 'canceled') {
    normalized.completedAt = null;
    normalized.statusNote = null;
  }

  return { error: null, normalized };
}

function validateEmployeeStatusTransition(currentStatus, nextStatus) {
  if (currentStatus === nextStatus) return null;

  const allowedTransitions = {
    todo: new Set(['in_progress']),
    in_progress: new Set(['on_hold', 'done']),
    on_hold: new Set(['in_progress']),
    done: new Set([]),
    canceled: new Set([]),
  };

  const allowed = allowedTransitions[currentStatus];
  if (!allowed || !allowed.has(nextStatus)) {
    return `Invalid status transition for member: ${currentStatus} -> ${nextStatus}.`;
  }
  return null;
}

function mapTaskComment(row) {
  return {
    id: row.id,
    taskId: row.task_id,
    businessId: row.business_id,
    authorUserId: row.author_user_id,
    authorName: row.profiles?.full_name ?? row.profiles?.email ?? null,
    body: row.body,
    createdAt: row.created_at,
  };
}

function mapTaskActivityRow(row, actorNameById) {
  const metadata = row.metadata ?? {};
  const actorName = metadata.actorName ?? (row.actor_user_id ? actorNameById?.get(row.actor_user_id) ?? null : null);
  const baseTitle = row.action ?? 'task_event';

  return {
    id: row.id,
    action: row.action,
    title: baseTitle
      .split('_')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' '),
    description: metadata.description ?? null,
    actorUserId: row.actor_user_id ?? null,
    actorName,
    entityType: row.entity_type ?? null,
    entityId: row.entity_id ?? null,
    metadata,
    createdAt: row.created_at,
  };
}

async function writeAuditLog({ businessId, actorUserId, action, entityType, entityId, metadata }) {
  try {
    const { error } = await supabaseService.from('audit_logs').insert({
      business_id: businessId ?? null,
      actor_user_id: actorUserId ?? null,
      action,
      entity_type: entityType,
      entity_id: entityId ?? null,
      metadata: metadata ?? {},
    });
    if (error) console.error('audit_log_insert_failed', error);
  } catch (err) {
    console.error('audit_log_insert_exception', err);
  }
}

async function canActorAccessTask({ actor, task }) {
  const canManageAll = actor.role === 'super_admin' || actor.role === 'business_owner';
  if (canManageAll) return { error: null, allowed: true };

  const { error: teamError, teamIds } = await getUserTeamIds({
    businessId: actor.businessId,
    userId: actor.userId,
  });
  if (teamError) return { error: teamError, allowed: false };

  const assignedToUser = task.assignee_user_id === actor.userId;
  const assignedToTeam = task.assignee_team_id && teamIds.includes(task.assignee_team_id);
  return { error: null, allowed: Boolean(assignedToUser || assignedToTeam) };
}

async function getBusinessTaskLimitContext(businessId) {
  const { data: business, error: businessError } = await supabaseService
    .from('businesses')
    .select('id, subscription_plan')
    .eq('id', businessId)
    .maybeSingle();
  if (businessError) return { error: businessError, context: null };
  if (!business) {
    return {
      error: { code: 'NOT_FOUND', message: 'Workspace not found.' },
      context: null,
    };
  }

  const planCode = business.subscription_plan ?? 'free';

  const { data: plan, error: planError } = await supabaseService
    .from('subscription_plans')
    .select('limits')
    .eq('code', planCode)
    .maybeSingle();

  if (planError && !isMissingSubscriptionPlansTableError(planError)) {
    return { error: planError, context: null };
  }

  const maxActiveTasksFromPlan =
    typeof plan?.limits?.max_active_tasks === 'number' ? plan.limits.max_active_tasks : null;
  const fallback = FALLBACK_MAX_ACTIVE_TASKS_BY_PLAN[planCode] ?? FALLBACK_MAX_ACTIVE_TASKS_BY_PLAN.free;
  const maxActiveTasks = maxActiveTasksFromPlan ?? fallback;

  return {
    error: null,
    context: { planCode, maxActiveTasks },
  };
}

async function countActiveTasks(businessId, opts = {}) {
  const query = supabaseService
    .from('tasks')
    .select('id')
    .eq('business_id', businessId)
    .in('status', ACTIVE_TASK_STATUSES);

  if (opts.excludeTaskId) query.neq('id', opts.excludeTaskId);

  const { data, error } = await query;
  if (error) return { error, count: 0 };
  return { error: null, count: (data ?? []).length };
}

async function ensureActiveTaskCapacity({ businessId, additionalActiveTasks = 1, excludeTaskId = null }) {
  const { error: limitError, context } = await getBusinessTaskLimitContext(businessId);
  if (limitError) return { error: limitError, allowed: false, maxActiveTasks: null, used: 0, remaining: 0, planCode: null };

  const { planCode, maxActiveTasks } = context;
  if (maxActiveTasks === null) {
    return { error: null, allowed: true, maxActiveTasks, used: 0, remaining: null, planCode };
  }

  const { error: countError, count } = await countActiveTasks(businessId, { excludeTaskId });
  if (countError) {
    return { error: countError, allowed: false, maxActiveTasks, used: 0, remaining: 0, planCode };
  }

  const remaining = Math.max(0, maxActiveTasks - count);
  return {
    error: null,
    allowed: remaining >= additionalActiveTasks,
    maxActiveTasks,
    used: count,
    remaining,
    planCode,
  };
}

async function assertAssigneeUserInBusiness({ businessId, assigneeUserId }) {
  if (!assigneeUserId) return { error: null, valid: true };

  const { data: business, error: businessError } = await supabaseService
    .from('businesses')
    .select('owner_user_id')
    .eq('id', businessId)
    .maybeSingle();
  if (businessError) return { error: businessError, valid: false };

  if (business?.owner_user_id === assigneeUserId) {
    return { error: null, valid: true };
  }

  const { data: membership, error: membershipError } = await supabaseService
    .from('business_members')
    .select('id')
    .eq('business_id', businessId)
    .eq('user_id', assigneeUserId)
    .in('status', ['active', 'invited'])
    .maybeSingle();
  if (membershipError) return { error: membershipError, valid: false };

  return { error: null, valid: Boolean(membership?.id) };
}

router.get('/api/tasks', async (req, res) => {
  try {
    const actor = await getActor(req, res);
    if (!actor) return;

    const { businessId, userId, role } = actor;
    const query = supabaseService
      .from('tasks')
      .select(TASK_SELECT_FIELDS)
      .eq('business_id', businessId)
      .order('created_at', { ascending: false });

    if (role === 'employee') {
      const { error: teamError, teamIds } = await getUserTeamIds({ businessId, userId });
      if (teamError) return sendDbError(res, teamError);

      if (teamIds.length > 0) {
        query.or(`assignee_user_id.eq.${userId},assignee_team_id.in.(${teamIds.join(',')})`);
      } else {
        query.eq('assignee_user_id', userId);
      }
    }

    const { data, error } = await query;
    if (error) return sendDbError(res, error);

    const displayContext = await buildTaskDisplayContext({ businessId, tasks: data ?? [] });
    if (displayContext.usersError) return sendDbError(res, displayContext.usersError);
    if (displayContext.teamsError) return sendDbError(res, displayContext.teamsError);

    return res.status(200).json({ success: true, tasks: (data ?? []).map((task) => mapTaskToResponse(task, displayContext)) });
  } catch (err) {
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

router.post('/api/tasks', async (req, res) => {
  try {
    const actor = await getActorWithOptions(req, res, { requireActiveWorkspace: true });
    if (!actor) return;

    const { businessId, userId, role } = actor;
    const idempotencyKey = readIdempotencyKey(req);
    if (idempotencyKey) {
      const { error: idempotencyLookupError, result } = await findIdempotentResponse({
        userId,
        scope: 'create_task',
        key: idempotencyKey,
      });
      if (idempotencyLookupError) return sendDbError(res, idempotencyLookupError);
      if (result) {
        res.setHeader('Idempotent-Replay', 'true');
        return res.status(result.statusCode).json(result.response);
      }
    }

    if (role === 'employee') {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Employees cannot create tasks.' } });
    }

    const parsed = createTaskSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'Invalid payload' },
      });
    }

    const assignmentType = parsed.data.assignmentType ?? 'individual';
    const assigneeUserId = parsed.data.assigneeUserId ?? (assignmentType === 'individual' ? userId : null);
    const assigneeTeamId = parsed.data.assigneeTeamId ?? null;

    const assignmentError = assertTaskAssignment({ assignmentType, assigneeUserId, assigneeTeamId });
    if (assignmentError) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: assignmentError } });
    }

    if (assignmentType === 'individual') {
      const { error: assigneeError, valid } = await assertAssigneeUserInBusiness({ businessId, assigneeUserId });
      if (assigneeError) return sendDbError(res, assigneeError);
      if (!valid) {
        return res.status(400).json({
          success: false,
          error: { code: 'ASSIGNEE_NOT_IN_WORKSPACE', message: 'Individual assignee must belong to this workspace.' },
        });
      }
    }

    const status = parsed.data.status ?? 'todo';
    const dueAt = parsed.data.dueAt ?? (parsed.data.dueDate ? new Date(parsed.data.dueDate).toISOString() : null);
    const normalizedState = normalizeTaskState({
      status,
      progressPercent: parsed.data.progressPercent,
      startAt: parsed.data.startAt ?? null,
      dueAt,
      completedAt: parsed.data.completedAt ?? null,
      statusNote: pickProvidedStatusNote(parsed.data, status) ?? null,
      holdReason: parsed.data.holdReason ?? null,
      cancelReason: parsed.data.cancelReason ?? null,
      completionNote: parsed.data.completionNote ?? null,
    });
    if (normalizedState.error) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: normalizedState.error } });
    }

    const n = normalizedState.normalized;
    if (isActiveTaskStatus(n.status)) {
      const { error: limitError, allowed, maxActiveTasks, planCode } = await ensureActiveTaskCapacity({
        businessId,
        additionalActiveTasks: 1,
      });
      if (limitError) return sendDbError(res, limitError);
      if (!allowed) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'TASK_LIMIT_REACHED',
            message: `Active task limit reached for ${planCode} plan (${maxActiveTasks}).`,
          },
        });
      }
    }

    const { data, error } = await supabaseService
      .from('tasks')
      .insert({
        business_id: businessId,
        title: parsed.data.title,
        description: parsed.data.description,
        status: n.status,
        priority: parsed.data.priority ?? 'medium',
        progress_percent: n.progressPercent,
        assignment_type: assignmentType,
        assignee_user_id: assigneeUserId,
        assignee_team_id: assigneeTeamId,
        created_by_user_id: userId,
        start_at: n.startAt,
        due_at: n.dueAt,
        completed_at: n.completedAt,
        estimated_at: parsed.data.estimatedAt ?? null,
        hold_reason: n.holdReason,
        cancel_reason: n.cancelReason,
        completion_note: n.completionNote,
      })
      .select(TASK_SELECT_FIELDS)
      .single();

    if (error) return sendDbError(res, error);

    await writeAuditLog({
      businessId,
      actorUserId: userId,
      action: 'task_created',
      entityType: 'task',
      entityId: data.id,
      metadata: {
        title: data.title,
        status: data.status,
        statusNote: pickTaskStatusNote(data, data.status),
        priority: data.priority,
        assignmentType: data.assignment_type,
      },
    });

    const { error: assigneeResolveError, recipientUserIds } = await resolveTaskRecipientUserIds({
      assignmentType: data.assignment_type,
      assigneeUserId: data.assignee_user_id,
      assigneeTeamId: data.assignee_team_id,
    });
    if (assigneeResolveError) {
      console.error('task_assignment_recipient_lookup_failed', assigneeResolveError);
    } else {
      const targets = recipientUserIds.filter((id) => id !== userId);
      if (targets.length > 0) {
        void notifySafe(
          createNotifications({
            recipientUserIds: targets,
            businessId,
            actorUserId: userId,
            type: 'task_assigned',
            title: 'New task assigned',
            message: data.title,
            priority: data.priority ?? 'medium',
            entityType: 'task',
            entityId: data.id,
            metadata: {
              taskId: data.id,
              assignmentType: data.assignment_type,
              status: data.status,
            },
          }),
          'task_created_assignment',
        );
      }

      await sendUrgentTaskEmails({
        businessId,
        actorUserId: userId,
        task: data,
        recipientUserIds: targets,
      });
    }

    const displayContext = await buildTaskDisplayContext({ businessId, tasks: [data] });
    if (displayContext.usersError) return sendDbError(res, displayContext.usersError);
    if (displayContext.teamsError) return sendDbError(res, displayContext.teamsError);

    const responsePayload = { success: true, task: mapTaskToResponse(data, displayContext) };
    if (idempotencyKey) {
      const { error: idempotencySaveError } = await saveIdempotentResponse({
        userId,
        scope: 'create_task',
        key: idempotencyKey,
        statusCode: 201,
        response: responsePayload,
      });
      if (idempotencySaveError) return sendDbError(res, idempotencySaveError);
    }
    return res.status(201).json(responsePayload);
  } catch (err) {
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

router.patch('/api/tasks/:id', async (req, res) => {
  try {
    const actor = await getActorWithOptions(req, res, { requireActiveWorkspace: true });
    if (!actor) return;

    const { businessId, userId, role } = actor;
    const { id } = req.params;

    const parsed = updateTaskSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'Invalid payload' },
      });
    }

    const { data: existingTask, error: existingError } = await supabaseService
      .from('tasks')
      .select(TASK_SELECT_FIELDS)
      .eq('id', id)
      .eq('business_id', businessId)
      .single();

    if (existingError) {
      if (existingError.code === 'PGRST116') {
        return res.status(404).json({ success: false, error: { code: 'TASK_NOT_FOUND', message: 'Task not found in this business.' } });
      }
      return sendDbError(res, existingError);
    }

    const canManageAll = role === 'super_admin' || role === 'business_owner';

    if (!canManageAll) {
      const { error: teamError, teamIds } = await getUserTeamIds({ businessId, userId });
      if (teamError) return sendDbError(res, teamError);

      const assignedToUser = existingTask.assignee_user_id === userId;
      const assignedToTeam = existingTask.assignee_team_id && teamIds.includes(existingTask.assignee_team_id);

      if (!assignedToUser && !assignedToTeam) {
        return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'You cannot update this task.' } });
      }

      const employeeAllowed = new Set(['status', 'isDone', 'statusNote', 'holdReason', 'cancelReason', 'completionNote']);
      const blockedKey = Object.keys(parsed.data).find((key) => !employeeAllowed.has(key));
      if (blockedKey) {
        return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Employees can only update task status.' } });
      }
    }

    const updatePayload = {};

    if (typeof parsed.data.title !== 'undefined') updatePayload.title = parsed.data.title;
    if (typeof parsed.data.description !== 'undefined') updatePayload.description = parsed.data.description;
    if (typeof parsed.data.priority !== 'undefined') updatePayload.priority = parsed.data.priority;
    if (typeof parsed.data.startAt !== 'undefined') updatePayload.start_at = parsed.data.startAt;
    if (typeof parsed.data.dueAt !== 'undefined') updatePayload.due_at = parsed.data.dueAt;
    if (typeof parsed.data.dueDate !== 'undefined') {
      updatePayload.due_at = parsed.data.dueDate ? new Date(parsed.data.dueDate).toISOString() : null;
    }
    if (typeof parsed.data.estimatedAt !== 'undefined') updatePayload.estimated_at = parsed.data.estimatedAt;
    if (typeof parsed.data.progressPercent !== 'undefined') updatePayload.progress_percent = parsed.data.progressPercent;

    let nextStatus = typeof parsed.data.status !== 'undefined' ? parsed.data.status : existingTask.status;
    if (typeof parsed.data.isDone !== 'undefined') {
      nextStatus = parsed.data.isDone ? 'done' : 'todo';
    }

    if (!canManageAll) {
      if (nextStatus === 'canceled') {
        return res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Members cannot cancel tasks.' },
        });
      }

      const transitionError = validateEmployeeStatusTransition(existingTask.status, nextStatus);
      if (transitionError) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_STATUS_TRANSITION', message: transitionError },
        });
      }
    }

    const normalizedState = normalizeTaskState({
      status: nextStatus,
      progressPercent:
        typeof parsed.data.progressPercent !== 'undefined' ? parsed.data.progressPercent : existingTask.progress_percent,
      startAt:
        typeof parsed.data.startAt !== 'undefined'
          ? parsed.data.startAt
          : (existingTask.start_at ?? null),
      dueAt:
        typeof parsed.data.dueAt !== 'undefined'
          ? parsed.data.dueAt
          : (typeof parsed.data.dueDate !== 'undefined'
            ? (parsed.data.dueDate ? new Date(parsed.data.dueDate).toISOString() : null)
            : (existingTask.due_at ?? (existingTask.due_date ? new Date(existingTask.due_date).toISOString() : null))),
      completedAt:
        typeof parsed.data.completedAt !== 'undefined' ? parsed.data.completedAt : (existingTask.completed_at ?? null),
      statusNote:
        typeof pickProvidedStatusNote(parsed.data, nextStatus) !== 'undefined'
          ? pickProvidedStatusNote(parsed.data, nextStatus)
          : pickTaskStatusNote(existingTask, nextStatus),
      holdReason:
        typeof parsed.data.holdReason !== 'undefined' ? parsed.data.holdReason : (existingTask.hold_reason ?? null),
      cancelReason:
        typeof parsed.data.cancelReason !== 'undefined' ? parsed.data.cancelReason : (existingTask.cancel_reason ?? null),
      completionNote:
        typeof parsed.data.completionNote !== 'undefined' ? parsed.data.completionNote : (existingTask.completion_note ?? null),
    });
    if (normalizedState.error) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: normalizedState.error } });
    }

    const n = normalizedState.normalized;
    const addsActiveSlot = !isActiveTaskStatus(existingTask.status) && isActiveTaskStatus(n.status);
    if (addsActiveSlot) {
      const { error: limitError, allowed, maxActiveTasks, planCode } = await ensureActiveTaskCapacity({
        businessId,
        additionalActiveTasks: 1,
        excludeTaskId: id,
      });
      if (limitError) return sendDbError(res, limitError);
      if (!allowed) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'TASK_LIMIT_REACHED',
            message: `Active task limit reached for ${planCode} plan (${maxActiveTasks}).`,
          },
        });
      }
    }

    updatePayload.status = n.status;
    updatePayload.progress_percent = n.progressPercent;
    updatePayload.start_at = n.startAt;
    updatePayload.due_at = n.dueAt;
    updatePayload.completed_at = n.completedAt;
    updatePayload.hold_reason = n.holdReason;
    updatePayload.cancel_reason = n.cancelReason;
    updatePayload.completion_note = n.completionNote;

    const nextAssignmentType = parsed.data.assignmentType ?? existingTask.assignment_type;
    const nextAssigneeUserId = typeof parsed.data.assigneeUserId !== 'undefined' ? parsed.data.assigneeUserId : existingTask.assignee_user_id;
    const nextAssigneeTeamId = typeof parsed.data.assigneeTeamId !== 'undefined' ? parsed.data.assigneeTeamId : existingTask.assignee_team_id;

    if (
      typeof parsed.data.assignmentType !== 'undefined' ||
      typeof parsed.data.assigneeUserId !== 'undefined' ||
      typeof parsed.data.assigneeTeamId !== 'undefined'
    ) {
      const assignmentError = assertTaskAssignment({
        assignmentType: nextAssignmentType,
        assigneeUserId: nextAssigneeUserId,
        assigneeTeamId: nextAssigneeTeamId,
      });

      if (assignmentError) {
        return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: assignmentError } });
      }

      if (nextAssignmentType === 'individual') {
        const { error: assigneeError, valid } = await assertAssigneeUserInBusiness({
          businessId,
          assigneeUserId: nextAssigneeUserId,
        });
        if (assigneeError) return sendDbError(res, assigneeError);
        if (!valid) {
          return res.status(400).json({
            success: false,
            error: { code: 'ASSIGNEE_NOT_IN_WORKSPACE', message: 'Individual assignee must belong to this workspace.' },
          });
        }
      }

      updatePayload.assignment_type = nextAssignmentType;
      updatePayload.assignee_user_id = nextAssigneeUserId;
      updatePayload.assignee_team_id = nextAssigneeTeamId;
    }

    const { data, error } = await supabaseService
      .from('tasks')
      .update(updatePayload)
      .eq('id', id)
      .eq('business_id', businessId)
      .select(TASK_SELECT_FIELDS)
      .single();

    if (error) return sendDbError(res, error);

    const changedFields = Object.keys(updatePayload);
    await writeAuditLog({
      businessId,
      actorUserId: userId,
      action: 'task_updated',
      entityType: 'task',
      entityId: data.id,
      metadata: {
        changedFields,
        fromStatus: existingTask.status,
        toStatus: data.status,
        statusNote: pickTaskStatusNote(data, data.status),
        assignmentType: data.assignment_type,
      },
    });

    const assignmentChanged =
      existingTask.assignment_type !== data.assignment_type ||
      (existingTask.assignee_user_id ?? null) !== (data.assignee_user_id ?? null) ||
      (existingTask.assignee_team_id ?? null) !== (data.assignee_team_id ?? null);
    if (assignmentChanged) {
      const { error: assigneeResolveError, recipientUserIds } = await resolveTaskRecipientUserIds({
        assignmentType: data.assignment_type,
        assigneeUserId: data.assignee_user_id,
        assigneeTeamId: data.assignee_team_id,
      });
      if (assigneeResolveError) {
        console.error('task_reassignment_recipient_lookup_failed', assigneeResolveError);
      } else {
        const targets = recipientUserIds.filter((id) => id !== userId);
        if (targets.length > 0) {
          void notifySafe(
            createNotifications({
              recipientUserIds: targets,
              businessId,
              actorUserId: userId,
              type: 'task_reassigned',
              title: 'Task assigned to you',
              message: data.title,
              priority: data.priority ?? 'medium',
              entityType: 'task',
              entityId: data.id,
              metadata: {
                taskId: data.id,
                assignmentType: data.assignment_type,
                status: data.status,
              },
            }),
            'task_reassigned',
          );
        }
      }
    }

    const shouldSendUrgentEmail = data.priority === 'urgent' && (existingTask.priority !== 'urgent' || assignmentChanged);
    if (shouldSendUrgentEmail) {
      const { error: urgentRecipientError, recipientUserIds } = await resolveTaskRecipientUserIds({
        assignmentType: data.assignment_type,
        assigneeUserId: data.assignee_user_id,
        assigneeTeamId: data.assignee_team_id,
      });
      if (urgentRecipientError) {
        console.error('task_urgent_recipients_lookup_failed', urgentRecipientError);
      } else {
        await sendUrgentTaskEmails({
          businessId,
          actorUserId: userId,
          task: data,
          recipientUserIds,
        });
      }
    }

    if (role === 'employee' && existingTask.status !== data.status) {
      const { error: ownerLookupError, ownerUserId } = await getWorkspaceOwnerUserId(businessId);
      if (ownerLookupError) {
        console.error('task_status_owner_lookup_failed', ownerLookupError);
      } else if (ownerUserId && ownerUserId !== userId) {
        void notifySafe(
          createNotification({
            recipientUserId: ownerUserId,
            businessId,
            actorUserId: userId,
            type: 'task_status_updated_by_member',
            title: 'Task status updated',
            message: `${data.title}: ${existingTask.status} -> ${data.status}`,
            priority: data.priority ?? 'medium',
            entityType: 'task',
            entityId: data.id,
            metadata: {
              fromStatus: existingTask.status,
              toStatus: data.status,
              taskId: data.id,
            },
          }),
          'task_status_updated_by_member',
        );
      }
    }

    const displayContext = await buildTaskDisplayContext({ businessId, tasks: [data] });
    if (displayContext.usersError) return sendDbError(res, displayContext.usersError);
    if (displayContext.teamsError) return sendDbError(res, displayContext.teamsError);

    return res.status(200).json({ success: true, task: mapTaskToResponse(data, displayContext) });
  } catch (err) {
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

router.delete('/api/tasks/:id', async (req, res) => {
  try {
    const actor = await getActorWithOptions(req, res, { requireActiveWorkspace: true });
    if (!actor) return;

    const { businessId, role, userId } = actor;
    const { id } = req.params;

    if (!(role === 'super_admin' || role === 'business_owner')) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Only business owners or super admins can delete tasks.' },
      });
    }

    const { data: existingTask, error: existingError } = await supabaseService
      .from('tasks')
      .select('id, title, status, assignment_type')
      .eq('id', id)
      .eq('business_id', businessId)
      .maybeSingle();
    if (existingError) return sendDbError(res, existingError);
    if (!existingTask) {
      return res.status(404).json({
        success: false,
        error: { code: 'TASK_NOT_FOUND', message: 'Task not found in this workspace.' },
      });
    }

    const { error } = await supabaseService
      .from('tasks')
      .delete()
      .eq('id', id)
      .eq('business_id', businessId);
    if (error) return sendDbError(res, error);

    await writeAuditLog({
      businessId,
      actorUserId: userId,
      action: 'task_deleted',
      entityType: 'task',
      entityId: existingTask.id,
      metadata: {
        title: existingTask.title,
        status: existingTask.status,
        assignmentType: existingTask.assignment_type,
      },
    });

    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

router.get('/api/tasks/:id/comments', async (req, res) => {
  try {
    const actor = await getActor(req, res);
    if (!actor) return;

    const { businessId } = actor;
    const { id } = req.params;

    const { data: task, error: taskError } = await supabaseService
      .from('tasks')
      .select('id, business_id, assignee_user_id, assignee_team_id')
      .eq('id', id)
      .eq('business_id', businessId)
      .maybeSingle();
    if (taskError) return sendDbError(res, taskError);
    if (!task) {
      return res.status(404).json({
        success: false,
        error: { code: 'TASK_NOT_FOUND', message: 'Task not found in this workspace.' },
      });
    }

    const { error: accessError, allowed } = await canActorAccessTask({ actor, task });
    if (accessError) return sendDbError(res, accessError);
    if (!allowed) {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'You cannot access this task.' } });
    }

    const { data: rows, error } = await supabaseService
      .from('task_comments')
      .select('id, task_id, business_id, author_user_id, body, created_at, profiles(full_name, email)')
      .eq('task_id', id)
      .eq('business_id', businessId)
      .order('created_at', { ascending: false });
    if (error) return sendDbError(res, error);

    return res.status(200).json({
      success: true,
      comments: (rows ?? []).map(mapTaskComment),
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

router.post('/api/tasks/:id/comments', taskCommentLimiter, async (req, res) => {
  try {
    const actor = await getActorWithOptions(req, res, { requireActiveWorkspace: true });
    if (!actor) return;

    const { businessId, userId, role } = actor;
    const { id } = req.params;
    const parsed = createTaskCommentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'Invalid payload' },
      });
    }

    const { data: task, error: taskError } = await supabaseService
      .from('tasks')
      .select('id, business_id, assignee_user_id, assignee_team_id')
      .eq('id', id)
      .eq('business_id', businessId)
      .maybeSingle();
    if (taskError) return sendDbError(res, taskError);
    if (!task) {
      return res.status(404).json({
        success: false,
        error: { code: 'TASK_NOT_FOUND', message: 'Task not found in this workspace.' },
      });
    }

    const { error: accessError, allowed } = await canActorAccessTask({ actor, task });
    if (accessError) return sendDbError(res, accessError);
    if (!allowed) {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'You cannot access this task.' } });
    }

    const { data, error } = await supabaseService
      .from('task_comments')
      .insert({
        task_id: id,
        business_id: businessId,
        author_user_id: userId,
        body: parsed.data.body,
      })
      .select('id, task_id, business_id, author_user_id, body, created_at, profiles(full_name, email)')
      .single();
    if (error) return sendDbError(res, error);

    await writeAuditLog({
      businessId,
      actorUserId: userId,
      action: 'task_comment_added',
      entityType: 'task',
      entityId: id,
      metadata: {
        description: 'Comment added on task',
      },
    });

    if (role === 'employee') {
      const { error: ownerLookupError, ownerUserId } = await getWorkspaceOwnerUserId(businessId);
      if (ownerLookupError) {
        console.error('task_comment_owner_lookup_failed', ownerLookupError);
      } else if (ownerUserId && ownerUserId !== userId) {
        void notifySafe(
          createNotification({
            recipientUserId: ownerUserId,
            businessId,
            actorUserId: userId,
            type: 'task_comment_added_by_member',
            title: 'New task comment',
            message: `A member added a comment on task ${id}.`,
            priority: 'general',
            entityType: 'task',
            entityId: id,
          }),
          'task_comment_added_by_member',
        );
      }
    }

    return res.status(201).json({
      success: true,
      comment: mapTaskComment(data),
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

router.get('/api/tasks/:id/activity', async (req, res) => {
  try {
    const actor = await getActor(req, res);
    if (!actor) return;

    const { businessId } = actor;
    const { id } = req.params;

    const { data: task, error: taskError } = await supabaseService
      .from('tasks')
      .select('id, business_id, assignee_user_id, assignee_team_id')
      .eq('id', id)
      .eq('business_id', businessId)
      .maybeSingle();
    if (taskError) return sendDbError(res, taskError);
    if (!task) {
      return res.status(404).json({
        success: false,
        error: { code: 'TASK_NOT_FOUND', message: 'Task not found in this workspace.' },
      });
    }

    const { error: accessError, allowed } = await canActorAccessTask({ actor, task });
    if (accessError) return sendDbError(res, accessError);
    if (!allowed) {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'You cannot access this task.' } });
    }

    const { data: rows, error } = await supabaseService
      .from('audit_logs')
      .select('id, action, entity_type, entity_id, actor_user_id, metadata, created_at')
      .eq('business_id', businessId)
      .eq('entity_type', 'task')
      .eq('entity_id', id)
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) return sendDbError(res, error);

    const actorIds = Array.from(
      new Set((rows ?? []).map((row) => row.actor_user_id).filter((id) => typeof id === 'string' && id.length > 0)),
    );
    const { data: actorRows, error: actorError } =
      actorIds.length > 0
        ? await supabaseService.from('profiles').select('id, full_name, email').in('id', actorIds)
        : { data: [], error: null };
    if (actorError) return sendDbError(res, actorError);
    const actorNameById = new Map((actorRows ?? []).map((row) => [row.id, row.full_name ?? row.email ?? row.id]));

    return res.status(200).json({
      success: true,
      activity: (rows ?? []).map((row) => mapTaskActivityRow(row, actorNameById)),
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

export default router;
