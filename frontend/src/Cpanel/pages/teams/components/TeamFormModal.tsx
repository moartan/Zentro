import { useEffect, useMemo, useState } from 'react';
import {
  statusLabel,
  teamStatuses,
  type Team,
  type TeamStatus,
  type WorkspaceMember,
} from '../mock';

type TeamFormValues = {
  name: string;
  description: string;
  status: TeamStatus;
  leaderUserId: string;
  memberUserIds: string[];
};

export default function TeamFormModal({
  open,
  mode,
  team,
  members,
  memberLimit,
  onClose,
  onSave,
}: {
  open: boolean;
  mode: 'create' | 'edit';
  team: Team | null;
  members: WorkspaceMember[];
  memberLimit: number | null;
  onClose: () => void;
  onSave: (values: TeamFormValues) => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<TeamStatus>('active');
  const [leaderUserId, setLeaderUserId] = useState('');
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (team) {
      setName(team.name);
      setDescription(team.description);
      setStatus(team.status);
      setLeaderUserId(team.leaderUserId);
      setSelectedMemberIds(team.memberUserIds);
      setErrorMessage(null);
      return;
    }

    const defaults = members.slice(0, 2).map((m) => m.id);
    setName('');
    setDescription('');
    setStatus('active');
    setSelectedMemberIds(defaults);
    setLeaderUserId(defaults[0] ?? members[0]?.id ?? '');
    setErrorMessage(null);
  }, [open, team, members]);

  const selectableLeaders = useMemo(
    () => members.filter((member) => selectedMemberIds.includes(member.id)),
    [members, selectedMemberIds],
  );

  function toggleMember(memberId: string) {
    setSelectedMemberIds((prev) => {
      if (prev.includes(memberId)) {
        const next = prev.filter((id) => id !== memberId);
        if (leaderUserId === memberId) {
          setLeaderUserId(next[0] ?? '');
        }
        return next;
      }
      return [...prev, memberId];
    });
  }

  function submit() {
    const cleanName = name.trim();
    const cleanDescription = description.trim();

    if (!cleanName) {
      setErrorMessage('Team name is required.');
      return;
    }

    if (selectedMemberIds.length === 0) {
      setErrorMessage('Select at least one member.');
      return;
    }

    if (!selectedMemberIds.includes(leaderUserId)) {
      setErrorMessage('Leader must be one of the selected members.');
      return;
    }

    if (memberLimit !== null && selectedMemberIds.length > memberLimit) {
      setErrorMessage(`This plan supports up to ${memberLimit} team members.`);
      return;
    }

    onSave({
      name: cleanName,
      description: cleanDescription,
      status,
      leaderUserId,
      memberUserIds: selectedMemberIds,
    });
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-2xl rounded-2xl border border-border bg-background p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-foreground">{mode === 'create' ? 'Create team' : 'Edit team'}</h2>
            <p className="mt-1 text-sm text-muted-foreground">Set team members and assign one team leader.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border px-3 py-1.5 text-sm font-semibold text-muted-foreground"
          >
            Close
          </button>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="space-y-2 text-sm font-semibold text-foreground">
            <span>Team name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-11 w-full rounded-xl border border-border bg-background px-4 text-sm font-medium outline-none"
              placeholder="Growth Squad"
            />
          </label>

          <label className="space-y-2 text-sm font-semibold text-foreground">
            <span>Status</span>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as TeamStatus)}
              className="h-11 w-full rounded-xl border border-border bg-background px-4 text-sm font-medium outline-none"
            >
              {teamStatuses.map((value) => (
                <option key={value} value={value}>
                  {statusLabel(value)}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="mt-4 block space-y-2 text-sm font-semibold text-foreground">
          <span>Description</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm font-medium outline-none"
            placeholder="What this team is responsible for..."
          />
        </label>

        <div className="mt-4 rounded-xl border border-border p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-semibold text-foreground">Members</div>
            <div className="text-xs text-muted-foreground">
              {selectedMemberIds.length}
              {memberLimit !== null ? ` / ${memberLimit}` : ' / Unlimited'}
            </div>
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {members.map((member) => (
              <label
                key={member.id}
                className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm"
              >
                <span>{member.name}</span>
                <input
                  type="checkbox"
                  checked={selectedMemberIds.includes(member.id)}
                  onChange={() => toggleMember(member.id)}
                  className="h-4 w-4"
                />
              </label>
            ))}
          </div>
        </div>

        <label className="mt-4 block space-y-2 text-sm font-semibold text-foreground">
          <span>Team leader</span>
          <select
            value={leaderUserId}
            onChange={(e) => setLeaderUserId(e.target.value)}
            className="h-11 w-full rounded-xl border border-border bg-background px-4 text-sm font-medium outline-none"
          >
            {selectableLeaders.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}
              </option>
            ))}
          </select>
        </label>

        {errorMessage ? <div className="mt-3 text-sm font-semibold text-rose-700">{errorMessage}</div> : null}

        <div className="mt-5 flex items-center justify-end gap-3 border-t border-border pt-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-border px-4 py-2 text-sm font-semibold text-foreground"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary-dark"
          >
            {mode === 'create' ? 'Create team' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
