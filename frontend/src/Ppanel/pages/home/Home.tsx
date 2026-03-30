import { ArrowRight, CheckCircle2, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';

const metrics = [
  { label: 'Active Workspaces', value: '2.4K+' },
  { label: 'Tasks Automated', value: '48M' },
  { label: 'Avg. Team Speed', value: '+37%' },
];

const features = [
  {
    title: 'Unified Workspace',
    description: 'Bring projects, docs, and updates into one clean command center.',
  },
  {
    title: 'Smart Automation',
    description: 'Automate recurring workflows and move your team from busy to productive.',
  },
  {
    title: 'Live Collaboration',
    description: 'Assign, review, and ship faster with real-time collaboration across teams.',
  },
];

export default function HomePage() {
  return (
    <div className="px-4 pb-12 pt-8 md:px-6 md:pt-12">
      <section className="mx-auto grid w-full max-w-7xl gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
        <div className="space-y-6">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-background/80 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-primary">
            <Sparkles className="h-4 w-4" />
            SaaS Operating System
          </span>

          <div className="space-y-4">
            <h1 className="text-4xl font-bold leading-tight tracking-tight text-foreground md:text-5xl">
              Run your SaaS operations from one focused workspace.
            </h1>
            <p className="max-w-2xl text-lg text-muted-foreground">
              Zentro helps product, support, and growth teams align faster with clear dashboards,
              workflow automation, and collaboration tools designed for scale.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              to="/pricing"
              className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary-dark"
            >
              Start Free Trial
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              to="/features"
              className="rounded-full border border-border bg-background/80 px-6 py-3 text-sm font-semibold text-foreground transition hover:bg-secondary/70"
            >
              Explore Features
            </Link>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {metrics.map((item) => (
              <div key={item.label} className="rounded-2xl border border-border/80 bg-background/80 p-4">
                <div className="text-2xl font-bold text-foreground">{item.value}</div>
                <div className="text-sm text-muted-foreground">{item.label}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-3xl border border-border/80 bg-background/80 p-5 shadow-sm">
          <div className="rounded-2xl border border-border bg-secondary/30 p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Team Pulse
              </h2>
              <span className="rounded-full bg-primary/15 px-3 py-1 text-xs font-semibold text-primary">
                Live
              </span>
            </div>

            <div className="space-y-3">
              <div className="rounded-xl border border-border bg-background p-4">
                <p className="text-sm font-semibold text-foreground">Customer Onboarding</p>
                <p className="mt-1 text-sm text-muted-foreground">92% completion this week</p>
              </div>
              <div className="rounded-xl border border-border bg-background p-4">
                <p className="text-sm font-semibold text-foreground">Product Sprint</p>
                <p className="mt-1 text-sm text-muted-foreground">14 tasks delivered on schedule</p>
              </div>
              <div className="rounded-xl border border-border bg-background p-4">
                <p className="text-sm font-semibold text-foreground">Support SLA</p>
                <p className="mt-1 text-sm text-muted-foreground">Average response time: 6 min</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto mt-14 w-full max-w-7xl">
        <div className="mb-6">
          <h3 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">
            Built for fast-moving SaaS teams
          </h3>
          <p className="mt-2 text-muted-foreground">
            Everything you need to manage operations, shipping, and growth in one place.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {features.map((feature) => (
            <article key={feature.title} className="rounded-2xl border border-border bg-background/80 p-5">
              <CheckCircle2 className="h-5 w-5 text-primary" />
              <h4 className="mt-3 text-lg font-semibold text-foreground">{feature.title}</h4>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{feature.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mx-auto mt-14 w-full max-w-7xl">
        <div className="rounded-3xl border border-border bg-background/85 p-6 md:p-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h3 className="text-2xl font-bold text-foreground">Start free, scale when ready</h3>
              <p className="mt-1 text-muted-foreground">
                Launch your workspace in minutes. Upgrade only when your team grows.
              </p>
            </div>
            <Link
              to="/pricing"
              className="rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary-dark"
            >
              Get Started
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
