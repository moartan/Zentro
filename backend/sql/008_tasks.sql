create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  title text not null,
  description text not null default '',
  status public.task_status not null default 'todo',
  priority public.task_priority not null default 'medium',
  progress_percent int,
  assignment_type public.task_assignment_type not null default 'individual',
  assignee_user_id uuid references public.profiles(id) on delete set null,
  assignee_team_id uuid,
  created_by_user_id uuid not null references public.profiles(id),
  start_at timestamptz,
  due_at timestamptz,
  completed_at timestamptz,
  estimated_at timestamptz,
  hold_reason text,
  cancel_reason text,
  completion_note text,
  due_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fk_tasks_assignee_team_business
    foreign key (assignee_team_id, business_id)
    references public.teams(id, business_id)
    on delete set null,
  constraint ck_tasks_assignment_target check (
    (assignment_type = 'individual' and assignee_user_id is not null and assignee_team_id is null)
    or
    (assignment_type = 'team' and assignee_team_id is not null and assignee_user_id is null)
  ),
  constraint ck_tasks_progress_percent_range check (progress_percent is null or (progress_percent >= 0 and progress_percent <= 100)),
  constraint ck_tasks_hold_reason check (status <> 'on_hold' or nullif(trim(hold_reason), '') is not null),
  constraint ck_tasks_cancel_reason check (status <> 'canceled' or nullif(trim(cancel_reason), '') is not null)
);
