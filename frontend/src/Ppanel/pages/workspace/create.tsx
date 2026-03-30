import { useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiPost } from '../../../shared/api/http';
import { useApp } from '../../../shared/AppProvider';

type Plan = 'free' | 'pro' | 'enterprise';

const plans: Array<{
  id: Plan;
  title: string;
  price: string;
  description: string;
  features: string[];
}> = [
  {
    id: 'free',
    title: 'Free',
    price: '$0 / month',
    description: 'Great for trying task workflows with a small team.',
    features: ['Up to 5 members', 'Up to 2 teams', 'Task management (basic)', 'Email support'],
  },
  {
    id: 'pro',
    title: 'Pro',
    price: '$29 / month',
    description: 'For growing teams that need advanced collaboration and scale.',
    features: ['Up to 25 members', 'Up to 10 teams', 'Task management (advanced)', 'Priority email support'],
  },
  {
    id: 'enterprise',
    title: 'Enterprise',
    price: 'Custom',
    description: 'For organizations that need unlimited collaboration and full control.',
    features: ['Unlimited members', 'Unlimited teams', 'Unlimited workflows', 'Dedicated success manager'],
  },
];

export default function CreateWorkspacePage() {
  const navigate = useNavigate();
  const { user, refreshSession } = useApp();
  const [plan, setPlan] = useState<Plan>('free');
  const [name, setName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const hasWorkspace = useMemo(() => {
    if (!user) return false;
    if (user.isPlatformSuperAdmin) return true;
    return Boolean(user.businessId) || (user.memberships?.length ?? 0) > 0;
  }, [user]);

  if (hasWorkspace) {
    // If user somehow lands here after being assigned, send them to cpanel.
    navigate('/cpanel', { replace: true });
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    try {
      setIsSubmitting(true);
      setErrorMessage(null);

      await apiPost('/api/workspaces', { name, plan });
      await refreshSession();
      navigate('/cpanel', { replace: true });
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to create workspace');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="px-4 pb-14 pt-10 md:px-6 md:pt-14">
      <div className="mx-auto w-full max-w-6xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground">Create your workspace</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Choose a plan and set your business name to start using Zentro.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {plans.map((p) => {
            const selected = plan === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setPlan(p.id)}
                className={`text-left rounded-3xl border p-6 transition-all ${
                  selected ? 'border-primary bg-primary/5 shadow-sm' : 'border-border bg-background hover:bg-secondary/20'
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-2xl font-bold text-foreground">{p.title}</div>
                    <div className="mt-2 text-sm text-muted-foreground">{p.description}</div>
                  </div>
                  <div
                    className={`h-5 w-5 rounded-full border ${
                      selected ? 'border-primary bg-primary' : 'border-border bg-background'
                    }`}
                    aria-hidden="true"
                  />
                </div>
                <div className="mt-6 text-4xl font-bold text-foreground">{p.price}</div>
                <ul className="mt-6 space-y-2 text-sm text-muted-foreground">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-center gap-2">
                      <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary/70" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </button>
            );
          })}
        </div>

        <form onSubmit={handleSubmit} className="mt-10 rounded-3xl border border-border bg-background p-6">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block md:col-span-2">
              <span className="mb-1 block text-sm font-medium text-foreground">Business name</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                minLength={2}
                placeholder="e.g. Unimall Ltd"
                className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/40"
              />
            </label>
          </div>

          {errorMessage && <p className="mt-4 text-sm font-semibold text-red-600">{errorMessage}</p>}

          <div className="mt-6 flex items-center justify-between gap-4">
            <div className="text-sm text-muted-foreground">
              Selected plan: <span className="font-semibold text-foreground">{plan.toUpperCase()}</span>
            </div>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isSubmitting ? 'Creating...' : 'Create Workspace'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

