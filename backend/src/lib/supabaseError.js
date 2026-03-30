export function normalizeSupabaseError(error) {
  if (!error) return null;

  if (error.code === 'PGRST205' || `${error.message}`.includes('Could not find the table')) {
    return {
      code: 'SCHEMA_NOT_READY',
      message: 'Schema is missing required tables. Run backend/sql/README.md migrations in order.',
    };
  }

  return {
    code: error.code ?? 'DATABASE_ERROR',
    message: error.message ?? 'Database operation failed',
  };
}

export function sendDbError(res, error, statusCode = 500) {
  const normalized = normalizeSupabaseError(error);
  return res.status(statusCode).json({ success: false, error: normalized });
}

