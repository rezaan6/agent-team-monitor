-- Agent Team Monitor — per-agent cwd.
-- Adds the working directory reported by the Claude Code hook payload so the
-- dashboard can render a session-tag badge (e.g. repo name) on each agent card
-- instead of forcing the viewer to decode the opaque session_id.
--
-- Safe to re-run. Run AFTER 0002_auth_and_scoping.sql.

alter table agents
  add column if not exists cwd text;

-- Useful when filtering by project/working dir in future views.
create index if not exists agents_user_cwd_idx on agents (user_id, cwd);
