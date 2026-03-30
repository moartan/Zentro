-- Subscription lifecycle dates for accuracy in billing views
-- Safe to run multiple times.

alter table public.businesses
  add column if not exists trial_started_at timestamptz;

alter table public.businesses
  add column if not exists last_payment_at timestamptz;

-- Backfill lifecycle dates from existing timestamps.
update public.businesses
set trial_started_at = coalesce(trial_started_at, subscription_updated_at, created_at)
where coalesce(subscription_plan, 'free') = 'free'
  and trial_started_at is null;

update public.businesses
set last_payment_at = coalesce(last_payment_at, subscription_updated_at, created_at)
where coalesce(subscription_plan, 'free') <> 'free'
  and last_payment_at is null;

create index if not exists idx_businesses_trial_started_at on public.businesses(trial_started_at);
create index if not exists idx_businesses_last_payment_at on public.businesses(last_payment_at);
