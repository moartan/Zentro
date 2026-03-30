export const ACCESS_COOKIE = 'zentro_at';
export const REFRESH_COOKIE = 'zentro_rt';

export function buildCookieOptions(isProd, maxAgeMs) {
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    path: '/',
    maxAge: maxAgeMs,
  };
}

export function setSessionCookies(res, session, isProd) {
  if (!session?.access_token || !session?.refresh_token) return;

  const accessMaxAgeMs = (session.expires_in ?? 3600) * 1000;
  const refreshMaxAgeMs = 30 * 24 * 60 * 60 * 1000;

  res.cookie(ACCESS_COOKIE, session.access_token, buildCookieOptions(isProd, accessMaxAgeMs));
  res.cookie(REFRESH_COOKIE, session.refresh_token, buildCookieOptions(isProd, refreshMaxAgeMs));
}

export function clearSessionCookies(res) {
  res.clearCookie(ACCESS_COOKIE, { path: '/' });
  res.clearCookie(REFRESH_COOKIE, { path: '/' });
}
