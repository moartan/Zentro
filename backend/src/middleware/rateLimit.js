const buckets = new Map();

function nowMs() {
  return Date.now();
}

function buildKey(req, keyFn) {
  if (keyFn) return keyFn(req);
  const forwarded = req.headers['x-forwarded-for'];
  const ip = Array.isArray(forwarded) ? forwarded[0] : typeof forwarded === 'string' ? forwarded.split(',')[0] : req.ip;
  return `${req.method}:${req.path}:${ip ?? 'unknown'}`;
}

export function createRateLimiter({ windowMs, max, keyFn, message }) {
  return (req, res, next) => {
    const key = buildKey(req, keyFn);
    const current = buckets.get(key);
    const now = nowMs();

    if (!current || current.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    if (current.count >= max) {
      const retryAfterSec = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
      res.setHeader('Retry-After', `${retryAfterSec}`);
      return res.status(429).json({
        success: false,
        error: {
          code: 'RATE_LIMITED',
          message: message ?? 'Too many requests. Please try again shortly.',
        },
      });
    }

    current.count += 1;
    return next();
  };
}
