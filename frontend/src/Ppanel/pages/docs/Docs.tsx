import { BookOpenText, Code2, LifeBuoy, Rocket } from 'lucide-react';

const sections = [
  {
    title: 'Getting Started',
    icon: Rocket,
    points: ['Create your workspace', 'Invite up to 5 members on Free', 'Create your first team and tasks'],
  },
  {
    title: 'Teams and Members',
    icon: BookOpenText,
    points: ['Organize members by teams', 'Set team responsibilities', 'Track ownership on every task'],
  },
  {
    title: 'Task Workflow',
    icon: Code2,
    points: ['Create task boards', 'Assign tasks to members', 'Move tasks across statuses'],
  },
  {
    title: 'Support',
    icon: LifeBuoy,
    points: ['Email support for all plans', 'Priority support on Pro', 'Dedicated support on Enterprise'],
  },
];

export default function DocsPage() {
  return (
    <div className="px-4 pb-14 pt-8 md:px-6 md:pt-12">
      <section className="mx-auto w-full max-w-7xl">
        <div className="rounded-3xl border border-border bg-background/85 p-6 md:p-8">
          <h1 className="text-4xl font-bold tracking-tight text-foreground md:text-5xl">Documentation</h1>
          <p className="mt-3 max-w-3xl text-lg text-muted-foreground">
            Learn how to set up Zentro, manage members and teams, and run task workflows end to end.
          </p>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {sections.map(({ title, icon: Icon, points }) => (
            <article key={title} className="rounded-2xl border border-border bg-background/85 p-6">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Icon className="h-5 w-5" />
              </span>
              <h2 className="mt-4 text-xl font-semibold text-foreground">{title}</h2>
              <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                {points.map((point) => (
                  <li key={point}>- {point}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
