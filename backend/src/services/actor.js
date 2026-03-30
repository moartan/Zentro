import { supabaseService } from '../config/supabase.js';
import { env } from '../config/env.js';
import { roleSchema } from '../validators/tasks.js';
import { resolveSessionFromCookies } from './session.js';
import { sendDbError } from '../lib/supabaseError.js';

export async function resolveActorContext({ userId, requestedBusinessId }) {
  const { data: profile, error: profileError } = await supabaseService
    .from('profiles')
    .select('id, email, full_name, is_platform_super_admin')
    .eq('id', userId)
    .maybeSingle();

  if (profileError) {
    return { error: profileError };
  }

  if (!profile) {
    return {
      error: {
        code: 'PROFILE_NOT_FOUND',
        message: 'Profile was not found for the authenticated user.',
      },
    };
  }

  if (profile.is_platform_super_admin) {
    return {
      error: null,
      context: {
        userId,
        role: 'super_admin',
        businessId: requestedBusinessId ?? null,
        isPlatformSuperAdmin: true,
      },
    };
  }

  let membershipQuery = supabaseService
    .from('business_members')
    .select('business_id, role, status')
    .eq('user_id', userId)
    .in('status', ['active', 'invited'])
    .order('created_at', { ascending: true })
    .limit(1);

  if (requestedBusinessId) {
    membershipQuery = membershipQuery.eq('business_id', requestedBusinessId);
  }

  const { data: membership, error: membershipError } = await membershipQuery.maybeSingle();
  if (membershipError) {
    return { error: membershipError };
  }

  if (!membership) {
    return {
      error: {
        code: 'MEMBERSHIP_NOT_FOUND',
        message: 'No business membership found for this user.',
      },
    };
  }

  return {
    error: null,
    context: {
      userId,
      role: membership.role,
      businessId: membership.business_id,
      isPlatformSuperAdmin: false,
      membershipStatus: membership.status,
    },
  };
}

export async function getActor(req, res) {
  const { user } = await resolveSessionFromCookies(req, res);

  const requestedBusinessId = req.header('x-business-id') ?? env.DEV_BUSINESS_ID ?? null;
  const userId = user?.id ?? env.DEV_USER_ID;

  if (!userId) {
    res.status(400).json({
      success: false,
      error: {
        code: 'ACTOR_CONTEXT_MISSING',
        message: 'Missing actor context. Provide a valid login cookie or set DEV_USER_ID for local development.',
      },
    });
    return null;
  }

  const { error, context } = await resolveActorContext({ userId, requestedBusinessId });
  if (error) {
    if (error.code === 'MEMBERSHIP_NOT_FOUND') {
      res.status(403).json({ success: false, error });
      return null;
    }

    return sendDbError(res, error);
  }

  const parsedRole = roleSchema.safeParse(context.role);
  if (!parsedRole.success) {
    res.status(500).json({
      success: false,
      error: { code: 'INVALID_ROLE', message: 'Resolved role is invalid. Check database role values.' },
    });
    return null;
  }

  if (!context.businessId) {
    res.status(400).json({
      success: false,
      error: {
        code: 'BUSINESS_CONTEXT_REQUIRED',
        message: 'Missing business context. Provide X-Business-Id, or assign the user to a business.',
      },
    });
    return null;
  }

  return {
    businessId: context.businessId,
    userId,
    role: parsedRole.data,
    isPlatformSuperAdmin: context.isPlatformSuperAdmin,
  };
}

function isMissingArchivedColumnError(error) {
  const msg = `${error?.message ?? ''}`.toLowerCase();
  return msg.includes('is_archived') && (msg.includes('does not exist') || msg.includes('could not find'));
}

async function assertWorkspaceWritable({ businessId, res }) {
  const { data, error } = await supabaseService
    .from('businesses')
    .select('id, is_archived')
    .eq('id', businessId)
    .maybeSingle();

  if (error) {
    if (isMissingArchivedColumnError(error)) {
      // If lifecycle migration is not applied yet, keep previous behavior.
      return true;
    }
    sendDbError(res, error);
    return false;
  }

  if (!data) {
    res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Workspace not found.' },
    });
    return false;
  }

  if (data.is_archived) {
    res.status(423).json({
      success: false,
      error: {
        code: 'WORKSPACE_ARCHIVED',
        message: 'Workspace is archived. This action is disabled until workspace is restored.',
      },
    });
    return false;
  }

  return true;
}

export async function getActorWithOptions(req, res, options = {}) {
  const actor = await getActor(req, res);
  if (!actor) return null;

  if (options?.requireActiveWorkspace) {
    const canWrite = await assertWorkspaceWritable({ businessId: actor.businessId, res });
    if (!canWrite) return null;
  }

  return {
    ...actor,
  };
}
