import { useEffect, useState } from 'react';
import { useApp } from '../../../shared/AppProvider';
import { getProfile, requestProfileEmailChange, resendProfileVerificationEmail } from '../../../shared/api/profile';
import { useToast } from '../../../shared/toast/ToastProvider';

export default function EmailVerificationPage() {
  const { user, refreshSession } = useApp();
  const toast = useToast();

  const [currentEmail, setCurrentEmail] = useState(user?.email ?? '');
  const [newEmail, setNewEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isResending, setIsResending] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      try {
        setIsLoading(true);
        const response = await getProfile();
        if (cancelled) return;
        setCurrentEmail(response.profile.email ?? user?.email ?? '');
      } catch (error) {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : 'Failed to load profile email');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    loadProfile();
    return () => {
      cancelled = true;
    };
  }, [toast, user?.email]);

  async function sendVerification() {
    if (!currentEmail) {
      toast.error('Current email is missing.');
      return;
    }

    try {
      setIsResending(true);
      await resendProfileVerificationEmail(currentEmail);
      toast.success('Verification email sent. Check your inbox.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to resend verification email');
    } finally {
      setIsResending(false);
    }
  }

  async function requestEmailChange(event: React.FormEvent) {
    event.preventDefault();
    if (!newEmail.trim() || !currentPassword) return;

    try {
      setIsSubmitting(true);
      const response = await requestProfileEmailChange({ newEmail: newEmail.trim(), currentPassword });
      setCurrentEmail(response.profile.email ?? newEmail.trim());
      setNewEmail('');
      setCurrentPassword('');
      await refreshSession();
      toast.success(response.message ?? 'Email change requested.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to request email change');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-border bg-background p-5 text-sm text-muted-foreground">
        Loading email settings...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-foreground">Email Verification and Change</h2>
        <p className="mt-2 text-muted-foreground">Manage your login email and verification state.</p>
      </div>

      <section className="rounded-2xl border border-border bg-background p-5">
        <h3 className="text-base font-semibold text-foreground">Current Email</h3>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-4">
          <div>
            <div className="text-sm font-semibold text-foreground">{currentEmail || '-'}</div>
            <div className="mt-1 text-xs text-muted-foreground">
              Verification is handled by Supabase Auth email confirmation.
            </div>
          </div>
          <button
            type="button"
            disabled={!currentEmail || isResending}
            onClick={sendVerification}
            className="rounded-full border border-border bg-background px-5 py-2 text-sm font-semibold text-foreground transition hover:bg-secondary/30 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isResending ? 'Sending...' : 'Resend Verification'}
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-background p-5">
        <h3 className="text-base font-semibold text-foreground">Change Email</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Request a new login email. You may need to confirm it from your inbox.
        </p>
        <form className="mt-4 space-y-4" onSubmit={requestEmailChange}>
          <label className="block">
            <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">New Email</div>
            <input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="name@company.com"
              className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none ring-primary/30 focus:ring-2"
            />
          </label>
          <label className="block">
            <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Current Password</div>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Enter current password"
              className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none ring-primary/30 focus:ring-2"
            />
          </label>
          <button
            type="submit"
            disabled={!newEmail.trim() || !currentPassword || isSubmitting}
            className="rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? 'Submitting...' : 'Request Email Change'}
          </button>
        </form>
      </section>
    </div>
  );
}
