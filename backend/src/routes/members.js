import { Router } from 'express';
import { z } from 'zod';

import { supabaseService } from '../config/supabase.js';
import { sendDbError } from '../lib/supabaseError.js';
import { getActorWithOptions } from '../services/actor.js';
import { ensureMemberSeatsAvailable } from '../services/subscriptionLimits.js';

const router = Router();

const permissionRoleSchema = z.enum(['business_owner', 'admin', 'manager', 'member']);
const permissionMatrixSchema = z.object({
  user_management: z
    .object({
      view: z.boolean().optional(),
      create: z.boolean().optional(),
      edit: z.boolean().optional(),
      delete: z.boolean().optional(),
      invite: z.boolean().optional(),
      suspend: z.boolean().optional(),
    })
    .default({}),
  task_management: z
    .object({
      view: z.boolean().optional(),
      create: z.boolean().optional(),
      edit: z.boolean().optional(),
      delete: z.boolean().optional(),
      manage: z.boolean().optional(),
    })
    .default({}),
  team_management: z
    .object({
      view: z.boolean().optional(),
      create: z.boolean().optional(),
      edit: z.boolean().optional(),
      delete: z.boolean().optional(),
      manage: z.boolean().optional(),
    })
    .default({}),
  billing: z
    .object({
      view: z.boolean().optional(),
      manage: z.boolean().optional(),
    })
    .default({}),
  settings: z
    .object({
      view: z.boolean().optional(),
      manage: z.boolean().optional(),
    })
    .default({}),
});

const savePermissionsSchema = z.object({
  role: permissionRoleSchema,
  permissions: permissionMatrixSchema,
  isCustomOverride: z.boolean().optional(),
});

const blockMemberSchema = z.object({ blocked: z.boolean() });
const updateMemberRoleSchema = z.object({ role: z.enum(['employee', 'business_owner']) });
const updateMemberTaskStatusSchema = z.object({ isDone: z.boolean() });
const TASK_SELECT_FIELDS =
  'id, business_id, title, description, status, priority, progress_percent, assignment_type, assignee_user_id, assignee_team_id, created_by_user_id, start_at, due_at, completed_at, estimated_at, hold_reason, cancel_reason, completion_note, due_date, created_at, updated_at';

const PERMISSION_GROUPS = {
  user_management: ['view', 'create', 'edit', 'delete', 'invite', 'suspend'],
  task_management: ['view', 'create', 'edit', 'delete', 'manage'],
  team_management: ['view', 'create', 'edit', 'delete', 'manage'],
  billing: ['view', 'manage'],
  settings: ['view', 'manage'],
};

function isMissingPermissionsTableError(error) {
  const msg = `${error?.message ?? ''}`.toLowerCase();
  return msg.includes('user_permissions') && (msg.includes('does not exist') || msg.includes('could not find'));
}

function buildDefaultPermissions(role) {
  const allEnabled = {};
  for (const [group, abilities] of Object.entries(PERMISSION_GROUPS)) {
    allEnabled[group] = {};
    for (const ability of abilities) allEnabled[group][ability] = true;
  }

  if (role === 'business_owner') return allEnabled;

  if (role === 'admin') {
    return {
      user_management: { view: true, create: true, edit: true, invite: true, suspend: true, delete: false },
      task_management: { view: true, create: true, edit: true, delete: true, manage: true },
      team_management: { view: true, create: true, edit: true, delete: false, manage: true },
      billing: { view: true, manage: false },
      settings: { view: true, manage: false },
    };
  }

  if (role === 'manager') {
    return {
      user_management: { view: true, invite: true, create: false, edit: false, delete: false, suspend: false },
      task_management: { view: true, create: true, edit: true, delete: false, manage: true },
      team_management: { view: true, create: true, edit: true, delete: false, manage: false },
      billing: { view: false, manage: false },
      settings: { view: true, manage: false },
    };
  }

  return {
    user_management: { view: false, create: false, edit: false, delete: false, invite: false, suspend: false },
    task_management: { view: true, create: true, edit: true, delete: false, manage: false },
    team_management: { view: true, create: false, edit: false, delete: false, manage: false },
    billing: { view: false, manage: false },
    settings: { view: false, manage: false },
  };
}

function normalizePermissions(role, partialPermissions) {
  const defaults = buildDefaultPermissions(role);
  const next = {};
  for (const [group, abilities] of Object.entries(PERMISSION_GROUPS)) {
    next[group] = {};
    for (const ability of abilities) {
      const overrideValue = partialPermissions?.[group]?.[ability];
      next[group][ability] = typeof overrideValue === 'boolean' ? overrideValue : Boolean(defaults[group][ability]);
    }
  }
  return next;
}

function isCustomOverride(role, normalizedPermissions) {
  const defaults = normalizePermissions(role, {});
  return JSON.stringify(defaults) !== JSON.stringify(normalizedPermissions);
}

function mapResolvedRoleToPermissionRole(resolvedRole) {
  if (resolvedRole === 'business_owner') return 'business_owner';
  if (resolvedRole === 'employee') return 'member';
  return 'member';
}

function mapTask(task) {
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
    startAt: task.start_at ?? null,
    dueAt: task.due_at ?? null,
    completedAt: task.completed_at ?? null,
    estimatedAt: task.estimated_at ?? null,
    holdReason: task.hold_reason ?? null,
    cancelReason: task.cancel_reason ?? null,
    completionNote: task.completion_note ?? null,
    dueDate: task.due_at ?? task.due_date ?? null,
    createdByUserId: task.created_by_user_id,
    createdAt: task.created_at,
    updatedAt: task.updated_at,
    isDone: task.status === 'done',
  };
}

function mapLoginActivityRow(row) {
  return {
    id: row.id,
    type: 'login',
    occurredAt: row.created_at,
    title: row.success ? 'Successful sign in' : 'Failed sign in',
    description: row.reason ?? null,
    ipAddress: row.ip_address ?? null,
    userAgent: row.user_agent ?? null,
    success: Boolean(row.success),
  };
}

function mapAuditActivityRow(row) {
  return {
    id: row.id,
    type: 'audit',
    occurredAt: row.created_at,
    title: row.action ?? 'Action',
    description: row.entity_type ? `${row.entity_type}${row.entity_id ? ` (${row.entity_id})` : ''}` : null,
    businessId: row.business_id ?? null,
    metadata: row.metadata ?? {},
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

async function requireBusinessOwner(req, res, options = {}) {
  const actor = await getActorWithOptions(req, res, options);
  if (!actor) return null;
  if (actor.role !== 'business_owner') {
    res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Workspace owner only.' } });
    return null;
  }
  return actor;
}

async function findBusinessMember({ businessId, userId }) {
  const { data, error } = await supabaseService
    .from('business_members')
    .select('id, business_id, user_id, role, status, joined_at, created_at')
    .eq('business_id', businessId)
    .eq('user_id', userId)
    .maybeSingle();
  return { data, error };
}

router.get('/api/members', async (req, res) => {
  try {
    const actor = await requireBusinessOwner(req, res);
    if (!actor) return;

    const { businessId } = actor;
    const { data: rows, error } = await supabaseService
      .from('business_members')
      .select('user_id, role, status, joined_at, created_at, profiles(id, email, full_name, created_at)')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })
      .limit(500);
    if (error) return sendDbError(res, error);

    const userIds = (rows ?? []).map((r) => r.user_id);

    let taskCountsByUserId = new Map();
    if (userIds.length > 0) {
      const { data: tasks, error: tasksError } = await supabaseService
        .from('tasks')
        .select('assignee_user_id, status')
        .eq('business_id', businessId)
        .in('assignee_user_id', userIds);
      if (tasksError) return sendDbError(res, tasksError);

      const nextMap = new Map();
      for (const task of tasks ?? []) {
        const key = task.assignee_user_id;
        const prev = nextMap.get(key) ?? { open: 0, done: 0 };
        if (task.status === 'done') prev.done += 1;
        else if (task.status !== 'canceled') prev.open += 1;
        nextMap.set(key, prev);
      }
      taskCountsByUserId = nextMap;
    }

    const members = (rows ?? []).map((row) => {
      const counts = taskCountsByUserId.get(row.user_id) ?? { open: 0, done: 0 };
      return {
        id: row.user_id,
        email: row.profiles?.email ?? null,
        fullName: row.profiles?.full_name ?? null,
        role: row.role,
        status: row.status,
        joinedAt: row.joined_at ?? row.created_at ?? row.profiles?.created_at ?? null,
        openTasks: counts.open,
        doneTasks: counts.done,
      };
    });

    return res.status(200).json({ success: true, members });
  } catch (err) {
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

router.get('/api/members/:id', async (req, res) => {
  try {
    const actor = await requireBusinessOwner(req, res);
    if (!actor) return;

    const memberUserId = req.params.id;
    const parsedId = z.string().uuid().safeParse(memberUserId);
    if (!parsedId.success) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid member id.' } });
    }

    const { data: membership, error: membershipError } = await findBusinessMember({
      businessId: actor.businessId,
      userId: memberUserId,
    });
    if (membershipError) return sendDbError(res, membershipError);
    if (!membership) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Member not found in this workspace.' } });
    }

    const { data: profile, error: profileError } = await supabaseService
      .from('profiles')
      .select('id, email, full_name, created_at')
      .eq('id', memberUserId)
      .maybeSingle();
    if (profileError) return sendDbError(res, profileError);
    if (!profile) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Profile not found.' } });
    }

    let { data: business, error: businessError } = await supabaseService
      .from('businesses')
      .select('id, name, slug, owner_user_id, subscription_plan, subscription_status')
      .eq('id', actor.businessId)
      .maybeSingle();
    if (businessError) {
      if (`${businessError.message}`.includes('subscription_plan') || `${businessError.message}`.includes('subscription_status')) {
        const { data: fallbackBusiness, error: fallbackError } = await supabaseService
          .from('businesses')
          .select('id, name, slug, owner_user_id')
          .eq('id', actor.businessId)
          .maybeSingle();
        if (fallbackError) return sendDbError(res, fallbackError);
        business = fallbackBusiness;
      } else {
        return sendDbError(res, businessError);
      }
    }

    const { data: teamRows, error: teamError } = await supabaseService
      .from('team_members')
      .select('team_id, role, teams(id, name, description, business_id)')
      .eq('user_id', memberUserId)
      .eq('teams.business_id', actor.businessId);
    if (teamError) return sendDbError(res, teamError);

    const resolvedRole = membership.role;
    const defaultPermissionRole = mapResolvedRoleToPermissionRole(resolvedRole);

    let savedPermissions = null;
    {
      const { data, error: permissionsError } = await supabaseService
        .from('user_permissions')
        .select('role_preset, permissions, is_custom_override, business_id, updated_at')
        .eq('user_id', memberUserId)
        .eq('business_id', actor.businessId)
        .maybeSingle();
      if (permissionsError) {
        if (!isMissingPermissionsTableError(permissionsError)) return sendDbError(res, permissionsError);
      } else {
        savedPermissions = data;
      }
    }

    const permissionRole = savedPermissions?.role_preset ?? defaultPermissionRole;
    const normalizedPermissions = normalizePermissions(permissionRole, savedPermissions?.permissions ?? {});
    const resolvedCustomOverride =
      typeof savedPermissions?.is_custom_override === 'boolean'
        ? savedPermissions.is_custom_override
        : isCustomOverride(permissionRole, normalizedPermissions);

    return res.status(200).json({
      success: true,
      member: {
        id: profile.id,
        email: profile.email ?? null,
        fullName: profile.full_name ?? null,
        role: resolvedRole,
        status: membership.status ?? null,
        createdAt: profile.created_at,
        workspace: {
          businessId: actor.businessId,
          businessName: business?.name ?? null,
          businessSlug: business?.slug ?? null,
          ownerUserId: business?.owner_user_id ?? null,
          subscriptionPlan: business?.subscription_plan ?? null,
          subscriptionStatus: business?.subscription_status ?? null,
          membershipJoinedAt: membership.joined_at ?? null,
        },
        teams: (teamRows ?? []).map((row) => ({
          teamId: row.team_id,
          teamName: row.teams?.name ?? null,
          teamDescription: row.teams?.description ?? null,
          role: row.role,
        })),
        permissions: {
          businessId: actor.businessId,
          role: permissionRole,
          permissions: normalizedPermissions,
          isCustomOverride: resolvedCustomOverride,
          updatedAt: savedPermissions?.updated_at ?? null,
        },
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

router.patch('/api/members/:id/block', async (req, res) => {
  try {
    const actor = await requireBusinessOwner(req, res, { requireActiveWorkspace: true });
    if (!actor) return;

    const memberUserId = req.params.id;
    const parsedId = z.string().uuid().safeParse(memberUserId);
    if (!parsedId.success) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid member id.' } });
    }

    const parsed = blockMemberSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid payload.' } });
    }

    if (memberUserId === actor.userId) {
      return res.status(400).json({ success: false, error: { code: 'CANNOT_BLOCK_SELF', message: 'Cannot block yourself.' } });
    }

    const { data: membership, error: membershipError } = await findBusinessMember({
      businessId: actor.businessId,
      userId: memberUserId,
    });
    if (membershipError) return sendDbError(res, membershipError);
    if (!membership) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Member not found.' } });
    }
    if (membership.role === 'business_owner') {
      return res.status(400).json({ success: false, error: { code: 'CANNOT_BLOCK_OWNER', message: 'Cannot block workspace owner.' } });
    }

    if (parsed.data.blocked) {
      const { error } = await supabaseService
        .from('business_members')
        .update({ status: 'block' })
        .eq('business_id', actor.businessId)
        .eq('user_id', memberUserId);
      if (error) return sendDbError(res, error);
    } else {
      const limitCheck = await ensureMemberSeatsAvailable({
        businessId: actor.businessId,
        additionalSeats: 1,
        ignoreUserId: memberUserId,
      });
      if (limitCheck.error) return sendDbError(res, limitCheck.error);
      if (!limitCheck.allowed) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MEMBER_LIMIT_REACHED',
            message: `Member limit reached for ${limitCheck.planCode ?? 'current'} plan (${limitCheck.maxMembers}).`,
          },
        });
      }

      const { error } = await supabaseService
        .from('business_members')
        .update({ status: 'active', joined_at: new Date().toISOString() })
        .eq('business_id', actor.businessId)
        .eq('user_id', memberUserId)
        .eq('status', 'block');
      if (error) return sendDbError(res, error);
    }

    await writeAuditLog({
      businessId: actor.businessId,
      actorUserId: actor.userId,
      action: parsed.data.blocked ? 'member_blocked' : 'member_activated',
      entityType: 'business_member',
      entityId: memberUserId,
      metadata: { targetUserId: memberUserId },
    });

    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

router.patch('/api/members/:id/role', async (req, res) => {
  try {
    const actor = await requireBusinessOwner(req, res, { requireActiveWorkspace: true });
    if (!actor) return;

    const memberUserId = req.params.id;
    const parsedId = z.string().uuid().safeParse(memberUserId);
    if (!parsedId.success) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid member id.' } });
    }

    const parsed = updateMemberRoleSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid payload.' } });
    }

    const { data: membership, error: membershipError } = await findBusinessMember({
      businessId: actor.businessId,
      userId: memberUserId,
    });
    if (membershipError) return sendDbError(res, membershipError);
    if (!membership) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Member not found.' } });
    }

    const nextRole = parsed.data.role;
    if (membership.role === 'business_owner' && nextRole === 'employee') {
      const { data: business, error: businessError } = await supabaseService
        .from('businesses')
        .select('owner_user_id')
        .eq('id', actor.businessId)
        .maybeSingle();
      if (businessError) return sendDbError(res, businessError);
      if (business?.owner_user_id === memberUserId) {
        return res.status(400).json({
          success: false,
          error: { code: 'CANNOT_DEMOTE_OWNER', message: 'Cannot demote current workspace owner.' },
        });
      }
    }

    const { error: updateError } = await supabaseService
      .from('business_members')
      .update({ role: nextRole })
      .eq('business_id', actor.businessId)
      .eq('user_id', memberUserId);
    if (updateError) return sendDbError(res, updateError);

    if (nextRole === 'business_owner') {
      const { error: businessUpdateError } = await supabaseService
        .from('businesses')
        .update({ owner_user_id: memberUserId })
        .eq('id', actor.businessId);
      if (businessUpdateError) return sendDbError(res, businessUpdateError);
    }

    await writeAuditLog({
      businessId: actor.businessId,
      actorUserId: actor.userId,
      action: 'member_role_changed',
      entityType: 'business_member',
      entityId: memberUserId,
      metadata: { targetUserId: memberUserId, nextRole },
    });

    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

router.delete('/api/members/:id', async (req, res) => {
  try {
    const actor = await requireBusinessOwner(req, res, { requireActiveWorkspace: true });
    if (!actor) return;

    const memberUserId = req.params.id;
    const parsedId = z.string().uuid().safeParse(memberUserId);
    if (!parsedId.success) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid member id.' } });
    }

    if (memberUserId === actor.userId) {
      return res.status(400).json({ success: false, error: { code: 'CANNOT_REMOVE_SELF', message: 'Cannot remove yourself.' } });
    }

    const { data: membership, error: membershipError } = await findBusinessMember({
      businessId: actor.businessId,
      userId: memberUserId,
    });
    if (membershipError) return sendDbError(res, membershipError);
    if (!membership) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Member not found.' } });
    }

    const { data: business, error: businessError } = await supabaseService
      .from('businesses')
      .select('owner_user_id')
      .eq('id', actor.businessId)
      .maybeSingle();
    if (businessError) return sendDbError(res, businessError);
    if (business?.owner_user_id === memberUserId || membership.role === 'business_owner') {
      return res.status(400).json({ success: false, error: { code: 'CANNOT_REMOVE_OWNER', message: 'Cannot remove workspace owner.' } });
    }

    const { error: deleteError } = await supabaseService
      .from('business_members')
      .delete()
      .eq('business_id', actor.businessId)
      .eq('user_id', memberUserId);
    if (deleteError) return sendDbError(res, deleteError);

    await writeAuditLog({
      businessId: actor.businessId,
      actorUserId: actor.userId,
      action: 'member_removed',
      entityType: 'business_member',
      entityId: memberUserId,
      metadata: { targetUserId: memberUserId },
    });

    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

router.get('/api/members/:id/tasks', async (req, res) => {
  try {
    const actor = await requireBusinessOwner(req, res);
    if (!actor) return;

    const memberUserId = req.params.id;
    const parsedId = z.string().uuid().safeParse(memberUserId);
    if (!parsedId.success) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid member id.' } });
    }

    const { data: membership, error: membershipError } = await findBusinessMember({
      businessId: actor.businessId,
      userId: memberUserId,
    });
    if (membershipError) return sendDbError(res, membershipError);
    if (!membership) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Member not found.' } });
    }

    const { data: rows, error: tasksError } = await supabaseService
      .from('tasks')
      .select(TASK_SELECT_FIELDS)
      .eq('business_id', actor.businessId)
      .eq('assignee_user_id', memberUserId)
      .order('created_at', { ascending: false })
      .limit(500);
    if (tasksError) return sendDbError(res, tasksError);

    const tasks = (rows ?? []).map(mapTask);
    const now = Date.now();
    const summary = tasks.reduce(
      (acc, task) => {
        acc.total += 1;
        if (task.status === 'todo') acc.todo += 1;
        if (task.status === 'in_progress') acc.inProgress += 1;
        if (task.status === 'on_hold') acc.onHold += 1;
        if (task.status === 'done') acc.done += 1;
        if (task.status === 'canceled') acc.canceled += 1;
        if (task.dueDate && !['done', 'canceled'].includes(task.status)) {
          const due = new Date(task.dueDate).getTime();
          if (!Number.isNaN(due) && due < now) acc.overdue += 1;
        }
        return acc;
      },
      { total: 0, todo: 0, inProgress: 0, onHold: 0, done: 0, canceled: 0, overdue: 0 }
    );

    return res.status(200).json({ success: true, summary, tasks });
  } catch (err) {
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

router.patch('/api/members/:id/tasks/:taskId', async (req, res) => {
  try {
    const actor = await requireBusinessOwner(req, res, { requireActiveWorkspace: true });
    if (!actor) return;

    const memberUserId = req.params.id;
    const taskId = req.params.taskId;
    const parsedMemberId = z.string().uuid().safeParse(memberUserId);
    const parsedTaskId = z.string().uuid().safeParse(taskId);
    if (!parsedMemberId.success || !parsedTaskId.success) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid id.' } });
    }

    const parsed = updateMemberTaskStatusSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'Invalid payload.' },
      });
    }

    const { data: existingTask, error: existingTaskError } = await supabaseService
      .from('tasks')
      .select(TASK_SELECT_FIELDS)
      .eq('business_id', actor.businessId)
      .eq('id', taskId)
      .maybeSingle();
    if (existingTaskError) return sendDbError(res, existingTaskError);
    if (!existingTask) {
      return res.status(404).json({ success: false, error: { code: 'TASK_NOT_FOUND', message: 'Task not found.' } });
    }
    if (existingTask.assignee_user_id !== memberUserId) {
      return res.status(400).json({
        success: false,
        error: { code: 'TASK_NOT_ASSIGNED_TO_MEMBER', message: 'Task is not assigned to this member.' },
      });
    }

    const nextStatus = parsed.data.isDone ? 'done' : 'todo';
    const completedAt = nextStatus === 'done' ? new Date().toISOString() : null;
    const progressPercent = nextStatus === 'done' ? 100 : 20;
    const { data: updatedTask, error: updateError } = await supabaseService
      .from('tasks')
      .update({ status: nextStatus, completed_at: completedAt, progress_percent: progressPercent })
      .eq('id', taskId)
      .eq('business_id', actor.businessId)
      .select(TASK_SELECT_FIELDS)
      .single();
    if (updateError) return sendDbError(res, updateError);

    await writeAuditLog({
      businessId: actor.businessId,
      actorUserId: actor.userId,
      action: nextStatus === 'done' ? 'member_task_marked_done' : 'member_task_reopened',
      entityType: 'task',
      entityId: updatedTask.id,
      metadata: {
        targetUserId: memberUserId,
        previousStatus: existingTask.status,
        nextStatus,
      },
    });

    return res.status(200).json({ success: true, task: mapTask(updatedTask) });
  } catch (err) {
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

router.get('/api/members/:id/activity', async (req, res) => {
  try {
    const actor = await requireBusinessOwner(req, res);
    if (!actor) return;

    const memberUserId = req.params.id;
    const parsedId = z.string().uuid().safeParse(memberUserId);
    if (!parsedId.success) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid member id.' } });
    }

    const { data: membership, error: membershipError } = await findBusinessMember({
      businessId: actor.businessId,
      userId: memberUserId,
    });
    if (membershipError) return sendDbError(res, membershipError);
    if (!membership) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Member not found.' } });
    }

    const [loginResult, auditResult] = await Promise.all([
      supabaseService
        .from('login_activity')
        .select('id, user_id, ip_address, user_agent, success, reason, created_at')
        .eq('user_id', memberUserId)
        .order('created_at', { ascending: false })
        .limit(120),
      supabaseService
        .from('audit_logs')
        .select('id, business_id, actor_user_id, action, entity_type, entity_id, metadata, created_at')
        .eq('business_id', actor.businessId)
        .eq('actor_user_id', memberUserId)
        .order('created_at', { ascending: false })
        .limit(120),
    ]);
    if (loginResult.error) return sendDbError(res, loginResult.error);
    if (auditResult.error) return sendDbError(res, auditResult.error);

    const loginEntries = (loginResult.data ?? []).map(mapLoginActivityRow);
    const auditEntries = (auditResult.data ?? []).map(mapAuditActivityRow);
    const entries = [...loginEntries, ...auditEntries].sort((a, b) => {
      const da = new Date(a.occurredAt).getTime();
      const db = new Date(b.occurredAt).getTime();
      return db - da;
    });

    const summary = {
      total: entries.length,
      loginSuccess: loginEntries.filter((entry) => entry.success).length,
      loginFailed: loginEntries.filter((entry) => !entry.success).length,
      auditActions: auditEntries.length,
    };

    return res.status(200).json({ success: true, summary, entries });
  } catch (err) {
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

router.patch('/api/members/:id/permissions', async (req, res) => {
  try {
    const actor = await requireBusinessOwner(req, res, { requireActiveWorkspace: true });
    if (!actor) return;

    const memberUserId = req.params.id;
    const parsedId = z.string().uuid().safeParse(memberUserId);
    if (!parsedId.success) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid member id.' } });
    }

    const parsed = savePermissionsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'Invalid payload.' },
      });
    }

    const { data: membership, error: membershipError } = await findBusinessMember({
      businessId: actor.businessId,
      userId: memberUserId,
    });
    if (membershipError) return sendDbError(res, membershipError);
    if (!membership) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Member not found.' } });
    }

    let permissionRole = parsed.data.role;
    if (membership.role === 'business_owner') {
      permissionRole = 'business_owner';
    }

    const normalizedPermissions = normalizePermissions(permissionRole, parsed.data.permissions);
    const resolvedCustomOverride =
      typeof parsed.data.isCustomOverride === 'boolean'
        ? parsed.data.isCustomOverride
        : isCustomOverride(permissionRole, normalizedPermissions);

    const { data: existing, error: existingError } = await supabaseService
      .from('user_permissions')
      .select('id')
      .eq('user_id', memberUserId)
      .eq('business_id', actor.businessId)
      .maybeSingle();
    if (existingError && !isMissingPermissionsTableError(existingError)) return sendDbError(res, existingError);
    if (existingError && isMissingPermissionsTableError(existingError)) {
      return res.status(500).json({
        success: false,
        error: { code: 'MISSING_SCHEMA', message: 'user_permissions table is missing. Run SQL migration 015_user_permissions.sql.' },
      });
    }

    const writePayload = {
      user_id: memberUserId,
      business_id: actor.businessId,
      role_preset: permissionRole,
      permissions: normalizedPermissions,
      is_custom_override: resolvedCustomOverride,
      updated_by_user_id: actor.userId,
    };

    if (existing?.id) {
      const { error: updateError } = await supabaseService.from('user_permissions').update(writePayload).eq('id', existing.id);
      if (updateError) return sendDbError(res, updateError);
    } else {
      const { error: insertError } = await supabaseService.from('user_permissions').insert(writePayload);
      if (insertError) {
        if (isMissingPermissionsTableError(insertError)) {
          return res.status(500).json({
            success: false,
            error: { code: 'MISSING_SCHEMA', message: 'user_permissions table is missing. Run SQL migration 015_user_permissions.sql.' },
          });
        }
        return sendDbError(res, insertError);
      }
    }

    await writeAuditLog({
      businessId: actor.businessId,
      actorUserId: actor.userId,
      action: 'member_permissions_updated',
      entityType: 'user_permissions',
      entityId: memberUserId,
      metadata: { rolePreset: permissionRole, isCustomOverride: resolvedCustomOverride },
    });

    return res.status(200).json({
      success: true,
      permissions: {
        businessId: actor.businessId,
        role: permissionRole,
        permissions: normalizedPermissions,
        isCustomOverride: resolvedCustomOverride,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

export default router;
