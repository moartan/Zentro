import { Activity, Bot, ShieldCheck, Workflow } from 'lucide-react';

const featureRows = [
  {
    icon: Workflow,
    title: 'Workflow Engine',
    description: 'Design no-code workflows that automate repetitive operations across your SaaS stack.',
  },
  {
    icon: Activity,
    title: 'Live Performance',
    description: 'Track team throughput, sprint health, and customer operations with real-time dashboards.',
  },
  {
    icon: Bot,
    title: 'AI Assist',
    description: 'Generate summaries, draft replies, and surface task blockers before they slow your team.',
  },
  {
    icon: ShieldCheck,
    title: 'Security Controls',
    description: 'Role-based access, audit logs, and policy controls built for scaling organizations.',
  },
];

export default function FeaturesPage() {
  return (
    <div className="px-4 pb-14 pt-8 md:px-6 md:pt-12">
      <section className="mx-auto w-full max-w-7xl">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="text-4xl font-bold tracking-tight text-foreground md:text-5xl">
            Features built for modern SaaS execution
          </h1>
          <p className="mt-3 text-lg text-muted-foreground">
            Zentro gives product, support, and growth teams a shared operating layer from planning
            to delivery.
          </p>
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-2">
          {featureRows.map(({ icon: Icon, title, description }) => (
            <article key={title} className="rounded-2xl border border-border bg-background/85 p-6">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Icon className="h-5 w-5" />
              </span>
              <h2 className="mt-4 text-xl font-semibold text-foreground">{title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p>
            </article>
          ))}
        </div>

        <div className="mt-10 rounded-3xl border border-border bg-background/85 p-6 md:p-8">
          <h3 className="text-2xl font-bold text-foreground">Everything connected, nothing fragmented</h3>
          <p className="mt-2 max-w-3xl text-muted-foreground">
            Replace scattered tools with one centralized workspace where teams can align goals,
            automate execution, and measure performance from the same source of truth.
          </p>
        </div>
      </section>
    </div>
  );
}
