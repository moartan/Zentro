import { Link } from 'react-router-dom';
import { useWorkspaceDetailsContext } from '../workspaceDetailsContext';

function roleLabel(role: string | null) {
  if (role === 'business_owner') return 'Workspace Owner';
  if (role === 'employee') return 'Member';
  return '-';
}

function statusLabel(status: string | null) {
  if (status === 'active') return 'Active';
  if (status === 'invited') return 'Invited';
  if (status === 'block') return 'Blocked';
  return '-';
}

function statusPill(status: string | null) {
  if (status === 'active') return 'bg-emerald-100 text-emerald-800';
  if (status === 'invited') return 'bg-amber-100 text-amber-800';
  if (status === 'block') return 'bg-rose-100 text-rose-800';
  return 'bg-secondary/50 text-muted-foreground';
}

export default function WorkspaceMembersTab() {
  const { details } = useWorkspaceDetailsContext();

  return (
    <div className="rounded-xl border border-border bg-background p-6 shadow-sm">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Members</h2>
        <p className="mt-1 text-sm text-muted-foreground">People associated with this workspace.</p>
      </div>

      <div className="mt-5 overflow-hidden rounded-2xl border border-border">
        <table className="w-full border-separate border-spacing-0">
          <thead className="bg-secondary/10">
            <tr>
              <th className="border-b border-border px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-muted-foreground">User</th>
              <th className="border-b border-border px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-muted-foreground">Role</th>
              <th className="border-b border-border px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-muted-foreground">Status</th>
              <th className="border-b border-border px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-muted-foreground">Action</th>
            </tr>
          </thead>
          <tbody>
            {details.members.map((member) => (
              <tr key={member.id}>
                <td className="border-b border-border px-4 py-4 align-top">
                  <div className="text-sm font-semibold text-foreground">{member.fullName ?? member.email ?? '-'}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{member.email ?? '-'}</div>
                </td>
                <td className="border-b border-border px-4 py-4 align-top text-sm text-foreground">{roleLabel(member.role)}</td>
                <td className="border-b border-border px-4 py-4 align-top">
                  <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${statusPill(member.status)}`}>
                    {statusLabel(member.status)}
                  </span>
                </td>
                <td className="border-b border-border px-4 py-4 align-top">
                  <Link
                    to={`/cpanel/users/${member.id}/account`}
                    className="inline-flex rounded-xl border border-border bg-background px-3 py-1.5 text-sm font-semibold text-foreground hover:bg-secondary/20"
                  >
                    Open User
                  </Link>
                </td>
              </tr>
            ))}

            {details.members.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-sm text-muted-foreground">
                  No members found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
