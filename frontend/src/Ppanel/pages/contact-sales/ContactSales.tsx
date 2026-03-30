import { Building2, CalendarDays, ShieldCheck } from 'lucide-react';

export default function ContactSalesPage() {
  return (
    <div className="px-4 pb-14 pt-8 md:px-6 md:pt-12">
      <section className="mx-auto grid w-full max-w-7xl gap-6 lg:grid-cols-[0.95fr_1.05fr]">
        <div className="rounded-3xl border border-border bg-background/85 p-6 md:p-8">
          <h1 className="text-4xl font-bold tracking-tight text-foreground md:text-5xl">Contact Sales</h1>
          <p className="mt-3 text-muted-foreground">
            Talk with our team about Enterprise pricing, security requirements, and onboarding.
          </p>

          <div className="mt-6 space-y-4">
            <div className="flex items-start gap-3 rounded-xl border border-border bg-secondary/30 p-4">
              <Building2 className="mt-1 h-5 w-5 text-primary" />
              <div>
                <p className="font-semibold text-foreground">Enterprise rollout</p>
                <p className="text-sm text-muted-foreground">Unlimited teams, custom onboarding, and change management support.</p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-xl border border-border bg-secondary/30 p-4">
              <ShieldCheck className="mt-1 h-5 w-5 text-primary" />
              <div>
                <p className="font-semibold text-foreground">Security and compliance</p>
                <p className="text-sm text-muted-foreground">Discuss SSO, auditing, and advanced access controls for your organization.</p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-xl border border-border bg-secondary/30 p-4">
              <CalendarDays className="mt-1 h-5 w-5 text-primary" />
              <div>
                <p className="font-semibold text-foreground">Live demo session</p>
                <p className="text-sm text-muted-foreground">We can walk your team through task and collaboration workflows.</p>
              </div>
            </div>
          </div>
        </div>

        <form className="rounded-3xl border border-border bg-background/90 p-6 md:p-8">
          <h2 className="text-2xl font-bold text-foreground">Request a call</h2>
          <p className="mt-2 text-sm text-muted-foreground">Mock form for now. You can connect this to your backend later.</p>

          <div className="mt-6 space-y-4">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-foreground">Full name</span>
              <input type="text" className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/40" placeholder="Your full name" />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-foreground">Work email</span>
              <input type="email" className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/40" placeholder="you@company.com" />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-foreground">Company</span>
              <input type="text" className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/40" placeholder="Company name" />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-foreground">Message</span>
              <textarea className="min-h-32 w-full rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/40" placeholder="Tell us about your team, members, and requirements." />
            </label>
          </div>

          <button type="button" className="mt-6 w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary-dark">
            Send Request
          </button>
        </form>
      </section>
    </div>
  );
}
