-- Optional cleanup for the old test-era tasks table.
-- Run this BEFORE the new schema migrations only if you still have the legacy table.

drop table if exists public.tasks cascade;
