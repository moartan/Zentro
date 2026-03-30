import { apiGet } from './http';
import type { AdminUserRow, WorkspaceStatus } from './users';

export type WorkspaceMember = {
  id: string;
  fullName: string | null;
  email: string | null;
  role: 'business_owner' | 'employee' | null;
  status: 'active' | 'invited' | 'block' | null;
  createdAt: string;
  canBlock: boolean;
  canDelete: boolean;
};

export type WorkspaceRow = {
  businessId: string | null;
  ownerUserId: string | null;
  slug: string;
  name: string;
  status: WorkspaceStatus;
  totalMembers: number;
  activeMembers: number;
  invitedMembers: number;
  blockedMembers: number;
  ownerName: string | null;
  ownerEmail: string | null;
  createdAt: string;
};

export type WorkspaceDetails = {
  workspace: WorkspaceRow;
  members: WorkspaceMember[];
  summary: {
    owners: number;
    employees: number;
    activeMembers: number;
    invitedMembers: number;
    blockedMembers: number;
  };
};

type UsersResponse = {
  success: boolean;
  users: AdminUserRow[];
};

function toSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function resolveWorkspaceSlug(user: AdminUserRow) {
  if (user.workspaceSlug && user.workspaceSlug.trim()) return user.workspaceSlug.trim();
  const byName = user.workspaceName ? toSlug(user.workspaceName) : '';
  if (byName) return byName;
  return `workspace-${user.id.slice(0, 8)}`;
}

function resolveWorkspaceName(user: AdminUserRow) {
  if (user.workspaceName && user.workspaceName.trim()) return user.workspaceName.trim();
  if (user.workspaceSlug && user.workspaceSlug.trim()) return user.workspaceSlug.trim();
  return 'Untitled Workspace';
}

function resolveStatus(members: AdminUserRow[]): WorkspaceStatus {
  const statuses = members.map((m) => m.workspaceStatus).filter(Boolean);
  if (statuses.includes('past_due')) return 'past_due';
  if (statuses.includes('canceled')) return 'canceled';
  if (statuses.includes('active')) return 'active';
  return null;
}

function buildWorkspaceRows(users: AdminUserRow[]): WorkspaceRow[] {
  const eligible = users.filter((user) => user.role !== 'super_admin' && (user.workspaceName || user.workspaceSlug));
  const groups = new Map<string, AdminUserRow[]>();

  for (const user of eligible) {
    const key = resolveWorkspaceSlug(user);
    const current = groups.get(key) ?? [];
    current.push(user);
    groups.set(key, current);
  }

  return Array.from(groups.entries())
    .map(([slug, members]) => {
      const first = members[0];
      const owner = members.find((member) => member.role === 'business_owner') ?? null;
      const createdAt = members
        .map((member) => member.createdAt)
        .filter(Boolean)
        .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())[0] ?? first.createdAt;

      const activeMembers = members.filter((member) => member.status === 'active').length;
      const invitedMembers = members.filter((member) => member.status === 'invited').length;
      const blockedMembers = members.filter((member) => member.status === 'block').length;

      return {
        businessId: first.businessId ?? null,
        ownerUserId: owner?.id ?? null,
        slug,
        name: resolveWorkspaceName(first),
        status: resolveStatus(members),
        totalMembers: members.length,
        activeMembers,
        invitedMembers,
        blockedMembers,
        ownerName: owner?.fullName ?? null,
        ownerEmail: owner?.email ?? null,
        createdAt,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

function mapMembers(users: AdminUserRow[], workspaceSlug: string): WorkspaceMember[] {
  return users
    .filter((user) => user.role !== 'super_admin')
    .filter((user) => resolveWorkspaceSlug(user) === workspaceSlug)
    .map((user) => ({
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      role: user.role === 'business_owner' || user.role === 'employee' ? user.role : null,
      status: user.status,
      createdAt: user.createdAt,
      canBlock: user.canBlock,
      canDelete: user.canDelete,
    }))
    .sort((a, b) => {
      if (a.role === 'business_owner' && b.role !== 'business_owner') return -1;
      if (b.role === 'business_owner' && a.role !== 'business_owner') return 1;
      return (a.fullName ?? a.email ?? '').localeCompare(b.fullName ?? b.email ?? '');
    });
}

export async function getWorkspaces() {
  const response = await apiGet<UsersResponse>('/api/users');
  const workspaces = buildWorkspaceRows(response.users ?? []);
  return { success: true, workspaces };
}

export async function getWorkspaceDetails(slug: string): Promise<{ success: boolean; details: WorkspaceDetails }> {
  const response = await apiGet<UsersResponse>('/api/users');
  const workspaces = buildWorkspaceRows(response.users ?? []);
  const workspace = workspaces.find((item) => item.slug === slug);

  if (!workspace) {
    throw new Error('Workspace not found');
  }

  const members = mapMembers(response.users ?? [], slug);
  const summary = {
    owners: members.filter((member) => member.role === 'business_owner').length,
    employees: members.filter((member) => member.role === 'employee').length,
    activeMembers: members.filter((member) => member.status === 'active').length,
    invitedMembers: members.filter((member) => member.status === 'invited').length,
    blockedMembers: members.filter((member) => member.status === 'block').length,
  };

  return {
    success: true,
    details: {
      workspace,
      members,
      summary,
    },
  };
}
