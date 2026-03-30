import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { blockMember, changeMemberRole, deleteMember } from '../../../../shared/api/members';
import { useMemberDetailsContext } from '../memberDetailsContext';
import { useToast } from '../../../../shared/toast/ToastProvider';

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

function roleLabel(role: string | null | undefined) {
  if (role === 'business_owner') return 'Workspace Owner';
  if (role === 'employee') return 'Member';
  return role ?? '-';
}

function memberStatusLabel(status: string | null | undefined) {
  if (status === 'active') return 'Active';
  if (status === 'invited') return 'Pending';
  if (status === 'block') return 'Blocked';
  return status ?? '-';
}

function planLabel(plan: string | null | undefined) {
  if (plan === 'free') return 'Free';
  if (plan === 'pro') return 'Pro';
  if (plan === 'enterprise') return 'Enterprise';
  return plan ?? '-';
}

function subscriptionStatusLabel(status: string | null | undefined) {
  if (status === 'active') return 'Active';
  if (status === 'past_due') return 'Past due';
  if (status === 'canceled') return 'Canceled';
  return status ?? '-';
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-background p-4">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export default function MemberDetailsWorkspaceTab() {
  const toast = useToast();
  const navigate = useNavigate();
  const { member, refreshMemberDetails } = useMemberDetailsContext();
  const [isMutating, setIsMutating] = useState(false);

  const workspaceName = member?.workspace.businessName ?? '-';
  const workspaceSlug = member?.workspace.businessSlug ?? '-';
  const joinedDate = formatDate(member?.workspace.membershipJoinedAt ?? member?.createdAt ?? null);
  const membershipRole = roleLabel(member?.role);
  const membershipStatus = memberStatusLabel(member?.status);
  const plan = planLabel(member?.workspace.subscriptionPlan);
  const subscriptionStatus = subscriptionStatusLabel(member?.workspace.subscriptionStatus);
  const teamsValue = useMemo(() => {
    if (!member?.teams?.length) return '-';
    return member.teams.map((team) => team.teamName ?? '-').join(', ');
  }, [member?.teams]);

  const roleActionLabel = member?.role === 'employee' ? 'Promote to owner' : 'Set as employee';
  const blockActionLabel = membershipStatus === 'Blocked' ? 'Activate' : 'Block';
  const isOwner = member?.role === 'business_owner';

  async function handleChangeRole() {
    if (!member) return;
    const nextRole = member.role === 'employee' ? 'business_owner' : 'employee';
    const ok = window.confirm(`Change role to ${roleLabel(nextRole)}?`);
    if (!ok) return;

    try {
      setIsMutating(true);
      await changeMemberRole(member.id, nextRole);
      await refreshMemberDetails();
      toast.success(`Role updated to ${roleLabel(nextRole)}.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Role update failed');
    } finally {
      setIsMutating(false);
    }
  }

  async function handleBlockToggle() {
    if (!member) return;
    const shouldBlock = member.status !== 'block';
    const ok = window.confirm(shouldBlock ? 'Block this member?' : 'Activate this member?');
    if (!ok) return;

    try {
      setIsMutating(true);
      await blockMember(member.id, shouldBlock);
      await refreshMemberDetails();
      toast.success(shouldBlock ? 'Member blocked.' : 'Member activated.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Status update failed');
    } finally {
      setIsMutating(false);
    }
  }

  async function handleRemoveMember() {
    if (!member) return;
    const ok = window.confirm('Remove this member? This cannot be undone.');
    if (!ok) return;

    try {
      setIsMutating(true);
      await deleteMember(member.id);
      toast.success('Member removed.');
      navigate('/cpanel/members');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setIsMutating(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-background p-6 shadow-sm">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Workspace</h2>
        <p className="mt-1 text-sm text-muted-foreground">Workspace-level details and controls for this member.</p>
      </div>

      <div className="mt-5 space-y-4">
        <Section title="Current Workspace">
          <div className="grid gap-3 lg:grid-cols-2">
            <Field label="Workspace name" value={workspaceName} />
            <Field label="Workspace slug" value={workspaceSlug} />
            <Field label="Joined date" value={joinedDate} />
            <Field label="Teams" value={teamsValue} />
          </div>
        </Section>

        <Section title="Membership">
          <div className="grid gap-3 lg:grid-cols-2">
            <Field label="Role in workspace" value={membershipRole} />
            <Field label="Member status" value={membershipStatus} />
            <Field label="Team assignments" value={String(member?.teams?.length ?? 0)} />
            <Field label="Last activity" value="-" />
          </div>
        </Section>

        <Section title="Subscription">
          <div className="grid gap-3 lg:grid-cols-2">
            <Field label="Plan" value={plan} />
            <Field label="Billing status" value={subscriptionStatus} />
            <Field label="Renewal date" value="-" />
            <Field label="Invoices" value="-" />
          </div>
        </Section>

        <Section title="Admin Actions">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleChangeRole}
              className="rounded-xl border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground hover:bg-secondary/20 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isMutating}
            >
              {roleActionLabel}
            </button>
            <button
              type="button"
              onClick={handleBlockToggle}
              className="rounded-xl border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground hover:bg-secondary/20 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isMutating}
            >
              {blockActionLabel}
            </button>
            <button
              type="button"
              onClick={handleRemoveMember}
              className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isMutating || isOwner}
            >
              Remove member
            </button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Remove is disabled for workspace owner.</p>
        </Section>
      </div>
    </div>
  );
}
