-- Notification preferences per user
-- Safe to run multiple times.

create table if not exists public.notification_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  in_app_enabled boolean not null default true,
  email_enabled boolean not null default true,
  urgent_only_email boolean not null default false,
  updated_at timestamptz not null default now()
);
