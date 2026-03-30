import { apiGet } from './http';

export type SuperAdminUserTypes = {
  platformAdmins: number;
  workspaceOwners: number;
  workspaceMembers: number;
};

export type WorkspaceUserTypes = {
  owners: number;
  managers: number;
  members: number;
};

export type DashboardHighlight = {
  label: string;
  value: string;
};

export type DashboardSummary = {
  role: 'super_admin' | 'business_owner' | 'employee';
  businessId?: string;
  totalUsers: number;
  activeWorkspaces: number;
  userTypes?: SuperAdminUserTypes | WorkspaceUserTypes;
  highlights?: DashboardHighlight[];
  recentUpdates?: string[];
};

export function getDashboardSummary() {
  return apiGet<{ success: boolean; summary: DashboardSummary }>('/api/dashboard/summary');
}
