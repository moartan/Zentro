import { useEffect, useMemo, useState } from 'react';
import { Eye, Search, UsersRound } from 'lucide-react';
import { getTeamsForBusiness, type Team as ApiTeam, type TeamStatus } from '../../../../shared/api/teams';
import TeamDetailsPanel from '../../teams/components/TeamDetailsPanel';
import type { Team as DrawerTeam, WorkspaceMember } from '../../teams/mock';
import { useWorkspaceDetailsContext } from '../workspaceDetailsContext';

function statusLabel(status: TeamStatus) {
  if (status === 'active') return 'Active';
  if (status === 'on_hold') return 'On hold';
  if (status === 'completed') return 'Completed';
  return 'Archived';
}

function statusPill(status: TeamStatus) {
  if (status === 'active') return 'bg-emerald-100 text-emerald-800';
  if (status === 'on_hold') return 'bg-amber-100 text-amber-800';
  if (status === 'completed') return 'bg-sky-100 text-sky-800';
  return 'bg-slate-200 text-slate-700';
}

function formatDate(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: '2-digit', year: 'numeric' }).format(d);
}

function toDrawerTeam(team: ApiTeam): DrawerTeam {
  return {
    id: team.id,
    name: team.name,
    description: team.description ?? '',
    status: team.status,
    createdByUserId: team.createdByUserId,
    leaderUserId: team.leaderUserId ?? team.memberUserIds[0] ?? '',
    memberUserIds: team.memberUserIds,
    comments: (team.comments ?? []).map((item) => ({
      id: item.id,
      authorId: item.authorId,
      body: item.body,
      createdAt: item.createdAt,
    })),
    createdAt: team.createdAt,
    updatedAt: team.updatedAt,
  };
}

export default function WorkspaceTeamsTab() {
  const { details } = useWorkspaceDetailsContext();
  const [rows, setRows] = useState<ApiTeam[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | TeamStatus>('all');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 10,
    total: 0,
    totalPages: 0,
    hasNext: false,
    hasPrev: false,
  });
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);

  useEffect(() => {
    if (!details.workspace.businessId) {
      setRows([]);
      setPagination({
        page: 1,
        pageSize: 10,
        total: 0,
        totalPages: 0,
        hasNext: false,
        hasPrev: false,
      });
      setErrorMessage('Workspace business id is missing.');
      setIsLoading(false);
      return;
    }

    let alive = true;
    setIsLoading(true);
    setErrorMessage(null);

    getTeamsForBusiness(details.workspace.businessId, {
      q: query.trim() || undefined,
      status: statusFilter,
      page,
      pageSize: 10,
    })
      .then((res) => {
        if (!alive) return;
        setRows(res.teams ?? []);
        setPagination(
          res.pagination ?? {
            page,
            pageSize: 10,
            total: res.teams?.length ?? 0,
            totalPages: res.teams?.length ? 1 : 0,
            hasNext: false,
            hasPrev: page > 1,
          },
        );
      })
      .catch((err) => {
        if (!alive) return;
        setErrorMessage(err instanceof Error ? err.message : 'Failed to load workspace teams');
      })
      .finally(() => {
        if (!alive) return;
        setIsLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [details.workspace.businessId, page, query, statusFilter]);

  useEffect(() => {
    setPage(1);
  }, [query, statusFilter]);

  const selectedTeam = useMemo(() => rows.find((team) => team.id === selectedTeamId) ?? null, [rows, selectedTeamId]);

  const drawerMembers = useMemo<WorkspaceMember[]>(() => {
    if (!selectedTeam) return [];
    return selectedTeam.members.map((member) => ({
      id: member.userId,
      name: member.fullName ?? member.email ?? 'Member',
      role: member.userId === details.workspace.ownerUserId ? 'business_owner' : 'employee',
    }));
  }, [selectedTeam, details.workspace.ownerUserId]);

  return (
    <div className="rounded-xl border border-border bg-background p-6 shadow-sm">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Teams</h2>
        <p className="mt-1 text-sm text-muted-foreground">Teams that belong to this workspace (read-only for super admin).</p>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-[1fr_220px]">
        <label className="relative block">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by team name or description"
            className="h-11 w-full rounded-xl border border-border bg-background pl-10 pr-4 text-sm outline-none"
          />
        </label>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as 'all' | TeamStatus)}
          className="h-11 rounded-xl border border-border bg-background px-4 text-sm font-semibold"
        >
          <option value="all">All status</option>
          <option value="active">Active</option>
          <option value="on_hold">On hold</option>
          <option value="completed">Completed</option>
          <option value="archived">Archived</option>
        </select>
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-border">
        <table className="w-full border-separate border-spacing-0">
          <thead className="bg-secondary/10">
            <tr>
              <th className="border-b border-border px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-muted-foreground">Team</th>
              <th className="border-b border-border px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-muted-foreground">Leader</th>
              <th className="border-b border-border px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-muted-foreground">Members</th>
              <th className="border-b border-border px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-muted-foreground">Status</th>
              <th className="border-b border-border px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-muted-foreground">Updated</th>
              <th className="border-b border-border px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-muted-foreground">Action</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">Loading teams...</td>
              </tr>
            ) : null}

            {!isLoading && errorMessage ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm font-semibold text-rose-700">{errorMessage}</td>
              </tr>
            ) : null}

            {!isLoading && !errorMessage && rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">No teams found.</td>
              </tr>
            ) : null}

            {!isLoading &&
              !errorMessage &&
              rows.map((team, i) => {
                const leader = team.members.find((member) => member.role === 'lead');
                return (
                  <tr key={team.id} className={i % 2 ? 'bg-secondary/10' : 'bg-background'}>
                    <td className="border-b border-border px-4 py-3 align-top">
                      <div className="font-semibold text-foreground">{team.name}</div>
                      <div className="mt-1 text-xs text-muted-foreground">{team.description || '-'}</div>
                    </td>
                    <td className="border-b border-border px-4 py-3 text-sm text-foreground">
                      {leader?.fullName ?? leader?.email ?? 'Unknown'}
                    </td>
                    <td className="border-b border-border px-4 py-3 text-sm text-foreground">
                      <span className="inline-flex items-center gap-1"><UsersRound className="h-4 w-4" />{team.memberUserIds.length}</span>
                    </td>
                    <td className="border-b border-border px-4 py-3">
                      <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${statusPill(team.status)}`}>
                        {statusLabel(team.status)}
                      </span>
                    </td>
                    <td className="border-b border-border px-4 py-3 text-sm text-muted-foreground">{formatDate(team.updatedAt)}</td>
                    <td className="border-b border-border px-4 py-3">
                      <button
                        type="button"
                        onClick={() => setSelectedTeamId(team.id)}
                        className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        View team
                      </button>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <div className="text-sm text-muted-foreground">
          Page {pagination.page} of {Math.max(pagination.totalPages, 1)} ({pagination.total} teams)
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
            disabled={!pagination.hasPrev}
            className="rounded-lg border border-border px-3 py-1.5 text-sm font-semibold disabled:opacity-50"
          >
            Prev
          </button>
          <button
            type="button"
            onClick={() => setPage((prev) => prev + 1)}
            disabled={!pagination.hasNext}
            className="rounded-lg border border-border px-3 py-1.5 text-sm font-semibold disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>

      <TeamDetailsPanel
        team={selectedTeam ? toDrawerTeam(selectedTeam) : null}
        members={drawerMembers}
        currentUserId={null}
        canChangeStatus={false}
        canChangeLeader={false}
        canComment={false}
        onClose={() => setSelectedTeamId(null)}
        onChangeStatus={() => undefined}
        onChangeLeader={() => undefined}
        onAddComment={() => undefined}
      />
    </div>
  );
}
