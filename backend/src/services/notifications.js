import { supabaseService } from '../config/supabase.js';
import { normalizeSupabaseError } from '../lib/supabaseError.js';

const PRIORITIES = new Set(['urgent', 'high', 'medium', 'general']);

function normalizePriority(value) {
  if (!value || !PRIORITIES.has(value)) return 'general';
  return value;
}

export function mapNotification(row) {
  return {
    id: row.id,
    businessId: row.business_id ?? null,
    recipientUserId: row.recipient_user_id,
    actorUserId: row.actor_user_id ?? null,
    type: row.type,
    title: row.title,
    message: row.message ?? null,
    priority: normalizePriority(row.priority),
    entityType: row.entity_type ?? null,
    entityId: row.entity_id ?? null,
    metadata: row.metadata ?? {},
    isRead: Boolean(row.is_read),
    readAt: row.read_at ?? null,
    createdAt: row.created_at,
  };
}

function normalizeRecipients(recipientUserIds) {
  return [...new Set((recipientUserIds ?? []).filter((id) => typeof id === 'string' && id.length > 0))];
}

export async function createNotifications({
  recipientUserIds,
  businessId = null,
  actorUserId = null,
  type,
  title,
  message = null,
  priority = 'general',
  entityType = null,
  entityId = null,
  metadata = {},
}) {
  const recipients = normalizeRecipients(recipientUserIds);
  if (recipients.length === 0) return { error: null };

  const { data: prefRows, error: prefError } = await supabaseService
    .from('notification_preferences')
    .select('user_id, in_app_enabled')
    .in('user_id', recipients);
  if (prefError && !isSchemaNotReadyError(prefError)) {
    return { error: prefError };
  }

  const inAppDisabled = new Set(
    (prefRows ?? []).filter((row) => row.in_app_enabled === false).map((row) => row.user_id),
  );
  const filteredRecipients = recipients.filter((id) => !inAppDisabled.has(id));
  if (filteredRecipients.length === 0) return { error: null };

  const rows = filteredRecipients.map((recipientUserId) => ({
    business_id: businessId,
    recipient_user_id: recipientUserId,
    actor_user_id: actorUserId,
    type,
    title,
    message,
    priority: normalizePriority(priority),
    entity_type: entityType,
    entity_id: entityId,
    metadata: metadata ?? {},
  }));

  const { error } = await supabaseService.from('notifications').insert(rows);
  if (error && isSchemaNotReadyError(error)) return { error: null };
  return { error };
}

export async function createNotification(payload) {
  return createNotifications({
    ...payload,
    recipientUserIds: [payload.recipientUserId],
  });
}

export async function listNotificationsForUser({ userId, businessId = null, limit = 20 }) {
  const cappedLimit = Math.max(1, Math.min(limit, 50));
  let query = supabaseService
    .from('notifications')
    .select(
      'id, business_id, recipient_user_id, actor_user_id, type, title, message, priority, entity_type, entity_id, metadata, is_read, read_at, created_at',
    )
    .eq('recipient_user_id', userId)
    .order('created_at', { ascending: false })
    .limit(cappedLimit);

  if (businessId) {
    query = query.or(`business_id.is.null,business_id.eq.${businessId}`);
  } else {
    query = query.is('business_id', null);
  }

  const { data, error } = await query;
  if (error) return { error, notifications: [] };
  return { error: null, notifications: (data ?? []).map(mapNotification) };
}

export async function countUnreadNotificationsForUser({ userId, businessId = null }) {
  let query = supabaseService
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('recipient_user_id', userId)
    .eq('is_read', false);

  if (businessId) {
    query = query.or(`business_id.is.null,business_id.eq.${businessId}`);
  } else {
    query = query.is('business_id', null);
  }

  const { count, error } = await query;
  if (error) return { error, unreadCount: 0 };
  return { error: null, unreadCount: count ?? 0 };
}

export async function markNotificationRead({ notificationId, userId }) {
  const { error } = await supabaseService
    .from('notifications')
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq('id', notificationId)
    .eq('recipient_user_id', userId);

  return { error };
}

export async function markAllNotificationsRead({ userId, businessId = null }) {
  let query = supabaseService
    .from('notifications')
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq('recipient_user_id', userId)
    .eq('is_read', false);

  if (businessId) {
    query = query.or(`business_id.is.null,business_id.eq.${businessId}`);
  } else {
    query = query.is('business_id', null);
  }

  const { error } = await query;
  return { error };
}

export async function getWorkspaceOwnerUserId(businessId) {
  const { data, error } = await supabaseService
    .from('businesses')
    .select('owner_user_id')
    .eq('id', businessId)
    .maybeSingle();
  if (error) return { error, ownerUserId: null };
  return { error: null, ownerUserId: data?.owner_user_id ?? null };
}

export async function getTeamMemberUserIds(teamId) {
  const { data, error } = await supabaseService.from('team_members').select('user_id').eq('team_id', teamId);
  if (error) return { error, userIds: [] };
  return { error: null, userIds: normalizeRecipients((data ?? []).map((row) => row.user_id)) };
}

export async function getUserIdByEmail(email) {
  if (!email) return { error: null, userId: null };
  const { data, error } = await supabaseService.from('profiles').select('id').ilike('email', email).maybeSingle();
  if (error) return { error, userId: null };
  return { error: null, userId: data?.id ?? null };
}

export async function notifySafe(promise, label) {
  try {
    const { error } = await promise;
    if (error) console.error(`notification_failed:${label}`, error);
  } catch (err) {
    console.error(`notification_exception:${label}`, err);
  }
}

function isSchemaNotReadyError(error) {
  const normalized = normalizeSupabaseError(error);
  if (normalized?.code === 'SCHEMA_NOT_READY') return true;
  if (error?.code === 'TABLE_NOT_FOUND') return true;
  const message = `${error?.message ?? ''}`.toLowerCase();
  return message.includes('unknown table') || message.includes('could not find the table');
}

const defaultPreferences = {
  inAppEnabled: true,
  emailEnabled: true,
  urgentOnlyEmail: false,
};

export async function getNotificationPreferences(userId) {
  const { data, error } = await supabaseService
    .from('notification_preferences')
    .select('in_app_enabled, email_enabled, urgent_only_email')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    if (isSchemaNotReadyError(error)) return { error: null, preferences: defaultPreferences };
    return { error, preferences: defaultPreferences };
  }

  if (!data) return { error: null, preferences: defaultPreferences };
  return {
    error: null,
    preferences: {
      inAppEnabled: Boolean(data.in_app_enabled),
      emailEnabled: Boolean(data.email_enabled),
      urgentOnlyEmail: Boolean(data.urgent_only_email),
    },
  };
}

export async function upsertNotificationPreferences(userId, preferences) {
  const { error } = await supabaseService.from('notification_preferences').upsert({
    user_id: userId,
    in_app_enabled: preferences.inAppEnabled,
    email_enabled: preferences.emailEnabled,
    urgent_only_email: preferences.urgentOnlyEmail,
    updated_at: new Date().toISOString(),
  });

  if (error && isSchemaNotReadyError(error)) return { error: null };
  return { error };
}
