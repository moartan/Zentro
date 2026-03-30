import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import RightDrawer from './components/RightDrawer';
import {
  getSubscriptionPlans,
  getWorkspaceSubscriptions,
  type PlanCode,
  type SubscriptionPlan,
  type WorkspaceSubscription,
  updateSubscriptionPlan,
} from '../../../shared/api/subscriptions';
import { useToast } from '../../../shared/toast/ToastProvider';

type BillingView = 'monthly' | 'yearly';

const featureLabelMap: Record<keyof SubscriptionPlan['featureFlags'], string> = {
  teams: 'Teams',
  activityLogs: 'Activity logs',
  customRoles: 'Custom roles',
  apiAccess: 'API access',
  fileUploads: 'File uploads',
};

function formatMoney(cents: number | null, currency: string) {
  if (cents === null) return 'Custom';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);
}

function getLimitText(value: number | null | undefined) {
  if (value === null || value === undefined) return 'Unlimited';
  return String(value);
}

function parseNullableInt(value: string) {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed || trimmed === 'unlimited') return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) throw new Error('Please enter a valid non-negative number or "Unlimited".');
  return Math.trunc(n);
}

function toInputValue(value: number | null | undefined) {
  if (value === null || value === undefined) return '';
  return String(value);
}

function trialDaysForPlan(code: PlanCode) {
  if (code === 'free') return 14;
  return 0;
}

function PlanEditor({
  plan,
  onClose,
  onSaved,
}: {
  plan: SubscriptionPlan | null;
  onClose: () => void;
  onSaved: (plan: SubscriptionPlan) => void;
}) {
  const toast = useToast();
  const [monthly, setMonthly] = useState('');
  const [yearly, setYearly] = useState('');
  const [discount, setDiscount] = useState('0');
  const [maxMembers, setMaxMembers] = useState('');
  const [maxTeams, setMaxTeams] = useState('');
  const [maxActiveTasks, setMaxActiveTasks] = useState('');
  const [maxProjects, setMaxProjects] = useState('');
  const [flags, setFlags] = useState(plan?.featureFlags ?? { teams: false, activityLogs: false, customRoles: false, apiAccess: false, fileUploads: false });
  const [isPublic, setIsPublic] = useState(Boolean(plan?.isPublic));
  const [isActive, setIsActive] = useState(Boolean(plan?.isActive));
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!plan) return;
    setMonthly(toInputValue(plan.monthlyPriceCents));
    setYearly(toInputValue(plan.yearlyPriceCents));
    setDiscount(String(plan.yearlyDiscountPercent ?? 0));
    setMaxMembers(toInputValue(plan.limits.maxMembers));
    setMaxTeams(toInputValue(plan.limits.maxTeams));
    setMaxActiveTasks(toInputValue(plan.limits.maxActiveTasks));
    setMaxProjects(toInputValue(plan.limits.maxProjects));
    setFlags(plan.featureFlags);
    setIsPublic(plan.isPublic);
    setIsActive(plan.isActive);
  }, [plan]);

  async function handleSave() {
    if (!plan) return;

    try {
      setIsSaving(true);

      const yearlyDiscountPercent = Number(discount);
      if (!Number.isFinite(yearlyDiscountPercent) || yearlyDiscountPercent < 0 || yearlyDiscountPercent > 100) {
        throw new Error('Yearly discount must be between 0 and 100.');
      }

      const res = await updateSubscriptionPlan(plan.code as PlanCode, {
        monthlyPriceCents: parseNullableInt(monthly),
        yearlyPriceCents: parseNullableInt(yearly),
        yearlyDiscountPercent,
        isPublic,
        isActive,
        limits: {
          maxMembers: parseNullableInt(maxMembers),
          maxTeams: parseNullableInt(maxTeams),
          maxActiveTasks: parseNullableInt(maxActiveTasks),
          maxProjects: parseNullableInt(maxProjects),
        },
        featureFlags: flags,
      });

      onSaved(res.plan);
      toast.success(`${plan.name} plan updated.`);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update plan');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <RightDrawer
      open={Boolean(plan)}
      onClose={onClose}
      title={`Edit ${plan?.name ?? ''} plan`}
      subtitle="Quick edit for limits, billing, and feature flags."
    >
      {!plan ? null : (
        <div className="space-y-6">
          <section className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2 text-sm font-semibold text-foreground">
              <span>Monthly price (cents)</span>
              <input
                value={monthly}
                onChange={(e) => setMonthly(e.target.value)}
                placeholder="e.g. 2900 or Unlimited"
                className="h-11 w-full rounded-xl border border-border bg-background px-4 text-sm font-medium outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
              />
            </label>
            <label className="space-y-2 text-sm font-semibold text-foreground">
              <span>Yearly price (cents)</span>
              <input
                value={yearly}
                onChange={(e) => setYearly(e.target.value)}
                placeholder="e.g. 27840 or Unlimited"
                className="h-11 w-full rounded-xl border border-border bg-background px-4 text-sm font-medium outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
              />
            </label>
            <label className="space-y-2 text-sm font-semibold text-foreground">
              <span>Yearly discount (%)</span>
              <input
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
                className="h-11 w-full rounded-xl border border-border bg-background px-4 text-sm font-medium outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
              />
            </label>
          </section>

          <section>
            <h3 className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">Limits</h3>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2 text-sm font-semibold text-foreground">
                <span>Max users</span>
                <input
                  value={maxMembers}
                  onChange={(e) => setMaxMembers(e.target.value)}
                  placeholder="5 or Unlimited"
                  className="h-11 w-full rounded-xl border border-border bg-background px-4 text-sm font-medium outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
                />
              </label>
              <label className="space-y-2 text-sm font-semibold text-foreground">
                <span>Max teams</span>
                <input
                  value={maxTeams}
                  onChange={(e) => setMaxTeams(e.target.value)}
                  placeholder="2 or Unlimited"
                  className="h-11 w-full rounded-xl border border-border bg-background px-4 text-sm font-medium outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
                />
              </label>
              <label className="space-y-2 text-sm font-semibold text-foreground">
                <span>Max active tasks</span>
                <input
                  value={maxActiveTasks}
                  onChange={(e) => setMaxActiveTasks(e.target.value)}
                  placeholder="50 or Unlimited"
                  className="h-11 w-full rounded-xl border border-border bg-background px-4 text-sm font-medium outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
                />
              </label>
              <label className="space-y-2 text-sm font-semibold text-foreground">
                <span>Max projects</span>
                <input
                  value={maxProjects}
                  onChange={(e) => setMaxProjects(e.target.value)}
                  placeholder="1 or Unlimited"
                  className="h-11 w-full rounded-xl border border-border bg-background px-4 text-sm font-medium outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
                />
              </label>
            </div>
          </section>

          <section>
            <h3 className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">Feature flags</h3>
            <div className="grid gap-2">
              {(Object.keys(featureLabelMap) as Array<keyof SubscriptionPlan['featureFlags']>).map((key) => (
                <label
                  key={key}
                  className="flex items-center justify-between rounded-xl border border-border px-4 py-3 text-sm font-semibold text-foreground"
                >
                  <span>{featureLabelMap[key]}</span>
                  <input
                    type="checkbox"
                    checked={flags[key]}
                    onChange={(e) => setFlags((prev) => ({ ...prev, [key]: e.target.checked }))}
                    className="h-5 w-5"
                  />
                </label>
              ))}
            </div>
          </section>

          <section className="grid gap-2">
            <label className="flex items-center justify-between rounded-xl border border-border px-4 py-3 text-sm font-semibold text-foreground">
              <span>Public plan</span>
              <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} className="h-5 w-5" />
            </label>
            <label className="flex items-center justify-between rounded-xl border border-border px-4 py-3 text-sm font-semibold text-foreground">
              <span>Active plan</span>
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="h-5 w-5" />
            </label>
          </section>

          <div className="flex items-center justify-end gap-3 border-t border-border pt-4">
            <button type="button" onClick={onClose} className="rounded-xl border border-border px-5 py-2.5 text-sm font-semibold">
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary-dark disabled:opacity-60"
            >
              {isSaving ? 'Saving...' : 'Save changes'}
            </button>
          </div>
        </div>
      )}
    </RightDrawer>
  );
}

export default function SubscriptionPlansPage() {
  const navigate = useNavigate();
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [workspaces, setWorkspaces] = useState<WorkspaceSubscription[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [view, setView] = useState<BillingView>('monthly');
  const [editingPlanCode, setEditingPlanCode] = useState<string | null>(null);
  const [selectedPreviewPlanCode, setSelectedPreviewPlanCode] = useState<PlanCode | null>(null);

  useEffect(() => {
    let alive = true;
    setIsLoading(true);
    setErrorMessage(null);

    Promise.all([getSubscriptionPlans(), getWorkspaceSubscriptions()])
      .then(([plansRes, workspacesRes]) => {
        if (!alive) return;
        setPlans(plansRes.plans ?? []);
        setWorkspaces(workspacesRes.workspaces ?? []);
      })
      .catch((err) => {
        if (!alive) return;
        setErrorMessage(err instanceof Error ? err.message : 'Failed to load plans');
      })
      .finally(() => {
        if (!alive) return;
        setIsLoading(false);
      });

    return () => {
      alive = false;
    };
  }, []);

  const sortedPlans = useMemo(() => [...plans].sort((a, b) => a.sortOrder - b.sortOrder), [plans]);
  const selectedPlan = useMemo(() => sortedPlans.find((plan) => plan.code === editingPlanCode) ?? null, [sortedPlans, editingPlanCode]);
  const selectedPreviewPlan = useMemo(
    () => sortedPlans.find((plan) => plan.code === selectedPreviewPlanCode) ?? null,
    [sortedPlans, selectedPreviewPlanCode],
  );
  const selectedPreviewSummary = selectedPreviewPlan
    ? `${selectedPreviewPlan.name} • ${
        selectedPreviewPlan.code === 'free'
          ? `Trial ${trialDaysForPlan(selectedPreviewPlan.code)} days`
          : `Features ${
              (Object.keys(selectedPreviewPlan.featureFlags) as Array<keyof SubscriptionPlan['featureFlags']>).filter(
                (key) => selectedPreviewPlan.featureFlags[key],
              ).length
            } enabled`
      } • ${
        view === 'monthly'
          ? `${formatMoney(selectedPreviewPlan.monthlyPriceCents, selectedPreviewPlan.currency)} /mo`
          : `${formatMoney(selectedPreviewPlan.yearlyPriceCents, selectedPreviewPlan.currency)} /yr`
      } • Max users ${getLimitText(selectedPreviewPlan.limits.maxMembers)}`
    : 'Select one plan card below to preview billing details.';
  const activeSubscriptionsCount = workspaces.filter((item) => item.status === 'active' && item.planCode !== 'free').length;
  const trialSubscriptionsCount = workspaces.filter((item) => item.status === 'active' && item.planCode === 'free').length;
  const lastUpdated = sortedPlans
    .map((plan) => plan.updatedAt)
    .filter(Boolean)
    .sort()
    .at(-1);

  return (
    <div className="rounded-xl border border-border bg-background p-6 text-[15px]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Subscriptions</h1>
          <p className="mt-2 text-muted-foreground">Configure public pricing tiers and plan limits.</p>
        </div>
        <div className="text-right text-sm text-muted-foreground">
          <p>Pricing version: v2.1</p>
          <p>Last updated: {lastUpdated ? new Date(lastUpdated).toLocaleDateString() : '-'}</p>
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-border bg-background p-5">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Plans</p>
          <p className="mt-2 text-2xl font-semibold text-foreground">{sortedPlans.length}</p>
        </div>
        <div className="rounded-2xl border border-border bg-background p-5">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Active subscriptions</p>
          <p className="mt-2 text-2xl font-semibold text-foreground">{activeSubscriptionsCount}</p>
        </div>
        <div className="rounded-2xl border border-border bg-background p-5">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Trial subscriptions (Free)</p>
          <p className="mt-2 text-2xl font-semibold text-foreground">{trialSubscriptionsCount}</p>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-secondary/5 p-4">
        <div className="text-sm font-semibold text-foreground">Billing view</div>
        <div className="min-w-[280px] flex-1 truncate text-sm text-muted-foreground">{selectedPreviewSummary}</div>
        <button
          type="button"
          onClick={() => selectedPreviewPlan && setEditingPlanCode(selectedPreviewPlan.code)}
          disabled={!selectedPreviewPlan}
          className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
        >
          Edit selected plan
        </button>
        <button
          type="button"
          onClick={() => selectedPreviewPlan && navigate(`/cpanel/subscriptions/businesses?plan=${selectedPreviewPlan.code}`)}
          disabled={!selectedPreviewPlan}
          className="rounded-xl border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground hover:bg-secondary/20 disabled:cursor-not-allowed disabled:opacity-60"
        >
          View workspaces
        </button>
        <div className="inline-flex rounded-full border border-border bg-background p-1">
          <button
            type="button"
            onClick={() => setView('monthly')}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold ${
              view === 'monthly' ? 'bg-secondary text-foreground' : 'text-muted-foreground'
            }`}
          >
            Monthly
          </button>
          <button
            type="button"
            onClick={() => setView('yearly')}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold ${
              view === 'yearly' ? 'bg-secondary text-foreground' : 'text-muted-foreground'
            }`}
          >
            Yearly
          </button>
        </div>
      </div>

      {isLoading ? <p className="mt-8 text-sm text-muted-foreground">Loading plans...</p> : null}
      {errorMessage ? <p className="mt-8 text-sm font-semibold text-rose-700">{errorMessage}</p> : null}

      {!isLoading && !errorMessage ? (
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          {sortedPlans.map((plan) => {
            const priceText = view === 'monthly' ? formatMoney(plan.monthlyPriceCents, plan.currency) : formatMoney(plan.yearlyPriceCents, plan.currency);
            const period = view === 'monthly' ? '/mo' : '/yr';
            const enabledFeatures = (Object.keys(plan.featureFlags) as Array<keyof SubscriptionPlan['featureFlags']>)
              .filter((key) => plan.featureFlags[key])
              .map((key) => featureLabelMap[key]);
            const disabledFeatures = (Object.keys(plan.featureFlags) as Array<keyof SubscriptionPlan['featureFlags']>)
              .filter((key) => !plan.featureFlags[key])
              .map((key) => featureLabelMap[key]);
            const isSelected = selectedPreviewPlanCode === plan.code;

            return (
              <article
                key={plan.code}
                onClick={() => setSelectedPreviewPlanCode((current) => (current === plan.code ? null : plan.code))}
                className={`cursor-pointer rounded-2xl border bg-background p-5 shadow-sm transition ${
                  isSelected ? 'border-primary ring-2 ring-primary/20' : 'border-border hover:border-primary/40'
                }`}
              >
                <div className="flex items-start justify-between">
                  <h2 className="text-2xl font-semibold text-foreground">{plan.name}</h2>
                  <span className="rounded-full bg-secondary/30 px-2.5 py-1 text-xs font-semibold text-muted-foreground">
                    {plan.isPublic ? 'Public' : 'Private'}
                  </span>
                </div>

                <div className="mt-4 flex items-end gap-2">
                  <div className="text-3xl font-semibold text-foreground">{priceText}</div>
                  <div className="pb-0.5 text-sm font-semibold text-muted-foreground">{period}</div>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{plan.description ?? '-'}</p>

                <div className="mt-4 grid gap-1 text-sm text-foreground">
                  <p>Max users: {getLimitText(plan.limits.maxMembers)}</p>
                  <p>Max teams: {getLimitText(plan.limits.maxTeams)}</p>
                  <p>Max active tasks: {getLimitText(plan.limits.maxActiveTasks)}</p>
                  <p>Max projects: {getLimitText(plan.limits.maxProjects)}</p>
                </div>

                <div className="mt-4 grid gap-1 text-sm">
                  {enabledFeatures.map((feature) => (
                    <p key={`${plan.code}-${feature}`} className="text-emerald-700">
                      + {feature}
                    </p>
                  ))}
                  {disabledFeatures.map((feature) => (
                    <p key={`${plan.code}-${feature}`} className="text-rose-700">
                      - {feature}
                    </p>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    setEditingPlanCode(plan.code);
                  }}
                  className="mt-5 inline-flex w-full items-center justify-center rounded-2xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary-dark"
                >
                  Edit plan
                </button>
              </article>
            );
          })}
        </div>
      ) : null}

      <PlanEditor
        plan={selectedPlan}
        onClose={() => setEditingPlanCode(null)}
        onSaved={(updatedPlan) => {
          setPlans((prev) => prev.map((item) => (item.code === updatedPlan.code ? updatedPlan : item)));
        }}
      />
    </div>
  );
}
