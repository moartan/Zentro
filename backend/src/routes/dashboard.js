import { Router } from 'express';

import { supabaseService } from '../config/supabase.js';
import { sendDbError } from '../lib/supabaseError.js';
import { ensureProfile } from '../services/profile.js';
import { resolveSessionFromCookies } from '../services/session.js';
import { resolveActorContext } from '../services/actor.js';

const router = Router();
const ACTIVE_TASK_STATUSES = ['todo', 'in_progress', 'on_hold'];

function isMissingColumnError(error, columnName) {
  const message = `${error?.message ?? ''}`.toLowerCase();
  const column = `${columnName}`.toLowerCase();
  return message.includes(column) && (message.includes('does not exist') || message.includes('could not find'));
}

function toTimestamp(value) {
  const timestamp = value ? new Date(value).getTime() : NaN;
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function clip(value, max = 60) {
  if (typeof value !== 'string') return '';
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}...`;
}

async function countActiveWorkspacesGlobal() {
  const attempts = [
    () =>
      supabaseService
        .from('businesses')
        .select('id', { count: 'exact', head: true })
        .eq('subscription_status', 'active')
        .eq('is_archived', false),
    () =>
      supabaseService
        .from('businesses')
        .select('id', { count: 'exact', head: true })
        .eq('subscription_status', 'active'),
    () =>
      supabaseService
        .from('businesses')
        .select('id', { count: 'exact', head: true })
        .eq('is_archived', false),
    () => supabaseService.from('businesses').select('id', { count: 'exact', head: true }),
  ];

  let lastError = null;
  for (const run of attempts) {
    const { count, error } = await run();
    if (!error) return { error: null, count: count ?? 0 };

    if (
      isMissingColumnError(error, 'subscription_status') ||
      isMissingColumnError(error, 'is_archived')
    ) {
      lastError = error;
      continue;
    }

    return { error, count: 0 };
  }

  return { error: lastError, count: 0 };
}

async function countWorkspaceUsers(businessId) {
  const { count, error } = await supabaseService
    .from('business_members')
    .select('id', { count: 'exact', head: true })
    .eq('business_id', businessId)
    .in('status', ['active', 'invited']);
  if (error) return { error, count: 0 };
  return { error: null, count: count ?? 0 };
}

async function getSuperAdminUserTypeBreakdown() {
  const { data: platformAdminRows, error: platformAdminsError } = await supabaseService
    .from('profiles')
    .select('id')
    .eq('is_platform_super_admin', true);
  if (platformAdminsError) {
    return { error: platformAdminsError, userTypes: null };
  }

  const { data: membershipRows, error: membershipsError } = await supabaseService
    .from('business_members')
    .select('user_id, role, status')
    .in('status', ['active', 'invited']);
  if (membershipsError) {
    return { error: membershipsError, userTypes: null };
  }

  const workspaceOwnerUserIds = new Set();
  const workspaceMemberUserIds = new Set();
  for (const row of membershipRows ?? []) {
    if (row.role === 'business_owner') workspaceOwnerUserIds.add(row.user_id);
    if (row.role === 'employee') workspaceMemberUserIds.add(row.user_id);
  }

  return {
    error: null,
    userTypes: {
      platformAdmins: (platformAdminRows ?? []).length,
      workspaceOwners: workspaceOwnerUserIds.size,
      workspaceMembers: workspaceMemberUserIds.size,
    },
  };
}

async function getWorkspaceUserTypeBreakdown(businessId) {
  const { data: membershipRows, error: membershipsError } = await supabaseService
    .from('business_members')
    .select('user_id, role, status')
    .eq('business_id', businessId)
    .in('status', ['active', 'invited']);
  if (membershipsError) {
    return { error: membershipsError, userTypes: null };
  }

  const ownerUserIds = new Set();
  const employeeUserIds = new Set();
  for (const row of membershipRows ?? []) {
    if (row.role === 'business_owner') ownerUserIds.add(row.user_id);
    if (row.role === 'employee') employeeUserIds.add(row.user_id);
  }

  let managerUserIds = new Set();
  if (employeeUserIds.size > 0) {
    const { data: permissionRows, error: permissionsError } = await supabaseService
      .from('user_permissions')
      .select('user_id, role_preset')
      .eq('business_id', businessId)
      .in('user_id', [...employeeUserIds])
      .in('role_preset', ['admin', 'manager']);

    if (permissionsError) {
      if (!isMissingColumnError(permissionsError, 'user_permissions')) {
        const message = `${permissionsError?.message ?? ''}`.toLowerCase();
        const isMissingPermissionsTable =
          message.includes('user_permissions') &&
          (message.includes('does not exist') || message.includes('could not find'));
        if (!isMissingPermissionsTable) {
          return { error: permissionsError, userTypes: null };
        }
      }
    } else {
      managerUserIds = new Set((permissionRows ?? []).map((row) => row.user_id));
    }
  }

  const members = Math.max(0, employeeUserIds.size - managerUserIds.size);

  return {
    error: null,
    userTypes: {
      owners: ownerUserIds.size,
      managers: managerUserIds.size,
      members,
    },
  };
}

async function countWorkspaceActiveFlag(businessId) {
  const attempts = [
    () =>
      supabaseService
        .from('businesses')
        .select('subscription_status, is_archived')
        .eq('id', businessId)
        .maybeSingle(),
    () =>
      supabaseService
        .from('businesses')
        .select('subscription_status')
        .eq('id', businessId)
        .maybeSingle(),
    () =>
      supabaseService
        .from('businesses')
        .select('is_archived')
        .eq('id', businessId)
        .maybeSingle(),
    () =>
      supabaseService
        .from('businesses')
        .select('id')
        .eq('id', businessId)
        .maybeSingle(),
  ];

  let lastError = null;
  for (const run of attempts) {
    const { data, error } = await run();
    if (!error) {
      if (!data) return { error: null, count: 0 };
      const isActiveByStatus =
        typeof data.subscription_status === 'undefined' ? true : data.subscription_status === 'active';
      const isActiveByArchive =
        typeof data.is_archived === 'undefined' ? true : data.is_archived === false;
      return { error: null, count: isActiveByStatus && isActiveByArchive ? 1 : 0 };
    }

    if (
      isMissingColumnError(error, 'subscription_status') ||
      isMissingColumnError(error, 'is_archived')
    ) {
      lastError = error;
      continue;
    }

    return { error, count: 0 };
  }

  return { error: lastError, count: 0 };
}

async function getSuperAdminHighlights() {
  const { count: totalTeams, error: teamsError } = await supabaseService
    .from('teams')
    .select('id', { count: 'exact', head: true });
  if (teamsError) return { error: teamsError, highlights: null };

  const { count: openTasks, error: openTasksError } = await supabaseService
    .from('tasks')
    .select('id', { count: 'exact', head: true })
    .in('status', ACTIVE_TASK_STATUSES);
  if (openTasksError) return { error: openTasksError, highlights: null };

  const { count: pendingInvites, error: invitesError } = await supabaseService
    .from('invitations')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending');
  if (invitesError) return { error: invitesError, highlights: null };

  const archivedAttempts = [
    () =>
      supabaseService
        .from('businesses')
        .select('id', { count: 'exact', head: true })
        .eq('is_archived', true),
    () =>
      supabaseService
        .from('businesses')
        .select('id', { count: 'exact', head: true })
        .eq('subscription_status', 'canceled'),
    () => Promise.resolve({ count: 0, error: null }),
  ];

  let archivedWorkspaces = 0;
  for (const run of archivedAttempts) {
    const { count, error } = await run();
    if (!error) {
      archivedWorkspaces = count ?? 0;
      break;
    }
    if (isMissingColumnError(error, 'is_archived') || isMissingColumnError(error, 'subscription_status')) {
      continue;
    }
    return { error, highlights: null };
  }

  return {
    error: null,
    highlights: [
      { label: 'Total Teams', value: `${totalTeams ?? 0}` },
      { label: 'Open Tasks', value: `${openTasks ?? 0}` },
      { label: 'Pending Invitations', value: `${pendingInvites ?? 0}` },
      { label: 'Archived Workspaces', value: `${archivedWorkspaces}` },
    ],
  };
}

async function getWorkspaceHighlights(businessId) {
  const { count: teams, error: teamsError } = await supabaseService
    .from('teams')
    .select('id', { count: 'exact', head: true })
    .eq('business_id', businessId);
  if (teamsError) return { error: teamsError, highlights: null };

  const { count: openTasks, error: openTasksError } = await supabaseService
    .from('tasks')
    .select('id', { count: 'exact', head: true })
    .eq('business_id', businessId)
    .in('status', ACTIVE_TASK_STATUSES);
  if (openTasksError) return { error: openTasksError, highlights: null };

  const { count: doneTasks, error: doneTasksError } = await supabaseService
    .from('tasks')
    .select('id', { count: 'exact', head: true })
    .eq('business_id', businessId)
    .eq('status', 'done');
  if (doneTasksError) return { error: doneTasksError, highlights: null };

  const { data: business, error: businessError } = await supabaseService
    .from('businesses')
    .select('subscription_plan')
    .eq('id', businessId)
    .maybeSingle();
  if (businessError && !isMissingColumnError(businessError, 'subscription_plan')) {
    return { error: businessError, highlights: null };
  }

  const plan = business?.subscription_plan ? String(business.subscription_plan).toUpperCase() : 'N/A';

  return {
    error: null,
    highlights: [
      { label: 'Active Teams', value: `${teams ?? 0}` },
      { label: 'Open Tasks', value: `${openTasks ?? 0}` },
      { label: 'Completed Tasks', value: `${doneTasks ?? 0}` },
      { label: 'Current Plan', value: plan },
    ],
  };
}

async function getSuperAdminRecentUpdates() {
  const { data: taskRows, error: tasksError } = await supabaseService
    .from('tasks')
    .select('id, title, status, created_at, updated_at')
    .order('created_at', { ascending: false })
    .limit(6);
  if (tasksError) return { error: tasksError, recentUpdates: null };

  const { data: inviteRows, error: invitesError } = await supabaseService
    .from('invitations')
    .select('id, email, status, created_at')
    .order('created_at', { ascending: false })
    .limit(6);
  if (invitesError) return { error: invitesError, recentUpdates: null };

  const events = [];

  for (const row of taskRows ?? []) {
    const title = clip(row.title || 'Untitled task');
    if (row.status === 'done') {
      events.push({
        at: toTimestamp(row.updated_at || row.created_at),
        text: `Task "${title}" was marked done.`,
      });
    } else {
      events.push({
        at: toTimestamp(row.created_at),
        text: `Task "${title}" was created.`,
      });
    }
  }

  for (const row of inviteRows ?? []) {
    if (row.status !== 'pending') continue;
    const email = clip(row.email || 'unknown user');
    events.push({
      at: toTimestamp(row.created_at),
      text: `Invitation sent to ${email}.`,
    });
  }

  events.sort((a, b) => b.at - a.at);
  return { error: null, recentUpdates: events.slice(0, 3).map((event) => event.text) };
}

async function getWorkspaceRecentUpdates(businessId) {
  const { data: taskRows, error: tasksError } = await supabaseService
    .from('tasks')
    .select('id, title, status, created_at, updated_at')
    .eq('business_id', businessId)
    .order('created_at', { ascending: false })
    .limit(6);
  if (tasksError) return { error: tasksError, recentUpdates: null };

  const { data: inviteRows, error: invitesError } = await supabaseService
    .from('invitations')
    .select('id, email, status, created_at')
    .eq('business_id', businessId)
    .order('created_at', { ascending: false })
    .limit(6);
  if (invitesError) return { error: invitesError, recentUpdates: null };

  const events = [];

  for (const row of taskRows ?? []) {
    const title = clip(row.title || 'Untitled task');
    if (row.status === 'done') {
      events.push({
        at: toTimestamp(row.updated_at || row.created_at),
        text: `Task "${title}" was completed.`,
      });
    } else if (row.status === 'in_progress') {
      events.push({
        at: toTimestamp(row.updated_at || row.created_at),
        text: `Task "${title}" moved to in progress.`,
      });
    } else {
      events.push({
        at: toTimestamp(row.created_at),
        text: `Task "${title}" was created.`,
      });
    }
  }

  for (const row of inviteRows ?? []) {
    if (row.status !== 'pending') continue;
    const email = clip(row.email || 'unknown user');
    events.push({
      at: toTimestamp(row.created_at),
      text: `Pending invitation for ${email}.`,
    });
  }

  events.sort((a, b) => b.at - a.at);
  return { error: null, recentUpdates: events.slice(0, 3).map((event) => event.text) };
}

router.get('/api/dashboard/summary', async (req, res) => {
  try {
    const { user } = await resolveSessionFromCookies(req, res);
    if (!user) {
      return res
        .status(401)
        .json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Login required.' } });
    }

    await ensureProfile(user);

    const requestedBusinessId = req.header('x-business-id') ?? null;
    const { error: actorError, context } = await resolveActorContext({
      userId: user.id,
      requestedBusinessId,
    });
    if (actorError) {
      if (actorError.code === 'MEMBERSHIP_NOT_FOUND') {
        return res.status(403).json({ success: false, error: actorError });
      }
      return sendDbError(res, actorError);
    }

    if (context.isPlatformSuperAdmin) {
      const { count: totalUsers, error: usersError } = await supabaseService
        .from('profiles')
        .select('id', { count: 'exact', head: true });
      if (usersError) return sendDbError(res, usersError);

      const { count: activeWorkspaces, error: workspacesError } = await countActiveWorkspacesGlobal();
      if (workspacesError) return sendDbError(res, workspacesError);

      const { userTypes, error: userTypesError } = await getSuperAdminUserTypeBreakdown();
      if (userTypesError) return sendDbError(res, userTypesError);

      const { highlights, error: highlightsError } = await getSuperAdminHighlights();
      if (highlightsError) {
        console.error('dashboard_super_admin_highlights_failed', highlightsError);
      }

      const { recentUpdates, error: recentUpdatesError } = await getSuperAdminRecentUpdates();
      if (recentUpdatesError) {
        console.error('dashboard_super_admin_recent_updates_failed', recentUpdatesError);
      }

      return res.status(200).json({
        success: true,
        summary: {
          role: 'super_admin',
          totalUsers: totalUsers ?? 0,
          activeWorkspaces,
          userTypes,
          highlights: highlights ?? [],
          recentUpdates: recentUpdates ?? [],
        },
      });
    }

    const businessId = context.businessId;
    if (!businessId) {
      return res.status(400).json({
        success: false,
        error: { code: 'BUSINESS_CONTEXT_REQUIRED', message: 'Missing workspace context.' },
      });
    }

    const { count: totalUsers, error: membersError } = await countWorkspaceUsers(businessId);
    if (membersError) return sendDbError(res, membersError);

    const { count: activeWorkspaces, error: workspaceError } = await countWorkspaceActiveFlag(businessId);
    if (workspaceError) return sendDbError(res, workspaceError);

    const { userTypes, error: userTypesError } = await getWorkspaceUserTypeBreakdown(businessId);
    if (userTypesError) return sendDbError(res, userTypesError);

    const { highlights, error: highlightsError } = await getWorkspaceHighlights(businessId);
    if (highlightsError) {
      console.error('dashboard_workspace_highlights_failed', highlightsError);
    }

    const { recentUpdates, error: recentUpdatesError } = await getWorkspaceRecentUpdates(businessId);
    if (recentUpdatesError) {
      console.error('dashboard_workspace_recent_updates_failed', recentUpdatesError);
    }

    return res.status(200).json({
      success: true,
      summary: {
        role: context.role,
        businessId,
        totalUsers,
        activeWorkspaces,
        userTypes,
        highlights: highlights ?? [],
        recentUpdates: recentUpdates ?? [],
      },
    });
  } catch (err) {
    return res
      .status(500)
      .json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

export default router;
