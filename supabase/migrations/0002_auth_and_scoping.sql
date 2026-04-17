-- Agent Team Monitor — multi-user auth + project scoping.
-- Run AFTER 0001_init.sql. Transforms the single-user schema into per-user
-- isolated records enforced by Row-Level Security.

-- =============================================================================
-- Add user_id + project columns
-- =============================================================================

alter table agents       add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table agents       add column if not exists project text;
alter table agent_events add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table agent_events add column if not exists project text;
alter table stop_requests add column if not exists user_id uuid references auth.users(id) on delete cascade;

create index if not exists agents_user_idx        on agents (user_id, started_at desc);
create index if not exists agents_user_project_idx on agents (user_id, project);
create index if not exists events_user_idx        on agent_events (user_id, "timestamp" desc);
create index if not exists stop_requests_user_idx on stop_requests (user_id);

-- =============================================================================
-- global_state: singleton -> per-user
-- =============================================================================

alter table global_state drop constraint if exists global_state_pkey;
alter table global_state drop constraint if exists global_state_id_check;
alter table global_state drop column if exists id;
alter table global_state add column if not exists user_id uuid primary key references auth.users(id) on delete cascade;

-- =============================================================================
-- Ingest tokens (for local hook scripts)
--   token_hash: sha256 of plaintext token (never store plaintext)
--   one token per (user, label) so users can rotate/revoke
-- =============================================================================

create table if not exists ingest_tokens (
  id           bigserial primary key,
  user_id      uuid not null references auth.users(id) on delete cascade,
  label        text not null default 'default',
  token_hash   text not null unique,
  default_project text,
  created_at   timestamptz default now(),
  last_used_at timestamptz,
  revoked_at   timestamptz
);

create index if not exists ingest_tokens_user_idx on ingest_tokens (user_id);
create index if not exists ingest_tokens_hash_idx on ingest_tokens (token_hash) where revoked_at is null;

-- =============================================================================
-- Trigger: auto-create a global_state row for every new auth.users
-- =============================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.global_state (user_id) values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =============================================================================
-- Tighten RLS: replace permissive "using (true)" with per-user policies
-- =============================================================================

-- Drop the old open-read policies
drop policy if exists "anon read agents"       on agents;
drop policy if exists "anon read events"       on agent_events;
drop policy if exists "anon read global_state" on global_state;

-- agents
create policy "users read own agents"
  on agents for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "users update own agents"
  on agents for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "users delete own agents"
  on agents for delete
  to authenticated
  using (user_id = (select auth.uid()));

-- agent_events
create policy "users read own events"
  on agent_events for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "users delete own events"
  on agent_events for delete
  to authenticated
  using (user_id = (select auth.uid()));

-- global_state
create policy "users read own global_state"
  on global_state for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "users update own global_state"
  on global_state for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- stop_requests (users can request stops for their own agents)
create policy "users read own stop_requests"
  on stop_requests for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "users insert own stop_requests"
  on stop_requests for insert
  to authenticated
  with check (user_id = (select auth.uid()));

-- ingest_tokens — users can see their own tokens (but we never expose the plaintext)
alter table ingest_tokens enable row level security;
create policy "users read own tokens"
  on ingest_tokens for select
  to authenticated
  using (user_id = (select auth.uid()));

-- Note: No INSERT policies for authenticated users on agents/agent_events.
-- All writes go through /api/hook which uses the service-role key (bypasses RLS)
-- and stamps user_id based on the verified ingest token. This is deliberate —
-- we don't want the browser to be able to spoof agent records.

-- =============================================================================
-- Realtime: already added in 0001; realtime respects RLS by default, so
-- subscribers will only see rows they can SELECT. No changes needed.
-- =============================================================================
