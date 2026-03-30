const DEFAULT_TTL_MS = 30_000;

/**
 * Very small in-process cache to avoid repeated admin users list queries.
 *
 * Notes:
 * - This is per-node-process (not shared across instances).
 * - We clear it on mutations (block/role/delete) and also expire by TTL.
 */
let cache = null;

export function getCachedAdminUsersList() {
  if (!cache) return null;
  if (Date.now() >= cache.expiresAt) {
    cache = null;
    return null;
  }
  return cache.payload;
}

export function setCachedAdminUsersList(payload, ttlMs = DEFAULT_TTL_MS) {
  cache = {
    expiresAt: Date.now() + ttlMs,
    payload,
  };
}

export function clearCachedAdminUsersList() {
  cache = null;
}

