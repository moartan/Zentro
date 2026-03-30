import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { API_BASE_URL } from './api/config';
import { setActorBusinessId } from './auth/actorContext';

type Props = {
  children: ReactNode;
};

type AuthMembership = {
  businessId: string;
  role: 'business_owner' | 'employee';
  status: 'active' | 'invited' | 'block';
  businessName: string | null;
  businessSlug: string | null;
  subscriptionPlan: 'free' | 'pro' | 'enterprise' | null;
  subscriptionStatus: 'active' | 'past_due' | 'canceled' | null;
};

type AuthUser = {
  id: string;
  email: string | null;
  fullName: string | null;
  role: 'super_admin' | 'business_owner' | 'employee' | null;
  businessId: string | null;
  isPlatformSuperAdmin: boolean;
  memberships: AuthMembership[];
};

type AuthSessionUser = Omit<AuthUser, 'memberships'> & {
  memberships?: AuthMembership[];
};

type AppContextValue = {
  user: AuthUser | null;
  activeBusinessId: string | null;
  isAuthLoading: boolean;
  setActiveBusinessId: (businessId: string | null) => void;
  refreshSession: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, fullName?: string) => Promise<{ requiresEmailConfirmation: boolean }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
};

const APP_AUTH_CACHE_KEY = 'zentro.auth.bootstrap.v1';

const AppContext = createContext<AppContextValue | undefined>(undefined);

function readAuthCache(): AuthUser | null {
  try {
    const raw = sessionStorage.getItem(APP_AUTH_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AuthUser;
    if (!parsed?.id) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeAuthCache(user: AuthUser | null) {
  try {
    if (!user) {
      sessionStorage.removeItem(APP_AUTH_CACHE_KEY);
      return;
    }
    sessionStorage.setItem(APP_AUTH_CACHE_KEY, JSON.stringify(user));
  } catch {
    // ignore storage failures (quota/private mode)
  }
}

function normalizeAuthUser(user: AuthSessionUser, membershipsFromDetails?: AuthMembership[]): AuthUser {
  const memberships = membershipsFromDetails ?? user.memberships ?? [];
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    businessId: user.businessId,
    isPlatformSuperAdmin: user.isPlatformSuperAdmin,
    memberships,
  };
}

async function fetchSessionBootstrap(): Promise<AuthSessionUser | null> {
  const response = await fetch(`${API_BASE_URL}/auth/session`, {
    method: 'GET',
    credentials: 'include',
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.error?.message ?? 'Failed to fetch session');
  }

  return (payload?.user ?? null) as AuthSessionUser | null;
}

async function fetchSessionDetails(): Promise<AuthMembership[]> {
  const response = await fetch(`${API_BASE_URL}/auth/session-details`, {
    method: 'GET',
    credentials: 'include',
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.error?.message ?? 'Failed to fetch session details');
  }

  return (payload?.memberships ?? []) as AuthMembership[];
}

export default function AppProvider({ children }: Props) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [activeBusinessId, setActiveBusinessIdState] = useState<string | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  function setActiveBusinessId(businessId: string | null) {
    setActiveBusinessIdState(businessId);
    setActorBusinessId(businessId);
  }

  function applyAuthUser(nextUser: AuthUser | null) {
    setUser(nextUser);
    setActiveBusinessId(nextUser?.businessId ?? null);
    writeAuthCache(nextUser);
  }

  async function fetchSession(opts?: { deferDetails?: boolean }) {
    const baseUser = await fetchSessionBootstrap();

    if (!baseUser) {
      applyAuthUser(null);
      return;
    }

    const bootstrapUser = normalizeAuthUser(baseUser, baseUser.memberships ?? []);
    applyAuthUser(bootstrapUser);

    if (opts?.deferDetails) {
      fetchSessionDetails()
        .then((memberships) => {
          const hydratedUser = normalizeAuthUser(baseUser, memberships);
          applyAuthUser(hydratedUser);
        })
        .catch(() => {
          // Keep bootstrap state if details hydration fails.
        });
      return;
    }

    let memberships: AuthMembership[] | undefined;
    try {
      memberships = await fetchSessionDetails();
    } catch {
      // Keep app usable even if non-critical details fail.
      memberships = baseUser.memberships ?? [];
    }

    const nextUser = normalizeAuthUser(baseUser, memberships);
    applyAuthUser(nextUser);
  }

  useEffect(() => {
    const cached = readAuthCache();
    if (cached) {
      applyAuthUser(cached);
      setIsAuthLoading(false);
    }

    fetchSession({ deferDetails: true })
      .catch(() => {
        if (!cached) {
          applyAuthUser(null);
        }
      })
      .finally(() => {
        if (!cached) {
          setIsAuthLoading(false);
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function signIn(email: string, password: string) {
    const response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload?.error?.message ?? 'Login failed');
    }

    await fetchSession();
  }

  async function signUp(email: string, password: string, fullName?: string) {
    const response = await fetch(`${API_BASE_URL}/auth/signup`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, fullName }),
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload?.error?.message ?? 'Sign up failed');
    }

    if (payload.requiresEmailConfirmation) {
      applyAuthUser(null);
    } else {
      await fetchSession();
    }

    return {
      requiresEmailConfirmation: Boolean(payload.requiresEmailConfirmation),
    };
  }

  async function signOut() {
    const response = await fetch(`${API_BASE_URL}/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error('Sign out failed');
    }

    applyAuthUser(null);
  }

  async function resetPassword(email: string) {
    const response = await fetch(`${API_BASE_URL}/auth/reset-password`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload?.error?.message ?? 'Reset password failed');
    }
  }

  const value = useMemo(
    () => ({
      user,
      activeBusinessId,
      isAuthLoading,
      setActiveBusinessId,
      refreshSession: fetchSession,
      signIn,
      signUp,
      signOut,
      resetPassword,
    }),
    [user, activeBusinessId, isAuthLoading]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within AppProvider');
  }
  return context;
}
