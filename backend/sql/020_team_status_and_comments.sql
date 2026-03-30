-- Team status + team comments + leader uniqueness
-- Safe to run multiple times.

do $$ begin
  create type public.team_status as enum ('active', 'on_hold', 'completed', 'archived');
exception
  when duplicate_object then null;
end $$;

alter table public.teams
  add column if not exists status public.team_status not null default 'active';

create unique index if not exists idx_team_members_one_lead_per_team
  on public.team_members (team_id)
  where role = 'lead';

create table if not exists public.team_comments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  team_id uuid not null,
  author_user_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  constraint fk_team_comments_team_business
    foreign key (team_id, business_id)
    references public.teams(id, business_id)
    on delete cascade,
  constraint ck_team_comments_body
    check (char_length(trim(body)) between 1 and 1000)
);

create index if not exists idx_team_comments_team_created_at
  on public.team_comments (team_id, created_at desc);

create index if not exists idx_teams_business_status
  on public.teams (business_id, status);
