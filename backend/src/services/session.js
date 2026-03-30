import { supabaseAnon, supabaseService } from '../config/supabase.js';
import { ACCESS_COOKIE, REFRESH_COOKIE, clearSessionCookies, setSessionCookies } from '../lib/cookies.js';
import { env } from '../config/env.js';

const isProd = env.NODE_ENV === 'production';

export async function resolveSessionFromCookies(req, res) {
  const accessToken = req.cookies?.[ACCESS_COOKIE];
  const refreshToken = req.cookies?.[REFRESH_COOKIE];

  if (!accessToken && !refreshToken) {
    return { session: null, user: null };
  }

  if (accessToken) {
    const { data, error } = await supabaseService.auth.getUser(accessToken);
    if (!error && data.user) {
      return {
        session: { access_token: accessToken, refresh_token: refreshToken ?? null },
        user: data.user,
      };
    }
  }

  if (refreshToken) {
    const { data, error } = await supabaseAnon.auth.refreshSession({ refresh_token: refreshToken });
    if (!error && data.session?.access_token) {
      setSessionCookies(res, data.session, isProd);
      const { data: refreshedUser } = await supabaseService.auth.getUser(data.session.access_token);
      return { session: data.session, user: refreshedUser.user ?? null };
    }
  }

  clearSessionCookies(res);
  return { session: null, user: null };
}

