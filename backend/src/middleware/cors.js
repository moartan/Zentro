import { env } from '../config/env.js';

const defaultOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
];

const allowedOrigins = new Set(env.FRONTEND_ORIGIN ? env.FRONTEND_ORIGIN.split(',').map((v) => v.trim()) : defaultOrigins);

export function corsMiddleware(req, res, next) {
  const origin = req.headers.origin;

  if (origin && allowedOrigins.has(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Vary', 'Origin');
    res.header('Access-Control-Allow-Credentials', 'true');
  }

  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Business-Id, X-User-Id, X-Role');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }

  return next();
}

