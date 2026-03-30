do $$ begin
  create type public.business_role as enum ('business_owner', 'employee');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.member_status as enum ('active', 'invited', 'block');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.team_member_role as enum ('lead', 'member');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.task_status as enum ('todo', 'in_progress', 'on_hold', 'done', 'canceled');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.task_priority as enum ('low', 'medium', 'high', 'urgent');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.task_assignment_type as enum ('individual', 'team');
exception
  when duplicate_object then null;
end $$;
