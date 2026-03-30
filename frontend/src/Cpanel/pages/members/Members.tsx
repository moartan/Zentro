import { useEffect, useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { getMembers, type MemberRole, type MemberRow, type MemberStatus } from '../../../shared/api/members';
import { getMySubscription, type WorkspaceSubscription } from '../../../shared/api/subscriptions';

function initialsFromName(fullName: string | null, email: string | null) {
  const base = (fullName ?? '').trim() || (email ?? '').trim();
  if (!base) return 'U';
  const parts = base.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function roleLabel(role: MemberRole) {
  if (role === 'business_owner') return 'Workspace Owner';
  return 'Member';
}

function statusLabel(status: MemberStatus) {
  if (status === 'active') return 'Active';
  if (status === 'invited') return 'Pending';
  if (status === 'block') return 'Blocked';
  return '-';
}

function statusPill(status: MemberStatus) {
  if (status === 'active') return 'bg-emerald-100 text-emerald-800';
  if (status === 'invited') return 'bg-amber-100 text-amber-800';
  if (status === 'block') return 'bg-rose-100 text-rose-800';
  return 'bg-secondary/50 text-muted-foreground';
}

type RoleFilter = 'all' | 'business_owner' | 'employee';
type StatusFilter = 'all' | 'active' | 'invited' | 'block';

export default function MembersPage() {
  const pageSize = 10;
  const [rows, setRows] = useState<MemberRow[]>([]);
  const [subscription, setSubscription] = useState<WorkspaceSubscription | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [page, setPage] = useState(1);
  const [isLimitNoticeOpen, setIsLimitNoticeOpen] = useState(true);

  useEffect(() => {
    let alive = true;
    setIsLoading(true);
    setErrorMessage(null);

    Promise.allSettled([getMembers(), getMySubscription()])
      .then(([membersResult, subscriptionResult]) => {
        if (!alive) return;

        if (membersResult.status === 'fulfilled') {
          setRows(membersResult.value.members ?? []);
        } else {
          const reason = membersResult.reason;
          setErrorMessage(reason instanceof Error ? reason.message : 'Failed to load members');
        }

        if (subscriptionResult.status === 'fulfilled') {
          setSubscription(subscriptionResult.value.subscription ?? null);
        } else {
          setSubscription(null);
        }
      })
      .finally(() => {
        if (!alive) return;
        setIsLoading(false);
      });

    return () => {
      alive = false;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (roleFilter !== 'all' && r.role !== roleFilter) return false;
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (!q) return true;
      const hay = [r.fullName ?? '', r.email ?? '', roleLabel(r.role), statusLabel(r.status)].join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [rows, query, roleFilter, statusFilter]);

  useEffect(() => {
    setPage(1);
  }, [query, roleFilter, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const pageStart = (safePage - 1) * pageSize;
  const pageRows = filtered.slice(pageStart, pageStart + pageSize);
  const memberLimit = subscription?.limits?.maxMembers ?? null;
  const usedSeats = typeof subscription?.memberCount === 'number' ? subscription.memberCount : rows.length;
  const seatsLeft = memberLimit === null ? null : Math.max(0, memberLimit - usedSeats);
  const isAtLimit = typeof seatsLeft === 'number' && seatsLeft <= 0;
  const isNearLimit = typeof seatsLeft === 'number' && seatsLeft > 0 && seatsLeft <= 2;

  return (
    <div className="rounded-xl border border-border bg-background p-6 text-[15px]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Members</h1>
          <p className="mt-2 text-muted-foreground">Manage members in your workspace.</p>
        </div>
        <Link
          to="/cpanel/members/invite"
          className="rounded-2xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary-dark"
        >
          Invite member
        </Link>
      </div>

      {memberLimit !== null && isLimitNoticeOpen ? (
        <div
          className={`mt-4 rounded-2xl border p-4 text-sm ${
            isAtLimit
              ? 'border-rose-200 bg-rose-50 text-rose-700'
              : isNearLimit
                ? 'border-amber-200 bg-amber-50 text-amber-800'
                : 'border-border bg-secondary/10 text-foreground'
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="font-semibold">
              {subscription?.planCode === 'free' ? 'Free plan member limit' : 'Member limit'}
            </div>
            <button
              type="button"
              onClick={() => setIsLimitNoticeOpen(false)}
              className="inline-flex h-6 w-6 items-center justify-center rounded-lg border border-border/60 bg-background/70 text-muted-foreground hover:bg-secondary/20"
              aria-label="Close announcement"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          {isAtLimit ? (
            <div className="mt-1 font-semibold">
              Limit reached: {usedSeats} of {memberLimit} members used. No seats left.
            </div>
          ) : (
            <div className="mt-1">
              {usedSeats} of {memberLimit} members used. {seatsLeft ?? 0} member{seatsLeft === 1 ? '' : 's'} left.
            </div>
          )}
        </div>
      ) : null}

      <div className="mt-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="relative w-full md:max-w-md">
          <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search members..."
            className="h-12 w-full rounded-2xl border border-border bg-background pl-12 pr-4 text-base text-foreground outline-none placeholder:text-muted-foreground"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value as RoleFilter)}
            className="h-12 rounded-2xl border border-border bg-background px-4 text-sm font-semibold text-foreground"
          >
            <option value="all">All roles</option>
            <option value="business_owner">Workspace Owner</option>
            <option value="employee">Member</option>
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="h-12 rounded-2xl border border-border bg-background px-4 text-sm font-semibold text-foreground"
          >
            <option value="all">All status</option>
            <option value="active">Active</option>
            <option value="invited">Pending</option>
            <option value="block">Blocked</option>
          </select>
        </div>
      </div>

      <div className="mt-6 overflow-hidden rounded-2xl border border-border">
        <table className="w-full border-separate border-spacing-0">
          <thead className="bg-secondary/10">
            <tr>
              <th className="border-b border-border px-5 py-4 text-left text-xs font-bold uppercase tracking-wide text-muted-foreground">Member</th>
              <th className="border-b border-border px-5 py-4 text-left text-xs font-bold uppercase tracking-wide text-muted-foreground">Role / title</th>
              <th className="hidden border-b border-border px-5 py-4 text-left text-xs font-bold uppercase tracking-wide text-muted-foreground md:table-cell">Open tasks</th>
              <th className="hidden border-b border-border px-5 py-4 text-left text-xs font-bold uppercase tracking-wide text-muted-foreground md:table-cell">Done tasks</th>
              <th className="border-b border-border px-5 py-4 text-left text-xs font-bold uppercase tracking-wide text-muted-foreground">Status</th>
            </tr>
          </thead>

          <tbody>
            {!isLoading && pageRows.map((row, i) => {
              const zebra = i % 2 === 1 ? 'bg-secondary/10' : 'bg-background';
              return (
                <tr key={row.id} className={zebra}>
                  <td className="border-b border-border px-5 py-5 align-middle">
                    <Link to={`/cpanel/members/${row.id}`} className="flex items-center gap-4">
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-secondary/40 text-xl font-bold text-foreground">
                        {initialsFromName(row.fullName, row.email)}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-base font-semibold leading-tight text-foreground">{row.fullName ?? '-'}</div>
                        <div className="mt-1 truncate text-sm text-muted-foreground">{row.email ?? '-'}</div>
                      </div>
                    </Link>
                  </td>
                  <td className="border-b border-border px-5 py-5 align-middle text-base text-foreground">{roleLabel(row.role)}</td>
                  <td className="hidden border-b border-border px-5 py-5 align-middle text-base text-foreground md:table-cell">{row.openTasks}</td>
                  <td className="hidden border-b border-border px-5 py-5 align-middle text-base text-foreground md:table-cell">{row.doneTasks}</td>
                  <td className="border-b border-border px-5 py-5 align-middle">
                    <span className={`inline-flex rounded-full px-4 py-2 text-base font-semibold ${statusPill(row.status)}`}>
                      {statusLabel(row.status)}
                    </span>
                  </td>
                </tr>
              );
            })}

            {isLoading && (
              <tr>
                <td colSpan={5} className="px-5 py-8 text-center text-sm text-muted-foreground">Loading members...</td>
              </tr>
            )}

            {!isLoading && errorMessage && (
              <tr>
                <td colSpan={5} className="px-5 py-8 text-center text-sm font-semibold text-rose-700">{errorMessage}</td>
              </tr>
            )}

            {!isLoading && !errorMessage && pageRows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-8 text-center text-sm text-muted-foreground">No members found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-5 flex items-center justify-between gap-2 text-muted-foreground">
        <div className="text-sm">
          Showing {filtered.length === 0 ? 0 : pageStart + 1}-{Math.min(pageStart + pageSize, filtered.length)} of {filtered.length}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={safePage <= 1}
            className="rounded-full border border-border px-4 py-2 text-sm font-semibold text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            Prev
          </button>
          <button
            type="button"
            className="h-10 w-10 rounded-full border border-primary text-sm font-semibold text-primary"
          >
            {safePage}
          </button>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={safePage >= totalPages}
            className="rounded-full border border-border px-4 py-2 text-sm font-semibold text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
