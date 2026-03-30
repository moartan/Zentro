create table if not exists public.team_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.team_member_role not null default 'member',
  created_at timestamptz not null default now(),
  unique (team_id, user_id)
);
