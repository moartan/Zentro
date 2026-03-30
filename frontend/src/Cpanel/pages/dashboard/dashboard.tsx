import { useApp } from '../../../shared/AppProvider';

export default function DashboardPage() {
  const { user } = useApp();

  const roleLabel =
    user?.role === 'super_admin'
      ? 'Platform Admin'
      : user?.role === 'business_owner'
      ? 'Workspace Owner'
      : user?.role === 'employee'
      ? 'Member'
      : 'No role assigned';

  return (
    <div className="rounded-xl border border-border bg-background p-6">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <p className="mt-2 text-muted-foreground">Signed in as: {roleLabel}</p>
      {user?.businessId && <p className="mt-1 text-sm text-muted-foreground">Business scope: {user.businessId}</p>}
    </div>
  );
}
