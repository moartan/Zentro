-- Idempotency keys for create endpoints
-- Safe to run multiple times.

create table if not exists public.idempotency_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  scope text not null,
  key text not null,
  status_code int not null,
  response jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours')
);

create unique index if not exists idx_idempotency_keys_user_scope_key
  on public.idempotency_keys (user_id, scope, key);

create index if not exists idx_idempotency_keys_expires_at
  on public.idempotency_keys (expires_at);
