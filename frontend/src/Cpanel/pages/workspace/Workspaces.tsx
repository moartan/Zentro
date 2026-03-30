import { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { Link } from 'react-router-dom';
import { getWorkspaces, type WorkspaceRow } from '../../../shared/api/workspaces';
import type { WorkspaceStatus } from '../../../shared/api/users';

function formatDate(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
  }).format(d);
}

function statusLabel(status: WorkspaceStatus) {
  if (status === 'active') return 'Active';
  if (status === 'past_due') return 'Past due';
  if (status === 'canceled') return 'Canceled';
  return '-';
}

function statusPill(status: WorkspaceStatus) {
  if (status === 'active') return 'bg-emerald-100 text-emerald-800';
  if (status === 'past_due') return 'bg-amber-100 text-amber-800';
  if (status === 'canceled') return 'bg-rose-100 text-rose-800';
  return 'bg-secondary/50 text-muted-foreground';
}

type StatusFilter = 'all' | 'active' | 'past_due' | 'canceled' | 'unassigned';

export default function WorkspacesPage() {
  const pageSize = 10;
  const [rows, setRows] = useState<WorkspaceRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [page, setPage] = useState(1);

  useEffect(() => {
    let alive = true;
    setIsLoading(true);
    setErrorMessage(null);

    getWorkspaces()
      .then((res) => {
        if (!alive) return;
        setRows(res.workspaces ?? []);
      })
      .catch((err) => {
        if (!alive) return;
        setErrorMessage(err instanceof Error ? err.message : 'Failed to load workspaces');
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
      if (statusFilter !== 'all') {
        const s = r.status ?? 'unassigned';
        if (s !== statusFilter) return false;
      }

      if (!q) return true;
      return [r.name, r.slug, r.ownerName ?? '', r.ownerEmail ?? '', statusLabel(r.status)].join(' ').toLowerCase().includes(q);
    });
  }, [rows, query, statusFilter]);

  useEffect(() => {
    setPage(1);
  }, [query, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const pageRows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  return (
    <div className="rounded-xl border border-border bg-background p-6 text-[15px]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Workspace</h1>
          <p className="mt-2 text-muted-foreground">All workspaces across the platform.</p>
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="relative w-full md:max-w-md">
          <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search workspace..."
            className="h-11 w-full rounded-xl border border-border bg-background pl-12 pr-4 text-sm outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
          />
        </div>

        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
            className="h-11 rounded-xl border border-border bg-background px-4 text-sm font-semibold text-foreground outline-none"
          >
            <option value="all">All status</option>
            <option value="active">Active</option>
            <option value="past_due">Past due</option>
            <option value="canceled">Canceled</option>
            <option value="unassigned">Unassigned</option>
          </select>
        </div>
      </div>

      {isLoading && <div className="mt-8 text-sm text-muted-foreground">Loading workspaces...</div>}
      {!isLoading && errorMessage && <div className="mt-8 text-sm font-semibold text-rose-700">{errorMessage}</div>}

      {!isLoading && !errorMessage && (
        <>
          <div className="mt-6 overflow-hidden rounded-2xl border border-border">
            <table className="w-full border-separate border-spacing-0">
              <thead className="bg-secondary/10">
                <tr>
                  <th className="border-b border-border px-5 py-3 text-left text-xs font-bold uppercase tracking-wide text-muted-foreground">Workspace</th>
                  <th className="border-b border-border px-5 py-3 text-left text-xs font-bold uppercase tracking-wide text-muted-foreground">Owner</th>
                  <th className="border-b border-border px-5 py-3 text-left text-xs font-bold uppercase tracking-wide text-muted-foreground">Members</th>
                  <th className="border-b border-border px-5 py-3 text-left text-xs font-bold uppercase tracking-wide text-muted-foreground">Status</th>
                  <th className="border-b border-border px-5 py-3 text-left text-xs font-bold uppercase tracking-wide text-muted-foreground">Created</th>
                  <th className="border-b border-border px-5 py-3 text-left text-xs font-bold uppercase tracking-wide text-muted-foreground">Action</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((row, index) => (
                  <tr key={row.slug} className={index % 2 === 1 ? 'bg-secondary/10' : 'bg-background'}>
                    <td className="border-b border-border px-5 py-4 align-top">
                      <div className="text-sm font-semibold text-foreground">{row.name}</div>
                      <div className="mt-1 text-xs text-muted-foreground">/{row.slug}</div>
                    </td>
                    <td className="border-b border-border px-5 py-4 align-top">
                      <div className="text-sm text-foreground">{row.ownerName ?? '-'}</div>
                      <div className="mt-1 text-xs text-muted-foreground">{row.ownerEmail ?? '-'}</div>
                    </td>
                    <td className="border-b border-border px-5 py-4 align-top">
                      <div className="text-sm font-semibold text-foreground">{row.totalMembers}</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {row.activeMembers} active / {row.invitedMembers} invited / {row.blockedMembers} blocked
                      </div>
                    </td>
                    <td className="border-b border-border px-5 py-4 align-top">
                      <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${statusPill(row.status)}`}>
                        {statusLabel(row.status)}
                      </span>
                    </td>
                    <td className="border-b border-border px-5 py-4 align-top text-sm text-muted-foreground">{formatDate(row.createdAt)}</td>
                    <td className="border-b border-border px-5 py-4 align-top">
                      <Link
                        to={`/cpanel/workspaces/${row.slug}`}
                        className="inline-flex items-center rounded-xl border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground hover:bg-secondary/20"
                      >
                        View Details
                      </Link>
                    </td>
                  </tr>
                ))}

                {pageRows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-5 py-10 text-center text-sm text-muted-foreground">
                      No workspace matched your filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              Showing {pageRows.length === 0 ? 0 : (safePage - 1) * pageSize + 1}-{(safePage - 1) * pageSize + pageRows.length} of {filtered.length}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                disabled={safePage <= 1}
                className="rounded-lg border border-border px-3 py-1.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
              >
                Prev
              </button>
              <span className="text-sm font-medium text-muted-foreground">
                Page {safePage} of {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                disabled={safePage >= totalPages}
                className="rounded-lg border border-border px-3 py-1.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
