import { useApp } from '../../../shared/AppProvider';

export default function BusinessesPage() {
  const { user } = useApp();

  return (
    <div className="rounded-xl border border-border bg-background p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Businesses</h1>
          <p className="mt-2 text-muted-foreground">
            Super admin view. This page will list and manage all workspaces (businesses).
          </p>
        </div>
        <div className="rounded-xl border border-border bg-secondary/30 px-4 py-2 text-sm font-semibold text-foreground">
          Role: {user?.role ?? 'unknown'}
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-border bg-background p-4">
        <div className="text-sm font-semibold text-foreground">Next</div>
        <ul className="mt-2 list-disc pl-5 text-sm text-muted-foreground">
          <li>API: `GET /api/businesses` (super_admin only)</li>
          <li>Search + filter by plan/status</li>
          <li>Open business details + members</li>
        </ul>
      </div>
    </div>
  );
}

