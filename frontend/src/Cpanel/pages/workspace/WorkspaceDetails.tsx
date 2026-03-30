import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, Building2, CreditCard, Users, UsersRound } from 'lucide-react';
import { Link, NavLink, Outlet, useParams } from 'react-router-dom';
import { getWorkspaceDetails, type WorkspaceDetails } from '../../../shared/api/workspaces';
import { WorkspaceDetailsProvider } from './workspaceDetailsContext';

function formatDate(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
  }).format(d);
}

function statusLabel(status: WorkspaceDetails['workspace']['status']) {
  if (status === 'active') return 'Active';
  if (status === 'past_due') return 'Past due';
  if (status === 'canceled') return 'Canceled';
  return '-';
}

function statusPill(status: WorkspaceDetails['workspace']['status']) {
  if (status === 'active') return 'bg-emerald-100 text-emerald-800';
  if (status === 'past_due') return 'bg-amber-100 text-amber-800';
  if (status === 'canceled') return 'bg-rose-100 text-rose-800';
  return 'bg-secondary/50 text-muted-foreground';
}

function KeyValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-6 py-2 text-sm">
      <div className="text-muted-foreground">{label}</div>
      <div className="text-right font-semibold text-foreground">{value || '-'}</div>
    </div>
  );
}

function TabLink({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition ${
          isActive
            ? 'border-primary bg-primary/10 text-primary'
            : 'border-border bg-background text-muted-foreground hover:bg-secondary/20 hover:text-foreground'
        }`
      }
      end
    >
      {icon}
      <span className="whitespace-nowrap">{label}</span>
    </NavLink>
  );
}

export default function WorkspaceDetailsPage() {
  const params = useParams();
  const slug = params.slug ?? '';

  const [details, setDetails] = useState<WorkspaceDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadWorkspaceDetails = useCallback(async () => {
    setErrorMessage(null);
    const res = await getWorkspaceDetails(slug);
    setDetails(res.details);
  }, [slug]);

  useEffect(() => {
    let alive = true;
    setIsLoading(true);
    setErrorMessage(null);

    getWorkspaceDetails(slug)
      .then((res) => {
        if (!alive) return;
        setDetails(res.details);
      })
      .catch((err) => {
        if (!alive) return;
        setErrorMessage(err instanceof Error ? err.message : 'Failed to load workspace');
      })
      .finally(() => {
        if (!alive) return;
        setIsLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [slug]);

  const quickOwner = useMemo(() => {
    if (!details?.workspace.ownerName && !details?.workspace.ownerEmail) return '-';
    return details.workspace.ownerName ?? details.workspace.ownerEmail ?? '-';
  }, [details?.workspace.ownerEmail, details?.workspace.ownerName]);

  return (
    <div className="rounded-xl border border-border bg-background p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Workspace Details</h1>
        </div>
        <Link to="/cpanel/workspaces" className="text-sm font-semibold text-primary hover:underline">
          Back to Workspace
        </Link>
      </div>

      {isLoading && <div className="mt-6 text-sm text-muted-foreground">Loading...</div>}
      {!isLoading && errorMessage && <div className="mt-6 text-sm font-semibold text-rose-700">{errorMessage}</div>}

      {!isLoading && !errorMessage && details && (
        <WorkspaceDetailsProvider
          value={{
            details,
            refreshWorkspaceDetails: async () => {
              setIsLoading(true);
              try {
                await loadWorkspaceDetails();
              } finally {
                setIsLoading(false);
              }
            },
          }}
        >
          <div className="mt-6 grid items-start gap-6 lg:grid-cols-[310px_1fr]">
            <div className="rounded-xl border border-border bg-background px-6 pb-4 pt-6 shadow-sm">
              <div className="flex h-32 w-32 items-center justify-center rounded-[32px] bg-primary/10 text-4xl font-extrabold text-primary">
                {details.workspace.name.slice(0, 2).toUpperCase()}
              </div>

              <div className="mt-5 text-2xl font-semibold text-foreground">{details.workspace.name}</div>
              <div className="mt-1 text-sm text-muted-foreground">/{details.workspace.slug}</div>
              <div className="mt-3">
                <span className={`inline-flex rounded-full px-4 py-2 text-sm font-bold ${statusPill(details.workspace.status)}`}>
                  {statusLabel(details.workspace.status)}
                </span>
              </div>

              <div className="mt-8">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Quick Info</div>
                <div className="mt-3">
                  <KeyValue label="Owner" value={quickOwner} />
                  <KeyValue label="Members" value={String(details.workspace.totalMembers)} />
                  <KeyValue label="Created" value={formatDate(details.workspace.createdAt)} />
                  <KeyValue label="Active" value={String(details.workspace.activeMembers)} />
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-border bg-background p-6 shadow-sm">
              <div className="flex flex-wrap gap-2">
                <TabLink to="overview" icon={<Building2 className="h-4 w-4" />} label="Overview" />
                <TabLink to="members" icon={<UsersRound className="h-4 w-4" />} label="Members" />
                <TabLink to="teams" icon={<Users className="h-4 w-4" />} label="Teams" />
                <TabLink to="subscription" icon={<CreditCard className="h-4 w-4" />} label="Subscription" />
                <TabLink to="activity" icon={<Activity className="h-4 w-4" />} label="Activity" />
              </div>

              <div className="mt-6">
                <Outlet />
              </div>
            </div>
          </div>
        </WorkspaceDetailsProvider>
      )}
    </div>
  );
}
