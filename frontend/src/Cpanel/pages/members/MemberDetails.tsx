import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate, useParams } from 'react-router-dom';
import { Activity, Building2, ChevronDown, ListTodo, Shield, User } from 'lucide-react';
import { blockMember, deleteMember, getMemberDetails } from '../../../shared/api/members';
import { MemberDetailsProvider, type MemberDetailsPayload } from './memberDetailsContext';
import { useToast } from '../../../shared/toast/ToastProvider';

function initialsFromName(fullName: string | null, email: string | null) {
  const base = (fullName ?? '').trim() || (email ?? '').trim();
  if (!base) return 'U';
  const parts = base.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

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

function statusLabel(status: string | null) {
  if (status === 'active') return 'Active';
  if (status === 'invited') return 'Pending';
  if (status === 'block') return 'Blocked';
  return '-';
}

function statusPill(status: string | null) {
  if (status === 'active') return 'bg-emerald-100 text-emerald-800';
  if (status === 'invited') return 'bg-amber-100 text-amber-800';
  if (status === 'block') return 'bg-rose-100 text-rose-800';
  return 'bg-secondary/50 text-muted-foreground';
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

function KeyValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-6 py-2 text-sm">
      <div className="text-muted-foreground">{label}</div>
      <div className="text-right font-semibold text-foreground">{value || '-'}</div>
    </div>
  );
}

function TabLink({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition ${
          isActive
            ? 'border-primary bg-primary/10 text-primary'
            : 'border-border bg-background text-muted-foreground hover:bg-secondary/20 hover:text-foreground'
        }`
      }
      end
    >
      {icon}
      <span className="whitespace-nowrap">{label}</span>
    </NavLink>
  );
}

export default function MemberDetailsPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const params = useParams();
  const memberId = params.id ?? '';
  const actionsRef = useRef<HTMLDivElement | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [payload, setPayload] = useState<MemberDetailsPayload | null>(null);
  const [isActionMenuOpen, setIsActionMenuOpen] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);

  const loadMemberDetails = useCallback(async () => {
    setErrorMessage(null);
    const res = await getMemberDetails(memberId);
    setPayload(res);
  }, [memberId]);

  useEffect(() => {
    let alive = true;
    setIsLoading(true);
    setErrorMessage(null);

    getMemberDetails(memberId)
      .then((res) => {
        if (!alive) return;
        setPayload(res);
      })
      .catch((err) => {
        if (!alive) return;
        setErrorMessage(err instanceof Error ? err.message : 'Failed to load member');
      })
      .finally(() => {
        if (!alive) return;
        setIsLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [memberId]);

  useEffect(() => {
    if (!isActionMenuOpen) return;

    function handleOutsideClick(event: MouseEvent) {
      if (!actionsRef.current) return;
      if (actionsRef.current.contains(event.target as Node)) return;
      setIsActionMenuOpen(false);
    }

    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isActionMenuOpen]);

  const member = payload?.member ?? null;
  const statusActionLabel = member?.status === 'block' ? 'Active' : 'Block';

  const quickWorkspaceName = member?.workspace.businessName ?? '-';
  const quickJoinedDate = formatDate(member?.workspace.membershipJoinedAt ?? member?.createdAt ?? null);
  const quickPlan = planLabel(member?.workspace.subscriptionPlan ?? null);

  const canDelete = member?.role !== 'business_owner';

  async function handleToggleStatus() {
    if (!member) return;
    const shouldBlock = member.status !== 'block';
    const ok = window.confirm(shouldBlock ? 'Block this member?' : 'Set this member to active?');
    if (!ok) return;

    try {
      setIsActionLoading(true);
      await blockMember(member.id, shouldBlock);
      setPayload((prev) =>
        prev
          ? {
              ...prev,
              member: {
                ...prev.member,
                status: shouldBlock ? 'block' : 'active',
              },
            }
          : prev,
      );
      setIsActionMenuOpen(false);
      toast.success(shouldBlock ? 'Member blocked.' : 'Member activated.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setIsActionLoading(false);
    }
  }

  async function handleDeleteMember() {
    if (!member) return;
    const ok = window.confirm('Remove this member? This cannot be undone.');
    if (!ok) return;

    try {
      setIsActionLoading(true);
      await deleteMember(member.id);
      toast.success('Member removed.');
      navigate('/cpanel/members');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Delete failed');
      setIsActionLoading(false);
    }
  }

  async function refreshMemberDetails() {
    try {
      setIsLoading(true);
      await loadMemberDetails();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to refresh member');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-background p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Member Details</h1>
        </div>
        <Link to="/cpanel/members" className="text-sm font-semibold text-primary hover:underline">
          Back to Members
        </Link>
      </div>

      {isLoading && <div className="mt-6 text-sm text-muted-foreground">Loading...</div>}
      {!isLoading && errorMessage && <div className="mt-6 text-sm font-semibold text-rose-700">{errorMessage}</div>}

      {!isLoading && !errorMessage && member && payload && (
        <MemberDetailsProvider value={{ payload, member, refreshMemberDetails }}>
          <div className="mt-6 grid items-start gap-6 lg:grid-cols-[310px_1fr]">
            <div className="self-start overflow-visible rounded-xl border border-border bg-background px-6 pt-6 pb-4 shadow-sm">
              <div className="flex h-full flex-col">
                <div>
                  <div className="flex flex-col items-center">
                    <div className="flex h-32 w-32 items-center justify-center rounded-[32px] bg-primary/10 text-4xl font-extrabold text-primary">
                      {initialsFromName(member.fullName, member.email)}
                    </div>
                    <div className="mt-5 text-center">
                      <div className="text-2xl font-semibold text-foreground">{member.fullName ?? member.email ?? '-'}</div>
                      <div className="mt-3">
                        <span className={`inline-flex rounded-full px-4 py-2 text-sm font-bold ${statusPill(member.status)}`}>
                          {statusLabel(member.status)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-8">
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Details</div>
                    <div className="mt-3">
                      <KeyValue label="Workspace" value={quickWorkspaceName} />
                      <KeyValue label="Email" value={member.email ?? '-'} />
                      <KeyValue label="Role" value={roleLabel(member.role)} />
                      <KeyValue label="Joined date" value={quickJoinedDate} />
                      <KeyValue label="Subscription" value={quickPlan} />
                    </div>
                  </div>
                </div>

                <div className="mt-6 flex justify-center">
                  <div ref={actionsRef} className="relative">
                    {isActionMenuOpen && (
                      <div className="absolute top-full left-1/2 z-20 mt-2 w-44 -translate-x-1/2 overflow-hidden rounded-xl border border-border bg-background shadow-lg">
                        <button
                          type="button"
                          onClick={handleToggleStatus}
                          disabled={isActionLoading}
                          className="block w-full px-4 py-2.5 text-left text-sm font-semibold text-foreground transition hover:bg-secondary/20 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {statusActionLabel}
                        </button>
                        <button
                          type="button"
                          onClick={handleDeleteMember}
                          disabled={isActionLoading || !canDelete}
                          className="block w-full border-t border-border px-4 py-2.5 text-left text-sm font-semibold text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Delete
                        </button>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => setIsActionMenuOpen((v) => !v)}
                      disabled={isActionLoading}
                      className="inline-flex items-center gap-2 rounded-2xl bg-primary px-5 py-2.5 text-sm font-bold uppercase tracking-wide text-primary-foreground disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      <span>Status</span>
                      <ChevronDown className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="min-w-0">
              <div className="rounded-xl border border-border bg-background p-4 shadow-sm">
                <div className="flex items-center gap-3 overflow-x-auto whitespace-nowrap">
                  <TabLink to="account" icon={<User className="h-4 w-4" />} label="Account" />
                  <TabLink to="workspace" icon={<Building2 className="h-4 w-4" />} label="Workspace" />
                  <TabLink to="permissions" icon={<Shield className="h-4 w-4" />} label="Permissions" />
                  <TabLink to="tasks" icon={<ListTodo className="h-4 w-4" />} label="Tasks" />
                  <TabLink to="activity" icon={<Activity className="h-4 w-4" />} label="Activity" />
                </div>
              </div>

              <div className="mt-4">
                <Outlet />
              </div>
            </div>
          </div>
        </MemberDetailsProvider>
      )}
    </div>
  );
}
