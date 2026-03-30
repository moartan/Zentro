do $$ begin
  alter type public.task_status add value if not exists 'on_hold';
exception
  when duplicate_object then null;
end $$;

do $$ begin
  alter type public.task_status add value if not exists 'canceled';
exception
  when duplicate_object then null;
end $$;

do $$ begin
  alter type public.task_priority add value if not exists 'urgent';
exception
  when duplicate_object then null;
end $$;

alter table if exists public.tasks
  add column if not exists progress_percent int,
  add column if not exists start_at timestamptz,
  add column if not exists due_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists estimated_at timestamptz,
  add column if not exists hold_reason text,
  add column if not exists cancel_reason text,
  add column if not exists completion_note text;

update public.tasks
set due_at = due_date::timestamptz
where due_at is null
  and due_date is not null;

do $$ begin
  alter table public.tasks
    add constraint ck_tasks_progress_percent_range
      check (progress_percent is null or (progress_percent >= 0 and progress_percent <= 100));
exception
  when duplicate_object then null;
end $$;

do $$ begin
  alter table public.tasks
    add constraint ck_tasks_hold_reason
      check (status::text <> 'on_hold' or nullif(trim(hold_reason), '') is not null);
exception
  when duplicate_object then null;
end $$;

do $$ begin
  alter table public.tasks
    add constraint ck_tasks_cancel_reason
      check (status::text <> 'canceled' or nullif(trim(cancel_reason), '') is not null);
exception
  when duplicate_object then null;
end $$;

create index if not exists idx_tasks_due_at on public.tasks(due_at);
