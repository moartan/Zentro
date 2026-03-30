export type TeamStatus = 'active' | 'on_hold' | 'completed' | 'archived';

export type TeamComment = {
  id: string;
  authorId: string;
  body: string;
  createdAt: string;
};

export type Team = {
  id: string;
  name: string;
  description: string;
  status: TeamStatus;
  createdByUserId: string;
  leaderUserId: string;
  memberUserIds: string[];
  comments: TeamComment[];
  createdAt: string;
  updatedAt: string;
};

export type WorkspaceMember = {
  id: string;
  name: string;
  role: 'business_owner' | 'employee';
};

export const FREE_MAX_TEAMS = 2;

export const TEAM_MEMBER_LIMIT_BY_PLAN: Record<'free' | 'pro' | 'enterprise', number | null> = {
  free: 5,
  pro: 15,
  enterprise: null,
};

export const teamStatuses: TeamStatus[] = ['active', 'on_hold', 'completed', 'archived'];

const MOCK_STORAGE_KEY = 'zentro.mock.teams.v2';

const seededMembers: WorkspaceMember[] = [
  { id: 'owner-1', name: 'Workspace Owner', role: 'business_owner' },
  { id: 'member-1', name: 'Amina Yusuf', role: 'employee' },
  { id: 'member-2', name: 'Daniel Kim', role: 'employee' },
  { id: 'member-3', name: 'Sarah Cole', role: 'employee' },
  { id: 'member-4', name: 'Noah Patel', role: 'employee' },
  { id: 'member-5', name: 'Lina Ahmed', role: 'employee' },
];

const seededTeams: Team[] = [
  {
    id: 'team-1',
    name: 'Growth Squad',
    description: 'Handles activation and conversion work across onboarding.',
    status: 'active',
    createdByUserId: 'owner-1',
    leaderUserId: 'member-1',
    memberUserIds: ['owner-1', 'member-1', 'member-2', 'member-3'],
    comments: [
      { id: 'c-1', authorId: 'member-1', body: 'I did the onboarding audit today.', createdAt: new Date(Date.now() - 86400000).toISOString() },
      { id: 'c-2', authorId: 'member-2', body: 'We need a new idea for week-two retention.', createdAt: new Date(Date.now() - 7200000).toISOString() },
    ],
    createdAt: new Date(Date.now() - 8 * 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 2 * 3600000).toISOString(),
  },
];

export function statusLabel(status: TeamStatus) {
  if (status === 'active') return 'Active';
  if (status === 'on_hold') return 'On hold';
  if (status === 'completed') return 'Completed';
  return 'Archived';
}

export function statusClass(status: TeamStatus) {
  if (status === 'active') return 'bg-emerald-100 text-emerald-800';
  if (status === 'on_hold') return 'bg-amber-100 text-amber-800';
  if (status === 'completed') return 'bg-sky-100 text-sky-800';
  return 'bg-slate-200 text-slate-700';
}

export function readMockTeams() {
  try {
    const raw = localStorage.getItem(MOCK_STORAGE_KEY);
    if (!raw) return seededTeams;
    const parsed = JSON.parse(raw) as Team[];
    if (!Array.isArray(parsed)) return seededTeams;
    return parsed;
  } catch {
    return seededTeams;
  }
}

export function writeMockTeams(teams: Team[]) {
  localStorage.setItem(MOCK_STORAGE_KEY, JSON.stringify(teams));
}

export function getWorkspaceMembers(currentUser?: {
  id: string | null;
  fullName: string | null;
  role: 'business_owner' | 'employee' | 'super_admin' | null;
}) {
  if (!currentUser?.id) return seededMembers;

  const hasCurrent = seededMembers.some((member) => member.id === currentUser.id);
  if (hasCurrent) return seededMembers;

  if (currentUser.role !== 'business_owner' && currentUser.role !== 'employee') {
    return seededMembers;
  }

  return [
    {
      id: currentUser.id,
      name: currentUser.fullName?.trim() || 'You',
      role: currentUser.role,
    },
    ...seededMembers,
  ];
}

export function formatShortDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: '2-digit', year: 'numeric' }).format(date);
}

export function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}
