alter table public.businesses
  add column if not exists description text,
  add column if not exists support_email text,
  add column if not exists support_phone text,
  add column if not exists website text,
  add column if not exists accent_color text,
  add column if not exists logo_url text;
