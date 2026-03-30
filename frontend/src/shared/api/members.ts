import { apiDelete, apiGet, apiPatch, apiPost } from './http';

export type MemberStatus = 'active' | 'invited' | 'block' | null;
export type MemberRole = 'business_owner' | 'employee';
export type PermissionRole = 'business_owner' | 'admin' | 'manager' | 'member';
export type PermissionGroup =
  | 'user_management'
  | 'task_management'
  | 'team_management'
  | 'billing'
  | 'settings';
export type PermissionAbility = 'view' | 'create' | 'edit' | 'delete' | 'invite' | 'suspend' | 'manage';
export type PermissionMatrix = Record<PermissionGroup, Partial<Record<PermissionAbility, boolean>>>;

export type MemberRow = {
  id: string;
  email: string | null;
  fullName: string | null;
  role: MemberRole;
  status: MemberStatus;
  joinedAt: string | null;
  openTasks: number;
  doneTasks: number;
};

type MembersResponse = {
  success: boolean;
  members: MemberRow[];
};

export function getMembers() {
  return apiGet<MembersResponse>('/api/members');
}

export type MemberDetails = {
  id: string;
  email: string | null;
  fullName: string | null;
  role: MemberRole;
  status: MemberStatus;
  createdAt: string;
  workspace: {
    businessId: string;
    businessName: string | null;
    businessSlug: string | null;
    ownerUserId: string | null;
    subscriptionPlan: 'free' | 'pro' | 'enterprise' | null;
    subscriptionStatus: 'active' | 'past_due' | 'canceled' | null;
    membershipJoinedAt: string | null;
  };
  teams: Array<{
    teamId: string;
    teamName: string | null;
    teamDescription: string | null;
    role: string | null;
  }>;
  permissions: {
    businessId: string | null;
    role: PermissionRole;
    permissions: PermissionMatrix;
    isCustomOverride: boolean;
    updatedAt: string | null;
  };
};

type MemberDetailsResponse = {
  success: boolean;
  member: MemberDetails;
};

export function getMemberDetails(memberId: string) {
  return apiGet<MemberDetailsResponse>(`/api/members/${memberId}`);
}

export function blockMember(memberId: string, blocked: boolean) {
  return apiPatch<{ success: boolean }>(`/api/members/${memberId}/block`, { blocked });
}

export function changeMemberRole(memberId: string, role: MemberRole) {
  return apiPatch<{ success: boolean }>(`/api/members/${memberId}/role`, { role });
}

export function deleteMember(memberId: string) {
  return apiDelete<{ success: boolean }>(`/api/members/${memberId}`);
}

export type MemberTask = {
  id: string;
  businessId: string;
  title: string;
  description: string;
  status: 'todo' | 'in_progress' | 'done';
  priority: 'low' | 'medium' | 'high';
  assignmentType: 'individual' | 'team';
  assigneeUserId: string | null;
  assigneeTeamId: string | null;
  dueDate: string | null;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
  isDone: boolean;
};

type MemberTasksResponse = {
  success: boolean;
  summary: {
    total: number;
    todo: number;
    inProgress: number;
    done: number;
    overdue: number;
  };
  tasks: MemberTask[];
};

export function getMemberTasks(memberId: string) {
  return apiGet<MemberTasksResponse>(`/api/members/${memberId}/tasks`);
}

export function updateMemberTaskStatus(memberId: string, taskId: string, input: { isDone: boolean }) {
  return apiPatch<{ success: boolean; task: MemberTask }>(`/api/members/${memberId}/tasks/${taskId}`, input);
}

export type MemberActivityEntry =
  | {
      id: string;
      type: 'login';
      occurredAt: string;
      title: string;
      description: string | null;
      ipAddress: string | null;
      userAgent: string | null;
      success: boolean;
    }
  | {
      id: string;
      type: 'audit';
      occurredAt: string;
      title: string;
      description: string | null;
      businessId: string | null;
      metadata: Record<string, unknown>;
    };

type MemberActivityResponse = {
  success: boolean;
  summary: {
    total: number;
    loginSuccess: number;
    loginFailed: number;
    auditActions: number;
  };
  entries: MemberActivityEntry[];
};

export function getMemberActivity(memberId: string) {
  return apiGet<MemberActivityResponse>(`/api/members/${memberId}/activity`);
}

export function saveMemberPermissions(
  memberId: string,
  payload: {
    role: PermissionRole;
    permissions: PermissionMatrix;
    isCustomOverride: boolean;
  },
) {
  return apiPatch<{
    success: boolean;
    permissions: {
      businessId: string | null;
      role: PermissionRole;
      permissions: PermissionMatrix;
      isCustomOverride: boolean;
    };
  }>(`/api/members/${memberId}/permissions`, payload);
}

export type InvitationRole = 'employee' | 'business_owner';
export type InvitationStatus = 'pending' | 'expired';

export type InvitationRow = {
  id: string;
  email: string;
  role: InvitationRole;
  name: string | null;
  gender: string | null;
  country: string | null;
  invitedByUserId: string;
  invitedByName: string | null;
  invitedByEmail: string | null;
  expiresAt: string;
  acceptedAt: string | null;
  createdAt: string;
  status: InvitationStatus;
};

type InvitationsResponse = {
  success: boolean;
  invitations: InvitationRow[];
};

export function getInvitations() {
  return apiGet<InvitationsResponse>('/api/invitations');
}

type CreateInvitationResponse = {
  success: boolean;
  invitation: InvitationRow;
};

export function createInvitation(payload: { email: string; name: string; gender?: string; country?: string }) {
  return apiPost<CreateInvitationResponse>('/api/invitations', payload);
}

export function revokeInvitation(invitationId: string) {
  return apiDelete<{ success: boolean }>(`/api/invitations/${invitationId}`);
}

export function resendInvitation(invitationId: string) {
  return apiPatch<{ success: boolean; invitation: { id: string; expiresAt: string } }>(`/api/invitations/${invitationId}/resend`, {});
}

export function updateInvitation(
  invitationId: string,
  payload: { email: string; name: string; gender?: string; country?: string },
) {
  return apiPatch<{ success: boolean; invitation: InvitationRow }>(`/api/invitations/${invitationId}`, payload);
}
