import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../../../shared/AppProvider';
import { getDashboardSummary, type DashboardSummary } from '../../../shared/api/dashboard';

type DashboardRole = 'super_admin' | 'business_owner' | 'employee';

type Kpi = {
  label: string;
  value: string;
  hint: string;
};

type UserTypeBreakdown = {
  label: string;
  count: number;
  tone: string;
};

type DashboardMock = {
  workspaceName: string;
  businessType: string;
  industry: string;
  workspaceSize: string;
  billingPlan: string;
  roleDescription: string;
  kpis: Kpi[];
  userTypes: UserTypeBreakdown[];
  highlights: Array<{ label: string; value: string }>;
  recentUpdates: string[];
};

function isSuperAdminUserTypes(
  value: DashboardSummary['userTypes']
): value is { platformAdmins: number; workspaceOwners: number; workspaceMembers: number } {
  return Boolean(
    value &&
      'platformAdmins' in value &&
      'workspaceOwners' in value &&
      'workspaceMembers' in value
  );
}

function isWorkspaceUserTypes(
  value: DashboardSummary['userTypes']
): value is { owners: number; managers: number; members: number } {
  return Boolean(value && 'owners' in value && 'managers' in value && 'members' in value);
}

const MOCK_BY_ROLE: Record<DashboardRole, DashboardMock> = {
  super_admin: {
    workspaceName: 'Zentro Platform',
    businessType: 'Multi-tenant SaaS',
    industry: 'Productivity & Operations',
    workspaceSize: '128 workspaces',
    billingPlan: 'Internal Admin',
    roleDescription: 'Platform Admin',
    kpis: [
      { label: 'Total Users', value: '2,416', hint: '+8.2% this month' },
      { label: 'Active Workspaces', value: '128', hint: '11 pending verification' },
      { label: 'Paid Subscriptions', value: '84', hint: '64 Pro • 20 Enterprise' },
      { label: 'Open Support Tasks', value: '53', hint: '7 marked urgent' },
    ],
    userTypes: [
      { label: 'Platform Admins', count: 4, tone: 'text-sky-600' },
      { label: 'Workspace Owners', count: 128, tone: 'text-emerald-600' },
      { label: 'Workspace Members', count: 2284, tone: 'text-violet-600' },
    ],
    highlights: [
      { label: 'Top Industry Segment', value: 'E-commerce (31%)' },
      { label: 'Average Workspace Size', value: '18.8 users' },
      { label: 'Trial Conversion Rate', value: '24.6%' },
      { label: 'Churn Risk Workspaces', value: '9 flagged' },
    ],
    recentUpdates: [
      '3 workspaces upgraded from Free to Pro today.',
      'Subscription plans were updated in pricing panel.',
      '2 new platform admins accepted invitation.',
    ],
  },
  business_owner: {
    workspaceName: 'Nova Commerce',
    businessType: 'E-commerce Operations',
    industry: 'Retail Technology',
    workspaceSize: '27 members',
    billingPlan: 'Pro Plan',
    roleDescription: 'Workspace Owner',
    kpis: [
      { label: 'Members', value: '27', hint: '3 seats left on current plan' },
      { label: 'Teams', value: '6', hint: '4 active • 2 on hold' },
      { label: 'Active Tasks', value: '43', hint: '11 due this week' },
      { label: 'Completed This Month', value: '98', hint: 'Delivery rate 91%' },
    ],
    userTypes: [
      { label: 'Owners', count: 1, tone: 'text-sky-600' },
      { label: 'Managers', count: 4, tone: 'text-emerald-600' },
      { label: 'Members', count: 22, tone: 'text-violet-600' },
    ],
    highlights: [
      { label: 'Main Team', value: 'Growth Ops' },
      { label: 'Busiest Queue', value: 'Customer Support' },
      { label: 'Average Task Completion', value: '2.3 days' },
      { label: 'Automation Usage', value: '67 workflows running' },
    ],
    recentUpdates: [
      '2 members joined the workspace this week.',
      'Team "Fulfillment" status changed to Active.',
      '5 high-priority tasks were closed in the last 24h.',
    ],
  },
  employee: {
    workspaceName: 'Nova Commerce',
    businessType: 'E-commerce Operations',
    industry: 'Retail Technology',
    workspaceSize: 'My view',
    billingPlan: 'Workspace Pro',
    roleDescription: 'Member',
    kpis: [
      { label: 'My Ongoing Tasks', value: '9', hint: '3 in progress • 1 on hold' },
      { label: 'My Overdue', value: '2', hint: 'Needs follow-up today' },
      { label: 'My Teams', value: '3', hint: 'Growth, CX, QA' },
      { label: 'Done This Week', value: '14', hint: '+5 vs last week' },
    ],
    userTypes: [
      { label: 'Owners', count: 1, tone: 'text-sky-600' },
      { label: 'Managers', count: 4, tone: 'text-emerald-600' },
      { label: 'Members', count: 22, tone: 'text-violet-600' },
    ],
    highlights: [
      { label: 'My Focus Area', value: 'Customer Tickets' },
      { label: 'Next Deadline', value: 'Mar 31, 2026' },
      { label: 'Task Health', value: 'Good' },
      { label: 'Recent Feedback', value: '2 comments pending' },
    ],
    recentUpdates: [
      'Task "Refund Escalation Batch" moved to In Progress.',
      'New comment added on "Weekly CX QA".',
      'Team lead assigned you a high-priority task.',
    ],
  },
};

export default function DashboardPage() {
  const { user } = useApp();

  const currentRole: DashboardRole = user?.role ?? 'employee';
  const mock = MOCK_BY_ROLE[currentRole];
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    getDashboardSummary()
      .then((res) => {
        if (!alive) return;
        setSummary(res.summary ?? null);
        setSummaryError(null);
      })
      .catch((error: unknown) => {
        if (!alive) return;
        setSummary(null);
        const message = error instanceof Error ? error.message : 'Failed to load dashboard summary.';
        setSummaryError(message);
      });

    return () => {
      alive = false;
    };
  }, []);

  const kpis = useMemo(() => {
    if (!summary) return mock.kpis;

    if (currentRole === 'super_admin') {
      return mock.kpis.map((item, index) => {
        if (index === 0) return { ...item, value: summary.totalUsers.toLocaleString() };
        if (index === 1) return { ...item, value: summary.activeWorkspaces.toLocaleString() };
        return item;
      });
    }

    if (currentRole === 'business_owner') {
      return mock.kpis.map((item, index) => {
        if (index === 0) return { ...item, value: summary.totalUsers.toLocaleString() };
        return item;
      });
    }

    return mock.kpis;
  }, [currentRole, mock.kpis, summary]);

  const userTypes = useMemo(() => {
    if (!summary?.userTypes) return mock.userTypes;

    if (currentRole === 'super_admin' && isSuperAdminUserTypes(summary.userTypes)) {
      return mock.userTypes.map((item, index) => {
        if (index === 0) return { ...item, count: summary.userTypes.platformAdmins };
        if (index === 1) return { ...item, count: summary.userTypes.workspaceOwners };
        if (index === 2) return { ...item, count: summary.userTypes.workspaceMembers };
        return item;
      });
    }

    if (isWorkspaceUserTypes(summary.userTypes)) {
      return mock.userTypes.map((item, index) => {
        if (index === 0) return { ...item, count: summary.userTypes.owners };
        if (index === 1) return { ...item, count: summary.userTypes.managers };
        if (index === 2) return { ...item, count: summary.userTypes.members };
        return item;
      });
    }

    return mock.userTypes;
  }, [currentRole, mock.userTypes, summary]);

  const highlights = useMemo(() => {
    if (!summary?.highlights || summary.highlights.length === 0) return mock.highlights;
    return summary.highlights;
  }, [mock.highlights, summary]);

  const recentUpdates = useMemo(() => {
    if (!summary?.recentUpdates || summary.recentUpdates.length === 0) return mock.recentUpdates;
    return summary.recentUpdates;
  }, [mock.recentUpdates, summary]);

  return (
    <div className="space-y-5">
      {summaryError && (
        <section className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Live dashboard data unavailable: {summaryError}
        </section>
      )}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((item) => (
          <article key={item.label} className="rounded-2xl border border-border bg-background p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{item.label}</p>
            <p className="mt-1 text-2xl font-semibold text-foreground">{item.value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{item.hint}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-2xl border border-border bg-background p-5">
          <h2 className="text-base font-semibold text-foreground">User Types In Business</h2>
          <p className="mt-1 text-sm text-muted-foreground">Snapshot by role distribution.</p>
          <div className="mt-4 space-y-3">
            {userTypes.map((item) => (
              <div key={item.label} className="flex items-center justify-between rounded-xl border border-border px-3 py-2">
                <span className="text-sm font-medium text-foreground">{item.label}</span>
                <span className={`text-sm font-semibold ${item.tone}`}>{item.count}</span>
              </div>
            ))}
          </div>
        </article>

        <article className="rounded-2xl border border-border bg-background p-5">
          <h2 className="text-base font-semibold text-foreground">Business Data Highlights</h2>
          <p className="mt-1 text-sm text-muted-foreground">Quick insights for {mock.roleDescription}.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {highlights.map((item) => (
              <div key={item.label} className="rounded-xl border border-border p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{item.label}</p>
                <p className="mt-1 text-sm font-semibold text-foreground">{item.value}</p>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="rounded-2xl border border-border bg-background p-5">
        <h2 className="text-base font-semibold text-foreground">Recent Updates</h2>
        <div className="mt-3 space-y-2">
          {recentUpdates.map((item) => (
            <div key={item} className="rounded-xl border border-border bg-secondary/10 px-3 py-2 text-sm text-foreground">
              {item}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
