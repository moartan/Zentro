import { apiDelete, apiGet, apiPatch, apiPost } from './http';
import { API_BASE_URL } from './config';
import { getActorHeaders } from '../auth/actorContext';

export type TeamStatus = 'active' | 'on_hold' | 'completed' | 'archived';

export type TeamComment = {
  id: string;
  authorId: string;
  authorName?: string | null;
  body: string;
  createdAt: string;
};

export type TeamMember = {
  userId: string;
  role: 'lead' | 'member';
  fullName: string | null;
  email: string | null;
};

export type Team = {
  id: string;
  businessId: string;
  name: string;
  description: string;
  status: TeamStatus;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
  leaderUserId: string | null;
  memberUserIds: string[];
  members: TeamMember[];
  comments: TeamComment[];
};

export type TeamsListResponse = {
  success: boolean;
  teams: Team[];
  pagination?: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
};

export function getTeams(params?: {
  q?: string;
  status?: TeamStatus | 'all';
  page?: number;
  pageSize?: number;
  mine?: boolean;
}) {
  const query = new URLSearchParams();
  if (params?.q) query.set('q', params.q);
  if (params?.status && params.status !== 'all') query.set('status', params.status);
  if (typeof params?.page === 'number') query.set('page', String(params.page));
  if (typeof params?.pageSize === 'number') query.set('pageSize', String(params.pageSize));
  if (params?.mine) query.set('mine', 'true');
  const suffix = query.toString() ? `?${query.toString()}` : '';
  return apiGet<TeamsListResponse>(`/api/teams${suffix}`);
}

export async function getTeamsForBusiness(
  businessId: string,
  params?: {
    q?: string;
    status?: TeamStatus | 'all';
    page?: number;
    pageSize?: number;
    mine?: boolean;
  },
) {
  const query = new URLSearchParams();
  if (params?.q) query.set('q', params.q);
  if (params?.status && params.status !== 'all') query.set('status', params.status);
  if (typeof params?.page === 'number') query.set('page', String(params.page));
  if (typeof params?.pageSize === 'number') query.set('pageSize', String(params.pageSize));
  if (params?.mine) query.set('mine', 'true');
  const suffix = query.toString() ? `?${query.toString()}` : '';

  const headers: Record<string, string> = {
    'X-Business-Id': businessId,
  };
  const actorHeaders = getActorHeaders();
  if (actorHeaders) Object.assign(headers, actorHeaders, { 'X-Business-Id': businessId });

  const response = await fetch(`${API_BASE_URL}/api/teams${suffix}`, {
    method: 'GET',
    credentials: 'include',
    headers,
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.error?.message ?? 'Failed to load teams');
  }
  return payload as TeamsListResponse;
}

export function createTeam(payload: {
  name: string;
  description: string;
  status: TeamStatus;
  leaderUserId: string;
  memberUserIds: string[];
}) {
  return apiPost<{ success: boolean; team: Team }>('/api/teams', payload);
}

export function updateTeam(
  teamId: string,
  payload: {
    name?: string;
    description?: string;
    status?: TeamStatus;
    leaderUserId?: string;
    memberUserIds?: string[];
  },
) {
  return apiPatch<{ success: boolean; team: Team }>(`/api/teams/${teamId}`, payload);
}

export function deleteTeam(teamId: string) {
  return apiDelete<{ success: boolean }>(`/api/teams/${teamId}`);
}

export function createTeamComment(teamId: string, payload: { body: string }) {
  return apiPost<{ success: boolean; comment: TeamComment }>(`/api/teams/${teamId}/comments`, payload);
}
