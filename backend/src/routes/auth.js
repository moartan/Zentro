import { Router } from 'express';

import { env } from '../config/env.js';
import { supabaseAnon, supabaseService } from '../config/supabase.js';
import { sendDbError } from '../lib/supabaseError.js';
import { setSessionCookies, clearSessionCookies } from '../lib/cookies.js';
import { createRateLimiter } from '../middleware/rateLimit.js';
import { resolveSessionFromCookies } from '../services/session.js';
import { ensureProfile } from '../services/profile.js';
import { resolveActorContext } from '../services/actor.js';
import { createNotification, notifySafe } from '../services/notifications.js';
import { signInSchema, signUpSchema, resetPasswordSchema } from '../validators/auth.js';

const router = Router();
const isProd = env.NODE_ENV === 'production';
const authLimiter = createRateLimiter({ windowMs: 60_000, max: 20, message: 'Too many auth requests. Please wait a minute.' });
const loginLimiter = createRateLimiter({ windowMs: 60_000, max: 10, message: 'Too many login attempts. Please wait a minute.' });

function isBlockedStatus(value) {
  return value === 'block' || value === 'blocked';
}

function normalizeIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (Array.isArray(forwarded) && forwarded.length > 0) {
    return `${forwarded[0]}`.split(',')[0].trim() || req.ip || null;
  }

  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim() || req.ip || null;
  }

  return req.ip || null;
}

function normalizeUserAgent(req) {
  return req.headers['user-agent'] ? `${req.headers['user-agent']}` : null;
}

async function writeLoginActivity({ req, userId, success, reason }) {
  try {
    const { error } = await supabaseService.from('login_activity').insert({
      user_id: userId ?? null,
      ip_address: normalizeIp(req),
      user_agent: normalizeUserAgent(req),
      success: Boolean(success),
      reason: reason ?? null,
    });
    if (error) {
      console.error('login_activity_insert_failed', error);
    }
  } catch (err) {
    console.error('login_activity_insert_exception', err);
  }
}

async function findProfileIdByEmail(email) {
  if (!email) return null;
  const { data, error } = await supabaseService
    .from('profiles')
    .select('id')
    .ilike('email', email)
    .maybeSingle();
  if (error) return null;
  return data?.id ?? null;
}

async function loadUserMemberships(userId) {
  const { data: memberships, error } = await supabaseService
    .from('business_members')
    .select('business_id, role, status, businesses(name, slug, subscription_plan, subscription_status)')
    .eq('user_id', userId)
    .in('status', ['active', 'invited']);

  if (error) {
    return { error, memberships: [] };
  }

  return {
    error: null,
    memberships: (memberships ?? []).map((member) => ({
      businessId: member.business_id,
      role: member.role,
      status: member.status,
      businessName: member.businesses?.name ?? null,
      businessSlug: member.businesses?.slug ?? null,
      subscriptionPlan: member.businesses?.subscription_plan ?? null,
      subscriptionStatus: member.businesses?.subscription_status ?? null,
    })),
  };
}

function nowMs() {
  return Date.now();
}

function logRouteTiming(route, startedAt, steps, extra) {
  const totalMs = nowMs() - startedAt;
  console.log('route_timing', {
    route,
    totalMs,
    ...steps,
    ...(extra ?? {}),
  });
}

router.get('/auth/session', async (req, res) => {
  const startedAt = nowMs();
  const steps = {};
  try {
    const sessionStepStartedAt = nowMs();
    const { user } = await resolveSessionFromCookies(req, res);
    steps.resolveSessionFromCookiesMs = nowMs() - sessionStepStartedAt;

    if (!user) {
      logRouteTiming('/auth/session', startedAt, steps, { hasUser: false });
      return res.status(200).json({ success: true, user: null });
    }

    const blockedStepStartedAt = nowMs();
    const { data: blockedMembership, error: blockedMembershipError } = await supabaseService
      .from('business_members')
      .select('status')
      .eq('user_id', user.id)
      .eq('status', 'block')
      .limit(1)
      .maybeSingle();
    steps.blockedMembershipCheckMs = nowMs() - blockedStepStartedAt;
    if (blockedMembershipError) {
      logRouteTiming('/auth/session', startedAt, steps, { hasUser: true, failedAt: 'blockedMembershipCheck' });
      return sendDbError(res, blockedMembershipError);
    }
    const hasBlockedMembership = Boolean(blockedMembership?.status && isBlockedStatus(blockedMembership.status));
    if (hasBlockedMembership) {
      clearSessionCookies(res);
      logRouteTiming('/auth/session', startedAt, steps, { hasUser: true, blocked: true });
      return res.status(403).json({
        success: false,
        error: {
          code: 'BLOCKED_ACCOUNT',
          message: 'Your account has been blocked. Contact admin.',
        },
      });
    }

    const requestedBusinessId = req.header('x-business-id') ?? env.DEV_BUSINESS_ID ?? null;
    const actorStepStartedAt = nowMs();
    const { error, context } = await resolveActorContext({ userId: user.id, requestedBusinessId });
    steps.resolveActorContextMs = nowMs() - actorStepStartedAt;
    if (error && error.code !== 'MEMBERSHIP_NOT_FOUND') {
      logRouteTiming('/auth/session', startedAt, steps, { hasUser: true, failedAt: 'resolveActorContext' });
      return sendDbError(res, error);
    }

    logRouteTiming('/auth/session', startedAt, steps, {
      hasUser: true,
      role: context?.role ?? null,
      hasBusinessId: Boolean(context?.businessId),
    });
    return res.status(200).json({
      success: true,
      user: {
        id: user.id,
        email: user.email ?? null,
        fullName: user.user_metadata?.full_name ?? null,
        role: context?.role ?? null,
        businessId: context?.businessId ?? null,
        isPlatformSuperAdmin: Boolean(context?.isPlatformSuperAdmin),
        memberships: [],
      },
    });
  } catch (err) {
    logRouteTiming('/auth/session', startedAt, steps, { failedAt: 'catch', error: err?.message ?? 'unknown_error' });
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

router.get('/auth/session-details', async (req, res) => {
  const startedAt = nowMs();
  const steps = {};
  try {
    const sessionStepStartedAt = nowMs();
    const { user } = await resolveSessionFromCookies(req, res);
    steps.resolveSessionFromCookiesMs = nowMs() - sessionStepStartedAt;
    if (!user) {
      logRouteTiming('/auth/session-details', startedAt, steps, { hasUser: false });
      return res.status(200).json({ success: true, memberships: [] });
    }

    const membershipsStepStartedAt = nowMs();
    const { error, memberships } = await loadUserMemberships(user.id);
    steps.loadUserMembershipsMs = nowMs() - membershipsStepStartedAt;
    if (error) return sendDbError(res, error);

    logRouteTiming('/auth/session-details', startedAt, steps, {
      hasUser: true,
      membershipsCount: memberships.length,
    });
    return res.status(200).json({ success: true, memberships });
  } catch (err) {
    logRouteTiming('/auth/session-details', startedAt, steps, { failedAt: 'catch', error: err?.message ?? 'unknown_error' });
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

router.post('/auth/signup', authLimiter, async (req, res) => {
  try {
    const parsed = signUpSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'Invalid payload' },
      });
    }

    const { email, password, fullName } = parsed.data;
    const { data: created, error: createError } = await supabaseService.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName ?? '' },
    });

    if (createError || !created.user) {
      return res.status(400).json({
        success: false,
        error: { code: 'AUTH_ERROR', message: createError?.message ?? 'Failed to create user.' },
      });
    }

    await ensureProfile(created.user);

    const { data: signInData, error: signInError } = await supabaseAnon.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError || !signInData.session) {
      return res.status(500).json({
        success: false,
        error: { code: 'SESSION_CREATE_FAILED', message: 'Account created but failed to create session.' },
      });
    }

    setSessionCookies(res, signInData.session, isProd);

    void notifySafe(
      createNotification({
        recipientUserId: created.user.id,
        type: 'welcome',
        title: 'Welcome to Zentro',
        message: 'Your account is ready. Create your workspace to get started.',
        priority: 'general',
        metadata: { source: 'signup' },
      }),
      'signup_welcome',
    );

    return res.status(200).json({
      success: true,
      user: {
        id: created.user.id,
        email: created.user.email ?? null,
        fullName: created.user.user_metadata?.full_name ?? null,
      },
      requiresEmailConfirmation: false,
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

router.post('/auth/login', loginLimiter, async (req, res) => {
  try {
    const parsed = signInSchema.safeParse(req.body);
    if (!parsed.success) {
      await writeLoginActivity({
        req,
        userId: null,
        success: false,
        reason: parsed.error.issues[0]?.message ?? 'validation_failed',
      });
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'Invalid payload' },
      });
    }

    const { email, password } = parsed.data;
    const { data, error } = await supabaseAnon.auth.signInWithPassword({ email, password });

    if (error || !data.session || !data.user) {
      const profileId = await findProfileIdByEmail(email);
      await writeLoginActivity({
        req,
        userId: profileId,
        success: false,
        reason: error?.message ?? 'invalid_credentials',
      });
      return res.status(401).json({
        success: false,
        error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password.' },
      });
    }

    await ensureProfile(data.user);

    const { data: membershipsForBlockCheck, error: blockedMembershipError } = await supabaseService
      .from('business_members')
      .select('status')
      .eq('user_id', data.user.id)
      .limit(200);
    if (blockedMembershipError) {
      return sendDbError(res, blockedMembershipError);
    }
    const hasBlockedMembership = (membershipsForBlockCheck ?? []).some((m) => isBlockedStatus(m.status));
    if (hasBlockedMembership) {
      await writeLoginActivity({
        req,
        userId: data.user.id,
        success: false,
        reason: 'blocked_account',
      });
      return res.status(403).json({
        success: false,
        error: {
          code: 'BLOCKED_ACCOUNT',
          message: 'Your account has been blocked. Contact admin.',
        },
      });
    }

    setSessionCookies(res, data.session, isProd);
    await writeLoginActivity({
      req,
      userId: data.user.id,
      success: true,
      reason: null,
    });

    return res.status(200).json({
      success: true,
      user: {
        id: data.user.id,
        email: data.user.email ?? null,
        fullName: data.user.user_metadata?.full_name ?? null,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

router.post('/auth/logout', async (_req, res) => {
  clearSessionCookies(res);
  return res.status(200).json({ success: true });
});

router.post('/auth/reset-password', authLimiter, async (req, res) => {
  try {
    const parsed = resetPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'Invalid payload' },
      });
    }

    const { error } = await supabaseAnon.auth.resetPasswordForEmail(parsed.data.email, {
      redirectTo: env.FRONTEND_RESET_PASSWORD_URL,
    });

    if (error) {
      return res.status(400).json({ success: false, error: { code: 'AUTH_ERROR', message: error.message } });
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

export default router;
