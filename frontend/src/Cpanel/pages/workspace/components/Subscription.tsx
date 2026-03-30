import { useWorkspaceDetailsContext } from '../workspaceDetailsContext';

function statusLabel(status: string | null) {
  if (status === 'active') return 'Active';
  if (status === 'past_due') return 'Past due';
  if (status === 'canceled') return 'Canceled';
  return '-';
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-background p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-2 text-lg font-semibold text-foreground">{value}</div>
    </div>
  );
}

export default function WorkspaceSubscriptionTab() {
  const { details } = useWorkspaceDetailsContext();

  return (
    <div className="rounded-xl border border-border bg-background p-6 shadow-sm">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Subscription</h2>
        <p className="mt-1 text-sm text-muted-foreground">Billing state and plan details.</p>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Workspace status" value={statusLabel(details.workspace.status)} />
        <Field label="Plan" value="Derived from users (API pending)" />
        <Field label="Outstanding" value="-" />
        <Field label="Renewal" value="-" />
      </div>

      <div className="mt-4 rounded-xl border border-border bg-secondary/10 p-4 text-sm text-muted-foreground">
        For full subscription controls, next step is wiring dedicated backend endpoints like
        `GET /api/businesses/:id` and `PATCH /api/businesses/:id/subscription`.
      </div>
    </div>
  );
}
