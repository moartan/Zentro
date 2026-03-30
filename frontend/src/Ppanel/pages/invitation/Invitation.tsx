import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { useApp } from '../../../shared/AppProvider';
import zentroLogo from '../../../assets/zentro.png';
import {
  acceptInvitationWithProfile,
  acceptInvitationWithSignup,
  resolveInvitation,
  type ResolvedInvitation,
} from '../../../shared/api/invitations';

function formatDate(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
  }).format(d);
}

export default function InvitationPage() {
  const { user, refreshSession } = useApp();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const [isLoading, setIsLoading] = useState(true);
  const [isAccepting, setIsAccepting] = useState(false);
  const [invitation, setInvitation] = useState<ResolvedInvitation | null>(null);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setIsLoading(false);
      setErrorMessage('Missing invitation token.');
      return;
    }

    let alive = true;
    setIsLoading(true);
    setErrorMessage(null);

    resolveInvitation(token)
      .then((res) => {
        if (!alive) return;
        setInvitation(res.invitation);
        setName(res.invitation.name ?? '');
      })
      .catch((err) => {
        if (!alive) return;
        setErrorMessage(err instanceof Error ? err.message : 'Failed to resolve invitation');
      })
      .finally(() => {
        if (!alive) return;
        setIsLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [token]);

  const emailMismatch = useMemo(() => {
    if (!user?.email || !invitation?.email) return false;
    return user.email.toLowerCase() !== invitation.email.toLowerCase();
  }, [invitation?.email, user?.email]);

  async function handleAccept() {
    if (!token) return;

    setIsAccepting(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      await acceptInvitationWithProfile({ token, name });
      await refreshSession();
      setSuccessMessage('Invitation accepted. You can now open your workspace dashboard.');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to accept invitation');
    } finally {
      setIsAccepting(false);
    }
  }

  async function handleSignupAndAccept() {
    if (!token) return;
    if (!password || password.length < 6) {
      setErrorMessage('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setErrorMessage('Password and confirm password do not match.');
      return;
    }

    setIsAccepting(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      await acceptInvitationWithSignup({ token, password, name });
      await refreshSession();
      setSuccessMessage('Account created and invitation accepted. You can now open your workspace dashboard.');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to sign up and accept invitation');
    } finally {
      setIsAccepting(false);
    }
  }

  return (
    <section className="mx-auto max-w-6xl px-4 pb-10 pt-8 md:px-6 md:pt-12">
      <div className="overflow-hidden rounded-2xl border border-border bg-background shadow-sm">
        {isLoading && <p className="p-6 text-sm text-muted-foreground">Loading invitation...</p>}

        {!isLoading && errorMessage && (
          <div className="m-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
            {errorMessage}
          </div>
        )}

        {!isLoading && invitation && (
          <div className="grid min-h-[680px] lg:grid-cols-[1.05fr_1fr]">
            <aside className="relative overflow-hidden bg-sky-500 p-8 text-white md:p-10">
              <div className="absolute -left-14 -top-14 h-56 w-56 rounded-full bg-sky-400/45" />
              <div className="absolute -bottom-20 -right-16 h-72 w-72 rounded-full bg-sky-400/45" />
              <div className="absolute left-8 top-44 h-56 w-56 rotate-12 rounded-[36px] border border-sky-300/60 bg-sky-400/30" />

              <div className="relative z-10 flex h-full flex-col justify-between">
                <div>
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl bg-white/90 p-1">
                      <img src={zentroLogo} alt="Zentro" className="h-full w-full object-contain" />
                    </div>
                    <div>
                      <div className="text-lg font-bold tracking-wide">Zentro</div>
                      <div className="text-xs uppercase tracking-[0.2em] text-sky-100">Workspace</div>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-sky-200/50 bg-sky-600/55 p-6 backdrop-blur-sm">
                  <p className="text-sm font-medium text-sky-50/95">You have been invited to this company</p>
                  <h2 className="mt-2 text-3xl font-extrabold leading-tight">{invitation.businessName ?? 'Workspace'}</h2>
                  <p className="mt-3 text-sm text-sky-100">
                    Invited by {invitation.invitedByName ?? invitation.invitedByEmail ?? '-'}.
                    <br />
                    Expires on {formatDate(invitation.expiresAt)}.
                  </p>
                </div>
              </div>
            </aside>

            <main className="p-8 md:p-10">
              <h1 className="text-3xl font-semibold text-foreground">Complete your account</h1>
              <p className="mt-2 text-sm text-muted-foreground">Set your details and join the workspace.</p>

              {user && emailMismatch && (
                <div className="mt-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  You are logged in as <span className="font-semibold">{user.email}</span>, but this invite is for{' '}
                  <span className="font-semibold">{invitation.email}</span>.
                </div>
              )}

              {successMessage && (
                <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                  {successMessage}
                </div>
              )}

              <div className="mt-6 space-y-4">
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-foreground">Full name</span>
                  <input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    className="h-11 w-full rounded-xl border border-border bg-background px-4 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/25"
                    placeholder="Enter full name"
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-foreground">Email</span>
                  <input
                    value={invitation.email}
                    readOnly
                    className="h-11 w-full rounded-xl border border-border bg-secondary/20 px-4 text-sm text-muted-foreground"
                  />
                </label>

                {!user && (
                  <>
                    <label className="block">
                      <span className="mb-1 block text-sm font-medium text-foreground">Password</span>
                      <input
                        type="password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        minLength={6}
                        className="h-11 w-full rounded-xl border border-border bg-background px-4 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/25"
                        placeholder="At least 6 characters"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-sm font-medium text-foreground">Confirm password</span>
                      <input
                        type="password"
                        value={confirmPassword}
                        onChange={(event) => setConfirmPassword(event.target.value)}
                        minLength={6}
                        className="h-11 w-full rounded-xl border border-border bg-background px-4 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/25"
                        placeholder="Re-enter password"
                      />
                    </label>
                  </>
                )}
              </div>

              <div className="mt-6 flex flex-wrap items-center gap-3">
                {!user ? (
                  <button
                    type="button"
                    onClick={handleSignupAndAccept}
                    disabled={isAccepting || Boolean(successMessage)}
                    className="rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isAccepting ? 'Processing...' : 'Create account and accept invite'}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleAccept}
                    disabled={emailMismatch || isAccepting || Boolean(successMessage)}
                    className="rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isAccepting ? 'Accepting...' : 'Accept invitation'}
                  </button>
                )}

                {!user && (
                  <Link
                    to={`/login?token=${encodeURIComponent(token)}`}
                    className="rounded-xl border border-border bg-background px-6 py-2.5 text-sm font-semibold text-foreground hover:bg-secondary/20"
                  >
                    Already have account? Login
                  </Link>
                )}

                <Link to="/" className="text-sm font-semibold text-primary hover:underline">
                  Back to home
                </Link>
              </div>
            </main>
          </div>
        )}
      </div>
    </section>
  );
}
