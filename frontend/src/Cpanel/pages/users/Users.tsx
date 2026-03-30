import { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  adminBlockUsers,
  adminChangeUserRole,
  adminDeleteUsers,
  getUsers,
  type AdminUserRow,
  type UserRole,
  type UserStatus,
  type WorkspaceStatus,
} from '../../../shared/api/users';

function SkeletonLine({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-full bg-secondary/40 ${className}`} />;
}

function UsersTableSkeleton({ rowsCount }: { rowsCount: number }) {
  const rows = Array.from({ length: rowsCount }, (_, i) => i);
  return (
    <>
      {rows.map((i) => {
        const zebra = i % 2 === 1 ? 'bg-secondary/10' : 'bg-background';
        return (
          <tr key={i} className={zebra}>
            <td className="border-b border-border px-5 py-5 align-middle">
              <div className="h-5 w-5 animate-pulse rounded border border-border bg-secondary/30" />
            </td>
            <td className="border-b border-border px-5 py-5 align-middle">
              <div className="flex items-center gap-4">
                <div className="h-14 w-14 animate-pulse rounded-full bg-secondary/40" />
                <div className="min-w-0 flex-1">
                  <SkeletonLine className="h-4 w-48" />
                  <div className="mt-2">
                    <SkeletonLine className="h-3 w-32" />
                  </div>
                </div>
              </div>
            </td>
            <td className="border-b border-border px-5 py-5 align-middle">
              <SkeletonLine className="h-4 w-28" />
            </td>
            <td className="hidden border-b border-border px-5 py-5 align-middle md:table-cell">
              <div className="flex flex-col gap-2">
                <SkeletonLine className="h-4 w-36" />
                <div>
                  <SkeletonLine className="h-6 w-20" />
                </div>
              </div>
            </td>
            <td className="hidden border-b border-border px-5 py-5 align-middle lg:table-cell">
              <SkeletonLine className="h-4 w-20" />
            </td>
            <td className="hidden border-b border-border px-5 py-5 align-middle lg:table-cell">
              <SkeletonLine className="h-4 w-10" />
            </td>
            <td className="border-b border-border px-5 py-5 align-middle">
              <SkeletonLine className="h-9 w-24" />
            </td>
          </tr>
        );
      })}
    </>
  );
}

function initialsFromName(fullName: string | null, email: string | null) {
  const base = (fullName ?? '').trim() || (email ?? '').trim();
  if (!base) return 'U';
  const parts = base.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function roleLabel(role: UserRole) {
  if (role === 'super_admin') return 'Platform Admin';
  if (role === 'business_owner') return 'Workspace Owner';
  if (role === 'employee') return 'Member';
  return '-';
}

function statusLabel(status: UserStatus) {
  if (status === 'active') return 'Active';
  if (status === 'invited') return 'Pending';
  if (status === 'block') return 'Blocked';
  return '-';
}

function statusPill(status: UserStatus) {
  if (status === 'active') return 'bg-emerald-100 text-emerald-800';
  if (status === 'invited') return 'bg-amber-100 text-amber-800';
  if (status === 'block') return 'bg-rose-100 text-rose-800';
  return 'bg-secondary/50 text-muted-foreground';
}

function workspaceStatusLabel(status: WorkspaceStatus) {
  if (status === 'active') return 'Active';
  if (status === 'past_due') return 'Past due';
  if (status === 'canceled') return 'Canceled';
  return '-';
}

function workspaceStatusPill(status: WorkspaceStatus) {
  if (status === 'active') return 'bg-emerald-100 text-emerald-800';
  if (status === 'past_due') return 'bg-amber-100 text-amber-800';
  if (status === 'canceled') return 'bg-rose-100 text-rose-800';
  return 'bg-secondary/50 text-muted-foreground';
}

type RoleFilter = 'all' | 'super_admin' | 'business_owner' | 'employee' | 'unassigned';
type StatusFilter = 'all' | 'active' | 'invited' | 'block' | 'unassigned';

export default function UsersPage() {
  const pageSize = 10;
  const [rows, setRows] = useState<AdminUserRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [page, setPage] = useState(1);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [bulkRole, setBulkRole] = useState<'employee' | 'business_owner'>('employee');
  const [isMutating, setIsMutating] = useState(false);

  useEffect(() => {
    let alive = true;
    setIsLoading(true);
    setErrorMessage(null);
    getUsers()
      .then((res) => {
        if (!alive) return;
        setRows(res.users ?? []);
      })
      .catch((err) => {
        if (!alive) return;
        setErrorMessage(err instanceof Error ? err.message : 'Failed to load users');
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
      if (roleFilter !== 'all') {
        const v = r.role ?? 'unassigned';
        if (v !== roleFilter) return false;
      }

      if (statusFilter !== 'all') {
        const v = r.status ?? 'unassigned';
        if (v !== statusFilter) return false;
      }

      if (!q) return true;
      const hay = [
        r.fullName ?? '',
        r.email ?? '',
        r.workspaceName ?? '',
        workspaceStatusLabel(r.workspaceStatus),
        roleLabel(r.role),
        statusLabel(r.status),
        r.id,
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [rows, query, roleFilter, statusFilter]);

  useEffect(() => {
    setPage(1);
  }, [query, roleFilter, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const pageStartIndex = (safePage - 1) * pageSize;
  const pageRows = filtered.slice(pageStartIndex, pageStartIndex + pageSize);

  const selectedCount = selectedIds.size;
  const selectedRows = useMemo(() => rows.filter((r) => selectedIds.has(r.id)), [rows, selectedIds]);
  const canChangeRole = selectedRows.length > 0 && selectedRows.every((r) => r.canChangeRole);
  const canDelete = selectedRows.length > 0 && selectedRows.every((r) => r.canDelete);
  const canBlock = selectedRows.length > 0 && selectedRows.every((r) => r.canBlock);
  const allSelectedBlocked = selectedRows.length > 0 && selectedRows.every((r) => r.status === 'block');
  const allVisibleSelected = pageRows.length > 0 && pageRows.every((r) => selectedIds.has(r.id));
  const someVisibleSelected = pageRows.some((r) => selectedIds.has(r.id)) && !allVisibleSelected;

  function toggleOne(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllVisible() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const shouldSelectAll = !allVisibleSelected;
      for (const r of pageRows) {
        if (shouldSelectAll) next.add(r.id);
        else next.delete(r.id);
      }
      return next;
    });
  }

  function clearAll() {
    setQuery('');
    setRoleFilter('all');
    setStatusFilter('all');
    setSelectedIds(new Set());
  }

  async function refresh() {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const res = await getUsers({ forceRefresh: true });
      setRows(res.users ?? []);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to load users');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleBlockToggle() {
    if (!canBlock || selectedCount === 0) return;
    const nextBlocked = !allSelectedBlocked;
    const ok = window.confirm(nextBlocked ? 'Block selected users?' : 'Unblock selected users?');
    if (!ok) return;

    try {
      setIsMutating(true);
      await adminBlockUsers(Array.from(selectedIds), nextBlocked);
      await refresh();
      setSelectedIds(new Set());
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setIsMutating(false);
    }
  }

  async function handleChangeRole() {
    if (!canChangeRole || selectedCount === 0) return;
    const ok = window.confirm(`Change role of selected users to ${bulkRole}?`);
    if (!ok) return;

    try {
      setIsMutating(true);
      await adminChangeUserRole(Array.from(selectedIds), bulkRole);
      await refresh();
      setSelectedIds(new Set());
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setIsMutating(false);
    }
  }

  async function handleRemove() {
    if (!canDelete || selectedCount === 0) return;
    const ok = window.confirm('Remove (delete) selected users? This cannot be undone.');
    if (!ok) return;

    try {
      setIsMutating(true);
      await adminDeleteUsers(Array.from(selectedIds));
      await refresh();
      setSelectedIds(new Set());
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setIsMutating(false);
    }
  }

  const pageButtons = useMemo(() => {
    const candidates = [1, totalPages, safePage - 1, safePage, safePage + 1].filter((n) => n >= 1 && n <= totalPages);
    const uniq = Array.from(new Set(candidates)).sort((a, b) => a - b);
    return uniq;
  }, [safePage, totalPages]);

  const showSkeleton = isLoading && rows.length === 0;

  return (
    <div className="rounded-xl border border-border bg-background p-6 text-[15px]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Users</h1>
          <p className="mt-2 text-muted-foreground">All users across all workspaces.</p>
        </div>
        <button
          type="button"
          className="rounded-2xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary-dark"
        >
          Invite member
        </button>
      </div>

      <div className="mt-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="relative w-full md:max-w-md">
          <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search members..."
            className="w-full rounded-2xl border border-border bg-background py-3 pl-12 pr-4 text-sm font-medium text-foreground outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value as RoleFilter)}
            className="rounded-full border border-border bg-background px-5 py-2.5 text-sm font-semibold text-foreground"
          >
            <option value="all">All roles</option>
            <option value="super_admin">Platform Admin</option>
            <option value="business_owner">Workspace Owner</option>
            <option value="employee">Member</option>
            <option value="unassigned">Unassigned</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="rounded-full border border-border bg-background px-5 py-2.5 text-sm font-semibold text-foreground"
          >
            <option value="all">All status</option>
            <option value="active">Active</option>
            <option value="invited">Pending</option>
            <option value="block">Blocked</option>
            <option value="unassigned">Unassigned</option>
          </select>

          {(query || roleFilter !== 'all' || statusFilter !== 'all' || selectedCount > 0) && (
            <button
              type="button"
              onClick={clearAll}
              className="text-sm font-semibold text-primary hover:underline"
            >
              Clear all
            </button>
          )}
        </div>
      </div>

      {(roleFilter !== 'all' || statusFilter !== 'all') && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {roleFilter !== 'all' && (
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground">
              Role: {roleFilter === 'unassigned' ? 'Unassigned' : roleLabel(roleFilter)}
              <button
                type="button"
                onClick={() => setRoleFilter('all')}
                className="text-muted-foreground hover:text-foreground"
                aria-label="Clear role filter"
              >
                ×
              </button>
            </span>
          )}
          {statusFilter !== 'all' && (
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground">
              Status: {statusFilter === 'unassigned' ? 'Unassigned' : statusLabel(statusFilter)}
              <button
                type="button"
                onClick={() => setStatusFilter('all')}
                className="text-muted-foreground hover:text-foreground"
                aria-label="Clear status filter"
              >
                ×
              </button>
            </span>
          )}
        </div>
      )}

      {selectedCount > 0 && (
        <div className="mt-6 rounded-2xl border border-border bg-background p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm font-semibold text-foreground">{selectedCount} selected</div>
            <div className="flex flex-wrap items-center gap-2">
              {selectedCount === 1 && (
                <Link
                  to={`/cpanel/users/${Array.from(selectedIds)[0]}/account`}
                  className="rounded-full border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground hover:bg-secondary/30"
                >
                  View user
                </Link>
              )}
              <button
                type="button"
                onClick={handleChangeRole}
                disabled={!canChangeRole || isMutating}
                className={`rounded-full border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground ${
                  !canChangeRole || isMutating ? 'opacity-60' : 'hover:bg-secondary/30'
                }`}
              >
                Change role
              </button>
              <select
                value={bulkRole}
                onChange={(e) => setBulkRole(e.target.value as 'employee' | 'business_owner')}
                disabled={!canChangeRole || isMutating}
                className={`rounded-full border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground ${
                  !canChangeRole || isMutating ? 'opacity-60' : ''
                }`}
              >
                <option value="employee">Member</option>
                <option value="business_owner">Workspace Owner</option>
              </select>
              <button
                type="button"
                onClick={handleBlockToggle}
                disabled={!canBlock || isMutating}
                className={`rounded-full border px-4 py-2 text-sm font-semibold ${
                  !canBlock || isMutating
                    ? 'border-amber-200 bg-amber-50 text-amber-800 opacity-60'
                    : 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100'
                }`}
              >
                {allSelectedBlocked ? 'Unblock' : 'Block'}
              </button>
              <button
                type="button"
                onClick={handleRemove}
                disabled={!canDelete || isMutating}
                className={`rounded-full border px-4 py-2 text-sm font-semibold ${
                  !canDelete || isMutating
                    ? 'border-rose-200 bg-rose-50 text-rose-800 opacity-60'
                    : 'border-rose-200 bg-rose-50 text-rose-800 hover:bg-rose-100'
                }`}
              >
                Remove
              </button>
              <button
                type="button"
                onClick={() => setSelectedIds(new Set())}
                className="ml-2 text-sm font-semibold text-primary hover:underline"
              >
                Clear
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mt-6 overflow-hidden rounded-3xl border border-border">
        <table className="w-full border-separate border-spacing-0">
          <thead className="bg-secondary/10">
            <tr>
              <th className="w-14 border-b border-border px-5 py-4 text-left">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = someVisibleSelected;
                  }}
                  onChange={toggleAllVisible}
                  disabled={showSkeleton}
                  className="h-5 w-5 rounded border-border"
                  aria-label="Select all"
                />
              </th>
              <th className="border-b border-border px-5 py-4 text-left text-sm font-bold tracking-wide text-muted-foreground">
                MEMBER
              </th>
              <th className="border-b border-border px-5 py-4 text-left text-sm font-bold tracking-wide text-muted-foreground">
                ROLE / TITLE
              </th>
              <th className="hidden border-b border-border px-5 py-4 text-left text-sm font-bold tracking-wide text-muted-foreground md:table-cell">
                WORKSPACE
              </th>
              <th className="hidden border-b border-border px-5 py-4 text-left text-sm font-bold tracking-wide text-muted-foreground lg:table-cell">
                LAST ACTIVE
              </th>
              <th className="hidden border-b border-border px-5 py-4 text-left text-sm font-bold tracking-wide text-muted-foreground lg:table-cell">
                OPEN TASKS
              </th>
              <th className="border-b border-border px-5 py-4 text-left text-sm font-bold tracking-wide text-muted-foreground">
                STATUS
              </th>
            </tr>
          </thead>
          <tbody>
            {showSkeleton && <UsersTableSkeleton rowsCount={pageSize} />}

            {!showSkeleton && !isLoading && errorMessage && (
              <tr>
                <td colSpan={7} className="px-5 py-8 text-sm font-semibold text-rose-700">
                  {errorMessage}
                </td>
              </tr>
            )}
            {!showSkeleton && !isLoading && !errorMessage && filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-8 text-sm text-muted-foreground">
                  No users found.
                </td>
              </tr>
            )}

            {!showSkeleton &&
              !isLoading &&
              !errorMessage &&
              pageRows.map((r, index) => {
                const isSelected = selectedIds.has(r.id);
                const primary = r.fullName ?? r.email ?? '-';
                const secondary = r.fullName ? r.email ?? '-' : `ID-${r.id.slice(0, 8).toUpperCase()}`;
                const zebra = index % 2 === 1 ? 'bg-secondary/10' : 'bg-background';
                return (
                  <tr
                    key={r.id}
                    className={`${isSelected ? 'bg-primary/5' : zebra} cursor-pointer`}
                    onClick={() => toggleOne(r.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        toggleOne(r.id);
                      }
                    }}
                  >
                    <td className="border-b border-border px-5 py-5 align-middle">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onClick={(e) => e.stopPropagation()}
                        onChange={() => toggleOne(r.id)}
                        className="h-5 w-5 rounded border-border"
                        aria-label={`Select ${r.fullName ?? r.email ?? 'user'}`}
                      />
                    </td>
                    <td className="border-b border-border px-5 py-5 align-middle">
                      <div className="flex items-center gap-4">
                        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-secondary/40 text-sm font-bold text-foreground">
                          {initialsFromName(r.fullName, r.email)}
                        </div>
                        <div>
                          <Link
                            to={`/cpanel/users/${r.id}/account`}
                            onClick={(e) => e.stopPropagation()}
                            className="text-[15px] font-semibold text-foreground hover:underline"
                          >
                            {primary}
                          </Link>
                          <div className="mt-1 text-xs font-medium text-muted-foreground">{secondary}</div>
                        </div>
                      </div>
                    </td>
                    <td className="border-b border-border px-5 py-5 align-middle text-sm font-medium text-muted-foreground">
                      {roleLabel(r.role)}
                    </td>
                    <td className="hidden border-b border-border px-5 py-5 align-middle text-sm font-medium text-muted-foreground md:table-cell">
                      <div className="flex flex-col gap-2">
                        <div className="text-sm font-medium text-muted-foreground">{r.workspaceName ?? '-'}</div>
                        <div>
                          <span
                            className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${workspaceStatusPill(
                              r.workspaceStatus
                            )}`}
                          >
                            {workspaceStatusLabel(r.workspaceStatus)}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="hidden border-b border-border px-5 py-5 align-middle text-sm font-medium text-muted-foreground lg:table-cell">
                      -
                    </td>
                    <td className="hidden border-b border-border px-5 py-5 align-middle text-sm font-medium text-muted-foreground lg:table-cell">
                      0
                    </td>
                    <td className="border-b border-border px-5 py-5 align-middle">
                      <span className={`inline-flex rounded-full px-4 py-2 text-sm font-bold ${statusPill(r.status)}`}>
                        {statusLabel(r.status)}
                      </span>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>

      {showSkeleton && (
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-sm">
            <SkeletonLine className="h-4 w-40" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <SkeletonLine className="h-10 w-20" />
            <SkeletonLine className="h-10 w-10" />
            <SkeletonLine className="h-10 w-10" />
            <SkeletonLine className="h-10 w-20" />
          </div>
        </div>
      )}

      {!showSkeleton && !isLoading && !errorMessage && filtered.length > 0 && (
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-muted-foreground">
            Showing <span className="font-semibold text-foreground">{pageStartIndex + 1}</span>-
            <span className="font-semibold text-foreground">{Math.min(pageStartIndex + pageRows.length, filtered.length)}</span> of{' '}
            <span className="font-semibold text-foreground">{filtered.length}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={safePage <= 1}
              className={`rounded-full border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground ${
                safePage <= 1 ? 'opacity-60' : 'hover:bg-secondary/30'
              }`}
            >
              Prev
            </button>

            {pageButtons.map((n, idx) => {
              const prev = pageButtons[idx - 1];
              const showDots = prev && n - prev > 1;
              return (
                <span key={n} className="flex items-center gap-2">
                  {showDots ? <span className="px-1 text-sm text-muted-foreground">…</span> : null}
                  <button
                    type="button"
                    onClick={() => setPage(n)}
                    className={`h-10 w-10 rounded-full border text-sm font-semibold ${
                      n === safePage
                        ? 'border-primary bg-primary/15 text-primary'
                        : 'border-border bg-background text-foreground hover:bg-secondary/30'
                    }`}
                  >
                    {n}
                  </button>
                </span>
              );
            })}

            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={safePage >= totalPages}
              className={`rounded-full border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground ${
                safePage >= totalPages ? 'opacity-60' : 'hover:bg-secondary/30'
              }`}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
