import { useEffect, useMemo, useState } from "react";
import {
  getUserBilling,
  type UserBillingEvent,
} from "../../../../shared/api/users";
import { useUserDetailsContext } from "../userDetailsContext";

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function currency(value: number | null) {
  if (value === null) return "-";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-background p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-2 text-lg font-semibold text-foreground">{value}</div>
    </div>
  );
}

function eventLabel(event: UserBillingEvent) {
  const action = event.action
    .replaceAll("_", " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!action) return "Billing event";
  return action[0].toUpperCase() + action.slice(1);
}

export default function UserDetailsBillingTab() {
  const { user } = useUserDetailsContext();

  const [billing, setBilling] = useState<{
    workspaceName: string | null;
    workspaceSlug: string | null;
    isOwner: boolean;
    planLabel: string;
    statusLabel: string;
    monthlyPriceUsd: number | null;
    outstandingBalanceUsd: number | null;
    paymentMethod: string | null;
    renewalDate: string | null;
    events: UserBillingEvent[];
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setIsLoading(true);
    setErrorMessage(null);

    getUserBilling(user.id)
      .then((res) => {
        if (!alive) return;
        setBilling(res.billing);
      })
      .catch((err) => {
        if (!alive) return;
        setErrorMessage(
          err instanceof Error ? err.message : "Failed to load billing",
        );
      })
      .finally(() => {
        if (!alive) return;
        setIsLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [user.id]);

  const eventCount = useMemo(() => billing?.events?.length ?? 0, [billing?.events]);

  return (
    <div className="rounded-xl border border-border bg-background p-6 shadow-sm">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Billing / Financial</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Plan, workspace billing status, and billing-related events.
        </p>
      </div>

      {isLoading && (
        <div className="mt-5 text-sm text-muted-foreground">Loading billing...</div>
      )}
      {!isLoading && errorMessage && (
        <div className="mt-5 text-sm font-semibold text-rose-700">
          {errorMessage}
        </div>
      )}

      {!isLoading && !errorMessage && billing && (
        <>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <SummaryCard label="Plan" value={billing.planLabel} />
            <SummaryCard label="Billing status" value={billing.statusLabel} />
            <SummaryCard label="Monthly price" value={currency(billing.monthlyPriceUsd)} />
            <SummaryCard label="Outstanding" value={currency(billing.outstandingBalanceUsd)} />
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            <div className="rounded-xl border border-border bg-background p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Workspace
              </div>
              <div className="mt-2 text-base font-semibold text-foreground">
                {billing.workspaceName ?? "-"}
              </div>
              <div className="mt-1 text-sm text-muted-foreground">
                Slug: {billing.workspaceSlug ?? "-"}
              </div>
              <div className="mt-1 text-sm text-muted-foreground">
                Owner access: {billing.isOwner ? "Yes" : "No"}
              </div>
            </div>

            <div className="rounded-xl border border-border bg-background p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Payment Details
              </div>
              <div className="mt-2 text-sm text-muted-foreground">
                Method: {billing.paymentMethod ?? "-"}
              </div>
              <div className="mt-1 text-sm text-muted-foreground">
                Renewal date: {formatDateTime(billing.renewalDate)}
              </div>
              <div className="mt-1 text-sm text-muted-foreground">
                Events found: {eventCount}
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-border bg-background p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Billing Events
            </div>
            <div className="mt-3 space-y-2">
              {billing.events.map((event) => (
                <article
                  key={event.id}
                  className="rounded-lg border border-border bg-background p-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm font-semibold text-foreground">
                      {eventLabel(event)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {formatDateTime(event.occurredAt)}
                    </div>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Entity: {event.entityType ?? "-"} {event.entityId ? `(${event.entityId})` : ""}
                  </div>
                </article>
              ))}

              {billing.events.length === 0 && (
                <div className="rounded-lg border border-border bg-background p-4 text-sm text-muted-foreground">
                  No billing events found yet.
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
