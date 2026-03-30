-- Pending subscription changes (effective at next renewal)
-- Safe to run multiple times.

alter table public.businesses
  add column if not exists pending_subscription_plan text;

alter table public.businesses
  add column if not exists pending_subscription_billing_cycle text;

alter table public.businesses
  add column if not exists pending_subscription_effective_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'businesses_pending_subscription_plan_check'
  ) then
    alter table public.businesses
      add constraint businesses_pending_subscription_plan_check
      check (
        pending_subscription_plan is null
        or pending_subscription_plan in ('free', 'pro', 'enterprise')
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'businesses_pending_subscription_cycle_check'
  ) then
    alter table public.businesses
      add constraint businesses_pending_subscription_cycle_check
      check (
        pending_subscription_billing_cycle is null
        or pending_subscription_billing_cycle in ('monthly', 'yearly')
      );
  end if;
end $$;

create index if not exists idx_businesses_pending_subscription_effective_at
  on public.businesses (pending_subscription_effective_at);
