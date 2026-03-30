import { useApp } from '../../../shared/AppProvider';

export default function MembersPage() {
  const { user } = useApp();

  return (
    <div className="rounded-xl border border-border bg-background p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Members</h1>
          <p className="mt-2 text-muted-foreground">
            Business owner view. This page will manage members in your business.
          </p>
        </div>
        <div className="rounded-xl border border-border bg-secondary/30 px-4 py-2 text-sm font-semibold text-foreground">
          Business: {user?.businessId ?? 'not set'}
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-border bg-background p-4">
        <div className="text-sm font-semibold text-foreground">Next</div>
        <ul className="mt-2 list-disc pl-5 text-sm text-muted-foreground">
          <li>API: `GET /api/members` (business_owner only)</li>
          <li>Create/edit/delete employees</li>
          <li>Invite flow using `public.invitations`</li>
        </ul>
      </div>
    </div>
  );
}

