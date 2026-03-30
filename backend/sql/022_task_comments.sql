-- Task comments
-- Safe to run multiple times.

create table if not exists public.task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  author_user_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  constraint ck_task_comments_body_length check (char_length(trim(body)) between 1 and 1000)
);

create index if not exists idx_task_comments_task_created_at
  on public.task_comments (task_id, created_at desc);

create index if not exists idx_task_comments_business_created_at
  on public.task_comments (business_id, created_at desc);
