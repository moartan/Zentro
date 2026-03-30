create table if not exists public.user_permissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  business_id uuid references public.businesses(id) on delete cascade,
  role_preset text not null check (role_preset in ('super_admin', 'business_owner', 'admin', 'manager', 'member')),
  permissions jsonb not null default '{}'::jsonb,
  is_custom_override boolean not null default false,
  updated_by_user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_user_permissions_unique_scope
on public.user_permissions(user_id, coalesce(business_id, '00000000-0000-0000-0000-000000000000'::uuid));

create index if not exists idx_user_permissions_user_id on public.user_permissions(user_id);
create index if not exists idx_user_permissions_business_id on public.user_permissions(business_id);

drop trigger if exists user_permissions_set_updated_at on public.user_permissions;
create trigger user_permissions_set_updated_at
before update on public.user_permissions
for each row
execute function public.set_updated_at();
