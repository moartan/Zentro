alter table public.invitations
  add column if not exists invitee_name text,
  add column if not exists invitee_gender text,
  add column if not exists invitee_country text;
