import { apiGet, apiPatch } from './http';

export type PlanCode = 'free' | 'pro' | 'enterprise';
export type BillingCycle = 'monthly' | 'yearly';
export type SubscriptionStatus = 'active' | 'past_due' | 'canceled';

export type SubscriptionPlan = {
  code: PlanCode;
  name: string;
  description: string | null;
  currency: string;
  monthlyPriceCents: number | null;
  yearlyPriceCents: number | null;
  yearlyDiscountPercent: number;
  isPublic: boolean;
  isActive: boolean;
  sortOrder: number;
  limits: {
    maxMembers: number | null;
    maxTeams: number | null;
    maxActiveTasks: number | null;
    maxProjects: number | null;
  };
  featureFlags: {
    teams: boolean;
    activityLogs: boolean;
    customRoles: boolean;
    apiAccess: boolean;
    fileUploads: boolean;
  };
  updatedAt: string | null;
};

export type WorkspaceSubscription = {
  businessId: string;
  name: string;
  slug: string;
  ownerUserId: string | null;
  status: SubscriptionStatus;
  planCode: PlanCode;
  billingCycle: BillingCycle;
  currency: string;
  unitPriceCents: number | null;
  renewalAt: string | null;
  trialStartedAt: string | null;
  lastPaymentAt: string | null;
  pendingChange: {
    planCode: PlanCode | null;
    billingCycle: BillingCycle | null;
    effectiveAt: string | null;
  } | null;
  limits: SubscriptionPlan['limits'] | null;
  updatedAt: string | null;
  memberCount?: number;
  teamCount?: number;
  activeTaskCount?: number;
};

export function getSubscriptionPlans() {
  return apiGet<{ success: boolean; plans: SubscriptionPlan[] }>('/api/subscriptions/plans');
}

export function updateSubscriptionPlan(
  code: PlanCode,
  payload: {
    name?: string;
    description?: string;
    currency?: string;
    monthlyPriceCents?: number | null;
    yearlyPriceCents?: number | null;
    yearlyDiscountPercent?: number;
    isPublic?: boolean;
    isActive?: boolean;
    sortOrder?: number;
    limits?: {
      maxMembers?: number | null;
      maxTeams?: number | null;
      maxActiveTasks?: number | null;
      maxProjects?: number | null;
    };
    featureFlags?: {
      teams?: boolean;
      activityLogs?: boolean;
      customRoles?: boolean;
      apiAccess?: boolean;
      fileUploads?: boolean;
    };
  },
) {
  return apiPatch<{ success: boolean; plan: SubscriptionPlan }>(`/api/subscriptions/plans/${code}`, payload);
}

export function getWorkspaceSubscriptions() {
  return apiGet<{ success: boolean; workspaces: WorkspaceSubscription[] }>('/api/subscriptions/workspaces');
}

export function updateWorkspaceSubscription(
  businessId: string,
  payload: {
    planCode?: PlanCode;
    status?: SubscriptionStatus;
    billingCycle?: BillingCycle;
    currency?: string;
    unitPriceCents?: number | null;
    renewalAt?: string | null;
  },
) {
  return apiPatch<{ success: boolean; workspace: WorkspaceSubscription }>(
    `/api/subscriptions/workspaces/${businessId}`,
    payload,
  );
}

export function getMySubscription() {
  return apiGet<{ success: boolean; subscription: WorkspaceSubscription }>('/api/subscriptions/my');
}

export function updateMySubscription(payload: {
  planCode?: PlanCode;
  billingCycle?: BillingCycle;
  applyTiming?: 'now' | 'next_renewal';
}) {
  return apiPatch<{ success: boolean; scheduled?: boolean; subscription: WorkspaceSubscription }>(
    '/api/subscriptions/my',
    payload,
  );
}
