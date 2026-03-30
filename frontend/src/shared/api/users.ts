import { apiDeleteWithBody, apiGet, apiPatch } from './http';

export type UserStatus = 'active' | 'invited' | 'block' | null;
export type UserRole = 'super_admin' | 'business_owner' | 'employee' | null;
export type WorkspaceStatus = 'active' | 'past_due' | 'canceled' | null;
export type PermissionRole = 'super_admin' | 'business_owner' | 'admin' | 'manager' | 'member';
export type PermissionGroup =
  | 'user_management'
  | 'task_management'
  | 'team_management'
  | 'billing'
  | 'settings';
export type PermissionAbility = 'view' | 'create' | 'edit' | 'delete' | 'invite' | 'suspend' | 'manage';
export type PermissionMatrix = Record<PermissionGroup, Partial<Record<PermissionAbility, boolean>>>;

export type AdminUserRow = {
  id: string;
  email: string | null;
  fullName: string | null;
  businessId: string | null;
  role: UserRole;
  status: UserStatus;
  workspaceName: string | null;
  workspaceSlug: string | null;
  workspaceStatus: WorkspaceStatus;
  createdAt: string;
  canChangeRole: boolean;
  canBlock: boolean;
  canDelete: boolean;
};

type UsersResponse = {
  success: boolean;
  users: AdminUserRow[];
};

const USERS_CACHE_KEY = 'zentro.adminUsers.v1';
const USERS_CACHE_TTL_MS = 30_000;

type CachedUsers = {
  cachedAt: number;
  payload: UsersResponse;
};

function readUsersCache(): UsersResponse | null {
  try {
    const raw = sessionStorage.getItem(USERS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedUsers;
    if (!parsed?.cachedAt || !parsed?.payload) return null;
    if (Date.now() - parsed.cachedAt > USERS_CACHE_TTL_MS) return null;
    return parsed.payload;
  } catch {
    return null;
  }
}

function writeUsersCache(payload: UsersResponse) {
  try {
    const value: CachedUsers = { cachedAt: Date.now(), payload };
    sessionStorage.setItem(USERS_CACHE_KEY, JSON.stringify(value));
  } catch {
    // ignore storage errors (quota/private mode)
  }
}

function clearUsersCache() {
  try {
    sessionStorage.removeItem(USERS_CACHE_KEY);
  } catch {
    // ignore
  }
}

/**
 * Returns cached data if it's younger than 30s, otherwise hits the API.
 * Use `forceRefresh` to bypass cache (e.g., manual refresh or after a mutation).
 */
export async function getUsers(opts?: { forceRefresh?: boolean }): Promise<UsersResponse> {
  if (!opts?.forceRefresh) {
    const cached = readUsersCache();
    if (cached) return cached;
  }

  const res = await apiGet<UsersResponse>('/api/users');
  writeUsersCache(res);
  return res;
}

type UserDetailsResponse = {
  success: boolean;
  user: {
    id: string;
    email: string | null;
    fullName: string | null;
    role: UserRole;
    status: UserStatus;
    createdAt: string;
    memberships: Array<{
      businessId: string;
      role: 'business_owner' | 'employee';
      status: 'active' | 'invited' | 'block';
      joinedAt: string | null;
      createdAt: string | null;
      businessName: string | null;
      businessSlug: string | null;
      subscriptionPlan: 'free' | 'pro' | 'enterprise' | null;
      subscriptionStatus: 'active' | 'past_due' | 'canceled' | null;
    }>;
    permissions: {
      businessId: string | null;
      role: PermissionRole;
      permissions: PermissionMatrix;
      isCustomOverride: boolean;
      updatedAt: string | null;
    };
  };
};

export function getUserDetails(userId: string) {
  return apiGet<UserDetailsResponse>(`/api/users/${userId}`);
}

export type UserTask = {
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

type UserTasksResponse = {
  success: boolean;
  summary: {
    total: number;
    todo: number;
    inProgress: number;
    done: number;
    overdue: number;
  };
  tasks: UserTask[];
};

export function getUserTasks(userId: string) {
  return apiGet<UserTasksResponse>(`/api/users/${userId}/tasks`);
}

export function updateUserTaskStatus(
  userId: string,
  taskId: string,
  input: { isDone: boolean },
) {
  return apiPatch<{ success: boolean; task: UserTask }>(
    `/api/users/${userId}/tasks/${taskId}`,
    input,
  );
}

export type UserActivityEntry =
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

type UserActivityResponse = {
  success: boolean;
  summary: {
    total: number;
    loginSuccess: number;
    loginFailed: number;
    auditActions: number;
  };
  entries: UserActivityEntry[];
};

export function getUserActivity(userId: string) {
  return apiGet<UserActivityResponse>(`/api/users/${userId}/activity`);
}

export type UserBillingEvent = {
  id: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  occurredAt: string;
  metadata: Record<string, unknown>;
};

type UserBillingResponse = {
  success: boolean;
  billing: {
    businessId: string | null;
    workspaceName: string | null;
    workspaceSlug: string | null;
    isOwner: boolean;
    role: string | null;
    membershipStatus: string | null;
    plan: 'free' | 'pro' | 'enterprise' | null;
    planLabel: string;
    status: 'active' | 'past_due' | 'canceled' | null;
    statusLabel: string;
    monthlyPriceUsd: number | null;
    outstandingBalanceUsd: number | null;
    paymentMethod: string | null;
    renewalDate: string | null;
    updatedAt: string | null;
    events: UserBillingEvent[];
  };
};

export function getUserBilling(userId: string) {
  return apiGet<UserBillingResponse>(`/api/users/${userId}/billing`);
}

export function saveUserPermissions(
  userId: string,
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
  }>(`/api/users/${userId}/permissions`, payload);
}

export function adminBlockUsers(userIds: string[], blocked: boolean) {
  clearUsersCache();
  return apiPatch<{ success: boolean }>('/api/admin/users/block', { userIds, blocked });
}

export function adminChangeUserRole(userIds: string[], role: 'employee' | 'business_owner') {
  clearUsersCache();
  return apiPatch<{ success: boolean }>('/api/admin/users/role', { userIds, role });
}

export function adminDeleteUsers(userIds: string[]) {
  clearUsersCache();
  return apiDeleteWithBody<{ success: boolean }>('/api/admin/users', { userIds });
}
