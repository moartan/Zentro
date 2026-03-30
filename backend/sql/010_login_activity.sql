create table if not exists public.login_activity (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  ip_address text,
  user_agent text,
  success boolean not null,
  reason text,
  created_at timestamptz not null default now()
);
