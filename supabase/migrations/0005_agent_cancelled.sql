-- Distinguishes a force-cancelled agent from a naturally completed one.
-- Both have status = 'completed'; the `cancelled` flag lets the UI render
-- a different banner (and lets future queries exclude manual cleanups from
-- usage stats if we ever want to).

alter table public.agents
  add column if not exists cancelled boolean not null default false;
