import { supabaseService } from '../config/supabase.js';

export async function getBusinessMemberLimit(businessId) {
  const { data: business, error: businessError } = await supabaseService
    .from('businesses')
    .select('subscription_plan')
    .eq('id', businessId)
    .maybeSingle();
  if (businessError) return { error: businessError, maxMembers: null, planCode: null };
  if (!business) return { error: { code: 'NOT_FOUND', message: 'Workspace not found.' }, maxMembers: null, planCode: null };

  const planCode = business.subscription_plan ?? 'free';
  const { data: plan, error: planError } = await supabaseService
    .from('subscription_plans')
    .select('limits')
    .eq('code', planCode)
    .maybeSingle();
  if (planError) return { error: planError, maxMembers: null, planCode };

  const maxMembers = typeof plan?.limits?.max_members === 'number' ? plan.limits.max_members : null;
  return { error: null, maxMembers, planCode };
}

export async function countActiveInvitedMembers(businessId, { ignoreUserId = null } = {}) {
  const { data, error } = await supabaseService
    .from('business_members')
    .select('user_id')
    .eq('business_id', businessId)
    .in('status', ['active', 'invited']);
  if (error) return { error, count: 0 };

  const count = (data ?? []).filter((row) => !ignoreUserId || row.user_id !== ignoreUserId).length;
  return { error: null, count };
}

export async function countPendingInvitations(businessId, { ignoreInvitationId = null } = {}) {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabaseService
    .from('invitations')
    .select('id')
    .eq('business_id', businessId)
    .is('accepted_at', null)
    .gt('expires_at', nowIso);
  if (error) return { error, count: 0 };

  const count = (data ?? []).filter((row) => !ignoreInvitationId || row.id !== ignoreInvitationId).length;
  return { error: null, count };
}

export async function ensureMemberSeatsAvailable({
  businessId,
  additionalSeats = 1,
  ignoreUserId = null,
  includePendingInvitations = false,
  ignoreInvitationId = null,
}) {
  const { error: limitError, maxMembers, planCode } = await getBusinessMemberLimit(businessId);
  if (limitError) return { error: limitError, allowed: false, maxMembers: null, used: 0, remaining: 0, planCode };
  if (maxMembers === null) return { error: null, allowed: true, maxMembers, used: 0, remaining: null, planCode };

  const { error: membersError, count: memberCount } = await countActiveInvitedMembers(businessId, { ignoreUserId });
  if (membersError) return { error: membersError, allowed: false, maxMembers, used: 0, remaining: 0, planCode };

  let used = memberCount;
  if (includePendingInvitations) {
    const { error: invitesError, count: invitesCount } = await countPendingInvitations(businessId, { ignoreInvitationId });
    if (invitesError) return { error: invitesError, allowed: false, maxMembers, used: 0, remaining: 0, planCode };
    used += invitesCount;
  }

  const remaining = Math.max(0, maxMembers - used);
  const allowed = remaining >= additionalSeats;
  return { error: null, allowed, maxMembers, used, remaining, planCode };
}
