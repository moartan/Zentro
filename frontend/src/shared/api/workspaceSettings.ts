import { apiDelete, apiDeleteWithBody, apiGet, apiPatch } from './http';

export type WorkspaceSettings = {
  id: string;
  name: string;
  slug: string;
  ownerUserId: string;
  description: string | null;
  supportEmail: string | null;
  supportPhone: string | null;
  website: string | null;
  accentColor: string;
  logoUrl: string | null;
  isArchived: boolean;
  archivedAt: string | null;
  subscriptionPlan: 'free' | 'pro' | 'enterprise' | null;
  subscriptionStatus: 'active' | 'past_due' | 'canceled' | null;
  createdAt: string;
  updatedAt: string;
};

export function getWorkspaceSettings() {
  return apiGet<{ success: boolean; workspace: WorkspaceSettings }>('/api/workspace');
}

export function updateWorkspaceSettings(payload: {
  name?: string;
  slug?: string;
  description?: string | null;
  supportEmail?: string | null;
  supportPhone?: string | null;
  website?: string | null;
  accentColor?: string | null;
}) {
  return apiPatch<{ success: boolean; workspace: WorkspaceSettings }>('/api/workspace', payload);
}

export function uploadWorkspaceLogo(payload: {
  fileName: string;
  contentType: string;
  dataBase64: string;
}) {
  return apiPatch<{ success: boolean; workspace: WorkspaceSettings }>('/api/workspace/logo', payload);
}

export function deleteWorkspaceLogo() {
  return apiDelete<{ success: boolean; workspace: WorkspaceSettings }>('/api/workspace/logo');
}

export function archiveWorkspace(payload: { archive: boolean; confirmation: string }) {
  return apiPatch<{ success: boolean; workspace: WorkspaceSettings }>('/api/workspace/archive', payload);
}

export function deleteWorkspace(payload: { confirmation: string; currentPassword: string }) {
  return apiDeleteWithBody<{ success: boolean }>('/api/workspace', payload);
}
