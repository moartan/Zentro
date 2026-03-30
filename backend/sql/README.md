# Supabase SQL Run Order

Run these files in this exact order from Supabase SQL Editor:

1. Optional cleanup: `000_drop_legacy_tasks_table.sql`
2. `001_extensions.sql`
3. `002_enums.sql`
4. `003_profiles.sql`
5. `004_businesses.sql`
6. `005_business_members.sql`
7. `006_teams.sql`
8. `007_team_members.sql`
9. `008_tasks.sql`
10. `009_invitations.sql`
11. `010_login_activity.sql`
12. `011_audit_logs.sql`
13. `012_updated_at_triggers.sql`
14. `013_indexes.sql`
15. `014_business_subscriptions.sql`
16. `015_user_permissions.sql`
17. `016_invitation_profile_fields.sql`
18. `017_subscription_plans_and_cycles.sql`
19. `018_subscription_lifecycle_dates.sql`
20. `019_subscription_pending_changes.sql`
21. `020_team_status_and_comments.sql`
22. `021_tasks_workflow_upgrade.sql`
23. `022_task_comments.sql`
24. `023_profile_extended_fields.sql`
25. `024_workspace_profile_fields.sql`
26. `025_workspace_lifecycle.sql`
27. `026_profile_backup_email.sql`
28. `027_notifications.sql`
29. `028_notification_preferences.sql`
30. `029_idempotency_keys.sql`

## Notes

- This is schema-only (no RLS policies yet).
- Existing backend task endpoints are still based on the old simple tasks shape and will need updates to use this multi-tenant schema.
