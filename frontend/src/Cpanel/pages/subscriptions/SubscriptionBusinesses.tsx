import { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { Link } from 'react-router-dom';
import RightDrawer from './components/RightDrawer';
import {
  getSubscriptionPlans,
  getWorkspaceSubscriptions,
  type BillingCycle,
  type PlanCode,
  type SubscriptionPlan,
  type SubscriptionStatus,
  type WorkspaceSubscription,
  updateWorkspaceSubscription,
} from '../../../shared/api/subscriptions';
import { useToast } from '../../../shared/toast/ToastProvider';

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

function trialDaysLeftFromStart(start: string | null, trialDays = 14) {
  if (!start) return null;
  const startedAt = new Date(start);
  if (Number.isNaN(startedAt.getTime())) return null;
  const elapsedDays = Math.floor((Date.now() - startedAt.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(0, trialDays - elapsedDays);
}

function daysLeftUntil(value: string | null) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const diffMs = d.getTime() - Date.now();
  return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
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

function billingActivityLabel(row: WorkspaceSubscription) {
  if (row.planCode === 'free') return formatDate(row.trialStartedAt);
  return formatDate(row.lastPaymentAt);
}

function cycleLabel(row: WorkspaceSubscription) {
  if (row.planCode === 'free') return 'Trial (14 days)';
  return row.billingCycle === 'yearly' ? 'Yearly' : 'Monthly';
}

function renewalLabel(row: WorkspaceSubscription) {
  if (row.planCode === 'free') {
    if (!row.trialStartedAt) return '-';
    const startedAt = new Date(row.trialStartedAt);
    if (Number.isNaN(startedAt.getTime())) return '-';
    const renewalDate = new Date(startedAt);
    renewalDate.setDate(renewalDate.getDate() + 14);
    const daysLeft = trialDaysLeftFromStart(row.trialStartedAt, 14);
    const dateText = formatDate(renewalDate.toISOString());
    if (daysLeft === null) return dateText;
    return `${dateText} (${daysLeft} day${daysLeft === 1 ? '' : 's'} left)`;
  }

  const fallbackRenewal =
    row.renewalAt ??
    addDays(
      row.lastPaymentAt ?? row.updatedAt ?? null,
      cycleDays(row.billingCycle),
    );
  if (!fallbackRenewal) return '-';
  const dateText = formatDate(fallbackRenewal);
  const daysLeft = daysLeftUntil(fallbackRenewal);
  if (daysLeft === null) return dateText;
  return `${dateText} (${daysLeft} day${daysLeft === 1 ? '' : 's'} left)`;
}

function parseNullableInt(value: string) {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed || trimmed === 'custom') return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) throw new Error('Unit price must be a valid non-negative number.');
  return Math.trunc(n);
}

function Editor({
  workspace,
  plans,
  onClose,
  onSaved,
}: {
  workspace: WorkspaceSubscription | null;
  plans: SubscriptionPlan[];
  onClose: () => void;
  onSaved: (row: WorkspaceSubscription) => void;
}) {
  const toast = useToast();
  const [planCode, setPlanCode] = useState<PlanCode>('free');
  const [billingCycle, setBillingCycle] = useState<BillingCycle>('monthly');
  const [status, setStatus] = useState<SubscriptionStatus>('active');
  const [currency, setCurrency] = useState('USD');
  const [unitPrice, setUnitPrice] = useState('');
  const [renewalAt, setRenewalAt] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!workspace) return;
    setPlanCode(workspace.planCode);
    setBillingCycle(workspace.billingCycle);
    setStatus(workspace.status);
    setCurrency(workspace.currency);
    setUnitPrice(workspace.unitPriceCents === null ? '' : String(workspace.unitPriceCents));
    setRenewalAt(workspace.renewalAt ? workspace.renewalAt.slice(0, 10) : '');
  }, [workspace]);

  async function handleSave() {
    if (!workspace) return;

    try {
      setIsSaving(true);
      const res = await updateWorkspaceSubscription(workspace.businessId, {
        planCode,
        billingCycle,
        status,
        currency: currency.trim() || 'USD',
        unitPriceCents: parseNullableInt(unitPrice),
        renewalAt: renewalAt ? new Date(`${renewalAt}T00:00:00.000Z`).toISOString() : null,
      });
      onSaved(res.workspace);
      toast.success(`Updated ${workspace.name}.`);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update workspace subscription');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <RightDrawer
      open={Boolean(workspace)}
      onClose={onClose}
      title={workspace ? `Edit ${workspace.name}` : 'Edit workspace'}
      subtitle="Update plan assignment, billing cycle, and status."
    >
      {!workspace ? null : (
        <div className="space-y-6">
          <section className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2 text-sm font-semibold text-foreground">
              <span>Plan</span>
              <select
                value={planCode}
                onChange={(e) => setPlanCode(e.target.value as PlanCode)}
                className="h-11 w-full rounded-xl border border-border bg-background px-4 text-sm font-medium outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
              >
                {plans.map((plan) => (
                  <option key={plan.code} value={plan.code}>
                    {plan.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-2 text-sm font-semibold text-foreground">
              <span>Billing cycle</span>
              <select
                value={billingCycle}
                onChange={(e) => setBillingCycle(e.target.value as BillingCycle)}
                className="h-11 w-full rounded-xl border border-border bg-background px-4 text-sm font-medium outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
              >
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
              </select>
            </label>
            <label className="space-y-2 text-sm font-semibold text-foreground">
              <span>Status</span>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as SubscriptionStatus)}
                className="h-11 w-full rounded-xl border border-border bg-background px-4 text-sm font-medium outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
              >
                <option value="active">Active</option>
                <option value="past_due">Past due</option>
                <option value="canceled">Canceled</option>
              </select>
            </label>
            <label className="space-y-2 text-sm font-semibold text-foreground">
              <span>Currency</span>
              <input
                value={currency}
                onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                className="h-11 w-full rounded-xl border border-border bg-background px-4 text-sm font-medium outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
              />
            </label>
            <label className="space-y-2 text-sm font-semibold text-foreground">
              <span>Unit price (cents)</span>
              <input
                value={unitPrice}
                onChange={(e) => setUnitPrice(e.target.value)}
                placeholder="e.g. 2900 or Custom"
                className="h-11 w-full rounded-xl border border-border bg-background px-4 text-sm font-medium outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
              />
            </label>
            <label className="space-y-2 text-sm font-semibold text-foreground">
              <span>Renewal date</span>
              <input
                type="date"
                value={renewalAt}
                onChange={(e) => setRenewalAt(e.target.value)}
                className="h-11 w-full rounded-xl border border-border bg-background px-4 text-sm font-medium outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
              />
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

export default function SubscriptionBusinessesPage() {
  const pageSize = 10;
  const [rows, setRows] = useState<WorkspaceSubscription[]>([]);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | SubscriptionStatus>('all');
  const [page, setPage] = useState(1);
  const [editingBusinessId, setEditingBusinessId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setIsLoading(true);
    setErrorMessage(null);

    Promise.all([getWorkspaceSubscriptions(), getSubscriptionPlans()])
      .then(([workspacesRes, plansRes]) => {
        if (!alive) return;
        setRows(workspacesRes.workspaces ?? []);
        setPlans(plansRes.plans ?? []);
      })
      .catch((err) => {
        if (!alive) return;
        setErrorMessage(err instanceof Error ? err.message : 'Failed to load workspace subscriptions');
      })
      .finally(() => {
        if (!alive) return;
        setIsLoading(false);
      });

    return () => {
      alive = false;
    };
  }, []);

  const planMap = useMemo(() => new Map(plans.map((plan) => [plan.code, plan])), [plans]);
  const selectedWorkspace = useMemo(() => rows.find((row) => row.businessId === editingBusinessId) ?? null, [rows, editingBusinessId]);

  const filteredRows = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return rows.filter((row) => {
      const matchesQuery =
        !normalized ||
        row.name.toLowerCase().includes(normalized) ||
        row.slug.toLowerCase().includes(normalized) ||
        row.planCode.toLowerCase().includes(normalized);
      const matchesStatus = statusFilter === 'all' ? true : row.status === statusFilter;
      return matchesQuery && matchesStatus;
    });
  }, [rows, query, statusFilter]);
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const pageRows = filteredRows.slice((safePage - 1) * pageSize, safePage * pageSize);

  useEffect(() => {
    setPage(1);
  }, [query, statusFilter]);

  return (
    <div className="rounded-xl border border-border bg-background p-6 text-[15px]">
      <h1 className="text-2xl font-semibold text-foreground">Workspace Subscriptions</h1>
      <p className="mt-2 text-muted-foreground">List of workspace billing assignments and subscription status.</p>

      <div className="mt-4 grid gap-3 md:grid-cols-[1fr_220px]">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search workspace by name, slug, or plan..."
            className="h-11 w-full rounded-xl border border-border bg-background pl-12 pr-4 text-sm outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as 'all' | SubscriptionStatus)}
          className="h-11 rounded-xl border border-border bg-background px-4 text-sm font-semibold text-foreground outline-none"
        >
          <option value="all">All status</option>
          <option value="active">Active</option>
          <option value="past_due">Past due</option>
          <option value="canceled">Canceled</option>
        </select>
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-border">
        <table className="w-full border-separate border-spacing-0">
          <thead className="bg-secondary/10">
            <tr>
              <th className="border-b border-border px-5 py-3 text-left text-xs font-bold uppercase tracking-wide text-muted-foreground">Workspace</th>
              <th className="border-b border-border px-5 py-3 text-left text-xs font-bold uppercase tracking-wide text-muted-foreground">Members</th>
              <th className="border-b border-border px-5 py-3 text-left text-xs font-bold uppercase tracking-wide text-muted-foreground">Plan</th>
              <th className="border-b border-border px-5 py-3 text-left text-xs font-bold uppercase tracking-wide text-muted-foreground">Billing Activity</th>
              <th className="border-b border-border px-5 py-3 text-left text-xs font-bold uppercase tracking-wide text-muted-foreground">Renewal</th>
              <th className="border-b border-border px-5 py-3 text-left text-xs font-bold uppercase tracking-wide text-muted-foreground">Cycle</th>
              <th className="border-b border-border px-5 py-3 text-left text-xs font-bold uppercase tracking-wide text-muted-foreground">Action</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={7} className="px-5 py-8 text-center text-sm text-muted-foreground">
                  Loading workspace subscriptions...
                </td>
              </tr>
            ) : null}

            {!isLoading && errorMessage ? (
              <tr>
                <td colSpan={7} className="px-5 py-8 text-center text-sm font-semibold text-rose-700">
                  {errorMessage}
                </td>
              </tr>
            ) : null}

            {!isLoading && !errorMessage && pageRows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-5 py-8 text-center text-sm text-muted-foreground">
                  No workspaces found.
                </td>
              </tr>
            ) : null}

            {!isLoading &&
              !errorMessage &&
              pageRows.map((row, i) => {
                const plan = planMap.get(row.planCode);
                return (
                  <tr key={row.businessId} className={i % 2 ? 'bg-secondary/10' : 'bg-background'}>
                    <td className="border-b border-border px-5 py-4 text-sm">
                      <div className="font-semibold text-foreground">{row.name}</div>
                      <div className="text-xs text-muted-foreground">/{row.slug}</div>
                    </td>
                    <td className="border-b border-border px-5 py-4 text-sm text-foreground">{row.memberCount ?? 0}</td>
                    <td className="border-b border-border px-5 py-4 text-sm text-foreground">
                      <div>{plan?.name ?? row.planCode}</div>
                      <div className="text-xs text-muted-foreground">{formatMoney(row.unitPriceCents, row.currency)}</div>
                    </td>
                    <td className="border-b border-border px-5 py-4 text-sm">
                      <div className="text-sm text-foreground">{billingActivityLabel(row)}</div>
                    </td>
                    <td className="border-b border-border px-5 py-4 text-sm text-foreground">
                      {renewalLabel(row)}
                    </td>
                    <td className="border-b border-border px-5 py-4 text-sm text-foreground">{cycleLabel(row)}</td>
                    <td className="border-b border-border px-5 py-4">
                      <div className="flex items-center gap-2">
                        <Link
                          to={`/cpanel/workspaces/${row.slug}`}
                          className="rounded-xl border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground hover:bg-secondary/20"
                        >
                          View
                        </Link>
                        <button
                          type="button"
                          onClick={() => setEditingBusinessId(row.businessId)}
                          className="rounded-xl border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground hover:bg-secondary/20"
                        >
                          Edit
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>

      {!isLoading && !errorMessage ? (
        <div className="mt-4 flex items-center justify-between gap-3">
          <div className="text-sm text-muted-foreground">
            Showing {pageRows.length === 0 ? 0 : (safePage - 1) * pageSize + 1}-{(safePage - 1) * pageSize + pageRows.length} of {filteredRows.length}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              disabled={safePage <= 1}
              className="h-12 rounded-full border border-border bg-background px-6 text-sm font-semibold text-muted-foreground disabled:cursor-not-allowed disabled:opacity-60"
            >
              Prev
            </button>
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-primary text-sm font-bold text-primary">
              {safePage}
            </span>
            <button
              type="button"
              onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={safePage >= totalPages}
              className="h-12 rounded-full border border-border bg-background px-6 text-sm font-semibold text-muted-foreground disabled:cursor-not-allowed disabled:opacity-60"
            >
              Next
            </button>
          </div>
        </div>
      ) : null}

      <Editor
        workspace={selectedWorkspace}
        plans={plans}
        onClose={() => setEditingBusinessId(null)}
        onSaved={(updated) => {
          setRows((prev) => prev.map((item) => (item.businessId === updated.businessId ? { ...item, ...updated } : item)));
        }}
      />
    </div>
  );
}
