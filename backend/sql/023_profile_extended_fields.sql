alter table public.profiles
  add column if not exists job_title text,
  add column if not exists phone text,
  add column if not exists country text,
  add column if not exists gender text,
  add column if not exists bio text;
