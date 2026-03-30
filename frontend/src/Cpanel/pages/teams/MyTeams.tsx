import { useEffect, useMemo, useState } from 'react';
import { CalendarClock, Crown, MessageSquare, Search, Users } from 'lucide-react';
import { useApp } from '../../../shared/AppProvider';
import { createTeamComment, getTeams, updateTeam, type Team as ApiTeam } from '../../../shared/api/teams';
import { useToast } from '../../../shared/toast/ToastProvider';
import TeamDetailsPanel from './components/TeamDetailsPanel';
import {
  formatShortDate,
  getWorkspaceMembers,
  readMockTeams,
  statusClass,
  statusLabel,
  type Team,
  type TeamStatus,
  type WorkspaceMember,
  writeMockTeams,
} from './mock';

function makeId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function initials(name: string | undefined) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
}

function toLocalTeam(team: ApiTeam): Team {
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

function uniqMembers(rows: WorkspaceMember[]) {
  const map = new Map<string, WorkspaceMember>();
  for (const row of rows) {
    if (!map.has(row.id)) map.set(row.id, row);
  }
  return [...map.values()];
}

function lastActivityAt(team: Team) {
  const timestamps = [team.updatedAt, ...team.comments.map((item) => item.createdAt)]
    .map((value) => new Date(value).getTime())
    .filter((value) => Number.isFinite(value));
  if (timestamps.length === 0) return null;
  return new Date(Math.max(...timestamps)).toISOString();
}

export default function MyTeamsPage() {
  const pageSize = 9;
  const { user } = useApp();
  const toast = useToast();
  const [teams, setTeams] = useState<Team[]>([]);
  const [source, setSource] = useState<'api' | 'mock'>('api');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | TeamStatus>('all');
  const [page, setPage] = useState(1);
  const [serverPagination, setServerPagination] = useState({
    page: 1,
    pageSize,
    total: 0,
    totalPages: 0,
    hasNext: false,
    hasPrev: false,
  });
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);

  const fallbackMembers = useMemo<WorkspaceMember[]>(
    () =>
      getWorkspaceMembers({
        id: user?.id ?? null,
        fullName: user?.fullName ?? null,
        role: user?.role ?? null,
      }),
    [user?.id, user?.fullName, user?.role],
  );
  const [members, setMembers] = useState<WorkspaceMember[]>(fallbackMembers);

  useEffect(() => {
    setMembers(fallbackMembers);
  }, [fallbackMembers]);

  useEffect(() => {
    if (source === 'mock') return;
    let alive = true;

    getTeams({
      q: search.trim() || undefined,
      status: statusFilter,
      page,
      pageSize,
      mine: true,
    })
      .then((res) => {
        if (!alive) return;
        const apiTeams = res.teams ?? [];
        const nextTeams = apiTeams.map(toLocalTeam);
        const nextMembers = uniqMembers(
          apiTeams.flatMap((team) =>
            (team.members ?? []).map((member) => ({
              id: member.userId,
              name: member.fullName ?? member.email ?? 'Member',
              role: member.role === 'lead' ? 'business_owner' : 'employee',
            })),
          ),
        );

        setTeams(nextTeams);
        setMembers(nextMembers.length > 0 ? nextMembers : fallbackMembers);
        setServerPagination(
          res.pagination ?? {
            page,
            pageSize,
            total: apiTeams.length,
            totalPages: apiTeams.length ? 1 : 0,
            hasNext: false,
            hasPrev: page > 1,
          },
        );
      })
      .catch(() => {
        if (!alive) return;
        setTeams(readMockTeams());
        setMembers(fallbackMembers);
        setSource('mock');
        setPage(1);
      });

    return () => {
      alive = false;
    };
  }, [source, fallbackMembers, search, statusFilter, page, pageSize]);

  useEffect(() => {
    if (source !== 'mock') return;
    writeMockTeams(teams);
  }, [teams, source]);

  const mine = useMemo(() => {
    if (!user?.id) return [];
    const myTeams = teams.filter((team) => team.memberUserIds.includes(user.id));
    const query = search.trim().toLowerCase();
    return myTeams.filter((team) => {
      const matchesStatus = statusFilter === 'all' || team.status === statusFilter;
      if (!query) return matchesStatus;
      const matchesQuery = team.name.toLowerCase().includes(query) || team.description.toLowerCase().includes(query);
      return matchesStatus && matchesQuery;
    });
  }, [teams, user?.id, search, statusFilter]);
  const mockTotalPages = Math.max(1, Math.ceil(mine.length / pageSize));
  const safeMockPage = Math.min(Math.max(page, 1), mockTotalPages);
  const mockPageTeams = mine.slice((safeMockPage - 1) * pageSize, safeMockPage * pageSize);
  const pagedMine = source === 'api' ? mine : mockPageTeams;

  const myTeamsAll = useMemo(() => {
    if (!user?.id) return [];
    return teams.filter((team) => team.memberUserIds.includes(user.id));
  }, [teams, user?.id]);
  const previewFallbackTeams = useMemo(() => (myTeamsAll.length === 0 ? teams.slice(0, 1) : []), [myTeamsAll.length, teams]);
  const visibleTeams = pagedMine.length > 0 ? pagedMine : previewFallbackTeams;

  const memberMap = useMemo(() => new Map(members.map((member) => [member.id, member])), [members]);
  const selectedTeam = useMemo(() => teams.find((team) => team.id === selectedTeamId) ?? null, [teams, selectedTeamId]);
  const leadCount = visibleTeams.filter((team) => team.leaderUserId === user?.id).length;
  const commentCount = visibleTeams.reduce((acc, team) => acc + team.comments.length, 0);
  const statusCounts = {
    active: visibleTeams.filter((team) => team.status === 'active').length,
    on_hold: visibleTeams.filter((team) => team.status === 'on_hold').length,
    completed: visibleTeams.filter((team) => team.status === 'completed').length,
    archived: visibleTeams.filter((team) => team.status === 'archived').length,
  };
  const pagination = source === 'api'
    ? serverPagination
    : {
        page: safeMockPage,
        pageSize,
        total: mine.length,
        totalPages: mockTotalPages,
        hasNext: safeMockPage < mockTotalPages,
        hasPrev: safeMockPage > 1,
      };

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter]);

  async function onChangeStatus(teamId: string, status: TeamStatus) {
    if (!user?.id) return;

    if (source === 'api') {
      try {
        const res = await updateTeam(teamId, { status });
        setTeams((prev) => prev.map((team) => (team.id === teamId ? toLocalTeam(res.team) : team)));
        toast.success('Team status updated.');
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to update status');
      }
      return;
    }

    const next = teams.map((team) => {
      if (team.id !== teamId) return team;
      if (team.leaderUserId !== user.id) return team;
      return { ...team, status, updatedAt: new Date().toISOString() };
    });
    setTeams(next);
    toast.success('Team status updated.');
  }

  async function addComment(teamId: string, body: string) {
    if (!user?.id) return;

    if (source === 'api') {
      try {
        const res = await createTeamComment(teamId, { body });
        setTeams((prev) =>
          prev.map((team) =>
            team.id === teamId
              ? {
                  ...team,
                  comments: [...team.comments, { id: res.comment.id, authorId: res.comment.authorId, body: res.comment.body, createdAt: res.comment.createdAt }],
                  updatedAt: new Date().toISOString(),
                }
              : team,
          ),
        );
        toast.success('Comment posted.');
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to post comment');
      }
      return;
    }

    const next = teams.map((team) =>
      team.id === teamId
        ? {
            ...team,
            comments: [...team.comments, { id: makeId('comment'), authorId: user.id, body, createdAt: new Date().toISOString() }],
            updatedAt: new Date().toISOString(),
          }
        : team,
    );
    setTeams(next);
    toast.success('Comment posted.');
  }

  return (
    <div className="space-y-4 rounded-xl border border-border bg-background p-6">
      <div className="relative overflow-hidden rounded-2xl border border-border bg-[radial-gradient(circle_at_top_right,_rgba(14,165,233,0.14),_transparent_40%),radial-gradient(circle_at_bottom_left,_rgba(16,185,129,0.14),_transparent_45%)] p-5">
        <div className="inline-flex rounded-full border border-border bg-background px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-primary">
          {source === 'api' ? 'Live Data' : 'Mock Preview'}
        </div>
        <h1 className="mt-3 text-3xl font-semibold text-foreground">My Teams</h1>
        <p className="mt-1 text-sm text-muted-foreground">Card-first member view showing only teams you belong to.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-border bg-background/80 p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Joined teams</div>
            <div className="mt-1 text-xl font-semibold text-foreground">{visibleTeams.length}</div>
          </div>
          <div className="rounded-xl border border-border bg-background/80 p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Leading</div>
            <div className="mt-1 text-xl font-semibold text-foreground">{leadCount}</div>
          </div>
          <div className="rounded-xl border border-border bg-background/80 p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Comments</div>
            <div className="mt-1 text-xl font-semibold text-foreground">{commentCount}</div>
          </div>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-[1fr_auto]">
        <label className="relative block">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search your teams"
            className="h-11 w-full rounded-xl border border-border bg-background pl-10 pr-4 text-sm outline-none"
          />
        </label>
        <div className="inline-flex flex-wrap rounded-xl border border-border bg-background p-1">
          <button
            type="button"
            onClick={() => setStatusFilter('all')}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${statusFilter === 'all' ? 'bg-secondary text-foreground' : 'text-muted-foreground'}`}
          >
            All
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('active')}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${statusFilter === 'active' ? 'bg-secondary text-foreground' : 'text-muted-foreground'}`}
          >
            Active {statusCounts.active}
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('on_hold')}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${statusFilter === 'on_hold' ? 'bg-secondary text-foreground' : 'text-muted-foreground'}`}
          >
            On hold {statusCounts.on_hold}
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('completed')}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${statusFilter === 'completed' ? 'bg-secondary text-foreground' : 'text-muted-foreground'}`}
          >
            Done {statusCounts.completed}
          </button>
        </div>
      </div>

      {mine.length === 0 && previewFallbackTeams.length === 0 ? (
        <div className="rounded-xl border border-border p-6 text-sm text-muted-foreground">You are not assigned to any team yet.</div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {visibleTeams.map((team) => {
            const leader = memberMap.get(team.leaderUserId);
            const isLeader = team.leaderUserId === user?.id;
            const recentComment = team.comments[team.comments.length - 1];
            const activityAt = lastActivityAt(team) ?? team.updatedAt;
            const visibleMembers = team.memberUserIds.slice(0, 3).map((id) => memberMap.get(id)?.name ?? 'Member');
            return (
              <article
                key={team.id}
                className="rounded-2xl border border-border bg-[linear-gradient(165deg,rgba(15,23,42,0.03),transparent_55%)] p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <h2 className="text-lg font-semibold text-foreground">{team.name}</h2>
                  <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(team.status)}`}>
                    {statusLabel(team.status)}
                  </span>
                </div>
                <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{team.description || 'No description yet.'}</p>
                <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                  <Users className="h-4 w-4" />
                  <span>{team.memberUserIds.length} members</span>
                </div>
                <div className="mt-2 inline-flex items-center gap-2 text-sm text-muted-foreground">
                  <Crown className="h-4 w-4" />
                  Leader: {leader?.name ?? 'Unknown'}
                </div>
                <div className="mt-3 flex -space-x-2">
                  {visibleMembers.map((name) => (
                    <div
                      key={`${team.id}-${name}`}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-background bg-secondary text-xs font-bold text-foreground"
                      title={name}
                    >
                      {initials(name)}
                    </div>
                  ))}
                </div>
                <div className="mt-3 rounded-lg border border-border bg-background/80 p-2.5 text-xs text-muted-foreground">
                  <div className="inline-flex items-center gap-1.5">
                    <MessageSquare className="h-3.5 w-3.5" />
                    Latest: {recentComment ? recentComment.body : 'No comments yet'}
                  </div>
                </div>
                <div className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <CalendarClock className="h-3.5 w-3.5" />
                  Last activity {formatShortDate(activityAt)}
                </div>
                {isLeader ? <div className="mt-2 text-xs font-semibold text-primary">You are the leader</div> : null}
                <button
                  type="button"
                  onClick={() => setSelectedTeamId(team.id)}
                  className="mt-4 w-full rounded-xl border border-border px-3 py-2 text-sm font-semibold text-foreground hover:bg-secondary/20"
                >
                  Open team board
                </button>
              </article>
            );
          })}
        </div>
      )}
      {mine.length > 0 ? (
        <div className="flex items-center justify-between gap-3">
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
      ) : null}

      <TeamDetailsPanel
        team={selectedTeam}
        members={members}
        currentUserId={user?.id ?? null}
        canChangeStatus={Boolean(selectedTeam && selectedTeam.leaderUserId === user?.id)}
        onClose={() => setSelectedTeamId(null)}
        onChangeStatus={onChangeStatus}
        onAddComment={addComment}
      />
    </div>
  );
}
