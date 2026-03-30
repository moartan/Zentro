import { useEffect, useMemo, useState } from 'react';
import {
  getMySubscription,
  getSubscriptionPlans,
  type BillingCycle,
  type PlanCode,
  type SubscriptionPlan,
  type WorkspaceSubscription,
  updateMySubscription,
} from '../../../shared/api/subscriptions';
import { useToast } from '../../../shared/toast/ToastProvider';

const featureLabels: Record<keyof SubscriptionPlan['featureFlags'], string> = {
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

function formatDate(value: string | null) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
  }).format(d);
}

function addDays(value: string | null, days: number) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

function cycleDays(cycle: BillingCycle) {
  return cycle === 'yearly' ? 365 : 30;
}

function daysLeftUntil(value: string | null) {
  if (!value) return null;
  const target = new Date(value);
  if (Number.isNaN(target.getTime())) return null;
  const now = new Date();
  const diffMs = target.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
}

function planLabel(code: PlanCode) {
  if (code === 'free') return 'Free';
  if (code === 'pro') return 'Pro';
  return 'Enterprise';
}

function statusLabel(status: WorkspaceSubscription['status']) {
  if (status === 'active') return 'Active';
  if (status === 'past_due') return 'Past due';
  return 'Canceled';
}

function statusPill(status: WorkspaceSubscription['status']) {
  if (status === 'active') return 'bg-emerald-100 text-emerald-800';
  if (status === 'past_due') return 'bg-amber-100 text-amber-800';
  return 'bg-rose-100 text-rose-800';
}

function limitText(value: number | null | undefined) {
  if (value === null || typeof value === 'undefined') return 'Unlimited';
  return String(value);
}

export default function MySubscriptionPage() {
  const toast = useToast();
  const [subscription, setSubscription] = useState<WorkspaceSubscription | null>(null);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedCycle, setSelectedCycle] = useState<BillingCycle>('monthly');
  const [pendingSwitch, setPendingSwitch] = useState<{
    planCode: PlanCode;
    billingCycle: BillingCycle;
    applyTiming: 'now' | 'next_renewal';
  } | null>(null);

  useEffect(() => {
    let alive = true;
    setIsLoading(true);
    setErrorMessage(null);

    Promise.all([getMySubscription(), getSubscriptionPlans()])
      .then(([subRes, plansRes]) => {
        if (!alive) return;
        setSubscription(subRes.subscription ?? null);
        setPlans(plansRes.plans ?? []);
        if (subRes.subscription?.billingCycle) {
          setSelectedCycle(subRes.subscription.billingCycle);
        }
      })
      .catch((err) => {
        if (!alive) return;
        setErrorMessage(err instanceof Error ? err.message : 'Failed to load subscription');
      })
      .finally(() => {
        if (!alive) return;
        setIsLoading(false);
      });

    return () => {
      alive = false;
    };
  }, []);

  const planMap = useMemo(() => new Map(plans.map((p) => [p.code, p])), [plans]);
  const currentPlan = subscription ? planMap.get(subscription.planCode) ?? null : null;
  const isFreePlan = subscription?.planCode === 'free';
  const trialStartBase =
    subscription?.trialStartedAt ?? (subscription?.planCode === 'free' ? subscription?.updatedAt ?? null : null);
  const trialRenewalDate = subscription?.planCode === 'free' ? addDays(trialStartBase, 14) : null;
  const paidStartDate =
    subscription?.lastPaymentAt ?? (subscription?.planCode !== 'free' ? subscription?.updatedAt ?? null : null);
  const paidRenewalDate =
    subscription?.planCode !== 'free'
      ? subscription?.renewalAt ?? addDays(paidStartDate, cycleDays(subscription?.billingCycle ?? 'monthly'))
      : null;
  const renewalDate = isFreePlan ? trialRenewalDate : paidRenewalDate;
  const paidDaysLeft = !isFreePlan ? daysLeftUntil(renewalDate) : null;
  const membersUsed = subscription?.memberCount ?? 0;
  const teamsUsed = subscription?.teamCount ?? 0;
  const activeTasksUsed = subscription?.activeTaskCount ?? 0;
  const teamsLimit = subscription?.limits?.maxTeams ?? null;
  const activeTasksLimit = subscription?.limits?.maxActiveTasks ?? null;
  const pendingPlan = pendingSwitch ? planMap.get(pendingSwitch.planCode) ?? null : null;
  const pendingOverLimitItems = pendingPlan
    ? [
        {
          label: 'Members',
          used: membersUsed,
          limit: pendingPlan.limits.maxMembers,
        },
        {
          label: 'Teams',
          used: teamsUsed,
          limit: pendingPlan.limits.maxTeams,
        },
        {
          label: 'Active tasks',
          used: activeTasksUsed,
          limit: pendingPlan.limits.maxActiveTasks,
        },
      ].filter((item) => item.limit !== null && item.used > (item.limit ?? 0))
    : [];
  const displayedPrice = subscription
    ? subscription.billingCycle === 'yearly'
      ? formatMoney(currentPlan?.yearlyPriceCents ?? subscription.unitPriceCents, subscription.currency)
      : formatMoney(currentPlan?.monthlyPriceCents ?? subscription.unitPriceCents, subscription.currency)
    : '-';

  async function performSwitchPlan(
    planCode: PlanCode,
    billingCycle: BillingCycle,
    applyTiming: 'now' | 'next_renewal',
  ) {
    if (!subscription) return;
    if (subscription.planCode === planCode && subscription.billingCycle === billingCycle && applyTiming === 'now') return;

    try {
      setIsSaving(true);
      const res = await updateMySubscription({ planCode, billingCycle, applyTiming });
      setSubscription((prev) => (prev ? { ...prev, ...res.subscription } : res.subscription));
      setSelectedCycle(res.subscription.billingCycle);
      if (res.scheduled) {
        toast.success(`Plan switch scheduled for next renewal.`);
      } else {
        toast.success(`Subscription updated to ${planLabel(planCode)} (${billingCycle}).`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update subscription');
    } finally {
      setIsSaving(false);
    }
  }

  function openSwitchConfirm(planCode: PlanCode) {
    if (!subscription) return;
    if (subscription.planCode === planCode && subscription.billingCycle === selectedCycle) return;
    setPendingSwitch({ planCode, billingCycle: selectedCycle, applyTiming: 'now' });
  }

  async function handleConfirmSwitch() {
    if (!pendingSwitch) return;
    await performSwitchPlan(pendingSwitch.planCode, pendingSwitch.billingCycle, pendingSwitch.applyTiming);
    setPendingSwitch(null);
  }

  return (
    <div className="rounded-xl border border-border bg-background p-6 text-[15px]">
      <h1 className="text-2xl font-semibold">My Subscription</h1>
      <p className="mt-2 text-muted-foreground">Review your current plan, limits, and billing timeline.</p>

      {isLoading ? <div className="mt-6 text-sm text-muted-foreground">Loading subscription...</div> : null}
      {errorMessage ? <div className="mt-6 text-sm font-semibold text-rose-700">{errorMessage}</div> : null}

      {!isLoading && !errorMessage && subscription ? (
        <>
          <section className="mt-6 rounded-2xl border border-border bg-background p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Current plan</div>
                <div className="mt-2 text-2xl font-semibold text-foreground">{planLabel(subscription.planCode)}</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  {displayedPrice} / {subscription.billingCycle === 'yearly' ? 'yr' : 'mo'}
                </div>
              </div>
              <span className={`inline-flex rounded-full px-4 py-2 text-sm font-bold ${statusPill(subscription.status)}`}>
                {statusLabel(subscription.status)}
              </span>
            </div>
          </section>

          <section className="mt-4 grid gap-4 md:grid-cols-3">
            <article className="rounded-2xl border border-border bg-background p-4">
              <div className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Members</div>
              <div className="mt-2 text-xl font-semibold text-foreground">
                {membersUsed}
                <span className="text-sm font-medium text-muted-foreground"> / {subscription.limits?.maxMembers ?? 'Unlimited'}</span>
              </div>
            </article>
            <article className="rounded-2xl border border-border bg-background p-4">
              <div className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Teams</div>
              <div className="mt-2 text-xl font-semibold text-foreground">
                {teamsUsed}
                <span className="text-sm font-medium text-muted-foreground"> / {teamsLimit ?? 'Unlimited'}</span>
              </div>
            </article>
            <article className="rounded-2xl border border-border bg-background p-4">
              <div className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Active tasks</div>
              <div className="mt-2 text-xl font-semibold text-foreground">
                {activeTasksUsed}
                <span className="text-sm font-medium text-muted-foreground"> / {activeTasksLimit ?? 'Unlimited'}</span>
              </div>
            </article>
          </section>

          <section className="mt-4 rounded-2xl border border-border bg-background p-4">
            <div className="grid gap-2 md:grid-cols-2">
              <div className="rounded-xl border border-border px-4 py-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Billing cycle</div>
                <div className="mt-1 text-sm font-semibold text-foreground">{subscription.billingCycle === 'yearly' ? 'Yearly' : 'Monthly'}</div>
              </div>
              <div className="rounded-xl border border-border px-4 py-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {isFreePlan ? 'Renewal' : 'Next payment'}
                </div>
                <div className="mt-1 text-sm font-semibold text-foreground">{formatDate(renewalDate)}</div>
              </div>
              <div className="rounded-xl border border-border px-4 py-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {isFreePlan ? 'Trial started' : 'Starting date'}
                </div>
                <div className="mt-1 text-sm font-semibold text-foreground">
                  {formatDate(isFreePlan ? subscription.trialStartedAt : paidStartDate)}
                </div>
              </div>
              <div className="rounded-xl border border-border px-4 py-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {isFreePlan ? 'Last payment' : 'Days left'}
                </div>
                <div className="mt-1 text-sm font-semibold text-foreground">
                  {isFreePlan ? formatDate(subscription.lastPaymentAt) : paidDaysLeft === null ? '-' : `${paidDaysLeft} days left`}
                </div>
              </div>
            </div>
          </section>

          {subscription.pendingChange ? (
            <section className="mt-4 rounded-2xl border border-amber-300 bg-amber-50 p-4">
              <div className="text-sm font-semibold text-amber-900">Scheduled change</div>
              <div className="mt-1 text-sm text-amber-800">
                {planLabel(subscription.pendingChange.planCode ?? subscription.planCode)} (
                {subscription.pendingChange.billingCycle === 'yearly' ? 'yearly' : 'monthly'}) on{' '}
                {formatDate(subscription.pendingChange.effectiveAt)}.
              </div>
            </section>
          ) : null}

          <section className="mt-4 rounded-2xl border border-border bg-background p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm font-semibold text-foreground">Switch plan</div>
              <div className="inline-flex rounded-full border border-border p-1">
                <button
                  type="button"
                  onClick={() => setSelectedCycle('monthly')}
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    selectedCycle === 'monthly' ? 'bg-secondary text-foreground' : 'text-muted-foreground'
                  }`}
                >
                  Monthly
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedCycle('yearly')}
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    selectedCycle === 'yearly' ? 'bg-secondary text-foreground' : 'text-muted-foreground'
                  }`}
                >
                  Yearly
                </button>
              </div>
            </div>
            <div className="mt-3 grid gap-3 lg:grid-cols-3">
              {plans.map((plan) => {
                const isCurrentPlan = subscription.planCode === plan.code;
                const isCurrentSelection = isCurrentPlan && subscription.billingCycle === selectedCycle;
                const priceText =
                  selectedCycle === 'yearly'
                    ? formatMoney(plan.yearlyPriceCents, plan.currency)
                    : formatMoney(plan.monthlyPriceCents, plan.currency);
                const enabledFeatures = (Object.keys(featureLabels) as Array<keyof SubscriptionPlan['featureFlags']>).filter(
                  (key) => plan.featureFlags[key],
                );
                const disabledFeatures = (Object.keys(featureLabels) as Array<keyof SubscriptionPlan['featureFlags']>).filter(
                  (key) => !plan.featureFlags[key],
                );
                return (
                  <article
                    key={plan.code}
                    className={`rounded-2xl border bg-background p-4 ${isCurrentPlan ? 'border-primary ring-2 ring-primary/20' : 'border-border'}`}
                  >
                    <div className="text-lg font-semibold text-foreground">{plan.name}</div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      {priceText} / {selectedCycle === 'yearly' ? 'yr' : 'mo'}
                    </div>
                    <div className="mt-3 space-y-1 text-sm text-muted-foreground">
                      <div>Members: {limitText(plan.limits.maxMembers)}</div>
                      <div>Teams: {limitText(plan.limits.maxTeams)}</div>
                      <div>Active tasks: {limitText(plan.limits.maxActiveTasks)}</div>
                    </div>
                    <div className="mt-3 space-y-1 text-sm">
                      {enabledFeatures.map((key) => (
                        <div key={`${plan.code}-${key}`} className="text-emerald-700">
                          + {featureLabels[key]}
                        </div>
                      ))}
                      {disabledFeatures.map((key) => (
                        <div key={`${plan.code}-${key}`} className="text-rose-700">
                          - {featureLabels[key]}
                        </div>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => openSwitchConfirm(plan.code)}
                      disabled={isSaving || isCurrentSelection}
                      className="mt-3 w-full rounded-xl border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground hover:bg-secondary/20 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isCurrentSelection ? 'Current plan' : 'Switch plan'}
                    </button>
                  </article>
                );
              })}
            </div>
          </section>
        </>
      ) : null}

      {pendingSwitch ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 p-4">
          <div className="w-full max-w-xl rounded-2xl border border-border bg-background p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold text-foreground">Confirm plan switch</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  You are switching to {planLabel(pendingSwitch.planCode)}. Price and limits may change.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPendingSwitch(null)}
                className="rounded-lg border border-border px-2.5 py-1 text-sm font-semibold text-muted-foreground hover:bg-secondary/20"
              >
                Close
              </button>
            </div>

            <div className="mt-4 rounded-xl border border-border p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Effective date</div>
              <div className="mt-2 inline-flex rounded-full border border-border p-1">
                <button
                  type="button"
                  onClick={() => setPendingSwitch((prev) => (prev ? { ...prev, applyTiming: 'now' } : prev))}
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    pendingSwitch.applyTiming === 'now' ? 'bg-secondary text-foreground' : 'text-muted-foreground'
                  }`}
                >
                  Apply now
                </button>
                <button
                  type="button"
                  onClick={() => setPendingSwitch((prev) => (prev ? { ...prev, applyTiming: 'next_renewal' } : prev))}
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    pendingSwitch.applyTiming === 'next_renewal' ? 'bg-secondary text-foreground' : 'text-muted-foreground'
                  }`}
                >
                  At next renewal
                </button>
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-border p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Billing cycle</div>
              <div className="mt-2 inline-flex rounded-full border border-border p-1">
                <button
                  type="button"
                  onClick={() => setPendingSwitch((prev) => (prev ? { ...prev, billingCycle: 'monthly' } : prev))}
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    pendingSwitch.billingCycle === 'monthly' ? 'bg-secondary text-foreground' : 'text-muted-foreground'
                  }`}
                >
                  Monthly
                </button>
                <button
                  type="button"
                  onClick={() => setPendingSwitch((prev) => (prev ? { ...prev, billingCycle: 'yearly' } : prev))}
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    pendingSwitch.billingCycle === 'yearly' ? 'bg-secondary text-foreground' : 'text-muted-foreground'
                  }`}
                >
                  Yearly
                </button>
              </div>
              <div className="mt-3 text-sm font-semibold text-foreground">
                {(() => {
                  const nextPlan = planMap.get(pendingSwitch.planCode);
                  const price =
                    pendingSwitch.billingCycle === 'yearly'
                      ? formatMoney(nextPlan?.yearlyPriceCents ?? null, subscription?.currency ?? 'USD')
                      : formatMoney(nextPlan?.monthlyPriceCents ?? null, subscription?.currency ?? 'USD');
                  return `${price} / ${pendingSwitch.billingCycle === 'yearly' ? 'yr' : 'mo'}`;
                })()}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {pendingSwitch.applyTiming === 'next_renewal'
                  ? 'This change will be queued and applied on your next renewal date.'
                  : 'This change will apply immediately.'}
              </div>
            </div>

            {pendingOverLimitItems.length > 0 ? (
              <div className="mt-4 rounded-xl border border-rose-300 bg-rose-50 p-4">
                <div className="text-sm font-semibold text-rose-800">Limit impact warning</div>
                <div className="mt-1 text-sm text-rose-700">
                  This plan is below your current usage. Review these items before switching:
                </div>
                <div className="mt-2 space-y-1 text-sm text-rose-800">
                  {pendingOverLimitItems.map((item) => (
                    <div key={item.label}>
                      {item.label}: {item.used} used, limit {item.limit}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="mt-5 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setPendingSwitch(null)}
                className="rounded-xl border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-secondary/20"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmSwitch}
                disabled={isSaving}
                className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary-dark disabled:opacity-60"
              >
                {isSaving ? 'Switching...' : `Confirm switch to ${planLabel(pendingSwitch.planCode)}`}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
