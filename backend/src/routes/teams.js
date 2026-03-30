import { Router } from 'express';
import { z } from 'zod';

import { supabaseService } from '../config/supabase.js';
import { sendDbError } from '../lib/supabaseError.js';
import { getActor, getActorWithOptions } from '../services/actor.js';
import { createNotifications, notifySafe } from '../services/notifications.js';
import { getUserTeamIds } from '../services/team.js';
import { addTeamCommentSchema, createTeamSchema, updateTeamSchema } from '../validators/teams.js';

const router = Router();

const TEAM_LIMIT_BY_PLAN = {
  free: 2,
  pro: 10,
  enterprise: null,
};

const TEAM_MEMBER_LIMIT_BY_PLAN = {
  free: 5,
  pro: 15,
  enterprise: null,
};

function uniqueIds(values) {
  return [...new Set(values)];
}

function mapTeamRow(row) {
  const members = Array.isArray(row.team_members)
    ? row.team_members.map((member) => ({
        userId: member.user_id,
        role: member.role,
        fullName: member.profiles?.full_name ?? null,
        email: member.profiles?.email ?? null,
      }))
    : [];

  const leader = members.find((m) => m.role === 'lead') ?? null;
  const memberUserIds = members.map((m) => m.userId);

  const comments = Array.isArray(row.team_comments)
    ? row.team_comments
        .map((item) => ({
          id: item.id,
          authorId: item.author_user_id,
          authorName: item.profiles?.full_name ?? null,
          body: item.body,
          createdAt: item.created_at,
        }))
        .sort((a, b) => `${a.createdAt}`.localeCompare(`${b.createdAt}`))
    : [];

  return {
    id: row.id,
    businessId: row.business_id,
    name: row.name,
    description: row.description ?? '',
    status: row.status ?? 'active',
    createdByUserId: row.created_by_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    leaderUserId: leader?.userId ?? memberUserIds[0] ?? null,
    memberUserIds,
    members,
    comments,
  };
}

async function getBusinessPlanContext(businessId) {
  const { data: business, error } = await supabaseService
    .from('businesses')
    .select('id, owner_user_id, subscription_plan')
    .eq('id', businessId)
    .maybeSingle();

  if (error) return { error, context: null };
  if (!business) {
    return {
      error: { code: 'NOT_FOUND', message: 'Workspace not found.' },
      context: null,
    };
  }

  const plan = business.subscription_plan ?? 'free';
  return {
    error: null,
    context: {
      ownerUserId: business.owner_user_id,
      plan,
      maxTeams: TEAM_LIMIT_BY_PLAN[plan] ?? TEAM_LIMIT_BY_PLAN.free,
      maxTeamMembers: TEAM_MEMBER_LIMIT_BY_PLAN[plan] ?? TEAM_MEMBER_LIMIT_BY_PLAN.free,
    },
  };
}

async function getAllowedUserIds({ businessId, ownerUserId }) {
  const { data, error } = await supabaseService
    .from('business_members')
    .select('user_id, status')
    .eq('business_id', businessId)
    .in('status', ['active', 'invited']);

  if (error) return { error, allowedUserIds: new Set() };

  const set = new Set((data ?? []).map((row) => row.user_id));
  if (ownerUserId) set.add(ownerUserId);
  return { error: null, allowedUserIds: set };
}

async function loadTeamById({ businessId, teamId }) {
  const { data, error } = await supabaseService
    .from('teams')
    .select(
      'id, business_id, name, description, status, created_by_user_id, created_at, updated_at, team_members(user_id, role, profiles(id, full_name, email)), team_comments(id, author_user_id, body, created_at, profiles(id, full_name))',
    )
    .eq('id', teamId)
    .eq('business_id', businessId)
    .maybeSingle();

  if (error) return { error, team: null };
  if (!data) return { error: null, team: null };
  return { error: null, team: mapTeamRow(data) };
}

async function syncTeamMembers({ teamId, leaderUserId, memberUserIds }) {
  const rows = memberUserIds.map((userId) => ({
    team_id: teamId,
    user_id: userId,
    role: userId === leaderUserId ? 'lead' : 'member',
  }));

  const { error: deleteError } = await supabaseService.from('team_members').delete().eq('team_id', teamId);
  if (deleteError) return { error: deleteError };

  const { error: insertError } = await supabaseService.from('team_members').insert(rows);
  if (insertError) return { error: insertError };

  return { error: null };
}

router.get('/api/teams', async (req, res) => {
  try {
    const actor = await getActor(req, res);
    if (!actor) return;

    const rawPage = Number.parseInt(`${req.query.page ?? '1'}`, 10);
    const rawPageSize = Number.parseInt(`${req.query.pageSize ?? '12'}`, 10);
    const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
    const pageSize = Number.isFinite(rawPageSize) ? Math.min(Math.max(rawPageSize, 1), 100) : 12;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const normalizedQ = q.replace(/[%]/g, '').replace(/[,]/g, ' ').slice(0, 120);
    const requestedStatus = typeof req.query.status === 'string' ? req.query.status : null;
    const status = ['active', 'on_hold', 'completed', 'archived'].includes(`${requestedStatus}`)
      ? requestedStatus
      : null;
    const mine = `${req.query.mine ?? ''}` === 'true';

    let targetTeamIds = null;
    if (actor.role === 'employee' || mine) {
      const { error: teamError, teamIds } = await getUserTeamIds({
        businessId: actor.businessId,
        userId: actor.userId,
      });
      if (teamError) return sendDbError(res, teamError);
      if (teamIds.length === 0) {
        return res.status(200).json({
          success: true,
          teams: [],
          pagination: {
            page,
            pageSize,
            total: 0,
            totalPages: 0,
            hasNext: false,
            hasPrev: false,
          },
          filters: { q, status, mine: actor.role === 'employee' ? true : mine },
        });
      }
      targetTeamIds = teamIds;
    }

    const listQuery = supabaseService
      .from('teams')
      .select(
        'id, business_id, name, description, status, created_by_user_id, created_at, updated_at, team_members(user_id, role, profiles(id, full_name, email)), team_comments(id, author_user_id, body, created_at, profiles(id, full_name))',
      )
      .eq('business_id', actor.businessId)
      .order('created_at', { ascending: false })
      .range(from, to);
    const countQuery = supabaseService
      .from('teams')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', actor.businessId);

    if (targetTeamIds) {
      listQuery.in('id', targetTeamIds);
      countQuery.in('id', targetTeamIds);
    }
    if (status) {
      listQuery.eq('status', status);
      countQuery.eq('status', status);
    }
    if (normalizedQ) {
      const pattern = `%${normalizedQ}%`;
      listQuery.or(`name.ilike.${pattern},description.ilike.${pattern}`);
      countQuery.or(`name.ilike.${pattern},description.ilike.${pattern}`);
    }

    const [{ data, error }, { count, error: countError }] = await Promise.all([listQuery, countQuery]);
    if (error) return sendDbError(res, error);
    if (countError) return sendDbError(res, countError);

    const total = count ?? 0;
    const totalPages = total > 0 ? Math.ceil(total / pageSize) : 0;

    return res.status(200).json({
      success: true,
      teams: (data ?? []).map(mapTeamRow),
      pagination: {
        page,
        pageSize,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
      filters: { q, status, mine: actor.role === 'employee' ? true : mine },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

router.get('/api/teams/:id', async (req, res) => {
  try {
    const actor = await getActor(req, res);
    if (!actor) return;

    const teamId = req.params.id;
    const parsed = z.string().uuid().safeParse(teamId);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid team id.' } });
    }

    const { error, team } = await loadTeamById({ businessId: actor.businessId, teamId });
    if (error) return sendDbError(res, error);
    if (!team) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Team not found.' } });
    }

    if (actor.role === 'employee' && !team.memberUserIds.includes(actor.userId)) {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'You cannot access this team.' } });
    }

    return res.status(200).json({ success: true, team });
  } catch (err) {
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

router.post('/api/teams', async (req, res) => {
  try {
    const actor = await getActorWithOptions(req, res, { requireActiveWorkspace: true });
    if (!actor) return;

    if (actor.role !== 'business_owner') {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Workspace owner only.' } });
    }

    const parsed = createTeamSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'Invalid payload.' },
      });
    }

    const { error: planError, context: planContext } = await getBusinessPlanContext(actor.businessId);
    if (planError) {
      if (planError.code === 'NOT_FOUND') {
        return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: planError.message } });
      }
      return sendDbError(res, planError);
    }

    const { count, error: countError } = await supabaseService
      .from('teams')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', actor.businessId);
    if (countError) return sendDbError(res, countError);

    if (typeof planContext.maxTeams === 'number' && (count ?? 0) >= planContext.maxTeams) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'TEAM_LIMIT_REACHED',
          message: `Team limit reached for ${planContext.plan} plan (${planContext.maxTeams}).`,
        },
      });
    }

    const memberUserIds = uniqueIds(parsed.data.memberUserIds);
    if (!memberUserIds.includes(parsed.data.leaderUserId)) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Leader must be included in memberUserIds.' },
      });
    }

    if (typeof planContext.maxTeamMembers === 'number' && memberUserIds.length > planContext.maxTeamMembers) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'TEAM_MEMBER_LIMIT_REACHED',
          message: `Team member limit reached for ${planContext.plan} plan (${planContext.maxTeamMembers}).`,
        },
      });
    }

    const { error: allowedError, allowedUserIds } = await getAllowedUserIds({
      businessId: actor.businessId,
      ownerUserId: planContext.ownerUserId,
    });
    if (allowedError) return sendDbError(res, allowedError);

    const outsiderId = memberUserIds.find((id) => !allowedUserIds.has(id));
    if (outsiderId) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_MEMBER', message: 'All team members must belong to this workspace.' },
      });
    }

    const { data: createdTeam, error: insertError } = await supabaseService
      .from('teams')
      .insert({
        business_id: actor.businessId,
        name: parsed.data.name,
        description: parsed.data.description ?? '',
        status: parsed.data.status ?? 'active',
        created_by_user_id: actor.userId,
      })
      .select('id')
      .single();
    if (insertError) return sendDbError(res, insertError);

    const { error: syncError } = await syncTeamMembers({
      teamId: createdTeam.id,
      leaderUserId: parsed.data.leaderUserId,
      memberUserIds,
    });
    if (syncError) return sendDbError(res, syncError);

    const { error: loadError, team } = await loadTeamById({ businessId: actor.businessId, teamId: createdTeam.id });
    if (loadError) return sendDbError(res, loadError);

    const recipients = (team?.memberUserIds ?? []).filter((id) => id !== actor.userId);
    if (recipients.length > 0) {
      void notifySafe(
        createNotifications({
          recipientUserIds: recipients,
          businessId: actor.businessId,
          actorUserId: actor.userId,
          type: 'team_member_added',
          title: 'You were added to a team',
          message: team?.name ?? parsed.data.name,
          priority: 'general',
          entityType: 'team',
          entityId: createdTeam.id,
          metadata: { teamId: createdTeam.id, teamName: team?.name ?? parsed.data.name },
        }),
        'team_created_member_added',
      );
    }

    return res.status(201).json({ success: true, team });
  } catch (err) {
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

router.patch('/api/teams/:id', async (req, res) => {
  try {
    const actor = await getActorWithOptions(req, res, { requireActiveWorkspace: true });
    if (!actor) return;

    const teamId = req.params.id;
    const parsedId = z.string().uuid().safeParse(teamId);
    if (!parsedId.success) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid team id.' } });
    }

    const parsed = updateTeamSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'Invalid payload.' },
      });
    }

    const { error: loadError, team } = await loadTeamById({ businessId: actor.businessId, teamId });
    if (loadError) return sendDbError(res, loadError);
    if (!team) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Team not found.' } });
    }

    const payload = parsed.data;

    if (actor.role === 'employee') {
      const blockedKey = Object.keys(payload).find((key) => key !== 'status');
      if (blockedKey) {
        return res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Employees can only update team status.' },
        });
      }

      const isLeader = team.members.some((member) => member.userId === actor.userId && member.role === 'lead');
      if (!isLeader) {
        return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Team leader only.' } });
      }

      const { error: updateError } = await supabaseService
        .from('teams')
        .update({ status: payload.status, updated_at: new Date().toISOString() })
        .eq('id', teamId)
        .eq('business_id', actor.businessId);
      if (updateError) return sendDbError(res, updateError);

      const { error: refetchError, team: updatedTeam } = await loadTeamById({ businessId: actor.businessId, teamId });
      if (refetchError) return sendDbError(res, refetchError);

      return res.status(200).json({ success: true, team: updatedTeam });
    }

    if (actor.role !== 'business_owner') {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Workspace owner only.' } });
    }

    const updatePayload = {};
    if (typeof payload.name !== 'undefined') updatePayload.name = payload.name;
    if (typeof payload.description !== 'undefined') updatePayload.description = payload.description;
    if (typeof payload.status !== 'undefined') updatePayload.status = payload.status;
    if (Object.keys(updatePayload).length > 0) updatePayload.updated_at = new Date().toISOString();

    if (Object.keys(updatePayload).length > 0) {
      const { error: updateError } = await supabaseService
        .from('teams')
        .update(updatePayload)
        .eq('id', teamId)
        .eq('business_id', actor.businessId);
      if (updateError) return sendDbError(res, updateError);
    }

    if (typeof payload.memberUserIds !== 'undefined' || typeof payload.leaderUserId !== 'undefined') {
      const { error: planError, context: planContext } = await getBusinessPlanContext(actor.businessId);
      if (planError) {
        if (planError.code === 'NOT_FOUND') {
          return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: planError.message } });
        }
        return sendDbError(res, planError);
      }

      const memberUserIds = uniqueIds(payload.memberUserIds ?? team.memberUserIds);
      const leaderUserId = payload.leaderUserId ?? team.leaderUserId;

      if (!leaderUserId || !memberUserIds.includes(leaderUserId)) {
        return res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Leader must be included in memberUserIds.' },
        });
      }

      if (typeof planContext.maxTeamMembers === 'number' && memberUserIds.length > planContext.maxTeamMembers) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'TEAM_MEMBER_LIMIT_REACHED',
            message: `Team member limit reached for ${planContext.plan} plan (${planContext.maxTeamMembers}).`,
          },
        });
      }

      const { error: allowedError, allowedUserIds } = await getAllowedUserIds({
        businessId: actor.businessId,
        ownerUserId: planContext.ownerUserId,
      });
      if (allowedError) return sendDbError(res, allowedError);

      const outsiderId = memberUserIds.find((id) => !allowedUserIds.has(id));
      if (outsiderId) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_MEMBER', message: 'All team members must belong to this workspace.' },
        });
      }

      const { error: syncError } = await syncTeamMembers({ teamId, leaderUserId, memberUserIds });
      if (syncError) return sendDbError(res, syncError);
    }

    const { error: refetchError, team: updatedTeam } = await loadTeamById({ businessId: actor.businessId, teamId });
    if (refetchError) return sendDbError(res, refetchError);

    if (actor.role === 'business_owner' && updatedTeam) {
      const previousMemberIds = new Set(team.memberUserIds);
      const addedMemberIds = updatedTeam.memberUserIds.filter((id) => !previousMemberIds.has(id) && id !== actor.userId);
      if (addedMemberIds.length > 0) {
        void notifySafe(
          createNotifications({
            recipientUserIds: addedMemberIds,
            businessId: actor.businessId,
            actorUserId: actor.userId,
            type: 'team_member_added',
            title: 'You were added to a team',
            message: updatedTeam.name,
            priority: 'general',
            entityType: 'team',
            entityId: updatedTeam.id,
            metadata: { teamId: updatedTeam.id, teamName: updatedTeam.name },
          }),
          'team_updated_member_added',
        );
      }
    }

    return res.status(200).json({ success: true, team: updatedTeam });
  } catch (err) {
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

router.delete('/api/teams/:id', async (req, res) => {
  try {
    const actor = await getActorWithOptions(req, res, { requireActiveWorkspace: true });
    if (!actor) return;

    if (actor.role !== 'business_owner') {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Workspace owner only.' } });
    }

    const teamId = req.params.id;
    const parsedId = z.string().uuid().safeParse(teamId);
    if (!parsedId.success) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid team id.' } });
    }

    const { error } = await supabaseService
      .from('teams')
      .delete()
      .eq('id', teamId)
      .eq('business_id', actor.businessId);
    if (error) return sendDbError(res, error);

    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

router.post('/api/teams/:id/comments', async (req, res) => {
  try {
    const actor = await getActorWithOptions(req, res, { requireActiveWorkspace: true });
    if (!actor) return;

    const teamId = req.params.id;
    const parsedId = z.string().uuid().safeParse(teamId);
    if (!parsedId.success) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid team id.' } });
    }

    const parsed = addTeamCommentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'Invalid payload.' },
      });
    }

    const { error: teamError, team } = await loadTeamById({ businessId: actor.businessId, teamId });
    if (teamError) return sendDbError(res, teamError);
    if (!team) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Team not found.' } });
    }

    const isTeamMember = team.memberUserIds.includes(actor.userId);
    if (!isTeamMember) {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Team members only.' } });
    }

    const { data, error } = await supabaseService
      .from('team_comments')
      .insert({
        business_id: actor.businessId,
        team_id: teamId,
        author_user_id: actor.userId,
        body: parsed.data.body,
      })
      .select('id, author_user_id, body, created_at, profiles(id, full_name)')
      .single();
    if (error) return sendDbError(res, error);

    return res.status(201).json({
      success: true,
      comment: {
        id: data.id,
        authorId: data.author_user_id,
        authorName: data.profiles?.full_name ?? null,
        body: data.body,
        createdAt: data.created_at,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

export default router;
