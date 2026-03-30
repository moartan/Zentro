import { Check, Sparkles } from 'lucide-react';

const plans = [
  {
    name: 'Free',
    price: '$0',
    period: '/month',
    description: 'Great for trying task workflows with a small team.',
    cta: 'Start Free Demo',
    highlighted: false,
    features: [
      'Up to 5 members',
      'Up to 2 teams',
      'Task management (basic)',
      'Email support',
    ],
  },
  {
    name: 'Pro',
    price: '$29',
    period: '/month',
    description: 'For growing teams that need advanced collaboration and scale.',
    cta: 'Start Pro Demo',
    highlighted: true,
    features: [
      'Up to 25 members',
      'Up to 10 teams',
      'Task management (advanced)',
      'Priority email support',
      'Automation and reports',
    ],
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    period: '',
    description: 'For organizations that need unlimited collaboration and full control.',
    cta: 'Contact Sales',
    highlighted: false,
    features: [
      'Unlimited members',
      'Unlimited teams',
      'Unlimited task workflows',
      'Dedicated success manager',
      'Custom SLA and security options',
    ],
  },
];

export default function PricingPage() {
  return (
    <div className="px-4 pb-14 pt-8 md:px-6 md:pt-12">
      <section className="mx-auto w-full max-w-7xl">
        <div className="mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-background/80 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-primary">
            <Sparkles className="h-4 w-4" />
            Pricing
          </span>
          <h1 className="mt-5 text-4xl font-bold tracking-tight text-foreground md:text-5xl">
            Simple pricing for every stage of growth
          </h1>
          <p className="mt-3 text-lg text-muted-foreground">
            Start free, upgrade when you scale, and move to enterprise when your team needs full
            control.
          </p>
        </div>

        <div className="mt-10 grid gap-5 lg:grid-cols-3">
          {plans.map((plan) => (
            <article
              key={plan.name}
              className={`rounded-3xl border p-6 ${
                plan.highlighted
                  ? 'border-primary bg-primary/5 shadow-[0_18px_50px_-24px_rgba(14,165,233,0.7)]'
                  : 'border-border bg-background/85'
              }`}
            >
              <h2 className="text-2xl font-bold text-foreground">{plan.name}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{plan.description}</p>

              <div className="mt-6 flex items-end gap-1">
                <span className="text-4xl font-black tracking-tight text-foreground">{plan.price}</span>
                {plan.period && <span className="pb-1 text-sm text-muted-foreground">{plan.period}</span>}
              </div>

              <button
                type="button"
                className={`mt-6 w-full rounded-xl px-4 py-3 text-sm font-semibold transition ${
                  plan.highlighted
                    ? 'bg-primary text-primary-foreground hover:bg-primary-dark'
                    : 'bg-secondary/80 text-foreground hover:bg-secondary'
                }`}
              >
                {plan.cta}
              </button>

              <ul className="mt-6 space-y-3">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
