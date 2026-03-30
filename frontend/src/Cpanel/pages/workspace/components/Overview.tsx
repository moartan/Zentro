import { useWorkspaceDetailsContext } from '../workspaceDetailsContext';

function statusLabel(status: string | null) {
  if (status === 'active') return 'Active';
  if (status === 'past_due') return 'Past due';
  if (status === 'canceled') return 'Canceled';
  return '-';
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="relative rounded-2xl border border-border bg-background px-5 pb-4 pt-5">
      <div className="absolute left-4 top-0 -translate-y-1/2 bg-background px-2 text-sm font-medium text-muted-foreground">
        {label}
      </div>
      <div className="pt-1 text-base font-semibold text-foreground">{value || '-'}</div>
    </div>
  );
}

export default function WorkspaceOverviewTab() {
  const { details } = useWorkspaceDetailsContext();

  return (
    <div className="rounded-xl border border-border bg-background p-6 shadow-sm">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Overview</h2>
        <p className="mt-1 text-sm text-muted-foreground">Workspace quick snapshot.</p>
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-2">
        <Field label="Workspace name" value={details.workspace.name} />
        <Field label="Workspace slug" value={details.workspace.slug} />
        <Field label="Status" value={statusLabel(details.workspace.status)} />
        <Field label="Total members" value={String(details.workspace.totalMembers)} />
        <Field label="Owners" value={String(details.summary.owners)} />
        <Field label="Members (non-owner)" value={String(details.summary.employees)} />
      </div>
    </div>
  );
}
