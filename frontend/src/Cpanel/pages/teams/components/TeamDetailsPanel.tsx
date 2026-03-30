import { useMemo, useState } from 'react';
import {
  formatDateTime,
  statusClass,
  statusLabel,
  teamStatuses,
  type Team,
  type TeamStatus,
  type WorkspaceMember,
} from '../mock';

export default function TeamDetailsPanel({
  team,
  members,
  currentUserId,
  canChangeStatus,
  canChangeLeader,
  canComment,
  onClose,
  onChangeStatus,
  onChangeLeader,
  onAddComment,
}: {
  team: Team | null;
  members: WorkspaceMember[];
  currentUserId: string | null;
  canChangeStatus: boolean;
  canChangeLeader?: boolean;
  canComment?: boolean;
  onClose: () => void;
  onChangeStatus: (teamId: string, status: TeamStatus) => void;
  onChangeLeader?: (teamId: string, leaderUserId: string) => void;
  onAddComment: (teamId: string, body: string) => void;
}) {
  const [tab, setTab] = useState<'overview' | 'comments' | 'activity'>('overview');
  const [comment, setComment] = useState('');

  const memberMap = useMemo(() => new Map(members.map((member) => [member.id, member])), [members]);
  const leaderName = team ? memberMap.get(team.leaderUserId)?.name ?? 'Unknown' : 'Unknown';
  const activityItems = useMemo(() => {
    if (!team) return [];
    const createdByName = memberMap.get(team.createdByUserId)?.name ?? 'Unknown member';
    const items: Array<{ id: string; time: string; title: string; details: string }> = [
      {
        id: `${team.id}-created`,
        time: team.createdAt,
        title: 'Team created',
        details: `${createdByName} created this team.`,
      },
      ...team.memberUserIds.map((id) => ({
        id: `${team.id}-member-${id}`,
        time: team.createdAt,
        title: 'Member added',
        details: `${memberMap.get(id)?.name ?? 'Unknown member'} was added to the team.`,
      })),
      {
        id: `${team.id}-leader`,
        time: team.createdAt,
        title: 'Leader assigned',
        details: `${leaderName} is assigned as team leader.`,
      },
      ...team.comments.map((comment) => ({
        id: `${team.id}-comment-${comment.id}`,
        time: comment.createdAt,
        title: 'Comment posted',
        details: `${memberMap.get(comment.authorId)?.name ?? 'Unknown member'}: ${comment.body}`,
      })),
    ];

    if (team.updatedAt && team.updatedAt !== team.createdAt) {
      items.push({
        id: `${team.id}-updated`,
        time: team.updatedAt,
        title: 'Team updated',
        details: `Team status is currently ${statusLabel(team.status)}.`,
      });
    }

    return items.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
  }, [leaderName, memberMap, team]);

  if (!team) return null;

  return (
    <div
      className="fixed inset-0 z-40 flex justify-end bg-slate-900/25"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="h-full w-full max-w-xl overflow-y-auto border-l border-border bg-background p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-foreground">{team.name}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{team.description || 'No description yet.'}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg border border-border px-3 py-1.5 text-sm font-semibold">
            Close
          </button>
        </div>

        <div className="mt-4 inline-flex rounded-full border border-border p-1">
          <button
            type="button"
            onClick={() => setTab('overview')}
            className={`rounded-full px-3 py-1 text-xs font-semibold ${tab === 'overview' ? 'bg-secondary text-foreground' : 'text-muted-foreground'}`}
          >
            Overview
          </button>
          <button
            type="button"
            onClick={() => setTab('comments')}
            className={`rounded-full px-3 py-1 text-xs font-semibold ${tab === 'comments' ? 'bg-secondary text-foreground' : 'text-muted-foreground'}`}
          >
            Comments
          </button>
          <button
            type="button"
            onClick={() => setTab('activity')}
            className={`rounded-full px-3 py-1 text-xs font-semibold ${tab === 'activity' ? 'bg-secondary text-foreground' : 'text-muted-foreground'}`}
          >
            Activity
          </button>
        </div>

        {tab === 'overview' ? (
          <div className="mt-4 space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-border p-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Leader</div>
                {canChangeLeader && onChangeLeader ? (
                  <select
                    value={team.leaderUserId}
                    onChange={(e) => onChangeLeader(team.id, e.target.value)}
                    className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm font-medium"
                  >
                    {team.memberUserIds.map((id) => (
                      <option key={id} value={id}>
                        {memberMap.get(id)?.name ?? 'Unknown member'}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="mt-1 text-sm font-semibold text-foreground">{leaderName}</div>
                )}
              </div>
              <div className="rounded-xl border border-border p-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Status</div>
                {canChangeStatus ? (
                  <select
                    value={team.status}
                    onChange={(e) => onChangeStatus(team.id, e.target.value as TeamStatus)}
                    className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm font-medium"
                  >
                    {teamStatuses.map((value) => (
                      <option key={value} value={value}>
                        {statusLabel(value)}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className={`mt-1 inline-flex rounded-full px-3 py-1 text-xs font-semibold ${statusClass(team.status)}`}>
                    {statusLabel(team.status)}
                  </span>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-border p-4">
              <div className="text-sm font-semibold text-foreground">Team members</div>
              <div className="mt-2 grid gap-2">
                {team.memberUserIds.map((id) => {
                  const member = memberMap.get(id);
                  return (
                    <div key={id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
                      <span>{member?.name ?? 'Unknown member'}</span>
                      <span className="text-xs text-muted-foreground">
                        {id === team.leaderUserId ? 'Leader' : member?.role === 'business_owner' ? 'Owner' : 'Member'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : tab === 'comments' ? (
          <div className="mt-4 space-y-3">
            {canComment !== false ? (
              <div className="rounded-xl border border-border p-4">
                <div className="text-sm font-semibold text-foreground">Add comment</div>
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  rows={3}
                  className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
                  placeholder="Example: I did that, we need a new idea..."
                />
                <div className="mt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      const value = comment.trim();
                      if (!value) return;
                      onAddComment(team.id, value);
                      setComment('');
                    }}
                    className="rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground hover:bg-primary-dark"
                  >
                    Post comment
                  </button>
                </div>
              </div>
            ) : null}

            <div className="space-y-2">
              {team.comments.length === 0 ? (
                <div className="rounded-xl border border-border p-4 text-sm text-muted-foreground">No comments yet.</div>
              ) : (
                team.comments
                  .slice()
                  .reverse()
                  .map((item) => {
                    const author = memberMap.get(item.authorId);
                    const isMe = currentUserId && item.authorId === currentUserId;
                    return (
                      <article key={item.id} className="rounded-xl border border-border p-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-sm font-semibold text-foreground">{author?.name ?? 'Unknown member'}</div>
                          <div className="text-xs text-muted-foreground">{formatDateTime(item.createdAt)}</div>
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">{item.body}</p>
                        {isMe ? <div className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-primary">You</div> : null}
                      </article>
                    );
                  })
              )}
            </div>
          </div>
        ) : (
          <div className="mt-4 rounded-xl border border-border p-4">
            <div className="text-sm font-semibold text-foreground">Team activity</div>
            <div className="mt-3 space-y-2">
              {activityItems.length === 0 ? (
                <div className="rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground">No activity yet.</div>
              ) : (
                activityItems.map((item) => (
                  <article key={item.id} className="rounded-lg border border-border px-3 py-2">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-semibold text-foreground">{item.title}</div>
                      <div className="text-xs text-muted-foreground">{formatDateTime(item.time)}</div>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{item.details}</p>
                  </article>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
