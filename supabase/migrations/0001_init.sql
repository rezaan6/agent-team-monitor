-- Agent Team Monitor — initial schema
-- Run this once in the Supabase SQL editor (or via `supabase db push`).

-- =============================================================================
-- Tables
-- =============================================================================

create table if not exists agents (
  id              bigserial primary key,
  description     text not null,
  prompt          text default '',
  subagent_type   text default 'general-purpose',
  background      boolean default false,
  status          text not null check (status in ('running','completed','error')),
  started_at      timestamptz not null default now(),
  completed_at    timestamptz,
  elapsed_ms      bigint,
  session_id      text,
  result_preview  text,
  usage           jsonb,
  current_activity jsonb,
  activity_log    jsonb default '[]'::jsonb,
  last_activity_at timestamptz default now()
);

create index if not exists agents_status_idx       on agents (status);
create index if not exists agents_session_idx      on agents (session_id, status);
create index if not exists agents_started_at_idx   on agents (started_at desc);
create index if not exists agents_last_activity_idx on agents (last_activity_at desc);

create table if not exists agent_events (
  id         bigserial primary key,
  type       text not null,
  agent_id   bigint references agents(id) on delete cascade,
  "timestamp" timestamptz default now(),
  payload    jsonb
);

create index if not exists events_timestamp_idx on agent_events ("timestamp" desc);

-- Singleton global state row (totals + active-agent rotation pointer)
create table if not exists global_state (
  id                  int primary key default 1 check (id = 1),
  total_tokens        bigint default 0,
  total_tool_uses     bigint default 0,
  total_duration_ms   bigint default 0,
  session_started_at  timestamptz default now(),
  active_agent_id     bigint,
  last_activity_ts    timestamptz
);

insert into global_state (id) values (1) on conflict (id) do nothing;

-- =============================================================================
-- Realtime
-- =============================================================================

alter publication supabase_realtime add table agents;
alter publication supabase_realtime add table agent_events;
alter publication supabase_realtime add table global_state;

-- =============================================================================
-- RLS — permissive for now (single-user personal dashboard).
-- Tighten later if you add auth.
-- =============================================================================

alter table agents enable row level security;
alter table agent_events enable row level security;
alter table global_state enable row level security;

create policy "anon read agents"        on agents        for select using (true);
create policy "anon read events"        on agent_events  for select using (true);
create policy "anon read global_state"  on global_state  for select using (true);
-- Writes happen exclusively via the Next.js API routes using the service-role
-- key, which bypasses RLS, so no write policies are needed here.
