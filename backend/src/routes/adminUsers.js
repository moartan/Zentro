import { Router } from 'express';

import { supabaseService } from '../config/supabase.js';
import { sendDbError } from '../lib/supabaseError.js';
import { ensureProfile } from '../services/profile.js';
import { resolveSessionFromCookies } from '../services/session.js';
import { adminUserIdsSchema } from '../validators/admin.js';
import { z } from 'zod';
import { clearCachedAdminUsersList } from '../services/adminUsersListCache.js';

const router = Router();

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

router.patch('/api/admin/users/block', async (req, res) => {
  try {
    const ctx = await requireSuperAdmin(req, res);
    if (!ctx) return;

    const parsed = adminUserIdsSchema.extend({ blocked: z.boolean() }).safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid payload' } });
    }

    const userIds = parsed.data.userIds;

    const { data: targets, error: targetsError } = await supabaseService
      .from('profiles')
      .select('id, is_platform_super_admin')
      .in('id', userIds);
    if (targetsError) return sendDbError(res, targetsError);
    if ((targets ?? []).some((t) => t.is_platform_super_admin)) {
      return res.status(400).json({
        success: false,
        error: { code: 'CANNOT_BLOCK_SUPER_ADMIN', message: 'Cannot block super admin users.' },
      });
    }

    if (parsed.data.blocked) {
      const { error } = await supabaseService.from('business_members').update({ status: 'block' }).in('user_id', userIds);
      if (error) return sendDbError(res, error);
    } else {
      const { error } = await supabaseService
        .from('business_members')
        .update({ status: 'active', joined_at: new Date().toISOString() })
        .in('user_id', userIds)
        .eq('status', 'block');
      if (error) return sendDbError(res, error);
    }

    clearCachedAdminUsersList();

    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

router.patch('/api/admin/users/role', async (req, res) => {
  try {
    const ctx = await requireSuperAdmin(req, res);
    if (!ctx) return;

    const parsed = adminUserIdsSchema.extend({ role: z.enum(['employee', 'business_owner']) }).safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid payload' } });
    }

    const userIds = parsed.data.userIds;
    const nextRole = parsed.data.role;

    const { data: targets, error: targetsError } = await supabaseService
      .from('profiles')
      .select('id, is_platform_super_admin, business_members(role, status, business_id)')
      .in('id', userIds);
    if (targetsError) return sendDbError(res, targetsError);

    if ((targets ?? []).some((t) => t.is_platform_super_admin)) {
      return res.status(400).json({
        success: false,
        error: { code: 'CANNOT_CHANGE_SUPER_ADMIN', message: 'Cannot change super admin users.' },
      });
    }

    const forbidden = (targets ?? []).filter((t) => {
      const memberships = t.business_members ?? [];
      const primary = memberships.find((m) => m.status === 'active') ?? memberships[0] ?? null;
      if (!primary) return true;
      if (primary.role === 'business_owner') return true;
      return false;
    });

    if (forbidden.length > 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'CANNOT_CHANGE_BUSINESS_OWNER', message: 'Cannot change role for business owner users.' },
      });
    }

    for (const t of targets ?? []) {
      const memberships = t.business_members ?? [];
      const primary = memberships.find((m) => m.status === 'active') ?? memberships[0] ?? null;
      if (!primary) continue;

      const { error: updErr } = await supabaseService
        .from('business_members')
        .update({ role: nextRole })
        .eq('user_id', t.id)
        .eq('business_id', primary.business_id);
      if (updErr) return sendDbError(res, updErr);

      if (nextRole === 'business_owner') {
        const { error: bizErr } = await supabaseService
          .from('businesses')
          .update({ owner_user_id: t.id })
          .eq('id', primary.business_id);
        if (bizErr) return sendDbError(res, bizErr);
      }
    }

    clearCachedAdminUsersList();

    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

router.delete('/api/admin/users', async (req, res) => {
  try {
    const ctx = await requireSuperAdmin(req, res);
    if (!ctx) return;

    const parsed = adminUserIdsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid payload' } });
    }

    const userIds = parsed.data.userIds;
    if (userIds.includes(ctx.user.id)) {
      return res.status(400).json({ success: false, error: { code: 'CANNOT_DELETE_SELF', message: 'Cannot delete yourself.' } });
    }

    let { data: targets, error: targetsError } = await supabaseService
      .from('profiles')
      .select('id, is_platform_super_admin, business_members(role, status, businesses(owner_user_id, subscription_status))')
      .in('id', userIds);

    if (targetsError) {
      if (`${targetsError.message}`.includes('subscription_status')) {
        const { data: fallbackTargets, error: fallbackError } = await supabaseService
          .from('profiles')
          .select('id, is_platform_super_admin, business_members(role, status, businesses(owner_user_id))')
          .in('id', userIds);
        if (fallbackError) return sendDbError(res, fallbackError);
        targets = fallbackTargets;
      } else {
        return sendDbError(res, targetsError);
      }
    }

    if ((targets ?? []).some((t) => t.is_platform_super_admin)) {
      return res.status(400).json({
        success: false,
        error: { code: 'CANNOT_DELETE_SUPER_ADMIN', message: 'Cannot delete super admin users.' },
      });
    }

    const blockedDeletes = (targets ?? []).filter((t) => {
      const memberships = t.business_members ?? [];
      const ownsActive = memberships.some((m) => {
        const isOwner = m.role === 'business_owner' || m.businesses?.owner_user_id === t.id;
        if (!isOwner) return false;
        const subStatus = m.businesses?.subscription_status;
        if (!subStatus) return true;
        return subStatus === 'active';
      });
      return ownsActive;
    });

    if (blockedDeletes.length > 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'CANNOT_DELETE_ACTIVE_OWNER', message: 'Cannot delete business owners with an active business.' },
      });
    }

    for (const id of userIds) {
      const { error } = await supabaseService.auth.admin.deleteUser(id);
      if (error) return sendDbError(res, error);
    }

    clearCachedAdminUsersList();

    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

export default router;
