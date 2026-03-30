import { Router } from 'express';
import { supabaseService } from '../config/supabase.js';
import { normalizeSupabaseError } from '../lib/supabaseError.js';

const router = Router();

router.get('/health', (_req, res) => {
  res.status(200).json({ success: true, service: 'backend', status: 'ok' });
});

async function checkTableReady(tableName) {
  const { error } = await supabaseService.from(tableName).select('id').limit(1);
  if (!error) return { table: tableName, ready: true, error: null };
  const normalized = normalizeSupabaseError(error);
  if (normalized?.code === 'SCHEMA_NOT_READY') {
    return { table: tableName, ready: false, error: normalized.message };
  }
  return { table: tableName, ready: false, error: normalized?.message ?? 'Unknown error' };
}

router.get('/health/schema', async (_req, res) => {
  const checks = await Promise.all([
    checkTableReady('notifications'),
    checkTableReady('notification_preferences'),
    checkTableReady('idempotency_keys'),
  ]);
  const missing = checks.filter((item) => !item.ready).map((item) => item.table);
  return res.status(200).json({
    success: true,
    status: missing.length === 0 ? 'ready' : 'partial',
    checks,
    missing,
  });
});

export default router;
