import { apiDelete, apiGet, apiPatch, apiPost } from './http';

export type ProfileGender = 'male' | 'female' | null;

export type Profile = {
  id: string;
  email: string | null;
  fullName: string | null;
  avatar: string | null;
  backupEmail: string | null;
  jobTitle: string | null;
  phone: string | null;
  country: string | null;
  gender: ProfileGender;
  bio: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ProfileActivityEntry =
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

export type ProfileSession = {
  id: string;
  device: string;
  ip: string;
  location: string;
  lastSeenAt: string;
  current: boolean;
};

export function getProfile() {
  return apiGet<{ success: boolean; profile: Profile }>('/api/profile');
}

export function updateProfile(payload: {
  fullName?: string;
  jobTitle?: string | null;
  phone?: string | null;
  country?: string | null;
  gender?: 'male' | 'female' | null;
  bio?: string | null;
}) {
  return apiPatch<{ success: boolean; profile: Profile }>('/api/profile', payload);
}

export function updateProfilePassword(payload: { currentPassword: string; newPassword: string }) {
  return apiPatch<{ success: boolean }>('/api/profile/password', payload);
}

export function updateProfileBackupEmail(payload: { backupEmail: string | null }) {
  return apiPatch<{ success: boolean; profile: Profile }>('/api/profile/backup-email', payload);
}

export function getProfileSessions() {
  return apiGet<{
    success: boolean;
    sessions: ProfileSession[];
    summary: {
      total: number;
      loginSuccess: number;
      loginFailed: number;
      auditActions: number;
    };
    activity: ProfileActivityEntry[];
  }>('/api/profile/sessions');
}

export function uploadProfileAvatar(payload: {
  fileName: string;
  contentType: string;
  dataBase64: string;
}) {
  return apiPatch<{ success: boolean; profile: Profile }>('/api/profile/avatar', payload);
}

export function deleteProfileAvatar() {
  return apiDelete<{ success: boolean; profile: Profile }>('/api/profile/avatar');
}

export function resendProfileVerificationEmail(email: string) {
  return apiPost<{ success: boolean }>('/api/profile/email/resend-verification', { email });
}

export function requestProfileEmailChange(payload: { newEmail: string; currentPassword: string }) {
  return apiPatch<{ success: boolean; profile: Profile; message?: string }>('/api/profile/email', payload);
}
