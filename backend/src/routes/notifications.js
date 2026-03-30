import { Router } from 'express';
import { z } from 'zod';

import { normalizeSupabaseError, sendDbError } from '../lib/supabaseError.js';
import { getActor } from '../services/actor.js';
import {
  countUnreadNotificationsForUser,
  getNotificationPreferences,
  listNotificationsForUser,
  markAllNotificationsRead,
  markNotificationRead,
  upsertNotificationPreferences,
} from '../services/notifications.js';

const router = Router();

function isSchemaNotReadyError(error) {
  const normalized = normalizeSupabaseError(error);
  return normalized?.code === 'SCHEMA_NOT_READY';
}

router.get('/api/notifications', async (req, res) => {
  try {
    const actor = await getActor(req, res);
    if (!actor) return;

    const limitParsed = z.coerce.number().int().min(1).max(50).optional().safeParse(req.query.limit);
    const limit = limitParsed.success ? limitParsed.data ?? 20 : 20;

    const [{ error: listError, notifications }, { error: countError, unreadCount }] = await Promise.all([
      listNotificationsForUser({
        userId: actor.userId,
        businessId: actor.businessId ?? null,
        limit,
      }),
      countUnreadNotificationsForUser({
        userId: actor.userId,
        businessId: actor.businessId ?? null,
      }),
    ]);

    if (listError || countError) {
      const schemaNotReady = isSchemaNotReadyError(listError) || isSchemaNotReadyError(countError);
      if (schemaNotReady) {
        return res.status(200).json({ success: true, notifications: [], unreadCount: 0 });
      }
      if (listError) return sendDbError(res, listError);
      return sendDbError(res, countError);
    }

    return res.status(200).json({
      success: true,
      notifications,
      unreadCount,
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

router.patch('/api/notifications/:id/read', async (req, res) => {
  try {
    const actor = await getActor(req, res);
    if (!actor) return;

    const parsedId = z.string().uuid().safeParse(req.params.id);
    if (!parsedId.success) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid notification id.' },
      });
    }

    const { error } = await markNotificationRead({ notificationId: parsedId.data, userId: actor.userId });
    if (error) {
      if (isSchemaNotReadyError(error)) return res.status(200).json({ success: true });
      return sendDbError(res, error);
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

router.patch('/api/notifications/read-all', async (req, res) => {
  try {
    const actor = await getActor(req, res);
    if (!actor) return;

    const { error } = await markAllNotificationsRead({
      userId: actor.userId,
      businessId: actor.businessId ?? null,
    });
    if (error) {
      if (isSchemaNotReadyError(error)) return res.status(200).json({ success: true });
      return sendDbError(res, error);
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

router.get('/api/notifications/preferences', async (req, res) => {
  try {
    const actor = await getActor(req, res);
    if (!actor) return;

    const { error, preferences } = await getNotificationPreferences(actor.userId);
    if (error) return sendDbError(res, error);
    return res.status(200).json({ success: true, preferences });
  } catch (err) {
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

const preferencesSchema = z.object({
  inAppEnabled: z.boolean().optional(),
  emailEnabled: z.boolean().optional(),
  urgentOnlyEmail: z.boolean().optional(),
});

router.patch('/api/notifications/preferences', async (req, res) => {
  try {
    const actor = await getActor(req, res);
    if (!actor) return;

    const parsed = preferencesSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'Invalid payload.' },
      });
    }

    const { error: currentError, preferences: current } = await getNotificationPreferences(actor.userId);
    if (currentError) return sendDbError(res, currentError);

    const next = {
      inAppEnabled: typeof parsed.data.inAppEnabled === 'boolean' ? parsed.data.inAppEnabled : current.inAppEnabled,
      emailEnabled: typeof parsed.data.emailEnabled === 'boolean' ? parsed.data.emailEnabled : current.emailEnabled,
      urgentOnlyEmail:
        typeof parsed.data.urgentOnlyEmail === 'boolean' ? parsed.data.urgentOnlyEmail : current.urgentOnlyEmail,
    };

    const { error } = await upsertNotificationPreferences(actor.userId, next);
    if (error) return sendDbError(res, error);
    return res.status(200).json({ success: true, preferences: next });
  } catch (err) {
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

export default router;
