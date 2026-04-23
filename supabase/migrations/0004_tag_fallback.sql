-- Agent Team Monitor — per-session tag fallback.
-- Adds a small label that the card uses ONLY when the session id is missing.
-- The existing `project` column is unchanged and continues to render as its
-- own independent pill on the card (see src/lib/agents/session-tag.ts).
--
-- Safe to re-run. Run AFTER 0003_agent_cwd.sql.

alter table agents
  add column if not exists tag_fallback text;
