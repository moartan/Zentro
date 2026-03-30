import { Router } from 'express';
import { z } from 'zod';

import { supabaseService } from '../config/supabase.js';
import { sendDbError } from '../lib/supabaseError.js';
import { ensureProfile } from '../services/profile.js';
import { resolveSessionFromCookies } from '../services/session.js';
import { getCachedAdminUsersList, setCachedAdminUsersList } from '../services/adminUsersListCache.js';

const router = Router();

const permissionRoleSchema = z.enum(['super_admin', 'business_owner', 'admin', 'manager', 'member']);
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
const updateUserTaskStatusSchema = z.object({
  isDone: z.boolean(),
});
const TASK_SELECT_FIELDS =
  'id, business_id, title, description, status, priority, progress_percent, assignment_type, assignee_user_id, assignee_team_id, created_by_user_id, start_at, due_at, completed_at, estimated_at, hold_reason, cancel_reason, completion_note, due_date, created_at, updated_at';

const PERMISSION_GROUPS = {
  user_management: ['view', 'create', 'edit', 'delete', 'invite', 'suspend'],
  task_management: ['view', 'create', 'edit', 'delete', 'manage'],
  team_management: ['view', 'create', 'edit', 'delete', 'manage'],
  billing: ['view', 'manage'],
  settings: ['view', 'manage'],
};

function buildDefaultPermissions(role) {
  const allEnabled = {};
  for (const [group, abilities] of Object.entries(PERMISSION_GROUPS)) {
    allEnabled[group] = {};
    for (const ability of abilities) allEnabled[group][ability] = true;
  }

  if (role === 'super_admin' || role === 'business_owner') return allEnabled;

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
  if (resolvedRole === 'super_admin') return 'super_admin';
  if (resolvedRole === 'business_owner') return 'business_owner';
  if (resolvedRole === 'employee') return 'member';
  return 'member';
}

function isMissingPermissionsTableError(error) {
  const msg = `${error?.message ?? ''}`.toLowerCase();
  return msg.includes('user_permissions') && (msg.includes('does not exist') || msg.includes('could not find'));
}

function mapTaskToUserDetailsResponse(task) {
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

function mapPlanLabel(plan) {
  if (plan === 'free') return 'Free';
  if (plan === 'pro') return 'Pro';
  if (plan === 'enterprise') return 'Enterprise';
  return plan ?? '-';
}

function mapBillingStatusLabel(status) {
  if (status === 'active') return 'Active';
  if (status === 'past_due') return 'Past due';
  if (status === 'canceled') return 'Canceled';
  return status ?? '-';
}

async function writeAuditLog({
  businessId,
  actorUserId,
  action,
  entityType,
  entityId,
  metadata,
}) {
  try {
    const { error } = await supabaseService.from('audit_logs').insert({
      business_id: businessId ?? null,
      actor_user_id: actorUserId ?? null,
      action,
      entity_type: entityType,
      entity_id: entityId ?? null,
      metadata: metadata ?? {},
    });
    if (error) {
      // Do not fail the main request when audit logging fails.
      console.error('audit_log_insert_failed', error);
    }
  } catch (err) {
    console.error('audit_log_insert_exception', err);
  }
}

async function requireSuperAdmin(req, res) {
  const { user } = await resolveSessionFromCookies(req, res);
  if (!user) {
    res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Login required.' } });
    return null;
  }

  await ensureProfile(user);

  const { data: requester, error: requesterError } = await supabaseService
    .from('profiles')
    .select('id, is_platform_super_admin')
    .eq('id', user.id)
    .single();

  if (requesterError) {
    sendDbError(res, requesterError);
    return null;
  }

  if (!requester.is_platform_super_admin) {
    res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Platform admin only.' } });
    return null;
  }

  return { user };
}

router.get('/api/users', async (req, res) => {
  try {
    const ctx = await requireSuperAdmin(req, res);
    if (!ctx) return;

    // Cache is safe here because this endpoint is super-admin only.
    const cached = getCachedAdminUsersList();
    if (cached) {
      res.set('Cache-Control', 'private, max-age=30');
      res.set('X-Cache', 'HIT');
      return res.status(200).json(cached);
    }

    let { data: rows, error } = await supabaseService
      .from('profiles')
      .select(
        'id, email, full_name, is_platform_super_admin, created_at, business_members(role, status, business_id, businesses(id, name, slug, owner_user_id, subscription_status))'
      )
      .order('created_at', { ascending: false })
      .limit(500);

    if (error) {
      if (`${error.message}`.includes('subscription_status')) {
        const { data: fallbackRows, error: fallbackError } = await supabaseService
          .from('profiles')
          .select(
            'id, email, full_name, is_platform_super_admin, created_at, business_members(role, status, business_id, businesses(id, name, slug, owner_user_id))'
          )
          .order('created_at', { ascending: false })
          .limit(500);
        if (fallbackError) return sendDbError(res, fallbackError);
        rows = fallbackRows;
      } else {
        return sendDbError(res, error);
      }
    }

    const users = (rows ?? []).map((profile) => {
      const memberships = profile.business_members ?? [];
      const primary = memberships.find((m) => m.status === 'active') ?? memberships[0] ?? null;

      const resolvedRole = profile.is_platform_super_admin ? 'super_admin' : primary?.role ?? null;
      const resolvedStatus = profile.is_platform_super_admin ? 'active' : primary?.status ?? null;

      const ownsActiveBusiness =
        memberships.some((m) => {
          const isOwner = m.role === 'business_owner' || m.businesses?.owner_user_id === profile.id;
          if (!isOwner) return false;
          const subStatus = m.businesses?.subscription_status;
          if (!subStatus) return true;
          return subStatus === 'active';
        }) ?? false;

      const canChangeRole = resolvedRole === 'employee';
      const canBlock = resolvedRole !== 'super_admin';
      const canDelete = resolvedRole !== 'super_admin' && !(resolvedRole === 'business_owner' && ownsActiveBusiness);

      return {
        id: profile.id,
        email: profile.email ?? null,
        fullName: profile.full_name ?? null,
        businessId: resolvedRole === 'super_admin' ? null : primary?.business_id ?? null,
        role: resolvedRole,
        status: resolvedStatus,
        workspaceName: resolvedRole === 'super_admin' ? 'Zentro' : primary?.businesses?.name ?? null,
        workspaceSlug: resolvedRole === 'super_admin' ? 'zentro' : primary?.businesses?.slug ?? null,
        workspaceStatus:
          resolvedRole === 'super_admin'
            ? 'active'
            : (primary?.businesses?.subscription_status ?? (primary?.status === 'active' ? 'active' : null)),
        createdAt: profile.created_at,
        canChangeRole,
        canBlock,
        canDelete,
      };
    });

    const payload = { success: true, users };
    setCachedAdminUsersList(payload);
    res.set('Cache-Control', 'private, max-age=30');
    res.set('X-Cache', 'MISS');
    return res.status(200).json(payload);
  } catch (err) {
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

router.get('/api/users/:id', async (req, res) => {
  try {
    const ctx = await requireSuperAdmin(req, res);
    if (!ctx) return;

    const userId = req.params.id;
    const parsedId = z.string().uuid().safeParse(userId);
    if (!parsedId.success) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid user id.' } });
    }

    let { data: profile, error } = await supabaseService
      .from('profiles')
      .select(
        'id, email, full_name, is_platform_super_admin, created_at, business_members(role, status, joined_at, created_at, business_id, businesses(id, name, slug, owner_user_id, subscription_plan, subscription_status))'
      )
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      if (`${error.message}`.includes('subscription_plan') || `${error.message}`.includes('subscription_status')) {
        const { data: fallbackProfile, error: fallbackError } = await supabaseService
          .from('profiles')
          .select(
            'id, email, full_name, is_platform_super_admin, created_at, business_members(role, status, joined_at, created_at, business_id, businesses(id, name, slug, owner_user_id))'
          )
          .eq('id', userId)
          .maybeSingle();
        if (fallbackError) return sendDbError(res, fallbackError);
        profile = fallbackProfile;
      } else {
        return sendDbError(res, error);
      }
    }

    if (!profile) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'User not found.' } });
    }

    const memberships = profile.business_members ?? [];
    const primary = memberships.find((m) => m.status === 'active') ?? memberships[0] ?? null;

    const resolvedRole = profile.is_platform_super_admin ? 'super_admin' : primary?.role ?? null;
    const resolvedStatus = profile.is_platform_super_admin ? 'active' : primary?.status ?? null;
    const permissionBusinessId = resolvedRole === 'super_admin' ? null : primary?.business_id ?? null;
    const defaultPermissionRole = mapResolvedRoleToPermissionRole(resolvedRole);

    let savedPermissions = null;
    {
      let query = supabaseService
        .from('user_permissions')
        .select('role_preset, permissions, is_custom_override, business_id, updated_at')
        .eq('user_id', userId);

      query = permissionBusinessId ? query.eq('business_id', permissionBusinessId) : query.is('business_id', null);

      const { data, error: permissionsError } = await query.maybeSingle();
      if (permissionsError) {
        if (!isMissingPermissionsTableError(permissionsError)) {
          return sendDbError(res, permissionsError);
        }
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
      user: {
        id: profile.id,
        email: profile.email ?? null,
        fullName: profile.full_name ?? null,
        role: resolvedRole,
        status: resolvedStatus,
        createdAt: profile.created_at,
        memberships: memberships.map((m) => ({
          businessId: m.business_id,
          role: m.role,
          status: m.status,
          joinedAt: m.joined_at ?? null,
          createdAt: m.created_at ?? null,
          businessName: m.businesses?.name ?? null,
          businessSlug: m.businesses?.slug ?? null,
          subscriptionPlan: m.businesses?.subscription_plan ?? null,
          subscriptionStatus: m.businesses?.subscription_status ?? null,
        })),
        permissions: {
          businessId: savedPermissions?.business_id ?? permissionBusinessId,
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

router.get('/api/users/:id/tasks', async (req, res) => {
  try {
    const ctx = await requireSuperAdmin(req, res);
    if (!ctx) return;

    const userId = req.params.id;
    const parsedId = z.string().uuid().safeParse(userId);
    if (!parsedId.success) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid user id.' } });
    }

    const { data: profile, error: profileError } = await supabaseService
      .from('profiles')
      .select('id, business_members(business_id)')
      .eq('id', userId)
      .maybeSingle();
    if (profileError) return sendDbError(res, profileError);
    if (!profile) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'User not found.' } });
    }

    const businessIds = Array.from(new Set((profile.business_members ?? []).map((m) => m.business_id).filter(Boolean)));
    if (businessIds.length === 0) {
      return res.status(200).json({
        success: true,
        summary: { total: 0, todo: 0, inProgress: 0, onHold: 0, done: 0, canceled: 0, overdue: 0 },
        tasks: [],
      });
    }

    const { data: rows, error: tasksError } = await supabaseService
      .from('tasks')
      .select(TASK_SELECT_FIELDS)
      .in('business_id', businessIds)
      .eq('assignee_user_id', userId)
      .order('created_at', { ascending: false })
      .limit(500);
    if (tasksError) return sendDbError(res, tasksError);

    const tasks = (rows ?? []).map(mapTaskToUserDetailsResponse);
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

router.patch('/api/users/:id/tasks/:taskId', async (req, res) => {
  try {
    const ctx = await requireSuperAdmin(req, res);
    if (!ctx) return;

    const userId = req.params.id;
    const taskId = req.params.taskId;

    const parsedUserId = z.string().uuid().safeParse(userId);
    if (!parsedUserId.success) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid user id.' } });
    }
    const parsedTaskId = z.string().uuid().safeParse(taskId);
    if (!parsedTaskId.success) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid task id.' } });
    }

    const parsed = updateUserTaskStatusSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'Invalid payload.' },
      });
    }

    const { data: existingTask, error: existingTaskError } = await supabaseService
      .from('tasks')
      .select(TASK_SELECT_FIELDS)
      .eq('id', taskId)
      .maybeSingle();
    if (existingTaskError) return sendDbError(res, existingTaskError);
    if (!existingTask) {
      return res.status(404).json({ success: false, error: { code: 'TASK_NOT_FOUND', message: 'Task not found.' } });
    }

    if (existingTask.assignee_user_id !== userId) {
      return res.status(400).json({
        success: false,
        error: { code: 'TASK_NOT_ASSIGNED_TO_USER', message: 'Task is not assigned to this user.' },
      });
    }

    const nextStatus = parsed.data.isDone ? 'done' : 'todo';
    const completedAt = nextStatus === 'done' ? new Date().toISOString() : null;
    const progressPercent = nextStatus === 'done' ? 100 : 20;

    const { data: updatedTask, error: updateError } = await supabaseService
      .from('tasks')
      .update({ status: nextStatus, completed_at: completedAt, progress_percent: progressPercent })
      .eq('id', taskId)
      .select(TASK_SELECT_FIELDS)
      .single();
    if (updateError) return sendDbError(res, updateError);

    await writeAuditLog({
      businessId: updatedTask.business_id,
      actorUserId: ctx.user.id,
      action: nextStatus === 'done' ? 'task_marked_done' : 'task_reopened',
      entityType: 'task',
      entityId: updatedTask.id,
      metadata: {
        targetUserId: userId,
        previousStatus: existingTask.status,
        nextStatus,
      },
    });

    return res.status(200).json({ success: true, task: mapTaskToUserDetailsResponse(updatedTask) });
  } catch (err) {
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

router.get('/api/users/:id/activity', async (req, res) => {
  try {
    const ctx = await requireSuperAdmin(req, res);
    if (!ctx) return;

    const userId = req.params.id;
    const parsedId = z.string().uuid().safeParse(userId);
    if (!parsedId.success) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid user id.' } });
    }

    const { data: profile, error: profileError } = await supabaseService
      .from('profiles')
      .select('id')
      .eq('id', userId)
      .maybeSingle();
    if (profileError) return sendDbError(res, profileError);
    if (!profile) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'User not found.' } });
    }

    const [loginResult, auditResult] = await Promise.all([
      supabaseService
        .from('login_activity')
        .select('id, user_id, ip_address, user_agent, success, reason, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(120),
      supabaseService
        .from('audit_logs')
        .select('id, business_id, actor_user_id, action, entity_type, entity_id, metadata, created_at')
        .eq('actor_user_id', userId)
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

router.get('/api/users/:id/billing', async (req, res) => {
  try {
    const ctx = await requireSuperAdmin(req, res);
    if (!ctx) return;

    const userId = req.params.id;
    const parsedId = z.string().uuid().safeParse(userId);
    if (!parsedId.success) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid user id.' } });
    }

    let { data: profile, error } = await supabaseService
      .from('profiles')
      .select(
        'id, full_name, email, is_platform_super_admin, business_members(role, status, business_id, businesses(id, name, slug, owner_user_id, subscription_plan, subscription_status))'
      )
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      if (`${error.message}`.includes('subscription_plan') || `${error.message}`.includes('subscription_status')) {
        const { data: fallbackProfile, error: fallbackError } = await supabaseService
          .from('profiles')
          .select('id, full_name, email, is_platform_super_admin, business_members(role, status, business_id, businesses(id, name, slug, owner_user_id))')
          .eq('id', userId)
          .maybeSingle();
        if (fallbackError) return sendDbError(res, fallbackError);
        profile = fallbackProfile;
      } else {
        return sendDbError(res, error);
      }
    }

    if (!profile) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'User not found.' } });
    }

    const memberships = profile.business_members ?? [];
    const primary = memberships.find((m) => m.status === 'active') ?? memberships[0] ?? null;

    const isSuperAdmin = Boolean(profile.is_platform_super_admin);
    const businessId = isSuperAdmin ? null : primary?.business_id ?? null;
    const workspaceName = isSuperAdmin ? 'Zentro' : primary?.businesses?.name ?? null;
    const workspaceSlug = isSuperAdmin ? 'zentro' : primary?.businesses?.slug ?? null;
    const role = isSuperAdmin ? 'super_admin' : primary?.role ?? null;
    const membershipStatus = isSuperAdmin ? 'active' : primary?.status ?? null;
    const isOwner = isSuperAdmin || role === 'business_owner' || primary?.businesses?.owner_user_id === profile.id;

    const subscriptionPlan = isSuperAdmin ? 'enterprise' : primary?.businesses?.subscription_plan ?? null;
    const subscriptionStatus = isSuperAdmin ? 'active' : primary?.businesses?.subscription_status ?? null;

    let billingEvents = [];
    if (businessId) {
      const { data: auditRows, error: auditError } = await supabaseService
        .from('audit_logs')
        .select('id, business_id, actor_user_id, action, entity_type, entity_id, metadata, created_at')
        .eq('business_id', businessId)
        .order('created_at', { ascending: false })
        .limit(100);
      if (auditError) return sendDbError(res, auditError);

      const billingKeywords = ['billing', 'invoice', 'payment', 'subscription'];
      billingEvents = (auditRows ?? [])
        .filter((row) => {
          const action = `${row.action ?? ''}`.toLowerCase();
          const entityType = `${row.entity_type ?? ''}`.toLowerCase();
          return billingKeywords.some((word) => action.includes(word) || entityType.includes(word));
        })
        .slice(0, 20)
        .map((row) => ({
          id: row.id,
          action: row.action ?? 'billing_action',
          entityType: row.entity_type ?? null,
          entityId: row.entity_id ?? null,
          occurredAt: row.created_at,
          metadata: row.metadata ?? {},
        }));
    }

    return res.status(200).json({
      success: true,
      billing: {
        businessId,
        workspaceName,
        workspaceSlug,
        isOwner,
        role,
        membershipStatus,
        plan: subscriptionPlan,
        planLabel: mapPlanLabel(subscriptionPlan),
        status: subscriptionStatus,
        statusLabel: mapBillingStatusLabel(subscriptionStatus),
        monthlyPriceUsd: subscriptionPlan === 'free' ? 0 : null,
        outstandingBalanceUsd: null,
        paymentMethod: null,
        renewalDate: null,
        updatedAt: null,
        events: billingEvents,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

router.patch('/api/users/:id/permissions', async (req, res) => {
  try {
    const ctx = await requireSuperAdmin(req, res);
    if (!ctx) return;

    const userId = req.params.id;
    const parsedId = z.string().uuid().safeParse(userId);
    if (!parsedId.success) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid user id.' } });
    }

    const parsed = savePermissionsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'Invalid payload.' },
      });
    }

    const { data: profile, error: profileError } = await supabaseService
      .from('profiles')
      .select('id, is_platform_super_admin, business_members(role, status, business_id)')
      .eq('id', userId)
      .maybeSingle();

    if (profileError) return sendDbError(res, profileError);
    if (!profile) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'User not found.' } });
    }

    const memberships = profile.business_members ?? [];
    const primary = memberships.find((m) => m.status === 'active') ?? memberships[0] ?? null;

    const resolvedRole = profile.is_platform_super_admin ? 'super_admin' : primary?.role ?? null;
    const permissionBusinessId = resolvedRole === 'super_admin' ? null : primary?.business_id ?? null;

    if (!permissionBusinessId && resolvedRole !== 'super_admin') {
      return res.status(400).json({
        success: false,
        error: { code: 'NO_WORKSPACE_SCOPE', message: 'User does not have a workspace scope for permissions.' },
      });
    }

    let permissionRole = parsed.data.role;
    if (resolvedRole === 'super_admin') {
      permissionRole = 'super_admin';
    } else if (permissionRole === 'super_admin') {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Only platform super admin users can have super_admin permission preset.' },
      });
    }

    const normalizedPermissions = normalizePermissions(permissionRole, parsed.data.permissions);
    const resolvedCustomOverride =
      typeof parsed.data.isCustomOverride === 'boolean'
        ? parsed.data.isCustomOverride
        : isCustomOverride(permissionRole, normalizedPermissions);

    let findExistingQuery = supabaseService.from('user_permissions').select('id').eq('user_id', userId);
    findExistingQuery = permissionBusinessId
      ? findExistingQuery.eq('business_id', permissionBusinessId)
      : findExistingQuery.is('business_id', null);

    const { data: existing, error: existingError } = await findExistingQuery.maybeSingle();
    if (existingError && !isMissingPermissionsTableError(existingError)) return sendDbError(res, existingError);
    if (existingError && isMissingPermissionsTableError(existingError)) {
      return res.status(500).json({
        success: false,
        error: { code: 'MISSING_SCHEMA', message: 'user_permissions table is missing. Run SQL migration 015_user_permissions.sql.' },
      });
    }

    const writePayload = {
      user_id: userId,
      business_id: permissionBusinessId,
      role_preset: permissionRole,
      permissions: normalizedPermissions,
      is_custom_override: resolvedCustomOverride,
      updated_by_user_id: ctx.user.id,
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
      businessId: permissionBusinessId,
      actorUserId: ctx.user.id,
      action: 'user_permissions_updated',
      entityType: 'user_permissions',
      entityId: userId,
      metadata: {
        rolePreset: permissionRole,
        isCustomOverride: resolvedCustomOverride,
      },
    });

    return res.status(200).json({
      success: true,
      permissions: {
        businessId: permissionBusinessId,
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
