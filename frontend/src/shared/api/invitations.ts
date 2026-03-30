import { apiGet, apiPost } from './http';

export type ResolvedInvitation = {
  id: string;
  businessId: string;
  businessName: string | null;
  businessSlug: string | null;
  email: string;
  role: 'employee' | 'business_owner';
  name: string | null;
  gender: string | null;
  country: string | null;
  invitedByName: string | null;
  invitedByEmail: string | null;
  expiresAt: string;
};

export function resolveInvitation(token: string) {
  const query = new URLSearchParams({ token }).toString();
  return apiGet<{ success: boolean; invitation: ResolvedInvitation }>(`/api/invitations/resolve?${query}`);
}

export function acceptInvitation(token: string) {
  return apiPost<{
    success: boolean;
    membership: {
      businessId: string;
      role: 'employee' | 'business_owner';
      status: 'active';
    };
  }>('/api/invitations/accept', { token });
}

export function acceptInvitationWithProfile(payload: {
  token: string;
  name?: string;
  gender?: string;
  country?: string;
}) {
  return apiPost<{
    success: boolean;
    membership: {
      businessId: string;
      role: 'employee' | 'business_owner';
      status: 'active';
    };
  }>('/api/invitations/accept', payload);
}

export function acceptInvitationWithSignup(payload: {
  token: string;
  password: string;
  name?: string;
  gender?: string;
  country?: string;
}) {
  return apiPost<{
    success: boolean;
    membership: {
      businessId: string;
      role: 'employee' | 'business_owner';
      status: 'active';
    };
    user: {
      id: string;
      email: string;
    };
  }>('/api/invitations/accept-signup', payload);
}

export function declineInvitation(token: string) {
  return apiPost<{ success: boolean }>('/api/invitations/decline', { token });
}
