alter table public.profiles
  add column if not exists backup_email text;

create unique index if not exists profiles_backup_email_unique_idx
  on public.profiles (lower(backup_email))
  where backup_email is not null;
