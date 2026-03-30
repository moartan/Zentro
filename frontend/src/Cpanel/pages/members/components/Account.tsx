import { useMemo } from 'react';
import { useMemberDetailsContext } from '../memberDetailsContext';

function formatDate(value: string | null | undefined) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
  }).format(d);
}

function splitName(fullName: string | null) {
  const raw = (fullName ?? '').trim();
  if (!raw) return { first: '-', last: '-' };
  const parts = raw.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return { first: parts[0], last: '-' };
  return { first: parts[0], last: parts.slice(1).join(' ') };
}

function roleLabel(role: string | null | undefined) {
  if (role === 'business_owner') return 'Workspace Owner';
  if (role === 'employee') return 'Member';
  return role ?? '-';
}

function planLabel(plan: string | null | undefined) {
  if (plan === 'free') return 'Free';
  if (plan === 'pro') return 'Pro';
  if (plan === 'enterprise') return 'Enterprise';
  return plan ?? '-';
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="relative rounded-2xl border border-border bg-background px-5 pb-4 pt-5">
      <div className="absolute left-4 top-0 -translate-y-1/2 bg-background px-2 text-sm font-medium text-muted-foreground">
        {label}
      </div>
      <div className="pt-1 text-base font-semibold text-foreground">{value || '-'}</div>
    </div>
  );
}

export default function MemberDetailsAccountTab() {
  const { member } = useMemberDetailsContext();

  const name = useMemo(() => splitName(member?.fullName ?? null), [member?.fullName]);

  return (
    <div className="rounded-xl border border-border bg-background p-6 shadow-sm">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Account</h2>
        <p className="mt-1 text-sm text-muted-foreground">Read-only profile and contact information.</p>
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-2">
        <Field label="First name" value={name.first} />
        <Field label="Last name" value={name.last} />
        <Field label="Email" value={member?.email ?? '-'} />
        <Field label="Phone number" value="-" />
        <Field label="Gender" value="-" />
        <Field label="Country" value="-" />
        <Field label="Status" value={member?.status ?? '-'} />
        <Field label="Role" value={roleLabel(member?.role)} />
        <Field label="Workspace" value={member?.workspace.businessName ?? '-'} />
        <Field label="Workspace status" value={member?.workspace.subscriptionStatus ?? '-'} />
        <Field label="Subscription" value={planLabel(member?.workspace.subscriptionPlan)} />
        <Field label="Joined date" value={formatDate(member?.workspace.membershipJoinedAt ?? member?.createdAt ?? null)} />
      </div>
    </div>
  );
}
