-- Subscription catalog + billing cycle fields
-- Safe to run multiple times.

create table if not exists public.subscription_plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code in ('free', 'pro', 'enterprise')),
  name text not null,
  description text,
  currency text not null default 'USD',
  monthly_price_cents integer,
  yearly_price_cents integer,
  yearly_discount_percent numeric(5,2) not null default 0,
  is_public boolean not null default true,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  limits jsonb not null default '{}'::jsonb,
  feature_flags jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.subscription_plans (
  code,
  name,
  description,
  currency,
  monthly_price_cents,
  yearly_price_cents,
  yearly_discount_percent,
  is_public,
  is_active,
  sort_order,
  limits,
  feature_flags
)
values
  (
    'free',
    'Free',
    'Starter plan for small workspaces.',
    'USD',
    0,
    0,
    0,
    true,
    true,
    10,
    '{"max_members":5,"max_teams":2,"max_active_tasks":50,"max_projects":1}'::jsonb,
    '{"teams":false,"activity_logs":false,"custom_roles":false,"api_access":false,"file_uploads":false}'::jsonb
  ),
  (
    'pro',
    'Pro',
    'Advanced plan for growing teams.',
    'USD',
    2900,
    27840,
    20,
    true,
    true,
    20,
    '{"max_members":25,"max_teams":10,"max_active_tasks":500,"max_projects":10}'::jsonb,
    '{"teams":true,"activity_logs":true,"custom_roles":false,"api_access":true,"file_uploads":true}'::jsonb
  ),
  (
    'enterprise',
    'Enterprise',
    'Custom plan for large organizations.',
    'USD',
    null,
    null,
    0,
    true,
    true,
    30,
    '{"max_members":null,"max_teams":null,"max_active_tasks":null,"max_projects":null}'::jsonb,
    '{"teams":true,"activity_logs":true,"custom_roles":true,"api_access":true,"file_uploads":true}'::jsonb
  )
on conflict (code) do update
set
  name = excluded.name,
  description = excluded.description,
  currency = excluded.currency,
  monthly_price_cents = excluded.monthly_price_cents,
  yearly_price_cents = excluded.yearly_price_cents,
  yearly_discount_percent = excluded.yearly_discount_percent,
  is_public = excluded.is_public,
  is_active = excluded.is_active,
  sort_order = excluded.sort_order,
  limits = excluded.limits,
  feature_flags = excluded.feature_flags,
  updated_at = now();

alter table public.businesses
  add column if not exists subscription_billing_cycle text not null default 'monthly';

alter table public.businesses
  add column if not exists subscription_currency text not null default 'USD';

alter table public.businesses
  add column if not exists subscription_unit_price_cents integer;

alter table public.businesses
  add column if not exists subscription_renewal_at timestamptz;

alter table public.businesses
  add column if not exists subscription_updated_at timestamptz not null default now();

do $$ begin
  alter table public.businesses
    add constraint businesses_subscription_billing_cycle_check
    check (subscription_billing_cycle in ('monthly', 'yearly'));
exception
  when duplicate_object then null;
end $$;

create index if not exists idx_subscription_plans_code on public.subscription_plans(code);
create index if not exists idx_subscription_plans_active_public on public.subscription_plans(is_active, is_public);
