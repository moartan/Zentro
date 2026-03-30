-- Add basic subscription fields to businesses (default: free + active).
-- Safe to run multiple times.

alter table public.businesses
  add column if not exists subscription_plan text not null default 'free';

alter table public.businesses
  add column if not exists subscription_status text not null default 'active';

-- Optional: basic validation (skip if you don't want constraints yet).
do $$ begin
  alter table public.businesses
    add constraint businesses_subscription_plan_check
    check (subscription_plan in ('free', 'pro', 'enterprise'));
exception
  when duplicate_object then null;
end $$;

do $$ begin
  alter table public.businesses
    add constraint businesses_subscription_status_check
    check (subscription_status in ('active', 'past_due', 'canceled'));
exception
  when duplicate_object then null;
end $$;

