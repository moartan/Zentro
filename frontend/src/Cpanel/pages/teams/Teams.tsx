import { useEffect, useMemo, useState } from 'react';
import { Edit3, Eye, Plus, Search, Trash2 } from 'lucide-react';
import { useApp } from '../../../shared/AppProvider';
import { getMembers } from '../../../shared/api/members';
import {
  createTeam,
  createTeamComment,
  deleteTeam,
  getTeams,
  updateTeam,
  type Team as ApiTeam,
} from '../../../shared/api/teams';
import { useToast } from '../../../shared/toast/ToastProvider';
import TeamDetailsPanel from './components/TeamDetailsPanel';
import TeamFormModal from './components/TeamFormModal';
import {
  formatShortDate,
  FREE_MAX_TEAMS,
  getWorkspaceMembers,
  readMockTeams,
  statusClass,
  statusLabel,
  TEAM_MEMBER_LIMIT_BY_PLAN,
  type Team,
  type TeamStatus,
  type WorkspaceMember,
  writeMockTeams,
} from './mock';

type TeamPlan = 'free' | 'pro' | 'enterprise';

function makeId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
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

export default function TeamsPage() {
  const pageSize = 10;
  const { user, isAuthLoading } = useApp();
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
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [deletingTeamId, setDeletingTeamId] = useState<string | null>(null);

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

  const [resolvedPlan, setResolvedPlan] = useState<TeamPlan | null>(null);

  useEffect(() => {
    const match = user?.memberships?.find((item) => item.businessId === user.businessId);
    const plan = match?.subscriptionPlan;
    if (plan === 'free' || plan === 'pro' || plan === 'enterprise') {
      setResolvedPlan(plan);
      return;
    }
    if (!isAuthLoading && user?.role === 'business_owner') {
      setResolvedPlan('free');
    }
  }, [user?.memberships, user?.businessId, user?.role, isAuthLoading]);

  const effectivePlan: TeamPlan = resolvedPlan ?? 'enterprise';
  const memberLimit = resolvedPlan ? TEAM_MEMBER_LIMIT_BY_PLAN[resolvedPlan] : null;

  useEffect(() => {
    setMembers(fallbackMembers);
  }, [fallbackMembers]);

  useEffect(() => {
    let alive = true;
    getMembers()
      .then((membersRes) => {
        if (!alive) return;
        const nextMembers = uniqMembers(
          (membersRes.members ?? []).map((item) => ({
            id: item.id,
            name: item.fullName ?? item.email ?? 'Member',
            role: item.role,
          })),
        );
        setMembers(nextMembers.length > 0 ? nextMembers : fallbackMembers);
      })
      .catch(() => {
        if (!alive) return;
        setMembers(fallbackMembers);
      });
    return () => {
      alive = false;
    };
  }, [fallbackMembers]);

  useEffect(() => {
    if (source === 'mock') return;
    let alive = true;
    getTeams({
      q: search.trim() || undefined,
      status: statusFilter,
      page,
      pageSize,
    })
      .then((teamsRes) => {
        if (!alive) return;
        setTeams((teamsRes.teams ?? []).map(toLocalTeam));
        setServerPagination(
          teamsRes.pagination ?? {
            page,
            pageSize,
            total: teamsRes.teams?.length ?? 0,
            totalPages: teamsRes.teams?.length ? 1 : 0,
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
  }, [source, search, statusFilter, page, pageSize, fallbackMembers]);

  useEffect(() => {
    if (source !== 'mock') return;
    writeMockTeams(teams);
  }, [teams, source]);

  const filteredTeams = useMemo(() => {
    const query = search.trim().toLowerCase();
    return teams.filter((team) => {
      const matchesQuery = !query || team.name.toLowerCase().includes(query) || team.description.toLowerCase().includes(query);
      const matchesStatus = statusFilter === 'all' || team.status === statusFilter;
      return matchesQuery && matchesStatus;
    });
  }, [teams, search, statusFilter]);
  const mockTotalPages = Math.max(1, Math.ceil(filteredTeams.length / pageSize));
  const safeMockPage = Math.min(Math.max(page, 1), mockTotalPages);
  const mockPageTeams = filteredTeams.slice((safeMockPage - 1) * pageSize, safeMockPage * pageSize);
  const displayTeams = source === 'api' ? teams : mockPageTeams;
  const pagination = source === 'api'
    ? serverPagination
    : {
        page: safeMockPage,
        pageSize,
        total: filteredTeams.length,
        totalPages: mockTotalPages,
        hasNext: safeMockPage < mockTotalPages,
        hasPrev: safeMockPage > 1,
      };

  const memberMap = useMemo(() => new Map(members.map((item) => [item.id, item])), [members]);

  const editingTeam = useMemo(() => teams.find((team) => team.id === editingTeamId) ?? null, [teams, editingTeamId]);
  const selectedTeam = useMemo(() => teams.find((team) => team.id === selectedTeamId) ?? null, [teams, selectedTeamId]);
  const deletingTeam = useMemo(() => teams.find((team) => team.id === deletingTeamId) ?? null, [teams, deletingTeamId]);

  const activeCount = teams.filter((team) => team.status === 'active').length;
  const canCreateTeam = !(effectivePlan === 'free' && teams.length >= FREE_MAX_TEAMS);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter]);

  function openCreateModal() {
    if (!canCreateTeam) return;
    setEditingTeamId(null);
    setIsFormOpen(true);
  }

  function openEditModal(teamId: string) {
    setEditingTeamId(teamId);
    setIsFormOpen(true);
  }

  function closeFormModal() {
    setIsFormOpen(false);
    setEditingTeamId(null);
  }

  async function upsertTeam(values: {
    name: string;
    description: string;
    status: TeamStatus;
    leaderUserId: string;
    memberUserIds: string[];
  }) {
    if (source === 'api') {
      try {
        if (!editingTeamId) {
          const res = await createTeam(values);
          setTeams((prev) => [toLocalTeam(res.team), ...prev]);
          setSelectedTeamId(res.team.id);
          toast.success('Team created successfully.');
        } else {
          const res = await updateTeam(editingTeamId, values);
          setTeams((prev) => prev.map((team) => (team.id === editingTeamId ? toLocalTeam(res.team) : team)));
          toast.success('Team updated successfully.');
        }
        closeFormModal();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to save team');
      }
      return;
    }

    if (!editingTeamId) {
      if (!canCreateTeam) return;
      const now = new Date().toISOString();
      const nextTeam: Team = {
        id: makeId('team'),
        name: values.name,
        description: values.description,
        status: values.status,
        createdByUserId: user?.id ?? 'owner-1',
        leaderUserId: values.leaderUserId,
        memberUserIds: values.memberUserIds,
        comments: [],
        createdAt: now,
        updatedAt: now,
      };
      const next = [nextTeam, ...teams];
      setTeams(next);
      setSelectedTeamId(nextTeam.id);
      closeFormModal();
      toast.success('Team created successfully.');
      return;
    }

    const next = teams.map((team) =>
      team.id === editingTeamId
        ? {
            ...team,
            name: values.name,
            description: values.description,
            status: values.status,
            leaderUserId: values.leaderUserId,
            memberUserIds: values.memberUserIds,
            updatedAt: new Date().toISOString(),
          }
        : team,
    );
    setTeams(next);
    closeFormModal();
    toast.success('Team updated successfully.');
  }

  async function changeTeamStatus(teamId: string, status: TeamStatus) {
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

    const next = teams.map((team) => (team.id === teamId ? { ...team, status, updatedAt: new Date().toISOString() } : team));
    setTeams(next);
    toast.success('Team status updated.');
  }

  async function changeTeamLeader(teamId: string, leaderUserId: string) {
    if (!leaderUserId) return;

    if (source === 'api') {
      try {
        const res = await updateTeam(teamId, { leaderUserId });
        setTeams((prev) => prev.map((team) => (team.id === teamId ? toLocalTeam(res.team) : team)));
        toast.success('Team leader updated.');
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to update leader');
      }
      return;
    }

    const next = teams.map((team) =>
      team.id === teamId ? { ...team, leaderUserId, updatedAt: new Date().toISOString() } : team,
    );
    setTeams(next);
    toast.success('Team leader updated.');
  }

  async function addComment(teamId: string, body: string) {
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

    const authorId = user?.id ?? members[0]?.id ?? 'owner-1';
    const next = teams.map((team) =>
      team.id === teamId
        ? {
            ...team,
            comments: [...team.comments, { id: makeId('comment'), authorId, body, createdAt: new Date().toISOString() }],
            updatedAt: new Date().toISOString(),
          }
        : team,
    );
    setTeams(next);
    toast.success('Comment posted.');
  }

  async function confirmDeleteTeam() {
    if (!deletingTeamId) return;

    if (source === 'api') {
      try {
        await deleteTeam(deletingTeamId);
        setTeams((prev) => prev.filter((team) => team.id !== deletingTeamId));
        if (selectedTeamId === deletingTeamId) setSelectedTeamId(null);
        toast.success('Team deleted successfully.');
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to delete team');
      } finally {
        setDeletingTeamId(null);
      }
      return;
    }

    setTeams((prev) => prev.filter((team) => team.id !== deletingTeamId));
    if (selectedTeamId === deletingTeamId) setSelectedTeamId(null);
    setDeletingTeamId(null);
    toast.success('Team deleted successfully.');
  }

  return (
    <div className="space-y-4 rounded-xl border border-border bg-background p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Teams</h1>
          <p className="mt-1 text-sm text-muted-foreground">Owner view: manage all teams, leaders, and status.</p>
        </div>
        <button
          type="button"
          onClick={openCreateModal}
          disabled={!canCreateTeam}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Plus className="h-4 w-4" />
          Create team
        </button>
      </div>

      {source === 'mock' ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          Using local mock data. Run backend migration + routes to switch to live data.
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-border p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Plan</div>
          <div className="mt-1 text-lg font-semibold text-foreground">{resolvedPlan ? resolvedPlan.toUpperCase() : '...'}</div>
        </div>
        <div className="rounded-xl border border-border p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Teams</div>
          <div className="mt-1 text-lg font-semibold text-foreground">{teams.length}</div>
        </div>
        <div className="rounded-xl border border-border p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Active teams</div>
          <div className="mt-1 text-lg font-semibold text-foreground">{activeCount}</div>
        </div>
      </div>

      {resolvedPlan === 'free' ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          Free plan supports up to {FREE_MAX_TEAMS} teams and {memberLimit ?? 'unlimited'} members per team.
        </div>
      ) : null}

      {!canCreateTeam ? (
        <div className="rounded-xl border border-rose-300 bg-rose-50 p-3 text-sm font-semibold text-rose-700">
          Team limit reached for free plan. Upgrade plan to create more teams.
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-[1fr_220px]">
        <label className="relative block">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
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

      <div className="overflow-hidden rounded-2xl border border-border">
        <table className="w-full border-separate border-spacing-0">
          <thead className="bg-secondary/10">
            <tr>
              <th className="border-b border-border px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-muted-foreground">Team</th>
              <th className="border-b border-border px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-muted-foreground">Leader</th>
              <th className="border-b border-border px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-muted-foreground">Members</th>
              <th className="border-b border-border px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-muted-foreground">Status</th>
              <th className="border-b border-border px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-muted-foreground">Last activity</th>
              <th className="border-b border-border px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-muted-foreground">Action</th>
            </tr>
          </thead>
          <tbody>
            {displayTeams.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">
                  No teams found.
                </td>
              </tr>
            ) : (
              displayTeams.map((team, i) => {
                const leader = memberMap.get(team.leaderUserId);
                const activityAt = lastActivityAt(team) ?? team.updatedAt;
                return (
                  <tr key={team.id} className={i % 2 ? 'bg-secondary/10' : 'bg-background'}>
                    <td className="border-b border-border px-4 py-3 align-top">
                      <div className="font-semibold text-foreground">{team.name}</div>
                      <div className="mt-1 text-xs text-muted-foreground">{team.description || '-'}</div>
                    </td>
                    <td className="border-b border-border px-4 py-3 text-sm text-foreground">{leader?.name ?? 'Unknown'}</td>
                    <td className="border-b border-border px-4 py-3 text-sm text-foreground">{team.memberUserIds.length}</td>
                    <td className="border-b border-border px-4 py-3">
                      <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${statusClass(team.status)}`}>
                        {statusLabel(team.status)}
                      </span>
                    </td>
                    <td className="border-b border-border px-4 py-3 text-sm text-muted-foreground">{formatShortDate(activityAt)}</td>
                    <td className="border-b border-border px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setSelectedTeamId(team.id)}
                          className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          View
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditModal(team.id)}
                          className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeletingTeamId(team.id)}
                          className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-2.5 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
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

      <TeamFormModal
        open={isFormOpen}
        mode={editingTeamId ? 'edit' : 'create'}
        team={editingTeam}
        members={members}
        memberLimit={memberLimit}
        onClose={closeFormModal}
        onSave={upsertTeam}
      />

      <TeamDetailsPanel
        team={selectedTeam}
        members={members}
        currentUserId={user?.id ?? null}
        canChangeStatus
        canChangeLeader
        onClose={() => setSelectedTeamId(null)}
        onChangeStatus={changeTeamStatus}
        onChangeLeader={changeTeamLeader}
        onAddComment={addComment}
      />

      {deletingTeam ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setDeletingTeamId(null);
          }}
        >
          <div className="w-full max-w-md rounded-2xl border border-border bg-background p-5 shadow-2xl">
            <h2 className="text-lg font-semibold text-foreground">Delete team</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              This will permanently delete <span className="font-semibold text-foreground">{deletingTeam.name}</span> and its
              comments. This action cannot be undone.
            </p>
            <div className="mt-5 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeletingTeamId(null)}
                className="rounded-xl border border-border px-4 py-2 text-sm font-semibold text-foreground"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeleteTeam}
                className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700"
              >
                Delete team
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
