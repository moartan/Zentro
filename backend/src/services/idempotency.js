import { supabaseService } from '../config/supabase.js';
import { normalizeSupabaseError } from '../lib/supabaseError.js';

function isSchemaNotReadyError(error) {
  const normalized = normalizeSupabaseError(error);
  return normalized?.code === 'SCHEMA_NOT_READY';
}

export async function findIdempotentResponse({ userId, scope, key }) {
  if (!key) return { error: null, result: null };

  const nowIso = new Date().toISOString();
  const { data, error } = await supabaseService
    .from('idempotency_keys')
    .select('status_code, response, expires_at')
    .eq('user_id', userId)
    .eq('scope', scope)
    .eq('key', key)
    .maybeSingle();

  if (error) {
    if (isSchemaNotReadyError(error)) return { error: null, result: null };
    return { error, result: null };
  }

  if (!data) return { error: null, result: null };
  if (data.expires_at && `${data.expires_at}` <= nowIso) return { error: null, result: null };

  return { error: null, result: { statusCode: data.status_code, response: data.response ?? {} } };
}

export async function saveIdempotentResponse({ userId, scope, key, statusCode, response, ttlHours = 24 }) {
  if (!key) return { error: null };

  const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000).toISOString();
  const { error } = await supabaseService.from('idempotency_keys').upsert(
    {
      user_id: userId,
      scope,
      key,
      status_code: statusCode,
      response: response ?? {},
      expires_at: expiresAt,
    },
    { onConflict: 'user_id,scope,key' },
  );

  if (error && isSchemaNotReadyError(error)) return { error: null };
  return { error };
}

export function readIdempotencyKey(req) {
  const value = req.header('Idempotency-Key');
  if (!value) return null;
  const trimmed = `${value}`.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, 120);
}
