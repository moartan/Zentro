import { Router } from 'express';
import { z } from 'zod';

import { supabaseService } from '../config/supabase.js';
import { sendDbError } from '../lib/supabaseError.js';
import { ensureProfile } from '../services/profile.js';
import { resolveSessionFromCookies } from '../services/session.js';
import { getActor, getActorWithOptions } from '../services/actor.js';
import { createNotification, notifySafe } from '../services/notifications.js';
import {
  updateMySubscriptionSchema,
  updatePlanSchema,
  updateWorkspaceSubscriptionSchema,
} from '../validators/subscriptions.js';

const router = Router();

function isMissingSubscriptionPlansTableError(error) {
  const msg = `${error?.message ?? ''}`.toLowerCase();
  return msg.includes('subscription_plans') && (msg.includes('does not exist') || msg.includes('could not find'));
}

function mapPlanRow(row) {
  return {
    code: row.code,
    name: row.name,
    description: row.description ?? null,
    currency: row.currency,
    monthlyPriceCents: row.monthly_price_cents ?? null,
    yearlyPriceCents: row.yearly_price_cents ?? null,
    yearlyDiscountPercent: Number(row.yearly_discount_percent ?? 0),
    isPublic: Boolean(row.is_public),
    isActive: Boolean(row.is_active),
    sortOrder: row.sort_order ?? 0,
    limits: {
      maxMembers: row.limits?.max_members ?? null,
      maxTeams: row.limits?.max_teams ?? null,
      maxActiveTasks: row.limits?.max_active_tasks ?? null,
      maxProjects: row.limits?.max_projects ?? null,
    },
    featureFlags: {
      teams: Boolean(row.feature_flags?.teams),
      activityLogs: Boolean(row.feature_flags?.activity_logs),
      customRoles: Boolean(row.feature_flags?.custom_roles),
      apiAccess: Boolean(row.feature_flags?.api_access),
      fileUploads: Boolean(row.feature_flags?.file_uploads),
    },
    updatedAt: row.updated_at ?? null,
  };
}

function mapWorkspaceRow(row, plan) {
  return {
    businessId: row.id,
    name: row.name,
    slug: row.slug,
    ownerUserId: row.owner_user_id ?? null,
    status: row.subscription_status ?? 'active',
    planCode: row.subscription_plan ?? 'free',
    billingCycle: row.subscription_billing_cycle ?? 'monthly',
    currency: row.subscription_currency ?? plan?.currency ?? 'USD',
    unitPriceCents:
      typeof row.subscription_unit_price_cents === 'number'
        ? row.subscription_unit_price_cents
        : row.subscription_billing_cycle === 'yearly'
          ? (plan?.yearlyPriceCents ?? null)
          : (plan?.monthlyPriceCents ?? null),
    renewalAt: row.subscription_renewal_at ?? null,
    trialStartedAt: row.trial_started_at ?? null,
    lastPaymentAt: row.last_payment_at ?? null,
    pendingChange:
      row.pending_subscription_plan || row.pending_subscription_billing_cycle
        ? {
            planCode: row.pending_subscription_plan ?? null,
            billingCycle: row.pending_subscription_billing_cycle ?? null,
            effectiveAt: row.pending_subscription_effective_at ?? null,
          }
        : null,
    limits: plan?.limits ?? null,
    updatedAt: row.subscription_updated_at ?? null,
  };
}

function resolveLifecycleDates({ existing, nextPlanCode }) {
  const nowIso = new Date().toISOString();
  let trialStartedAt = existing.trial_started_at ?? null;
  let lastPaymentAt = existing.last_payment_at ?? null;

  if (nextPlanCode === 'free') {
    if (!trialStartedAt || existing.subscription_plan !== 'free') {
      trialStartedAt = nowIso;
    }
    lastPaymentAt = null;
  } else {
    trialStartedAt = null;
    if (!lastPaymentAt || existing.subscription_plan === 'free') {
      lastPaymentAt = nowIso;
    }
  }

  return { trialStartedAt, lastPaymentAt };
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

async function requirePlansReadAccess(req, res) {
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

  // Super admins can read plan catalog globally (no business context required).
  if (requester.is_platform_super_admin) {
    return { userId: user.id, role: 'super_admin', isPlatformSuperAdmin: true, businessId: null };
  }

  const actor = await getActor(req, res);
  if (!actor) return null;
  if (actor.role !== 'business_owner') {
    res.status(403).json({
      success: false,
      error: { code: 'FORBIDDEN', message: 'Platform admin or workspace owner only.' },
    });
    return null;
  }

  return actor;
}

async function getPlansMap() {
  const { data, error } = await supabaseService
    .from('subscription_plans')
    .select(
      'code, name, description, currency, monthly_price_cents, yearly_price_cents, yearly_discount_percent, is_public, is_active, sort_order, limits, feature_flags, updated_at',
    )
    .order('sort_order', { ascending: true });

  if (error) return { error, plans: [], plansMap: new Map() };

  const plans = (data ?? []).map(mapPlanRow);
  const plansMap = new Map(plans.map((plan) => [plan.code, plan]));
  return { error: null, plans, plansMap };
}

function planPriceForCycle(plan, billingCycle) {
  if (!plan) return null;
  if (billingCycle === 'yearly') return plan.yearlyPriceCents;
  return plan.monthlyPriceCents;
}

function addDaysIso(value, days) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

function cycleDays(cycle) {
  return cycle === 'yearly' ? 365 : 30;
}

function resolveNextRenewalAt(row) {
  if (row.subscription_renewal_at) return row.subscription_renewal_at;
  if ((row.subscription_plan ?? 'free') === 'free') {
    return addDaysIso(row.trial_started_at ?? row.subscription_updated_at ?? row.created_at ?? null, 14);
  }
  const base = row.last_payment_at ?? row.subscription_updated_at ?? row.created_at ?? null;
  return addDaysIso(base, cycleDays(row.subscription_billing_cycle ?? 'monthly'));
}

router.get('/api/subscriptions/plans', async (req, res) => {
  try {
    const actor = await requirePlansReadAccess(req, res);
    if (!actor) return;

    const { error, plans } = await getPlansMap();
    if (error) {
      if (isMissingSubscriptionPlansTableError(error)) {
        return res.status(500).json({
          success: false,
          error: {
            code: 'MISSING_SCHEMA',
            message: 'subscription_plans table is missing. Run SQL migration 017_subscription_plans_and_cycles.sql.',
          },
        });
      }
      return sendDbError(res, error);
    }

    return res.status(200).json({ success: true, plans });
  } catch (err) {
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

router.patch('/api/subscriptions/plans/:code', async (req, res) => {
  try {
    const ctx = await requireSuperAdmin(req, res);
    if (!ctx) return;

    const code = req.params.code;
    const parsedCode = z.enum(['free', 'pro', 'enterprise']).safeParse(code);
    if (!parsedCode.success) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid plan code.' } });
    }

    const parsed = updatePlanSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'Invalid payload.' },
      });
    }

    const payload = parsed.data;
    const updatePayload = {};

    if (typeof payload.name !== 'undefined') updatePayload.name = payload.name;
    if (typeof payload.description !== 'undefined') updatePayload.description = payload.description || null;
    if (typeof payload.currency !== 'undefined') updatePayload.currency = payload.currency.toUpperCase();
    if (typeof payload.monthlyPriceCents !== 'undefined') updatePayload.monthly_price_cents = payload.monthlyPriceCents;
    if (typeof payload.yearlyPriceCents !== 'undefined') updatePayload.yearly_price_cents = payload.yearlyPriceCents;
    if (typeof payload.yearlyDiscountPercent !== 'undefined') updatePayload.yearly_discount_percent = payload.yearlyDiscountPercent;
    if (typeof payload.isPublic !== 'undefined') updatePayload.is_public = payload.isPublic;
    if (typeof payload.isActive !== 'undefined') updatePayload.is_active = payload.isActive;
    if (typeof payload.sortOrder !== 'undefined') updatePayload.sort_order = payload.sortOrder;

    if (payload.limits) {
      updatePayload.limits = {
        max_members: typeof payload.limits.maxMembers === 'undefined' ? undefined : payload.limits.maxMembers,
        max_teams: typeof payload.limits.maxTeams === 'undefined' ? undefined : payload.limits.maxTeams,
        max_active_tasks:
          typeof payload.limits.maxActiveTasks === 'undefined' ? undefined : payload.limits.maxActiveTasks,
        max_projects: typeof payload.limits.maxProjects === 'undefined' ? undefined : payload.limits.maxProjects,
      };
      Object.keys(updatePayload.limits).forEach((k) => {
        if (typeof updatePayload.limits[k] === 'undefined') delete updatePayload.limits[k];
      });
    }

    if (payload.featureFlags) {
      updatePayload.feature_flags = {
        teams: typeof payload.featureFlags.teams === 'undefined' ? undefined : payload.featureFlags.teams,
        activity_logs:
          typeof payload.featureFlags.activityLogs === 'undefined' ? undefined : payload.featureFlags.activityLogs,
        custom_roles:
          typeof payload.featureFlags.customRoles === 'undefined' ? undefined : payload.featureFlags.customRoles,
        api_access: typeof payload.featureFlags.apiAccess === 'undefined' ? undefined : payload.featureFlags.apiAccess,
        file_uploads:
          typeof payload.featureFlags.fileUploads === 'undefined' ? undefined : payload.featureFlags.fileUploads,
      };
      Object.keys(updatePayload.feature_flags).forEach((k) => {
        if (typeof updatePayload.feature_flags[k] === 'undefined') delete updatePayload.feature_flags[k];
      });
    }

    updatePayload.updated_at = new Date().toISOString();

    const { data: current, error: currentError } = await supabaseService
      .from('subscription_plans')
      .select('limits, feature_flags')
      .eq('code', code)
      .maybeSingle();
    if (currentError) return sendDbError(res, currentError);
    if (!current) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Plan not found.' } });
    }

    if (updatePayload.limits) {
      updatePayload.limits = { ...(current.limits ?? {}), ...updatePayload.limits };
    }
    if (updatePayload.feature_flags) {
      updatePayload.feature_flags = { ...(current.feature_flags ?? {}), ...updatePayload.feature_flags };
    }

    const { data: updated, error: updateError } = await supabaseService
      .from('subscription_plans')
      .update(updatePayload)
      .eq('code', code)
      .select(
        'code, name, description, currency, monthly_price_cents, yearly_price_cents, yearly_discount_percent, is_public, is_active, sort_order, limits, feature_flags, updated_at',
      )
      .single();
    if (updateError) return sendDbError(res, updateError);

    return res.status(200).json({ success: true, plan: mapPlanRow(updated) });
  } catch (err) {
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

router.get('/api/subscriptions/workspaces', async (req, res) => {
  try {
    const ctx = await requireSuperAdmin(req, res);
    if (!ctx) return;

    const { error: plansError, plansMap } = await getPlansMap();
    if (plansError) {
      if (isMissingSubscriptionPlansTableError(plansError)) {
        return res.status(500).json({
          success: false,
          error: {
            code: 'MISSING_SCHEMA',
            message: 'subscription_plans table is missing. Run SQL migration 017_subscription_plans_and_cycles.sql.',
          },
        });
      }
      return sendDbError(res, plansError);
    }

    const { data: businesses, error: businessesError } = await supabaseService
      .from('businesses')
      .select(
        'id, name, slug, owner_user_id, subscription_plan, subscription_status, subscription_billing_cycle, subscription_currency, subscription_unit_price_cents, subscription_renewal_at, trial_started_at, last_payment_at, pending_subscription_plan, pending_subscription_billing_cycle, pending_subscription_effective_at, subscription_updated_at',
      )
      .order('created_at', { ascending: false })
      .limit(500);
    if (businessesError) return sendDbError(res, businessesError);

    const ids = (businesses ?? []).map((b) => b.id);
    let memberCounts = new Map();

    if (ids.length > 0) {
      const { data: memberships, error: memberError } = await supabaseService
        .from('business_members')
        .select('business_id, status')
        .in('business_id', ids)
        .in('status', ['active', 'invited']);
      if (memberError) return sendDbError(res, memberError);

      const next = new Map();
      for (const row of memberships ?? []) {
        next.set(row.business_id, (next.get(row.business_id) ?? 0) + 1);
      }
      memberCounts = next;
    }

    const workspaces = (businesses ?? []).map((row) => {
      const plan = plansMap.get(row.subscription_plan ?? 'free') ?? null;
      return {
        ...mapWorkspaceRow(row, plan),
        memberCount: memberCounts.get(row.id) ?? 0,
      };
    });

    return res.status(200).json({ success: true, workspaces });
  } catch (err) {
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

router.patch('/api/subscriptions/workspaces/:businessId', async (req, res) => {
  try {
    const ctx = await requireSuperAdmin(req, res);
    if (!ctx) return;

    const businessId = req.params.businessId;
    const parsedBusinessId = z.string().uuid().safeParse(businessId);
    if (!parsedBusinessId.success) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid workspace id.' } });
    }

    const parsed = updateWorkspaceSubscriptionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'Invalid payload.' },
      });
    }

    const { error: plansError, plansMap } = await getPlansMap();
    if (plansError) return sendDbError(res, plansError);

    const { data: existingBusiness, error: existingError } = await supabaseService
      .from('businesses')
      .select(
        'id, name, slug, owner_user_id, subscription_plan, subscription_status, subscription_billing_cycle, subscription_currency, subscription_unit_price_cents, subscription_renewal_at, trial_started_at, last_payment_at, pending_subscription_plan, pending_subscription_billing_cycle, pending_subscription_effective_at, subscription_updated_at',
      )
      .eq('id', businessId)
      .maybeSingle();
    if (existingError) return sendDbError(res, existingError);
    if (!existingBusiness) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Workspace not found.' } });
    }

    const payload = parsed.data;
    const nextPlanCode = payload.planCode ?? existingBusiness.subscription_plan ?? 'free';
    const nextBillingCycle = payload.billingCycle ?? existingBusiness.subscription_billing_cycle ?? 'monthly';
    const plan = plansMap.get(nextPlanCode) ?? null;
    const { trialStartedAt, lastPaymentAt } = resolveLifecycleDates({
      existing: existingBusiness,
      nextPlanCode,
    });

    const updatePayload = {
      subscription_plan: nextPlanCode,
      subscription_status: payload.status ?? existingBusiness.subscription_status ?? 'active',
      subscription_billing_cycle: nextBillingCycle,
      subscription_currency: (payload.currency ?? existingBusiness.subscription_currency ?? plan?.currency ?? 'USD').toUpperCase(),
      subscription_unit_price_cents:
        typeof payload.unitPriceCents !== 'undefined'
          ? payload.unitPriceCents
          : planPriceForCycle(plan, nextBillingCycle),
      subscription_renewal_at:
        typeof payload.renewalAt !== 'undefined' ? payload.renewalAt : (existingBusiness.subscription_renewal_at ?? null),
      trial_started_at: trialStartedAt,
      last_payment_at: lastPaymentAt,
      pending_subscription_plan: null,
      pending_subscription_billing_cycle: null,
      pending_subscription_effective_at: null,
      subscription_updated_at: new Date().toISOString(),
    };

    const { data: updated, error: updateError } = await supabaseService
      .from('businesses')
      .update(updatePayload)
      .eq('id', businessId)
      .select(
        'id, name, slug, owner_user_id, subscription_plan, subscription_status, subscription_billing_cycle, subscription_currency, subscription_unit_price_cents, subscription_renewal_at, trial_started_at, last_payment_at, pending_subscription_plan, pending_subscription_billing_cycle, pending_subscription_effective_at, subscription_updated_at',
      )
      .single();
    if (updateError) return sendDbError(res, updateError);

    const activePlanCode = updated.subscription_plan ?? nextPlanCode;
    const activeCycle = updated.subscription_billing_cycle ?? nextBillingCycle;
    void notifySafe(
      createNotification({
        recipientUserId: actor.userId,
        businessId: actor.businessId,
        actorUserId: actor.userId,
        type: scheduled ? 'subscription_change_scheduled' : 'subscription_changed',
        title: scheduled ? 'Subscription change scheduled' : 'Subscription updated',
        message: scheduled
          ? `Your plan will change to ${nextPlanCode} (${nextBillingCycle}) on next renewal.`
          : `Your plan is now ${activePlanCode} (${activeCycle}).`,
        priority: 'general',
        entityType: 'subscription',
        entityId: actor.businessId,
        metadata: {
          scheduled,
          currentPlanCode,
          currentBillingCycle,
          nextPlanCode,
          nextBillingCycle,
        },
      }),
      'subscription_updated',
    );

    return res.status(200).json({
      success: true,
      workspace: mapWorkspaceRow(updated, plan),
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

router.get('/api/subscriptions/my', async (req, res) => {
  try {
    const actor = await getActor(req, res);
    if (!actor) return;

    if (actor.role !== 'business_owner') {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Workspace owner only.' } });
    }

    const { error: plansError, plansMap } = await getPlansMap();
    if (plansError) return sendDbError(res, plansError);

    const { data: business, error: businessError } = await supabaseService
      .from('businesses')
      .select(
        'id, name, slug, owner_user_id, subscription_plan, subscription_status, subscription_billing_cycle, subscription_currency, subscription_unit_price_cents, subscription_renewal_at, trial_started_at, last_payment_at, pending_subscription_plan, pending_subscription_billing_cycle, pending_subscription_effective_at, subscription_updated_at',
      )
      .eq('id', actor.businessId)
      .maybeSingle();
    if (businessError) return sendDbError(res, businessError);
    if (!business) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Workspace not found.' } });
    }

    const plan = plansMap.get(business.subscription_plan ?? 'free') ?? null;
    const workspace = mapWorkspaceRow(business, plan);

    const { data: members, error: membersError } = await supabaseService
      .from('business_members')
      .select('id')
      .eq('business_id', actor.businessId)
      .in('status', ['active', 'invited']);
    if (membersError) return sendDbError(res, membersError);

    const { data: teams, error: teamsError } = await supabaseService
      .from('teams')
      .select('id')
      .eq('business_id', actor.businessId);
    if (teamsError) return sendDbError(res, teamsError);

    const { data: activeTasks, error: activeTasksError } = await supabaseService
      .from('tasks')
      .select('id')
      .eq('business_id', actor.businessId)
      .in('status', ['todo', 'in_progress', 'on_hold']);
    if (activeTasksError) return sendDbError(res, activeTasksError);

    return res.status(200).json({
      success: true,
      subscription: {
        ...workspace,
        memberCount: (members ?? []).length,
        teamCount: (teams ?? []).length,
        activeTaskCount: (activeTasks ?? []).length,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

router.patch('/api/subscriptions/my', async (req, res) => {
  try {
    const actor = await getActorWithOptions(req, res, { requireActiveWorkspace: true });
    if (!actor) return;

    if (actor.role !== 'business_owner') {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Workspace owner only.' } });
    }

    const parsed = updateMySubscriptionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'Invalid payload.' },
      });
    }

    const payload = parsed.data;

    const { error: plansError, plansMap } = await getPlansMap();
    if (plansError) return sendDbError(res, plansError);

    const { data: current, error: currentError } = await supabaseService
      .from('businesses')
      .select(
        'id, name, slug, owner_user_id, subscription_plan, subscription_status, subscription_billing_cycle, subscription_currency, subscription_unit_price_cents, subscription_renewal_at, trial_started_at, last_payment_at, pending_subscription_plan, pending_subscription_billing_cycle, pending_subscription_effective_at, subscription_updated_at',
      )
      .eq('id', actor.businessId)
      .maybeSingle();
    if (currentError) return sendDbError(res, currentError);
    if (!current) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Workspace not found.' } });
    }

    const currentPlanCode = current.subscription_plan ?? 'free';
    const currentBillingCycle = current.subscription_billing_cycle ?? 'monthly';
    const nextPlanCode = payload.planCode ?? currentPlanCode;
    const nextBillingCycle = payload.billingCycle ?? currentBillingCycle;
    const applyTiming = payload.applyTiming ?? 'now';
    const nextPlan = plansMap.get(nextPlanCode) ?? null;

    if (nextPlanCode === currentPlanCode && nextBillingCycle === currentBillingCycle && applyTiming === 'now') {
      return res.status(400).json({
        success: false,
        error: { code: 'NO_CHANGES', message: 'Selected plan and billing cycle are already active.' },
      });
    }

    let updatePayload = {};
    let scheduled = false;

    if (applyTiming === 'next_renewal') {
      const effectiveAt = resolveNextRenewalAt(current);
      if (!effectiveAt) {
        return res.status(400).json({
          success: false,
          error: { code: 'RENEWAL_DATE_REQUIRED', message: 'Renewal date is required to schedule a future change.' },
        });
      }

      updatePayload = {
        pending_subscription_plan: nextPlanCode,
        pending_subscription_billing_cycle: nextBillingCycle,
        pending_subscription_effective_at: effectiveAt,
        subscription_updated_at: new Date().toISOString(),
      };
      scheduled = true;
    } else {
      const { trialStartedAt, lastPaymentAt } = resolveLifecycleDates({
        existing: current,
        nextPlanCode,
      });

      updatePayload = {
        subscription_plan: nextPlanCode,
        subscription_billing_cycle: nextBillingCycle,
        subscription_currency: nextPlan?.currency ?? current.subscription_currency ?? 'USD',
        subscription_unit_price_cents: planPriceForCycle(nextPlan, nextBillingCycle),
        trial_started_at: trialStartedAt,
        last_payment_at: lastPaymentAt,
        pending_subscription_plan: null,
        pending_subscription_billing_cycle: null,
        pending_subscription_effective_at: null,
        subscription_updated_at: new Date().toISOString(),
      };
    }

    const { data: updated, error: updateError } = await supabaseService
      .from('businesses')
      .update(updatePayload)
      .eq('id', actor.businessId)
      .select(
        'id, name, slug, owner_user_id, subscription_plan, subscription_status, subscription_billing_cycle, subscription_currency, subscription_unit_price_cents, subscription_renewal_at, trial_started_at, last_payment_at, pending_subscription_plan, pending_subscription_billing_cycle, pending_subscription_effective_at, subscription_updated_at',
      )
      .single();
    if (updateError) return sendDbError(res, updateError);

    return res.status(200).json({
      success: true,
      scheduled,
      subscription: mapWorkspaceRow(
        updated,
        plansMap.get((updated.subscription_plan ?? currentPlanCode)) ?? plansMap.get(currentPlanCode) ?? null,
      ),
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

export default router;
