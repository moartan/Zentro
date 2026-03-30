import { useApp } from '../../../shared/AppProvider';

export default function InviteMemberPage() {
  const { user } = useApp();

  return (
    <div className="rounded-xl border border-border bg-background p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Invite Member</h1>
          <p className="mt-2 text-muted-foreground">
            Invite a new employee to your business. (UI + API wiring next.)
          </p>
        </div>
        <div className="rounded-xl border border-border bg-secondary/30 px-4 py-2 text-sm font-semibold text-foreground">
          Business: {user?.businessId ?? 'not set'}
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-border bg-background p-4">
        <div className="text-sm font-semibold text-foreground">Next</div>
        <ul className="mt-2 list-disc pl-5 text-sm text-muted-foreground">
          <li>Form: email + role (employee)</li>
          <li>API: `POST /api/invitations`</li>
          <li>List: pending invites + revoke</li>
        </ul>
      </div>
    </div>
  );
}

