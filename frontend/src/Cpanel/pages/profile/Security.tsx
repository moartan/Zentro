import { useEffect, useMemo, useState } from 'react';
import { getProfile, updateProfileBackupEmail, updateProfilePassword } from '../../../shared/api/profile';
import { getNotificationPreferences, updateNotificationPreferences } from '../../../shared/api/notifications';
import { useToast } from '../../../shared/toast/ToastProvider';

function toNullable(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export default function SecurityPage() {
  const toast = useToast();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [backupEmail, setBackupEmail] = useState('');
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [loginAlertsEnabled, setLoginAlertsEnabled] = useState(true);
  const [inAppEnabled, setInAppEnabled] = useState(true);
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [urgentOnlyEmail, setUrgentOnlyEmail] = useState(false);
  const [isLoadingRecovery, setIsLoadingRecovery] = useState(true);
  const [isLoadingNotifications, setIsLoadingNotifications] = useState(true);
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [isSavingBackupEmail, setIsSavingBackupEmail] = useState(false);
  const [isSavingNotifications, setIsSavingNotifications] = useState(false);

  const passwordScore = useMemo(() => {
    let score = 0;
    if (newPassword.length >= 8) score += 1;
    if (/[A-Z]/.test(newPassword)) score += 1;
    if (/[0-9]/.test(newPassword)) score += 1;
    if (/[^A-Za-z0-9]/.test(newPassword)) score += 1;
    return score;
  }, [newPassword]);

  const passwordLabel = ['Very weak', 'Weak', 'Fair', 'Strong', 'Very strong'][passwordScore];
  const canSubmitPassword =
    currentPassword.length > 0 && newPassword.length >= 8 && confirmPassword.length > 0 && newPassword === confirmPassword;

  useEffect(() => {
    let cancelled = false;

    async function loadRecoveryEmail() {
      try {
        setIsLoadingRecovery(true);
        const response = await getProfile();
        if (cancelled) return;
        setBackupEmail(response.profile.backupEmail ?? '');
      } catch (error) {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : 'Failed to load security settings');
        }
      } finally {
        if (!cancelled) {
          setIsLoadingRecovery(false);
        }
      }
    }

    loadRecoveryEmail();
    return () => {
      cancelled = true;
    };
  }, [toast]);

  useEffect(() => {
    let cancelled = false;

    async function loadNotificationSettings() {
      try {
        setIsLoadingNotifications(true);
        const response = await getNotificationPreferences();
        if (cancelled) return;
        setInAppEnabled(response.preferences.inAppEnabled);
        setEmailEnabled(response.preferences.emailEnabled);
        setUrgentOnlyEmail(response.preferences.urgentOnlyEmail);
      } catch (error) {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : 'Failed to load notification settings');
        }
      } finally {
        if (!cancelled) {
          setIsLoadingNotifications(false);
        }
      }
    }

    loadNotificationSettings();
    return () => {
      cancelled = true;
    };
  }, [toast]);

  async function handlePasswordSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmitPassword) return;

    try {
      setIsSavingPassword(true);
      await updateProfilePassword({ currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      toast.success('Password updated successfully.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update password');
    } finally {
      setIsSavingPassword(false);
    }
  }

  async function handleBackupEmailSubmit(event: React.FormEvent) {
    event.preventDefault();

    try {
      setIsSavingBackupEmail(true);
      const response = await updateProfileBackupEmail({ backupEmail: toNullable(backupEmail) });
      setBackupEmail(response.profile.backupEmail ?? '');
      toast.success(response.profile.backupEmail ? 'Recovery email saved.' : 'Recovery email removed.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update recovery email');
    } finally {
      setIsSavingBackupEmail(false);
    }
  }

  async function handleNotificationPreferencesSubmit(event: React.FormEvent) {
    event.preventDefault();
    try {
      setIsSavingNotifications(true);
      const response = await updateNotificationPreferences({
        inAppEnabled,
        emailEnabled,
        urgentOnlyEmail,
      });
      setInAppEnabled(response.preferences.inAppEnabled);
      setEmailEnabled(response.preferences.emailEnabled);
      setUrgentOnlyEmail(response.preferences.urgentOnlyEmail);
      toast.success('Notification preferences updated.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update notification preferences');
    } finally {
      setIsSavingNotifications(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-foreground">Security</h2>
        <p className="mt-2 text-muted-foreground">Manage password, recovery email, login alerts, and account protection.</p>
      </div>

      <section className="rounded-2xl border border-border bg-background p-5">
        <h3 className="text-base font-semibold text-foreground">Recovery Email</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Optional backup email used for account recovery when you cannot access your main login email.
        </p>
        {isLoadingRecovery ? (
          <div className="mt-3 text-sm text-muted-foreground">Loading recovery email...</div>
        ) : (
          <form className="mt-4 space-y-3" onSubmit={handleBackupEmailSubmit}>
            <Field label="Backup Email">
              <input
                type="email"
                value={backupEmail}
                onChange={(e) => setBackupEmail(e.target.value)}
                placeholder="name@gmail.com (optional)"
                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none ring-primary/30 focus:ring-2"
              />
            </Field>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={isSavingBackupEmail}
                className="rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSavingBackupEmail ? 'Saving...' : 'Save Recovery Email'}
              </button>
              <button
                type="button"
                onClick={() => setBackupEmail('')}
                className="rounded-full border border-border bg-background px-5 py-2.5 text-sm font-semibold text-foreground transition hover:bg-secondary/30"
              >
                Clear
              </button>
            </div>
          </form>
        )}
      </section>

      <section className="rounded-2xl border border-border bg-background p-5">
        <h3 className="text-base font-semibold text-foreground">Change Password</h3>
        <form className="mt-4 grid gap-4 md:grid-cols-2" onSubmit={handlePasswordSubmit}>
          <Field label="Current Password">
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none ring-primary/30 focus:ring-2"
            />
          </Field>
          <div />
          <Field label="New Password">
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none ring-primary/30 focus:ring-2"
            />
            <div className="mt-2 text-xs text-muted-foreground">Strength: {passwordLabel}</div>
          </Field>
          <Field label="Confirm New Password">
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none ring-primary/30 focus:ring-2"
            />
            {confirmPassword && confirmPassword !== newPassword ? (
              <div className="mt-2 text-xs text-danger">Passwords do not match.</div>
            ) : null}
          </Field>
          <div className="md:col-span-2">
            <button
              type="submit"
              disabled={!canSubmitPassword || isSavingPassword}
              className="rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSavingPassword ? 'Updating...' : 'Update Password'}
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-2xl border border-border bg-background p-5">
        <h3 className="text-base font-semibold text-foreground">Account Protection</h3>
        <div className="mt-4 space-y-3">
          <ToggleRow
            title="Two-factor authentication (2FA)"
            description="Require an extra verification step at login."
            checked={twoFactorEnabled}
            onChange={setTwoFactorEnabled}
          />
          <ToggleRow
            title="Login alerts"
            description="Send an email when your account is accessed from a new device."
            checked={loginAlertsEnabled}
            onChange={setLoginAlertsEnabled}
          />
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-background p-5">
        <h3 className="text-base font-semibold text-foreground">Notification Preferences</h3>
        <p className="mt-1 text-sm text-muted-foreground">Control in-app and email notifications for your account.</p>
        {isLoadingNotifications ? (
          <div className="mt-3 text-sm text-muted-foreground">Loading notification preferences...</div>
        ) : (
          <form className="mt-4 space-y-3" onSubmit={handleNotificationPreferencesSubmit}>
            <ToggleRow
              title="In-app notifications"
              description="Show notifications inside Zentro."
              checked={inAppEnabled}
              onChange={setInAppEnabled}
            />
            <ToggleRow
              title="Email notifications"
              description="Allow email alerts for important updates."
              checked={emailEnabled}
              onChange={setEmailEnabled}
            />
            <ToggleRow
              title="Urgent-only email"
              description="Only send email notifications for urgent items."
              checked={urgentOnlyEmail}
              onChange={setUrgentOnlyEmail}
            />
            <button
              type="submit"
              disabled={isSavingNotifications}
              className="rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSavingNotifications ? 'Saving...' : 'Save Notification Preferences'}
            </button>
          </form>
        )}
      </section>
    </div>
  );
}

type FieldProps = {
  label: string;
  children: React.ReactNode;
};

function Field({ label, children }: FieldProps) {
  return (
    <label className="block">
      <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      {children}
    </label>
  );
}

type ToggleRowProps = {
  title: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
};

function ToggleRow({ title, description, checked, onChange }: ToggleRowProps) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-border p-4">
      <div>
        <div className="text-sm font-semibold text-foreground">{title}</div>
        <div className="mt-1 text-sm text-muted-foreground">{description}</div>
      </div>
      <button
        type="button"
        aria-pressed={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-7 w-12 rounded-full transition ${checked ? 'bg-primary' : 'bg-muted'}`}
      >
        <span className={`absolute top-1 h-5 w-5 rounded-full bg-white transition ${checked ? 'left-6' : 'left-1'}`} />
      </button>
    </div>
  );
}
