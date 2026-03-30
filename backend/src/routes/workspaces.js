import { Router } from 'express';

import { env } from '../config/env.js';
import { supabaseAnon, supabaseService } from '../config/supabase.js';
import { sendDbError } from '../lib/supabaseError.js';
import { ensureProfile } from '../services/profile.js';
import { resolveSessionFromCookies } from '../services/session.js';
import { getActor } from '../services/actor.js';
import { createNotification, notifySafe } from '../services/notifications.js';
import { slugify, randomSlugSuffix } from '../lib/slug.js';
import {
  archiveWorkspaceSchema,
  createWorkspaceSchema,
  deleteWorkspaceSchema,
  updateWorkspaceSchema,
  uploadWorkspaceLogoSchema,
} from '../validators/workspace.js';

const router = Router();
const MAX_LOGO_BYTES = 5 * 1024 * 1024;
const WORKSPACE_LOGO_BUCKET = env.WORKSPACE_LOGO_BUCKET ?? 'workspace-branding';
const allowedImageTypes = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp']);

function mapWorkspace(row) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    ownerUserId: row.owner_user_id,
    description: row.description ?? null,
    supportEmail: row.support_email ?? null,
    supportPhone: row.support_phone ?? null,
    website: row.website ?? null,
    accentColor: row.accent_color ?? '#0ea5e9',
    logoUrl: row.logo_url ?? null,
    isArchived: Boolean(row.is_archived),
    archivedAt: row.archived_at ?? null,
    subscriptionPlan: row.subscription_plan ?? null,
    subscriptionStatus: row.subscription_status ?? null,
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
  const marker = `/storage/v1/object/public/${WORKSPACE_LOGO_BUCKET}/`;
  const index = url.indexOf(marker);
  if (index === -1) return null;
  return decodeURIComponent(url.slice(index + marker.length));
}

async function tryDeleteLogo(path) {
  if (!path) return;
  try {
    await supabaseService.storage.from(WORKSPACE_LOGO_BUCKET).remove([path]);
  } catch {
    // ignore cleanup errors
  }
}

async function requireOwnerActor(req, res) {
  const actor = await getActor(req, res);
  if (!actor) return null;

  if (actor.role !== 'business_owner') {
    res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Workspace owner only.' } });
    return null;
  }

  return actor;
}

router.post('/api/workspaces', async (req, res) => {
  try {
    const { user } = await resolveSessionFromCookies(req, res);
    if (!user) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Login required.' } });
    }

    await ensureProfile(user);

    const parsed = createWorkspaceSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'Invalid payload' },
      });
    }

    const { data: profile, error: profileError } = await supabaseService
      .from('profiles')
      .select('id, is_platform_super_admin')
      .eq('id', user.id)
      .single();

    if (profileError) return sendDbError(res, profileError);
    if (profile.is_platform_super_admin) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Platform admins do not create workspaces from this flow.' },
      });
    }

    const { data: existingMembership } = await supabaseService
      .from('business_members')
      .select('business_id')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle();

    if (existingMembership?.business_id) {
      return res.status(400).json({
        success: false,
        error: { code: 'WORKSPACE_ALREADY_EXISTS', message: 'This account already has a workspace.' },
      });
    }

    const slugBase = slugify(parsed.data.name) || 'workspace';
    const slug = `${slugBase}-${randomSlugSuffix()}`;

    let createdBusiness = null;
    {
      const nowIso = new Date().toISOString();
      const trialStartedAt = parsed.data.plan === 'free' ? nowIso : null;
      const lastPaymentAt = parsed.data.plan === 'free' ? null : nowIso;
      const { data, error } = await supabaseService
        .from('businesses')
        .insert({
          name: parsed.data.name,
          slug,
          owner_user_id: user.id,
          subscription_plan: parsed.data.plan,
          subscription_status: 'active',
          trial_started_at: trialStartedAt,
          last_payment_at: lastPaymentAt,
          support_email: user.email ?? null,
          accent_color: '#0ea5e9',
        })
        .select('id')
        .single();

      if (!error) {
        createdBusiness = data;
      } else if (
        `${error.message}`.includes('subscription_plan') ||
        `${error.message}`.includes('subscription_status') ||
        `${error.message}`.includes('trial_started_at') ||
        `${error.message}`.includes('last_payment_at') ||
        `${error.message}`.includes('support_email') ||
        `${error.message}`.includes('accent_color')
      ) {
        const { data: fallbackData, error: fallbackError } = await supabaseService
          .from('businesses')
          .insert({
            name: parsed.data.name,
            slug,
            owner_user_id: user.id,
          })
          .select('id')
          .single();

        if (fallbackError) return sendDbError(res, fallbackError);
        createdBusiness = fallbackData;
      } else {
        return sendDbError(res, error);
      }
    }

    const { error: memberInsertError } = await supabaseService.from('business_members').insert({
      business_id: createdBusiness.id,
      user_id: user.id,
      role: 'business_owner',
      status: 'active',
      joined_at: new Date().toISOString(),
    });
    if (memberInsertError) return sendDbError(res, memberInsertError);

    void notifySafe(
      createNotification({
        recipientUserId: user.id,
        businessId: createdBusiness.id,
        actorUserId: user.id,
        type: 'workspace_created',
        title: 'Workspace created',
        message: `${parsed.data.name} is ready.`,
        priority: 'general',
        entityType: 'workspace',
        entityId: createdBusiness.id,
      }),
      'workspace_created',
    );

    return res.status(201).json({
      success: true,
      workspace: { businessId: createdBusiness.id, name: parsed.data.name, plan: parsed.data.plan },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

router.get('/api/workspace', async (req, res) => {
  try {
    const actor = await requireOwnerActor(req, res);
    if (!actor) return;

    let { data, error } = await supabaseService
      .from('businesses')
      .select(
        'id, name, slug, owner_user_id, description, support_email, support_phone, website, accent_color, logo_url, subscription_plan, subscription_status, created_at, updated_at'
      )
      .eq('id', actor.businessId)
      .maybeSingle();

    if (error) {
      if (
        `${error.message}`.includes('description') ||
        `${error.message}`.includes('support_email') ||
        `${error.message}`.includes('logo_url')
      ) {
        const { data: fallback, error: fallbackError } = await supabaseService
          .from('businesses')
          .select('id, name, slug, owner_user_id, subscription_plan, subscription_status, created_at, updated_at')
          .eq('id', actor.businessId)
          .maybeSingle();
        if (fallbackError) return sendDbError(res, fallbackError);
        data = {
          ...fallback,
          description: null,
          support_email: null,
          support_phone: null,
          website: null,
          accent_color: '#0ea5e9',
          logo_url: null,
        };
      } else {
        return sendDbError(res, error);
      }
    }

    if (!data) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Workspace not found.' } });
    }

    return res.status(200).json({ success: true, workspace: mapWorkspace(data) });
  } catch (err) {
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

router.patch('/api/workspace', async (req, res) => {
  try {
    const actor = await requireOwnerActor(req, res);
    if (!actor) return;

    const parsed = updateWorkspaceSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'Invalid payload.' },
      });
    }

    const payload = {};
    if (typeof parsed.data.name !== 'undefined') payload.name = parsed.data.name;
    if (typeof parsed.data.slug !== 'undefined') payload.slug = parsed.data.slug;
    if (typeof parsed.data.description !== 'undefined') payload.description = parsed.data.description;
    if (typeof parsed.data.supportEmail !== 'undefined') payload.support_email = parsed.data.supportEmail;
    if (typeof parsed.data.supportPhone !== 'undefined') payload.support_phone = parsed.data.supportPhone;
    if (typeof parsed.data.website !== 'undefined') payload.website = parsed.data.website;
    if (typeof parsed.data.accentColor !== 'undefined') payload.accent_color = parsed.data.accentColor;

    let { data, error } = await supabaseService
      .from('businesses')
      .update(payload)
      .eq('id', actor.businessId)
      .eq('owner_user_id', actor.userId)
      .select(
        'id, name, slug, owner_user_id, description, support_email, support_phone, website, accent_color, logo_url, subscription_plan, subscription_status, created_at, updated_at'
      )
      .single();

    if (error) {
      if (error.code === '23505') {
        return res.status(400).json({
          success: false,
          error: { code: 'SLUG_ALREADY_EXISTS', message: 'Workspace slug already exists. Try another one.' },
        });
      }

      if (
        `${error.message}`.includes('description') ||
        `${error.message}`.includes('support_email') ||
        `${error.message}`.includes('logo_url')
      ) {
        const fallbackPayload = {};
        if (typeof payload.name !== 'undefined') fallbackPayload.name = payload.name;
        if (typeof payload.slug !== 'undefined') fallbackPayload.slug = payload.slug;

        const { data: fallbackData, error: fallbackError } = await supabaseService
          .from('businesses')
          .update(fallbackPayload)
          .eq('id', actor.businessId)
          .eq('owner_user_id', actor.userId)
          .select('id, name, slug, owner_user_id, subscription_plan, subscription_status, created_at, updated_at')
          .single();
        if (fallbackError) return sendDbError(res, fallbackError);
        data = {
          ...fallbackData,
          description: null,
          support_email: null,
          support_phone: null,
          website: null,
          accent_color: '#0ea5e9',
          logo_url: null,
        };
      } else {
        return sendDbError(res, error);
      }
    }

    return res.status(200).json({ success: true, workspace: mapWorkspace(data) });
  } catch (err) {
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

router.patch('/api/workspace/logo', async (req, res) => {
  try {
    const actor = await requireOwnerActor(req, res);
    if (!actor) return;

    const parsed = uploadWorkspaceLogoSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'Invalid payload.' },
      });
    }

    const contentType = parsed.data.contentType.toLowerCase();
    if (!allowedImageTypes.has(contentType)) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Only PNG, JPG, JPEG, and WEBP images are supported.' },
      });
    }

    const base64Payload = extractBase64Payload(parsed.data.dataBase64);
    let fileBuffer;
    try {
      fileBuffer = Buffer.from(base64Payload, 'base64');
    } catch {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid base64 image payload.' },
      });
    }

    if (!fileBuffer || fileBuffer.length < 1) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Image payload is empty.' },
      });
    }

    if (fileBuffer.length > MAX_LOGO_BYTES) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Logo size must be 5MB or less.' },
      });
    }

    const { data: currentWorkspace, error: currentWorkspaceError } = await supabaseService
      .from('businesses')
      .select('logo_url')
      .eq('id', actor.businessId)
      .eq('owner_user_id', actor.userId)
      .single();
    if (currentWorkspaceError) return sendDbError(res, currentWorkspaceError);

    const safeFileName = sanitizeFileName(parsed.data.fileName) || 'logo';
    const storagePath = `${actor.businessId}/${Date.now()}-${safeFileName}`;

    const { error: uploadError } = await supabaseService.storage.from(WORKSPACE_LOGO_BUCKET).upload(storagePath, fileBuffer, {
      contentType,
      upsert: true,
      cacheControl: '3600',
    });
    if (uploadError) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'STORAGE_ERROR',
          message: uploadError.message ?? `Failed to upload logo to storage bucket "${WORKSPACE_LOGO_BUCKET}".`,
        },
      });
    }

    const { data: publicData } = supabaseService.storage.from(WORKSPACE_LOGO_BUCKET).getPublicUrl(storagePath);
    const logoUrl = publicData?.publicUrl ?? null;

    const { data: updated, error: updateError } = await supabaseService
      .from('businesses')
      .update({ logo_url: logoUrl })
      .eq('id', actor.businessId)
      .eq('owner_user_id', actor.userId)
      .select(
        'id, name, slug, owner_user_id, description, support_email, support_phone, website, accent_color, logo_url, subscription_plan, subscription_status, created_at, updated_at'
      )
      .single();
    if (updateError) return sendDbError(res, updateError);

    const oldPath = extractStoragePathFromPublicUrl(currentWorkspace?.logo_url ?? null);
    if (oldPath && oldPath !== storagePath) {
      await tryDeleteLogo(oldPath);
    }

    return res.status(200).json({ success: true, workspace: mapWorkspace(updated) });
  } catch (err) {
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

router.delete('/api/workspace/logo', async (req, res) => {
  try {
    const actor = await requireOwnerActor(req, res);
    if (!actor) return;

    const { data: currentWorkspace, error: currentWorkspaceError } = await supabaseService
      .from('businesses')
      .select('logo_url')
      .eq('id', actor.businessId)
      .eq('owner_user_id', actor.userId)
      .single();
    if (currentWorkspaceError) return sendDbError(res, currentWorkspaceError);

    const oldPath = extractStoragePathFromPublicUrl(currentWorkspace?.logo_url ?? null);
    await tryDeleteLogo(oldPath);

    const { data: updated, error: updateError } = await supabaseService
      .from('businesses')
      .update({ logo_url: null })
      .eq('id', actor.businessId)
      .eq('owner_user_id', actor.userId)
      .select(
        'id, name, slug, owner_user_id, description, support_email, support_phone, website, accent_color, logo_url, subscription_plan, subscription_status, created_at, updated_at'
      )
      .single();
    if (updateError) return sendDbError(res, updateError);

    return res.status(200).json({ success: true, workspace: mapWorkspace(updated) });
  } catch (err) {
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

router.patch('/api/workspace/archive', async (req, res) => {
  try {
    const actor = await requireOwnerActor(req, res);
    if (!actor) return;

    const parsed = archiveWorkspaceSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'Invalid payload.' },
      });
    }

    const { data: existing, error: existingError } = await supabaseService
      .from('businesses')
      .select('id, name, slug, is_archived')
      .eq('id', actor.businessId)
      .eq('owner_user_id', actor.userId)
      .single();
    if (existingError) {
      if (`${existingError.message}`.includes('is_archived')) {
        return res.status(500).json({
          success: false,
          error: { code: 'MISSING_SCHEMA', message: 'Run backend/sql/025_workspace_lifecycle.sql first.' },
        });
      }
      return sendDbError(res, existingError);
    }

    const expectedConfirmation = (existing.slug ?? existing.name ?? '').trim().toLowerCase();
    const providedConfirmation = parsed.data.confirmation.trim().toLowerCase();
    if (!expectedConfirmation || expectedConfirmation !== providedConfirmation) {
      return res.status(400).json({
        success: false,
        error: { code: 'CONFIRMATION_MISMATCH', message: 'Confirmation text does not match workspace slug.' },
      });
    }

    const payload = {
      is_archived: parsed.data.archive,
      archived_at: parsed.data.archive ? new Date().toISOString() : null,
    };

    let { data: updated, error: updateError } = await supabaseService
      .from('businesses')
      .update(payload)
      .eq('id', actor.businessId)
      .eq('owner_user_id', actor.userId)
      .select(
        'id, name, slug, owner_user_id, description, support_email, support_phone, website, accent_color, logo_url, is_archived, archived_at, subscription_plan, subscription_status, created_at, updated_at'
      )
      .single();
    if (updateError) {
      if (`${updateError.message}`.includes('is_archived')) {
        return res.status(500).json({
          success: false,
          error: { code: 'MISSING_SCHEMA', message: 'Run backend/sql/025_workspace_lifecycle.sql first.' },
        });
      }
      return sendDbError(res, updateError);
    }

    return res.status(200).json({ success: true, workspace: mapWorkspace(updated) });
  } catch (err) {
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

router.delete('/api/workspace', async (req, res) => {
  try {
    const actor = await requireOwnerActor(req, res);
    if (!actor) return;

    const parsed = deleteWorkspaceSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'Invalid payload.' },
      });
    }

    const { data: profile, error: profileError } = await supabaseService
      .from('profiles')
      .select('email')
      .eq('id', actor.userId)
      .maybeSingle();
    if (profileError) return sendDbError(res, profileError);
    if (!profile?.email) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Owner email is missing for password verification.' },
      });
    }

    const { error: verifyError } = await supabaseAnon.auth.signInWithPassword({
      email: profile.email,
      password: parsed.data.currentPassword,
    });
    if (verifyError) {
      return res.status(401).json({
        success: false,
        error: { code: 'INVALID_CREDENTIALS', message: 'Current password is incorrect.' },
      });
    }

    const { data: existing, error: existingError } = await supabaseService
      .from('businesses')
      .select('id, name, slug, logo_url')
      .eq('id', actor.businessId)
      .eq('owner_user_id', actor.userId)
      .single();
    if (existingError) return sendDbError(res, existingError);

    const expectedConfirmation = (existing.slug ?? existing.name ?? '').trim().toLowerCase();
    const providedConfirmation = parsed.data.confirmation.trim().toLowerCase();
    if (!expectedConfirmation || expectedConfirmation !== providedConfirmation) {
      return res.status(400).json({
        success: false,
        error: { code: 'CONFIRMATION_MISMATCH', message: 'Confirmation text does not match workspace slug.' },
      });
    }

    const oldLogoPath = extractStoragePathFromPublicUrl(existing.logo_url ?? null);
    await tryDeleteLogo(oldLogoPath);

    const { error: deleteError } = await supabaseService
      .from('businesses')
      .delete()
      .eq('id', actor.businessId)
      .eq('owner_user_id', actor.userId);
    if (deleteError) return sendDbError(res, deleteError);

    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

export default router;
