-- Notifications center
-- Safe to run multiple times.

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references public.businesses(id) on delete cascade,
  recipient_user_id uuid not null references public.profiles(id) on delete cascade,
  actor_user_id uuid references public.profiles(id) on delete set null,
  type text not null,
  title text not null,
  message text,
  priority text not null default 'general',
  entity_type text,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  is_read boolean not null default false,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

do $$ begin
  alter table public.notifications
    add constraint ck_notifications_priority
      check (priority in ('urgent', 'high', 'medium', 'general'));
exception
  when duplicate_object then null;
end $$;

create index if not exists idx_notifications_recipient_created_at
  on public.notifications (recipient_user_id, created_at desc);

create index if not exists idx_notifications_recipient_unread
  on public.notifications (recipient_user_id, is_read, created_at desc);

create index if not exists idx_notifications_business_created_at
  on public.notifications (business_id, created_at desc);
