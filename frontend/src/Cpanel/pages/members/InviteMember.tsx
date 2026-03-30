import { useEffect, useState, type FormEvent } from 'react';
import {
  createInvitation,
  getInvitations,
  resendInvitation,
  revokeInvitation,
  updateInvitation,
  type InvitationRow,
} from '../../../shared/api/members';
import { useToast } from '../../../shared/toast/ToastProvider';

function formatDate(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
  }).format(d);
}

function statusPill(status: InvitationRow['status']) {
  if (status === 'expired') return 'bg-rose-100 text-rose-700';
  return 'bg-amber-100 text-amber-800';
}

export default function InviteMemberPage() {
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [gender, setGender] = useState('');
  const [country, setCountry] = useState('');
  const [rows, setRows] = useState<InvitationRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [selectedInvitationId, setSelectedInvitationId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function loadInvitations() {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const res = await getInvitations();
      setRows(res.invitations ?? []);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to load invitations');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadInvitations();
  }, []);

  function resetForm() {
    setEmail('');
    setName('');
    setGender('');
    setCountry('');
    setSelectedInvitationId(null);
  }

  function handleSelectInvitation(row: InvitationRow) {
    setSelectedInvitationId(row.id);
    setEmail(row.email ?? '');
    setName(row.name ?? '');
    setGender(row.gender ?? '');
    setCountry(row.country ?? '');
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErrorMessage(null);

    try {
      setIsSubmitting(true);
      if (selectedInvitationId) {
        await updateInvitation(selectedInvitationId, { email, name, gender, country });
      } else {
        await createInvitation({ email, name, gender, country });
      }
      resetForm();
      await loadInvitations();
      toast.success(selectedInvitationId ? 'Invitation updated.' : 'Invitation created.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to invite member';
      setErrorMessage(msg);
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleRevoke(invitationId: string) {
    const ok = window.confirm('Revoke this invitation?');
    if (!ok) return;

    try {
      setRevokingId(invitationId);
      await revokeInvitation(invitationId);
      if (selectedInvitationId === invitationId) resetForm();
      await loadInvitations();
      toast.success('Invitation revoked.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to revoke invitation');
    } finally {
      setRevokingId(null);
    }
  }

  async function handleResend(invitationId: string) {
    try {
      setResendingId(invitationId);
      await resendInvitation(invitationId);
      await loadInvitations();
      toast.success('Invitation resent.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to resend invitation');
    } finally {
      setResendingId(null);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-background p-6">
      <div>
        <h1 className="text-2xl font-semibold">Invite Member</h1>
        <p className="mt-2 text-muted-foreground">Invite new members to your workspace.</p>
      </div>

      <form onSubmit={handleSubmit} className="mt-6 rounded-2xl border border-border bg-background p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {selectedInvitationId ? 'Edit invitation' : 'New invitation'}
          </h2>
          {selectedInvitationId && (
            <button
              type="button"
              onClick={resetForm}
              className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-secondary/20"
            >
              Cancel edit
            </button>
          )}
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Name *</label>
            <input
              type="text"
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Full name"
              className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="member@company.com"
              className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Gender (optional)</label>
            <select
              value={gender}
              onChange={(event) => setGender(event.target.value)}
              className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm font-semibold text-foreground"
            >
              <option value="">Not specified</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Country (optional)</label>
            <input
              type="text"
              value={country}
              onChange={(event) => setCountry(event.target.value)}
              placeholder="Country"
              className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
          </div>
        </div>
        <div className="mt-3">
          <button
            type="submit"
            disabled={isSubmitting}
            className="h-11 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isSubmitting ? 'Saving...' : selectedInvitationId ? 'Update invite' : 'Send invite'}
          </button>
        </div>
      </form>

      {errorMessage && <div className="mt-4 text-sm font-semibold text-rose-700">{errorMessage}</div>}

      <div className="mt-6 rounded-2xl border border-border bg-background p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Pending invitations</h2>
          <button
            type="button"
            onClick={loadInvitations}
            disabled={isLoading}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground disabled:cursor-not-allowed disabled:opacity-60"
          >
            Refresh
          </button>
        </div>

        {isLoading && <div className="mt-4 text-sm text-muted-foreground">Loading invitations...</div>}

        {!isLoading && rows.length === 0 && (
          <div className="mt-4 rounded-xl border border-border p-4 text-sm text-muted-foreground">No invitations yet.</div>
        )}

        {!isLoading && rows.length > 0 && (
          <div className="mt-4 overflow-hidden rounded-xl border border-border">
            <table className="w-full border-separate border-spacing-0">
              <thead className="bg-secondary/10">
                <tr>
                  <th className="border-b border-border px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-muted-foreground">Email</th>
                  <th className="border-b border-border px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-muted-foreground">Name</th>
                  <th className="border-b border-border px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-muted-foreground">Gender</th>
                  <th className="border-b border-border px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-muted-foreground">Country</th>
                  <th className="border-b border-border px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-muted-foreground">Invited</th>
                  <th className="border-b border-border px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-muted-foreground">Expires</th>
                  <th className="border-b border-border px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-muted-foreground">Status</th>
                  <th className="border-b border-border px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-muted-foreground">Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.id}
                    className={`cursor-pointer ${selectedInvitationId === row.id ? 'bg-primary/5' : 'hover:bg-secondary/10'}`}
                    onClick={() => handleSelectInvitation(row)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        handleSelectInvitation(row);
                      }
                    }}
                    tabIndex={0}
                    role="button"
                    aria-pressed={selectedInvitationId === row.id}
                  >
                    <td className="border-b border-border px-4 py-3 text-sm text-foreground">{row.email}</td>
                    <td className="border-b border-border px-4 py-3 text-sm text-foreground">{row.name ?? '-'}</td>
                    <td className="border-b border-border px-4 py-3 text-sm text-foreground">{row.gender ?? '-'}</td>
                    <td className="border-b border-border px-4 py-3 text-sm text-foreground">{row.country ?? '-'}</td>
                    <td className="border-b border-border px-4 py-3 text-sm text-muted-foreground">{formatDate(row.createdAt)}</td>
                    <td className="border-b border-border px-4 py-3 text-sm text-muted-foreground">{formatDate(row.expiresAt)}</td>
                    <td className="border-b border-border px-4 py-3 text-sm">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wide ${statusPill(row.status)}`}>
                        {row.status}
                      </span>
                    </td>
                    <td className="border-b border-border px-4 py-3 text-sm">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleResend(row.id)}
                          disabled={resendingId === row.id}
                          className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-secondary/20 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {resendingId === row.id ? 'Sending...' : 'Resend'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRevoke(row.id)}
                          disabled={revokingId === row.id}
                          className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {revokingId === row.id ? 'Revoking...' : 'Revoke'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
