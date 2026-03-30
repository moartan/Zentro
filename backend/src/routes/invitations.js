import { randomUUID, createHash } from 'crypto';
import { Router } from 'express';
import { z } from 'zod';

import { env } from '../config/env.js';
import { supabaseAnon, supabaseService } from '../config/supabase.js';
import { setSessionCookies } from '../lib/cookies.js';
import { sendDbError } from '../lib/supabaseError.js';
import { createRateLimiter } from '../middleware/rateLimit.js';
import { getActorWithOptions } from '../services/actor.js';
import { findIdempotentResponse, readIdempotencyKey, saveIdempotentResponse } from '../services/idempotency.js';
import { createNotification, notifySafe, getUserIdByEmail } from '../services/notifications.js';
import { ensureProfile } from '../services/profile.js';
import { resolveSessionFromCookies } from '../services/session.js';
import { getInvitationLink } from '../services/mailer.js';
import { ensureMemberSeatsAvailable } from '../services/subscriptionLimits.js';

const router = Router();

const createInvitationSchema = z.object({
  email: z.string().trim().email(),
  name: z.string().trim().min(2, 'Name is required.').max(120, 'Name is too long.'),
  gender: z.enum(['male', 'female']).optional().or(z.literal('')),
  country: z.string().trim().max(80).optional().or(z.literal('')),
});
const updateInvitationSchema = createInvitationSchema;
const resolveInvitationSchema = z.object({
  token: z.string().trim().min(10, 'Invalid invitation token.'),
});
const invitationProfileSchema = z.object({
  name: z.string().trim().min(2, 'Name is required.').max(120, 'Name is too long.'),
  gender: z.enum(['male', 'female']).optional().or(z.literal('')),
  country: z.string().trim().max(80).optional().or(z.literal('')),
});
const acceptInvitationSchema = resolveInvitationSchema.merge(
  invitationProfileSchema.partial(),
);
const acceptInvitationWithSignupSchema = acceptInvitationSchema.extend({
  password: z.string().min(6, 'Password must be at least 6 characters.'),
});

function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

function isMissingInviteProfileColumnsError(error) {
  const msg = `${error?.message ?? ''}`.toLowerCase();
  return msg.includes('invitee_name') || msg.includes('invitee_gender') || msg.includes('invitee_country');
}

function sendMissingInviteColumns(res) {
  return res.status(500).json({
    success: false,
    error: {
      code: 'MISSING_SCHEMA',
      message: 'Missing invitation profile columns. Run backend/sql/016_invitation_profile_fields.sql.',
    },
  });
}

function isMissingArchivedColumnError(error) {
  const msg = `${error?.message ?? ''}`.toLowerCase();
  return msg.includes('is_archived') && (msg.includes('does not exist') || msg.includes('could not find'));
}

async function assertBusinessAcceptsWrites({ businessId, res }) {
  const { data, error } = await supabaseService
    .from('businesses')
    .select('id, is_archived')
    .eq('id', businessId)
    .maybeSingle();

  if (error) {
    if (isMissingArchivedColumnError(error)) return true;
    sendDbError(res, error);
    return false;
  }

  if (!data) {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Workspace not found.' } });
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

async function getInvitationEmailContext({ businessId, invitedByUserId }) {
  const [{ data: business, error: businessError }, { data: inviter, error: inviterError }] = await Promise.all([
    supabaseService.from('businesses').select('name').eq('id', businessId).maybeSingle(),
    supabaseService.from('profiles').select('full_name, email').eq('id', invitedByUserId).maybeSingle(),
  ]);

  if (businessError) return { error: businessError, context: null };
  if (inviterError) return { error: inviterError, context: null };

  return {
    error: null,
    context: {
      workspaceName: business?.name ?? 'Workspace',
      inviterName: inviter?.full_name ?? inviter?.email ?? 'Workspace owner',
    },
  };
}

function hashToken(rawToken) {
  return createHash('sha256').update(rawToken).digest('hex');
}

const isProd = env.NODE_ENV === 'production';
const invitationWriteLimiter = createRateLimiter({
  windowMs: 60_000,
  max: 20,
  message: 'Too many invitation actions. Please wait a minute.',
});

async function resolvePendingInvitationByToken(rawToken) {
  const tokenHash = hashToken(rawToken);
  const { data: invite, error } = await supabaseService
    .from('invitations')
    .select(
      'id, business_id, email, role, invitee_name, invitee_gender, invitee_country, invited_by_user_id, expires_at, accepted_at, created_at, businesses(name, slug), profiles!invitations_invited_by_user_id_fkey(full_name, email)'
    )
    .eq('token_hash', tokenHash)
    .maybeSingle();
  if (error) return { error, invite: null };
  if (!invite) {
    return {
      error: { code: 'NOT_FOUND', message: 'Invitation not found.' },
      invite: null,
    };
  }
  if (invite.accepted_at) {
    return {
      error: { code: 'ALREADY_ACCEPTED', message: 'Invitation already accepted.' },
      invite: null,
    };
  }

  const expiresTs = invite.expires_at ? new Date(invite.expires_at).getTime() : Number.NaN;
  if (Number.isNaN(expiresTs) || expiresTs < Date.now()) {
    return {
      error: { code: 'EXPIRED', message: 'Invitation expired.' },
      invite: null,
    };
  }

  return { error: null, invite };
}

async function upsertAcceptedMembership({ businessId, userId, role }) {
  return supabaseService.from('business_members').upsert(
    {
      business_id: businessId,
      user_id: userId,
      role: role ?? 'employee',
      status: 'active',
      joined_at: new Date().toISOString(),
    },
    { onConflict: 'business_id,user_id' },
  );
}

async function needsAdditionalSeat({ businessId, userId }) {
  const { data: membership, error } = await supabaseService
    .from('business_members')
    .select('status')
    .eq('business_id', businessId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) return { error, additionalSeats: 0 };

  const status = membership?.status ?? null;
  if (!membership || status === 'block') {
    return { error: null, additionalSeats: 1 };
  }

  return { error: null, additionalSeats: 0 };
}

async function markInvitationAccepted(inviteId) {
  return supabaseService
    .from('invitations')
    .update({ accepted_at: new Date().toISOString() })
    .eq('id', inviteId);
}

async function applyProfileCorrections({ userId, name, gender, country }) {
  const nextName = (name ?? '').trim();
  const nextGender = (gender ?? '').trim();
  const nextCountry = (country ?? '').trim();

  if (nextName) {
    const { error: profileUpdateError } = await supabaseService
      .from('profiles')
      .update({ full_name: nextName })
      .eq('id', userId);
    if (profileUpdateError) return { error: profileUpdateError };
  }

  const updatePayload = {
    user_metadata: {
      full_name: nextName || undefined,
      gender: nextGender || undefined,
      country: nextCountry || undefined,
    },
  };
  const { error: authUpdateError } = await supabaseService.auth.admin.updateUserById(userId, updatePayload);
  if (authUpdateError) return { error: authUpdateError };

  return { error: null };
}

async function findAuthUserByEmail(email) {
  const target = normalizeEmail(email);
  let page = 1;
  const perPage = 200;

  while (page <= 20) {
    const { data, error } = await supabaseService.auth.admin.listUsers({ page, perPage });
    if (error) return { error, user: null };
    const users = data?.users ?? [];
    if (users.length === 0) break;

    const found = users.find((u) => normalizeEmail(u.email ?? '') === target);
    if (found) return { error: null, user: found };

    if (users.length < perPage) break;
    page += 1;
  }

  return { error: null, user: null };
}

async function ensureProfileByUserId(userId) {
  const { data, error } = await supabaseService.auth.admin.getUserById(userId);
  if (error) return { error };
  if (!data?.user) {
    return { error: { code: 'AUTH_USER_NOT_FOUND', message: 'Auth user not found.' } };
  }
  await ensureProfile(data.user);
  return { error: null };
}

async function sendSupabaseInvitationEmail({
  email,
  invitationLink,
  inviteeName,
  inviteeGender,
  inviteeCountry,
  businessId,
  workspaceName,
}) {
  const { error } = await supabaseService.auth.admin.inviteUserByEmail(email, {
    redirectTo: invitationLink,
    data: {
      full_name: inviteeName ?? null,
      gender: inviteeGender ?? null,
      country: inviteeCountry ?? null,
      business_id: businessId,
      business_name: workspaceName ?? null,
    },
  });

  if (error) {
    const msg = `${error.message ?? ''}`.toLowerCase();
    if (msg.includes('already') && (msg.includes('registered') || msg.includes('exists'))) {
      const known = new Error(
        'Supabase invite email works only for not-yet-registered users. This email already has an account.',
      );
      known.code = 'USER_ALREADY_REGISTERED';
      throw known;
    }
    const unknown = new Error(error.message ?? 'Failed to send invitation email via Supabase.');
    unknown.code = 'SUPABASE_INVITE_FAILED';
    throw unknown;
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

router.get('/api/invitations', async (req, res) => {
  try {
    const actor = await requireBusinessOwner(req, res);
    if (!actor) return;

    let rows = null;
    {
      const { data, error } = await supabaseService
        .from('invitations')
        .select(
          'id, email, role, invitee_name, invitee_gender, invitee_country, invited_by_user_id, expires_at, accepted_at, created_at, profiles!invitations_invited_by_user_id_fkey(full_name, email)'
        )
        .eq('business_id', actor.businessId)
        .is('accepted_at', null)
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) {
        if (isMissingInviteProfileColumnsError(error)) return sendMissingInviteColumns(res);
        return sendDbError(res, error);
      } else {
        rows = data;
      }
    }

    const now = Date.now();
    const invitations = (rows ?? []).map((row) => {
      const expiresAtTs = row.expires_at ? new Date(row.expires_at).getTime() : null;
      const isExpired = typeof expiresAtTs === 'number' && !Number.isNaN(expiresAtTs) ? expiresAtTs < now : false;
      return {
        id: row.id,
        email: row.email,
        role: row.role,
        name: row.invitee_name ?? null,
        gender: row.invitee_gender ?? null,
        country: row.invitee_country ?? null,
        invitedByUserId: row.invited_by_user_id,
        invitedByName: row.profiles?.full_name ?? null,
        invitedByEmail: row.profiles?.email ?? null,
        expiresAt: row.expires_at,
        acceptedAt: row.accepted_at,
        createdAt: row.created_at,
        status: isExpired ? 'expired' : 'pending',
      };
    });

    return res.status(200).json({ success: true, invitations });
  } catch (err) {
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

router.post('/api/invitations', invitationWriteLimiter, async (req, res) => {
  try {
    const actor = await requireBusinessOwner(req, res, { requireActiveWorkspace: true });
    if (!actor) return;
    const idempotencyKey = readIdempotencyKey(req);
    if (idempotencyKey) {
      const { error: idempotencyLookupError, result } = await findIdempotentResponse({
        userId: actor.userId,
        scope: 'create_invitation',
        key: idempotencyKey,
      });
      if (idempotencyLookupError) return sendDbError(res, idempotencyLookupError);
      if (result) {
        res.setHeader('Idempotent-Replay', 'true');
        return res.status(result.statusCode).json(result.response);
      }
    }

    const parsed = createInvitationSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'Invalid payload.' },
      });
    }

    const normalizedEmail = normalizeEmail(parsed.data.email);
    const inviteeName = parsed.data.name;
    const inviteeGender = parsed.data.gender?.trim() || null;
    const inviteeCountry = parsed.data.country?.trim() || null;

    const { data: actorProfile, error: actorProfileError } = await supabaseService
      .from('profiles')
      .select('email')
      .eq('id', actor.userId)
      .maybeSingle();
    if (actorProfileError) return sendDbError(res, actorProfileError);
    if (normalizeEmail(actorProfile?.email ?? '') === normalizedEmail) {
      return res.status(400).json({
        success: false,
        error: { code: 'CANNOT_INVITE_SELF', message: 'You cannot invite your own email.' },
      });
    }

    const { data: existingProfile, error: existingProfileError } = await supabaseService
      .from('profiles')
      .select('id')
      .ilike('email', normalizedEmail)
      .maybeSingle();
    if (existingProfileError) return sendDbError(res, existingProfileError);

    if (existingProfile?.id) {
      const { data: existingMembership, error: membershipError } = await supabaseService
        .from('business_members')
        .select('id, status')
        .eq('business_id', actor.businessId)
        .eq('user_id', existingProfile.id)
        .in('status', ['active', 'invited', 'block'])
        .maybeSingle();
      if (membershipError) return sendDbError(res, membershipError);
      if (existingMembership?.id) {
        return res.status(400).json({
          success: false,
          error: { code: 'ALREADY_MEMBER', message: 'This email already belongs to a workspace member.' },
        });
      }
    }

    const { data: existingInvite, error: inviteError } = await supabaseService
      .from('invitations')
      .select('id, expires_at')
      .eq('business_id', actor.businessId)
      .ilike('email', normalizedEmail)
      .is('accepted_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (inviteError) return sendDbError(res, inviteError);

    if (existingInvite?.id) {
      const expires = new Date(existingInvite.expires_at).getTime();
      if (!Number.isNaN(expires) && expires > Date.now()) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVITATION_ALREADY_PENDING', message: 'An active invitation already exists for this email.' },
        });
      }
    }

    const limitCheck = await ensureMemberSeatsAvailable({
      businessId: actor.businessId,
      additionalSeats: 1,
      includePendingInvitations: true,
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

    const rawToken = randomUUID();
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const invitationLink = getInvitationLink(rawToken);

    const { data: inserted, error: insertError } = await supabaseService
      .from('invitations')
      .insert({
        business_id: actor.businessId,
        email: normalizedEmail,
        role: 'employee',
        invitee_name: inviteeName,
        invitee_gender: inviteeGender,
        invitee_country: inviteeCountry,
        invited_by_user_id: actor.userId,
        token_hash: tokenHash,
        expires_at: expiresAt,
      })
      .select('id, email, role, invitee_name, invitee_gender, invitee_country, invited_by_user_id, expires_at, accepted_at, created_at')
      .single();
    if (insertError) {
      if (isMissingInviteProfileColumnsError(insertError)) return sendMissingInviteColumns(res);
      return sendDbError(res, insertError);
    }

    const { error: emailCtxError, context: emailCtx } = await getInvitationEmailContext({
      businessId: actor.businessId,
      invitedByUserId: actor.userId,
    });
    if (emailCtxError) return sendDbError(res, emailCtxError);

    try {
      await sendSupabaseInvitationEmail({
        email: normalizedEmail,
        invitationLink,
        inviteeName,
        inviteeGender,
        inviteeCountry,
        businessId: actor.businessId,
        workspaceName: emailCtx.workspaceName,
      });
    } catch (emailError) {
      await supabaseService.from('invitations').delete().eq('id', inserted.id);
      return res.status(500).json({
        success: false,
        error: {
          code: 'EMAIL_SEND_FAILED',
          message: emailError.message ?? 'Failed to send invitation email.',
        },
      });
    }

    const { userId: inviteeUserId, error: inviteeLookupError } = existingProfile?.id
      ? { userId: existingProfile.id, error: null }
      : await getUserIdByEmail(normalizedEmail);
    if (inviteeLookupError) {
      console.error('notification_lookup_invitee_failed', inviteeLookupError);
    } else if (inviteeUserId) {
      void notifySafe(
        createNotification({
          recipientUserId: inviteeUserId,
          businessId: actor.businessId,
          actorUserId: actor.userId,
          type: 'invitation_received',
          title: 'Workspace invitation',
          message: `You were invited to join ${emailCtx.workspaceName}.`,
          priority: 'general',
          entityType: 'invitation',
          entityId: inserted.id,
          metadata: { workspaceName: emailCtx.workspaceName, inviteEmail: normalizedEmail, role: inserted.role },
        }),
        'invitation_received',
      );
    }

    const responsePayload = {
      success: true,
      invitation: {
        id: inserted.id,
        email: inserted.email,
        role: inserted.role,
        name: inserted.invitee_name ?? inviteeName,
        gender: inserted.invitee_gender ?? inviteeGender,
        country: inserted.invitee_country ?? inviteeCountry,
        invitedByUserId: inserted.invited_by_user_id,
        invitedByName: null,
        invitedByEmail: null,
        expiresAt: inserted.expires_at,
        acceptedAt: inserted.accepted_at,
        createdAt: inserted.created_at,
        status: 'pending',
      },
    };
    if (idempotencyKey) {
      const { error: idempotencySaveError } = await saveIdempotentResponse({
        userId: actor.userId,
        scope: 'create_invitation',
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

router.patch('/api/invitations/:id', async (req, res) => {
  try {
    const actor = await requireBusinessOwner(req, res, { requireActiveWorkspace: true });
    if (!actor) return;

    const inviteId = req.params.id;
    const parsedId = z.string().uuid().safeParse(inviteId);
    if (!parsedId.success) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid invitation id.' } });
    }

    const parsed = updateInvitationSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'Invalid payload.' },
      });
    }

    const normalizedEmail = normalizeEmail(parsed.data.email);
    const inviteeName = parsed.data.name;
    const inviteeGender = parsed.data.gender?.trim() || null;
    const inviteeCountry = parsed.data.country?.trim() || null;

    const { data: existingInvite, error: existingInviteError } = await supabaseService
      .from('invitations')
      .select('id, business_id, accepted_at')
      .eq('id', inviteId)
      .maybeSingle();
    if (existingInviteError) return sendDbError(res, existingInviteError);
    if (!existingInvite || existingInvite.business_id !== actor.businessId) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Invitation not found.' } });
    }
    if (existingInvite.accepted_at) {
      return res.status(400).json({ success: false, error: { code: 'ALREADY_ACCEPTED', message: 'Accepted invitations cannot be edited.' } });
    }

    const { data: actorProfile, error: actorProfileError } = await supabaseService
      .from('profiles')
      .select('email')
      .eq('id', actor.userId)
      .maybeSingle();
    if (actorProfileError) return sendDbError(res, actorProfileError);
    if (normalizeEmail(actorProfile?.email ?? '') === normalizedEmail) {
      return res.status(400).json({
        success: false,
        error: { code: 'CANNOT_INVITE_SELF', message: 'You cannot invite your own email.' },
      });
    }

    const { data: existingProfile, error: existingProfileError } = await supabaseService
      .from('profiles')
      .select('id')
      .ilike('email', normalizedEmail)
      .maybeSingle();
    if (existingProfileError) return sendDbError(res, existingProfileError);

    if (existingProfile?.id) {
      const { data: existingMembership, error: membershipError } = await supabaseService
        .from('business_members')
        .select('id, status')
        .eq('business_id', actor.businessId)
        .eq('user_id', existingProfile.id)
        .in('status', ['active', 'invited', 'block'])
        .maybeSingle();
      if (membershipError) return sendDbError(res, membershipError);
      if (existingMembership?.id) {
        return res.status(400).json({
          success: false,
          error: { code: 'ALREADY_MEMBER', message: 'This email already belongs to a workspace member.' },
        });
      }
    }

    const { data: duplicateInvite, error: duplicateError } = await supabaseService
      .from('invitations')
      .select('id')
      .eq('business_id', actor.businessId)
      .ilike('email', normalizedEmail)
      .is('accepted_at', null)
      .neq('id', inviteId)
      .maybeSingle();
    if (duplicateError) return sendDbError(res, duplicateError);
    if (duplicateInvite?.id) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVITATION_ALREADY_PENDING', message: 'Another active invitation already exists for this email.' },
      });
    }

    const { data: updated, error: updateError } = await supabaseService
      .from('invitations')
      .update({
        email: normalizedEmail,
        invitee_name: inviteeName,
        invitee_gender: inviteeGender,
        invitee_country: inviteeCountry,
      })
      .eq('id', inviteId)
      .eq('business_id', actor.businessId)
      .select('id, email, role, invitee_name, invitee_gender, invitee_country, invited_by_user_id, expires_at, accepted_at, created_at')
      .single();
    if (updateError) {
      if (isMissingInviteProfileColumnsError(updateError)) return sendMissingInviteColumns(res);
      return sendDbError(res, updateError);
    }

    const expiresAtTs = updated.expires_at ? new Date(updated.expires_at).getTime() : null;
    const isExpired = typeof expiresAtTs === 'number' && !Number.isNaN(expiresAtTs) ? expiresAtTs < Date.now() : false;

    return res.status(200).json({
      success: true,
      invitation: {
        id: updated.id,
        email: updated.email,
        role: updated.role,
        name: updated.invitee_name ?? null,
        gender: updated.invitee_gender ?? null,
        country: updated.invitee_country ?? null,
        invitedByUserId: updated.invited_by_user_id,
        invitedByName: null,
        invitedByEmail: null,
        expiresAt: updated.expires_at,
        acceptedAt: updated.accepted_at,
        createdAt: updated.created_at,
        status: isExpired ? 'expired' : 'pending',
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

router.get('/api/invitations/resolve', async (req, res) => {
  try {
    const parsed = resolveInvitationSchema.safeParse({ token: req.query.token });
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'Invalid invitation token.' },
      });
    }

    const { error, invite } = await resolvePendingInvitationByToken(parsed.data.token);
    if (error?.code === 'NOT_FOUND') return res.status(404).json({ success: false, error });
    if (error?.code === 'EXPIRED' || error?.code === 'ALREADY_ACCEPTED') return res.status(400).json({ success: false, error });
    if (error) return sendDbError(res, error);
    const canWrite = await assertBusinessAcceptsWrites({ businessId: invite.business_id, res });
    if (!canWrite) return;

    return res.status(200).json({
      success: true,
      invitation: {
        id: invite.id,
        businessId: invite.business_id,
        businessName: invite.businesses?.name ?? null,
        businessSlug: invite.businesses?.slug ?? null,
        email: invite.email,
        role: invite.role,
        name: invite.invitee_name ?? null,
        gender: invite.invitee_gender ?? null,
        country: invite.invitee_country ?? null,
        invitedByName: invite.profiles?.full_name ?? null,
        invitedByEmail: invite.profiles?.email ?? null,
        expiresAt: invite.expires_at,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

router.post('/api/invitations/accept', invitationWriteLimiter, async (req, res) => {
  try {
    const parsed = acceptInvitationSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'Invalid invitation token.' },
      });
    }

    const { user } = await resolveSessionFromCookies(req, res);
    if (!user) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Login required.' } });
    }
    await ensureProfile(user);

    const { error, invite } = await resolvePendingInvitationByToken(parsed.data.token);
    if (error?.code === 'NOT_FOUND') return res.status(404).json({ success: false, error });
    if (error?.code === 'EXPIRED' || error?.code === 'ALREADY_ACCEPTED') return res.status(400).json({ success: false, error });
    if (error) return sendDbError(res, error);
    const canWrite = await assertBusinessAcceptsWrites({ businessId: invite.business_id, res });
    if (!canWrite) return;

    const { data: profile, error: profileError } = await supabaseService
      .from('profiles')
      .select('email')
      .eq('id', user.id)
      .maybeSingle();
    if (profileError) return sendDbError(res, profileError);
    if (normalizeEmail(profile?.email ?? '') !== normalizeEmail(invite.email)) {
      return res.status(403).json({
        success: false,
        error: { code: 'EMAIL_MISMATCH', message: 'This invitation belongs to a different email.' },
      });
    }

    const correctedName = parsed.data.name ?? invite.invitee_name ?? '';
    const correctedGender = parsed.data.gender ?? invite.invitee_gender ?? '';
    const correctedCountry = parsed.data.country ?? invite.invitee_country ?? '';

    const { error: profileCorrectionError } = await applyProfileCorrections({
      userId: user.id,
      name: correctedName,
      gender: correctedGender,
      country: correctedCountry,
    });
    if (profileCorrectionError) return sendDbError(res, profileCorrectionError);

    const { error: seatCheckMembershipError, additionalSeats } = await needsAdditionalSeat({
      businessId: invite.business_id,
      userId: user.id,
    });
    if (seatCheckMembershipError) return sendDbError(res, seatCheckMembershipError);
    if (additionalSeats > 0) {
      const limitCheck = await ensureMemberSeatsAvailable({
        businessId: invite.business_id,
        additionalSeats,
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
    }

    const { error: membershipUpsertError } = await upsertAcceptedMembership({
      businessId: invite.business_id,
      userId: user.id,
      role: invite.role ?? 'employee',
    });
    if (membershipUpsertError) return sendDbError(res, membershipUpsertError);

    const { error: acceptError } = await markInvitationAccepted(invite.id);
    if (acceptError) return sendDbError(res, acceptError);

    void notifySafe(
      createNotification({
        recipientUserId: user.id,
        businessId: invite.business_id,
        actorUserId: user.id,
        type: 'invitation_accepted_self',
        title: 'Invitation accepted',
        message: 'You joined the workspace successfully.',
        priority: 'general',
        entityType: 'invitation',
        entityId: invite.id,
      }),
      'invitation_accepted_member',
    );

    if (invite.invited_by_user_id && invite.invited_by_user_id !== user.id) {
      void notifySafe(
        createNotification({
          recipientUserId: invite.invited_by_user_id,
          businessId: invite.business_id,
          actorUserId: user.id,
          type: 'invitation_accepted',
          title: 'Invitation accepted',
          message: `${invite.email} accepted your invitation.`,
          priority: 'general',
          entityType: 'invitation',
          entityId: invite.id,
          metadata: { inviteEmail: invite.email },
        }),
        'invitation_accepted_owner',
      );
    }

    return res.status(200).json({
      success: true,
      membership: {
        businessId: invite.business_id,
        role: invite.role ?? 'employee',
        status: 'active',
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

router.post('/api/invitations/decline', invitationWriteLimiter, async (req, res) => {
  try {
    const parsed = resolveInvitationSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'Invalid invitation token.' },
      });
    }

    const { error, invite } = await resolvePendingInvitationByToken(parsed.data.token);
    if (error?.code === 'NOT_FOUND') return res.status(404).json({ success: false, error });
    if (error?.code === 'EXPIRED' || error?.code === 'ALREADY_ACCEPTED') return res.status(400).json({ success: false, error });
    if (error) return sendDbError(res, error);

    const { error: deleteError } = await supabaseService.from('invitations').delete().eq('id', invite.id);
    if (deleteError) return sendDbError(res, deleteError);

    if (invite.invited_by_user_id) {
      void notifySafe(
        createNotification({
          recipientUserId: invite.invited_by_user_id,
          businessId: invite.business_id,
          actorUserId: null,
          type: 'invitation_declined',
          title: 'Invitation declined',
          message: `${invite.email} declined your invitation.`,
          priority: 'general',
          entityType: 'invitation',
          entityId: invite.id,
          metadata: { inviteEmail: invite.email },
        }),
        'invitation_declined_owner',
      );
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

router.post('/api/invitations/accept-signup', invitationWriteLimiter, async (req, res) => {
  try {
    const parsed = acceptInvitationWithSignupSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'Invalid payload.' },
      });
    }

    const { error, invite } = await resolvePendingInvitationByToken(parsed.data.token);
    if (error?.code === 'NOT_FOUND') return res.status(404).json({ success: false, error });
    if (error?.code === 'EXPIRED' || error?.code === 'ALREADY_ACCEPTED') return res.status(400).json({ success: false, error });
    if (error) return sendDbError(res, error);

    const resolvedName = parsed.data.name ?? invite.invitee_name ?? '';
    const resolvedGender = parsed.data.gender ?? invite.invitee_gender ?? '';
    const resolvedCountry = parsed.data.country ?? invite.invitee_country ?? '';

    let targetUserId = null;
    const { error: existingAuthUserError, user: existingAuthUser } = await findAuthUserByEmail(invite.email);
    if (existingAuthUserError) return sendDbError(res, existingAuthUserError);

    if (existingAuthUser?.id) {
      targetUserId = existingAuthUser.id;
      const { error: updateAuthError } = await supabaseService.auth.admin.updateUserById(targetUserId, {
        password: parsed.data.password,
        email_confirm: true,
        user_metadata: {
          full_name: resolvedName || undefined,
          gender: resolvedGender || undefined,
          country: resolvedCountry || undefined,
        },
      });
      if (updateAuthError) {
        return res.status(400).json({
          success: false,
          error: { code: 'AUTH_ERROR', message: updateAuthError.message ?? 'Failed to update invited account.' },
        });
      }
      const { error: ensureExistingProfileError } = await ensureProfileByUserId(targetUserId);
      if (ensureExistingProfileError) return sendDbError(res, ensureExistingProfileError);
    } else {
      const { data: created, error: createError } = await supabaseService.auth.admin.createUser({
        email: invite.email,
        password: parsed.data.password,
        email_confirm: true,
        user_metadata: {
          full_name: resolvedName || undefined,
          gender: resolvedGender || undefined,
          country: resolvedCountry || undefined,
        },
      });
      if (createError || !created.user) {
        return res.status(400).json({
          success: false,
          error: { code: 'AUTH_ERROR', message: createError?.message ?? 'Failed to create invited account.' },
        });
      }
      targetUserId = created.user.id;
      await ensureProfile(created.user);
    }

    const { error: profileCorrectionError } = await applyProfileCorrections({
      userId: targetUserId,
      name: resolvedName,
      gender: resolvedGender,
      country: resolvedCountry,
    });
    if (profileCorrectionError) return sendDbError(res, profileCorrectionError);

    const { error: seatCheckMembershipError, additionalSeats } = await needsAdditionalSeat({
      businessId: invite.business_id,
      userId: targetUserId,
    });
    if (seatCheckMembershipError) return sendDbError(res, seatCheckMembershipError);
    if (additionalSeats > 0) {
      const limitCheck = await ensureMemberSeatsAvailable({
        businessId: invite.business_id,
        additionalSeats,
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
    }

    const { error: membershipUpsertError } = await upsertAcceptedMembership({
      businessId: invite.business_id,
      userId: targetUserId,
      role: invite.role ?? 'employee',
    });
    if (membershipUpsertError) return sendDbError(res, membershipUpsertError);

    const { error: acceptError } = await markInvitationAccepted(invite.id);
    if (acceptError) return sendDbError(res, acceptError);

    void notifySafe(
      createNotification({
        recipientUserId: targetUserId,
        businessId: invite.business_id,
        actorUserId: targetUserId,
        type: 'invitation_accepted_self',
        title: 'Invitation accepted',
        message: 'You joined the workspace successfully.',
        priority: 'general',
        entityType: 'invitation',
        entityId: invite.id,
      }),
      'invitation_signup_member',
    );

    if (invite.invited_by_user_id && invite.invited_by_user_id !== targetUserId) {
      void notifySafe(
        createNotification({
          recipientUserId: invite.invited_by_user_id,
          businessId: invite.business_id,
          actorUserId: targetUserId,
          type: 'invitation_accepted',
          title: 'Invitation accepted',
          message: `${invite.email} accepted your invitation.`,
          priority: 'general',
          entityType: 'invitation',
          entityId: invite.id,
          metadata: { inviteEmail: invite.email },
        }),
        'invitation_signup_owner',
      );
    }

    const { data: signInData, error: signInError } = await supabaseAnon.auth.signInWithPassword({
      email: invite.email,
      password: parsed.data.password,
    });
    if (signInError || !signInData.session) {
      return res.status(500).json({
        success: false,
        error: { code: 'SESSION_CREATE_FAILED', message: 'Account created but failed to create session.' },
      });
    }
    setSessionCookies(res, signInData.session, isProd);

    return res.status(200).json({
      success: true,
      membership: {
        businessId: invite.business_id,
        role: invite.role ?? 'employee',
        status: 'active',
      },
      user: {
        id: targetUserId,
        email: invite.email,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

router.delete('/api/invitations/:id', async (req, res) => {
  try {
    const actor = await requireBusinessOwner(req, res, { requireActiveWorkspace: true });
    if (!actor) return;

    const inviteId = req.params.id;
    const parsedId = z.string().uuid().safeParse(inviteId);
    if (!parsedId.success) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid invitation id.' } });
    }

    const { data: existing, error: existingError } = await supabaseService
      .from('invitations')
      .select('id, business_id, email, invitee_name, invited_by_user_id, accepted_at')
      .eq('id', inviteId)
      .maybeSingle();
    if (existingError) return sendDbError(res, existingError);
    if (!existing || existing.business_id !== actor.businessId) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Invitation not found.' } });
    }
    if (existing.accepted_at) {
      return res.status(400).json({ success: false, error: { code: 'ALREADY_ACCEPTED', message: 'Accepted invitations cannot be revoked.' } });
    }

    const { error: deleteError } = await supabaseService.from('invitations').delete().eq('id', inviteId);
    if (deleteError) return sendDbError(res, deleteError);

    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

router.patch('/api/invitations/:id/resend', async (req, res) => {
  try {
    const actor = await requireBusinessOwner(req, res, { requireActiveWorkspace: true });
    if (!actor) return;

    const inviteId = req.params.id;
    const parsedId = z.string().uuid().safeParse(inviteId);
    if (!parsedId.success) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid invitation id.' } });
    }

    const { data: existing, error: existingError } = await supabaseService
      .from('invitations')
      .select('id, business_id, email, invitee_name, invitee_gender, invitee_country, invited_by_user_id, accepted_at')
      .eq('id', inviteId)
      .maybeSingle();
    if (existingError) return sendDbError(res, existingError);
    if (!existing || existing.business_id !== actor.businessId) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Invitation not found.' } });
    }
    if (existing.accepted_at) {
      return res.status(400).json({ success: false, error: { code: 'ALREADY_ACCEPTED', message: 'Accepted invitations cannot be resent.' } });
    }

    const rawToken = randomUUID();
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const invitationLink = getInvitationLink(rawToken);

    const { error: updateError } = await supabaseService
      .from('invitations')
      .update({
        token_hash: tokenHash,
        expires_at: expiresAt,
      })
      .eq('id', inviteId)
      .eq('business_id', actor.businessId);
    if (updateError) return sendDbError(res, updateError);

    const { error: emailCtxError, context: emailCtx } = await getInvitationEmailContext({
      businessId: actor.businessId,
      invitedByUserId: existing.invited_by_user_id ?? actor.userId,
    });
    if (emailCtxError) return sendDbError(res, emailCtxError);

    try {
      await sendSupabaseInvitationEmail({
        email: existing.email,
        invitationLink,
        inviteeName: existing.invitee_name ?? null,
        inviteeGender: null,
        inviteeCountry: null,
        businessId: actor.businessId,
        workspaceName: emailCtx.workspaceName,
      });
    } catch (emailError) {
      return res.status(500).json({
        success: false,
        error: {
          code: 'EMAIL_SEND_FAILED',
          message: emailError.message ?? 'Failed to send invitation email.',
        },
      });
    }

    return res.status(200).json({
      success: true,
      invitation: {
        id: inviteId,
        expiresAt,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

export default router;
