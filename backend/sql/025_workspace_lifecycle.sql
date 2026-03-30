alter table public.businesses
  add column if not exists is_archived boolean not null default false,
  add column if not exists archived_at timestamptz;
