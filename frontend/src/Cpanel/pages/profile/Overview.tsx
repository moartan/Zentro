import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useApp } from '../../../shared/AppProvider';
import { getProfile, type Profile } from '../../../shared/api/profile';
import { useToast } from '../../../shared/toast/ToastProvider';

export default function ProfileOverviewPage() {
  const { user } = useApp();
  const toast = useToast();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const roleLabel =
    user?.role === 'super_admin'
      ? 'Platform Admin'
      : user?.role === 'business_owner'
      ? 'Workspace Owner'
      : user?.role === 'employee'
      ? 'Member'
      : 'Business User';

  const workspaceLabel = (() => {
    if (user?.isPlatformSuperAdmin) return 'Platform';
    if (!user?.businessId) return 'Not created yet';

    const match = user.memberships?.find((m) => m.businessId === user.businessId);
    return match?.businessName ?? user.businessId;
  })();

  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      try {
        setIsLoading(true);
        const response = await getProfile();
        if (cancelled) return;
        setProfile(response.profile);
      } catch (error) {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : 'Failed to load profile overview');
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
  }, [toast]);

  const fullName = profile?.fullName ?? user?.fullName ?? '-';
  const email = profile?.email ?? user?.email ?? '-';
  const phone = profile?.phone ?? '-';
  const country = profile?.country ?? '-';
  const gender = profile?.gender ? profile.gender.charAt(0).toUpperCase() + profile.gender.slice(1) : '-';
  const avatarLabel = profile?.avatar ? 'Uploaded' : '-';

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-border bg-background p-5 text-sm text-muted-foreground">
        Loading profile overview...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-foreground">Overview</h2>
          <p className="mt-2 text-muted-foreground">Your account information.</p>
        </div>
        <Link
          to="/cpanel/profile/edit-profile"
          className="inline-flex items-center justify-center rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary-dark"
        >
          Edit Profile
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-border bg-background p-5">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Full Name</div>
          <div className="mt-2 text-base font-semibold text-foreground">{fullName}</div>
        </div>
        <div className="rounded-2xl border border-border bg-background p-5">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Email</div>
          <div className="mt-2 text-base font-semibold text-foreground">{email}</div>
        </div>
        <div className="rounded-2xl border border-border bg-background p-5">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Phone</div>
          <div className="mt-2 text-base font-semibold text-foreground">{phone}</div>
        </div>
        <div className="rounded-2xl border border-border bg-background p-5">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Country</div>
          <div className="mt-2 text-base font-semibold text-foreground">{country}</div>
        </div>
        <div className="rounded-2xl border border-border bg-background p-5">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Gender</div>
          <div className="mt-2 text-base font-semibold text-foreground">{gender}</div>
        </div>
        <div className="rounded-2xl border border-border bg-background p-5">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Avatar</div>
          <div className="mt-2 text-base font-semibold text-foreground">{avatarLabel}</div>
        </div>
        <div className="rounded-2xl border border-border bg-background p-5">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Role</div>
          <div className="mt-2 text-base font-semibold text-foreground">{roleLabel}</div>
        </div>
        <div className="rounded-2xl border border-border bg-background p-5">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Workspace</div>
          <div className="mt-2 text-base font-semibold text-foreground">{workspaceLabel}</div>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-secondary/20 p-5">
        <div className="text-sm font-semibold text-foreground">Edit information</div>
        <p className="mt-1 text-sm text-muted-foreground">
          To update your profile details, go to the Edit Profile tab.
        </p>
        <div className="mt-4">
          <Link
            to="/cpanel/profile/edit-profile"
            className="inline-flex items-center justify-center rounded-full border border-border bg-background px-5 py-2.5 text-sm font-semibold text-foreground transition hover:bg-secondary/40"
          >
            Go to Edit Profile
          </Link>
        </div>
      </div>
    </div>
  );
}
