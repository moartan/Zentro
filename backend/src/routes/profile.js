import { Router } from 'express';

import { env } from '../config/env.js';
import { supabaseAnon, supabaseService } from '../config/supabase.js';
import { sendDbError } from '../lib/supabaseError.js';
import { resolveSessionFromCookies } from '../services/session.js';
import { ensureProfile } from '../services/profile.js';
import {
  changePasswordSchema,
  requestEmailChangeSchema,
  resendVerificationSchema,
  updateBackupEmailSchema,
  updateProfileSchema,
  uploadAvatarSchema,
} from '../validators/profile.js';

const router = Router();
const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const PROFILE_AVATAR_BUCKET = env.PROFILE_AVATAR_BUCKET ?? 'avatars';
const allowedAvatarContentTypes = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp']);

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

function mapProfile(row) {
  return {
    id: row.id,
    email: row.email ?? null,
    fullName: row.full_name ?? null,
    avatar: row.avatar ?? null,
    backupEmail: row.backup_email ?? null,
    jobTitle: row.job_title ?? null,
    phone: row.phone ?? null,
    country: row.country ?? null,
    gender: row.gender === 'male' || row.gender === 'female' ? row.gender : null,
    bio: row.bio ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function sanitizeFileName(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 120);
}

function extractBase64Payload(value) {
  if (!value) return '';
  const parts = value.split(',');
  return parts.length > 1 ? parts[parts.length - 1] : value;
}

function extractStoragePathFromPublicUrl(url) {
  if (!url) return null;
  const marker = `/storage/v1/object/public/${PROFILE_AVATAR_BUCKET}/`;
  const index = url.indexOf(marker);
  if (index === -1) return null;
  return decodeURIComponent(url.slice(index + marker.length));
}

async function tryDeleteAvatar(path) {
  if (!path) return;
  try {
    await supabaseService.storage.from(PROFILE_AVATAR_BUCKET).remove([path]);
  } catch {
    // ignore avatar cleanup failures
  }
}

async function requireAuth(req, res) {
  const { user } = await resolveSessionFromCookies(req, res);
  if (!user) {
    res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Login required.' } });
    return null;
  }

  await ensureProfile(user);
  return { user };
}

function mapLoginEvent(row) {
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

function mapAuditEvent(row) {
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

function buildSessions(loginRows, currentContext) {
  const grouped = new Map();

  for (const row of loginRows ?? []) {
    if (!row.success) continue;
    const key = `${row.user_agent ?? '-'}::${row.ip_address ?? '-'}`;
    const existing = grouped.get(key);
    if (!existing || new Date(row.created_at).getTime() > new Date(existing.lastSeenAt).getTime()) {
      grouped.set(key, {
        id: key,
        device: row.user_agent ?? 'Unknown device',
        ip: row.ip_address ?? '-',
        location: 'Unknown',
        lastSeenAt: row.created_at,
        current: false,
      });
    }
  }

  const sessions = Array.from(grouped.values()).sort((a, b) => {
    const da = new Date(a.lastSeenAt).getTime();
    const db = new Date(b.lastSeenAt).getTime();
    return db - da;
  });

  const currentKey = `${currentContext.userAgent ?? '-'}::${currentContext.ipAddress ?? '-'}`;
  const currentMatch = sessions.find((session) => session.id === currentKey);

  if (currentMatch) {
    currentMatch.current = true;
  } else {
    sessions.unshift({
      id: 'current',
      device: currentContext.userAgent ?? 'Current device',
      ip: currentContext.ipAddress ?? '-',
      location: 'Current session',
      lastSeenAt: new Date().toISOString(),
      current: true,
    });
  }

  return sessions.slice(0, 20).map((session) => ({
    id: session.id,
    device: session.device,
    ip: session.ip,
    location: session.location,
    lastSeenAt: session.lastSeenAt,
    current: session.current,
  }));
}

router.get('/api/profile', async (req, res) => {
  try {
    const ctx = await requireAuth(req, res);
    if (!ctx) return;

    const { data: profile, error } = await supabaseService
      .from('profiles')
      .select('id, email, full_name, avatar, backup_email, job_title, phone, country, gender, bio, created_at, updated_at')
      .eq('id', ctx.user.id)
      .maybeSingle();

    if (error) {
      if (`${error.message}`.includes('job_title') || `${error.message}`.includes('bio') || `${error.message}`.includes('backup_email')) {
        return res.status(500).json({
          success: false,
          error: {
            code: 'MISSING_SCHEMA',
            message:
              'Missing extended profile columns. Run backend/sql/023_profile_extended_fields.sql and backend/sql/026_profile_backup_email.sql.',
          },
        });
      }
      return sendDbError(res, error);
    }

    if (!profile) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Profile not found.' } });
    }

    return res.status(200).json({ success: true, profile: mapProfile(profile) });
  } catch (err) {
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

router.patch('/api/profile', async (req, res) => {
  try {
    const ctx = await requireAuth(req, res);
    if (!ctx) return;

    const parsed = updateProfileSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'Invalid payload.' },
      });
    }

    const payload = {};
    if (typeof parsed.data.fullName !== 'undefined') payload.full_name = parsed.data.fullName;
    if (typeof parsed.data.jobTitle !== 'undefined') payload.job_title = parsed.data.jobTitle;
    if (typeof parsed.data.phone !== 'undefined') payload.phone = parsed.data.phone;
    if (typeof parsed.data.country !== 'undefined') payload.country = parsed.data.country;
    if (typeof parsed.data.gender !== 'undefined') payload.gender = parsed.data.gender;
    if (typeof parsed.data.bio !== 'undefined') payload.bio = parsed.data.bio;

    const { data: updated, error } = await supabaseService
      .from('profiles')
      .update(payload)
      .eq('id', ctx.user.id)
      .select('id, email, full_name, avatar, backup_email, job_title, phone, country, gender, bio, created_at, updated_at')
      .single();
    if (error) {
      if (`${error.message}`.includes('job_title') || `${error.message}`.includes('bio') || `${error.message}`.includes('backup_email')) {
        return res.status(500).json({
          success: false,
          error: {
            code: 'MISSING_SCHEMA',
            message:
              'Missing extended profile columns. Run backend/sql/023_profile_extended_fields.sql and backend/sql/026_profile_backup_email.sql.',
          },
        });
      }
      return sendDbError(res, error);
    }

    if (typeof parsed.data.fullName !== 'undefined') {
      const { error: authError } = await supabaseService.auth.admin.updateUserById(ctx.user.id, {
        user_metadata: {
          ...(ctx.user.user_metadata ?? {}),
          full_name: parsed.data.fullName ?? '',
        },
      });
      if (authError) {
        console.error('sync_user_metadata_failed', authError);
      }
    }

    return res.status(200).json({ success: true, profile: mapProfile(updated) });
  } catch (err) {
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

router.patch('/api/profile/password', async (req, res) => {
  try {
    const ctx = await requireAuth(req, res);
    if (!ctx) return;

    const parsed = changePasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'Invalid payload.' },
      });
    }

    if (ctx.user.email) {
      const { error: verifyError } = await supabaseAnon.auth.signInWithPassword({
        email: ctx.user.email,
        password: parsed.data.currentPassword,
      });

      if (verifyError) {
        return res.status(401).json({
          success: false,
          error: { code: 'INVALID_CREDENTIALS', message: 'Current password is incorrect.' },
        });
      }
    }

    const { error: updateError } = await supabaseService.auth.admin.updateUserById(ctx.user.id, {
      password: parsed.data.newPassword,
    });

    if (updateError) {
      return res.status(400).json({
        success: false,
        error: { code: 'AUTH_ERROR', message: updateError.message ?? 'Failed to update password.' },
      });
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

router.patch('/api/profile/backup-email', async (req, res) => {
  try {
    const ctx = await requireAuth(req, res);
    if (!ctx) return;

    const parsed = updateBackupEmailSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'Invalid payload.' },
      });
    }

    const loginEmail = `${ctx.user.email ?? ''}`.trim().toLowerCase();
    const backupEmail = parsed.data.backupEmail ? parsed.data.backupEmail.trim().toLowerCase() : null;
    if (backupEmail && backupEmail === loginEmail) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Backup email must be different from your login email.',
        },
      });
    }

    const { data: updated, error } = await supabaseService
      .from('profiles')
      .update({ backup_email: backupEmail })
      .eq('id', ctx.user.id)
      .select('id, email, full_name, avatar, backup_email, job_title, phone, country, gender, bio, created_at, updated_at')
      .single();
    if (error) {
      if (`${error.message}`.includes('backup_email')) {
        return res.status(500).json({
          success: false,
          error: {
            code: 'MISSING_SCHEMA',
            message: 'Missing backup email column. Run backend/sql/026_profile_backup_email.sql.',
          },
        });
      }
      if (error.code === '23505') {
        return res.status(400).json({
          success: false,
          error: {
            code: 'EMAIL_ALREADY_USED',
            message: 'This backup email is already used by another account.',
          },
        });
      }
      return sendDbError(res, error);
    }

    return res.status(200).json({ success: true, profile: mapProfile(updated) });
  } catch (err) {
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

router.post('/api/profile/email/resend-verification', async (req, res) => {
  try {
    const ctx = await requireAuth(req, res);
    if (!ctx) return;

    const parsed = resendVerificationSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'Invalid payload.' },
      });
    }

    const currentEmail = `${ctx.user.email ?? ''}`.trim().toLowerCase();
    const requestedEmail = parsed.data.email.trim().toLowerCase();
    if (!currentEmail || currentEmail !== requestedEmail) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Email must match your current account email.' },
      });
    }

    const { error } = await supabaseAnon.auth.resend({
      type: 'signup',
      email: requestedEmail,
      options: {
        emailRedirectTo: env.FRONTEND_ORIGIN,
      },
    });
    if (error) {
      return res.status(400).json({
        success: false,
        error: { code: 'AUTH_ERROR', message: error.message ?? 'Failed to resend verification email.' },
      });
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

router.patch('/api/profile/email', async (req, res) => {
  try {
    const ctx = await requireAuth(req, res);
    if (!ctx) return;

    const parsed = requestEmailChangeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'Invalid payload.' },
      });
    }

    const currentEmail = `${ctx.user.email ?? ''}`.trim().toLowerCase();
    const nextEmail = parsed.data.newEmail.trim().toLowerCase();
    if (!currentEmail) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Current account email is missing.' },
      });
    }

    if (currentEmail === nextEmail) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'New email must be different from current email.' },
      });
    }

    const { error: verifyError } = await supabaseAnon.auth.signInWithPassword({
      email: currentEmail,
      password: parsed.data.currentPassword,
    });
    if (verifyError) {
      return res.status(401).json({
        success: false,
        error: { code: 'INVALID_CREDENTIALS', message: 'Current password is incorrect.' },
      });
    }

    const { error: updateAuthError } = await supabaseService.auth.admin.updateUserById(ctx.user.id, {
      email: nextEmail,
      email_confirm: false,
    });
    if (updateAuthError) {
      return res.status(400).json({
        success: false,
        error: { code: 'AUTH_ERROR', message: updateAuthError.message ?? 'Failed to request email change.' },
      });
    }

    const { data: updated, error: profileError } = await supabaseService
      .from('profiles')
      .update({ email: nextEmail })
      .eq('id', ctx.user.id)
      .select('id, email, full_name, avatar, job_title, phone, country, gender, bio, created_at, updated_at')
      .single();
    if (profileError) return sendDbError(res, profileError);

    return res.status(200).json({
      success: true,
      profile: mapProfile(updated),
      message: 'Email change requested. Check your inbox to confirm the new email.',
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

router.patch('/api/profile/avatar', async (req, res) => {
  try {
    const ctx = await requireAuth(req, res);
    if (!ctx) return;

    const parsed = uploadAvatarSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'Invalid payload.' },
      });
    }

    const contentType = parsed.data.contentType.toLowerCase();
    if (!allowedAvatarContentTypes.has(contentType)) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Only PNG, JPG, JPEG, and WEBP images are supported.' },
      });
    }

    const base64Payload = extractBase64Payload(parsed.data.dataBase64);
    let imageBuffer;
    try {
      imageBuffer = Buffer.from(base64Payload, 'base64');
    } catch {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid base64 image payload.' },
      });
    }

    if (!imageBuffer || imageBuffer.length < 1) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Image payload is empty.' },
      });
    }

    if (imageBuffer.length > MAX_AVATAR_BYTES) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Avatar size must be 5MB or less.' },
      });
    }

    const safeFileName = sanitizeFileName(parsed.data.fileName) || 'avatar';
    const storagePath = `${ctx.user.id}/${Date.now()}-${safeFileName}`;

    const { data: currentProfile, error: currentProfileError } = await supabaseService
      .from('profiles')
      .select('avatar')
      .eq('id', ctx.user.id)
      .maybeSingle();
    if (currentProfileError) return sendDbError(res, currentProfileError);

    const { error: uploadError } = await supabaseService.storage.from(PROFILE_AVATAR_BUCKET).upload(storagePath, imageBuffer, {
      contentType,
      upsert: true,
      cacheControl: '3600',
    });
    if (uploadError) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'STORAGE_ERROR',
          message: uploadError.message ?? `Failed to upload avatar to storage bucket "${PROFILE_AVATAR_BUCKET}".`,
        },
      });
    }

    const { data: publicData } = supabaseService.storage.from(PROFILE_AVATAR_BUCKET).getPublicUrl(storagePath);
    const avatarUrl = publicData?.publicUrl ?? null;

    const { data: updated, error: updateError } = await supabaseService
      .from('profiles')
      .update({ avatar: avatarUrl })
      .eq('id', ctx.user.id)
      .select('id, email, full_name, avatar, job_title, phone, country, gender, bio, created_at, updated_at')
      .single();
    if (updateError) return sendDbError(res, updateError);

    const oldAvatarPath = extractStoragePathFromPublicUrl(currentProfile?.avatar ?? null);
    if (oldAvatarPath && oldAvatarPath !== storagePath) {
      await tryDeleteAvatar(oldAvatarPath);
    }

    return res.status(200).json({ success: true, profile: mapProfile(updated) });
  } catch (err) {
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

router.delete('/api/profile/avatar', async (req, res) => {
  try {
    const ctx = await requireAuth(req, res);
    if (!ctx) return;

    const { data: currentProfile, error: currentProfileError } = await supabaseService
      .from('profiles')
      .select('avatar')
      .eq('id', ctx.user.id)
      .maybeSingle();
    if (currentProfileError) return sendDbError(res, currentProfileError);

    const oldAvatarPath = extractStoragePathFromPublicUrl(currentProfile?.avatar ?? null);
    await tryDeleteAvatar(oldAvatarPath);

    const { data: updated, error: updateError } = await supabaseService
      .from('profiles')
      .update({ avatar: null })
      .eq('id', ctx.user.id)
      .select('id, email, full_name, avatar, job_title, phone, country, gender, bio, created_at, updated_at')
      .single();
    if (updateError) return sendDbError(res, updateError);

    return res.status(200).json({ success: true, profile: mapProfile(updated) });
  } catch (err) {
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

router.get('/api/profile/sessions', async (req, res) => {
  try {
    const ctx = await requireAuth(req, res);
    if (!ctx) return;

    const [loginResult, auditResult] = await Promise.all([
      supabaseService
        .from('login_activity')
        .select('id, user_id, ip_address, user_agent, success, reason, created_at')
        .eq('user_id', ctx.user.id)
        .order('created_at', { ascending: false })
        .limit(200),
      supabaseService
        .from('audit_logs')
        .select('id, business_id, actor_user_id, action, entity_type, entity_id, metadata, created_at')
        .eq('actor_user_id', ctx.user.id)
        .order('created_at', { ascending: false })
        .limit(120),
    ]);

    if (loginResult.error) return sendDbError(res, loginResult.error);
    if (auditResult.error) return sendDbError(res, auditResult.error);

    const loginEntries = (loginResult.data ?? []).map(mapLoginEvent);
    const auditEntries = (auditResult.data ?? []).map(mapAuditEvent);
    const activity = [...loginEntries, ...auditEntries].sort((a, b) => {
      const da = new Date(a.occurredAt).getTime();
      const db = new Date(b.occurredAt).getTime();
      return db - da;
    });

    const sessions = buildSessions(loginResult.data ?? [], {
      ipAddress: normalizeIp(req),
      userAgent: normalizeUserAgent(req),
    });

    return res.status(200).json({
      success: true,
      sessions,
      summary: {
        total: activity.length,
        loginSuccess: loginEntries.filter((entry) => entry.success).length,
        loginFailed: loginEntries.filter((entry) => !entry.success).length,
        auditActions: auditEntries.length,
      },
      activity,
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

export default router;
