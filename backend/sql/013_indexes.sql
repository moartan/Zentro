create index if not exists idx_business_members_user_id on public.business_members(user_id);
create index if not exists idx_business_members_business_id on public.business_members(business_id);

create index if not exists idx_teams_business_id on public.teams(business_id);
create index if not exists idx_team_members_user_id on public.team_members(user_id);
create index if not exists idx_team_members_team_id on public.team_members(team_id);

create index if not exists idx_tasks_business_id on public.tasks(business_id);
create index if not exists idx_tasks_assignee_user_id on public.tasks(assignee_user_id);
create index if not exists idx_tasks_assignee_team_id on public.tasks(assignee_team_id);
create index if not exists idx_tasks_status on public.tasks(status);

create index if not exists idx_invitations_business_id on public.invitations(business_id);
create index if not exists idx_invitations_email on public.invitations(email);

create index if not exists idx_login_activity_user_id on public.login_activity(user_id);
create index if not exists idx_login_activity_created_at on public.login_activity(created_at desc);

create index if not exists idx_audit_logs_business_id on public.audit_logs(business_id);
create index if not exists idx_audit_logs_actor_user_id on public.audit_logs(actor_user_id);
create index if not exists idx_audit_logs_created_at on public.audit_logs(created_at desc);
