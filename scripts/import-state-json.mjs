#!/usr/bin/env node
// One-shot importer: data/state.json -> Supabase (agents, agent_events, global_state).
// All rows are stamped with the admin user's user_id and the given project.
//
// Usage:
//   node --env-file=.env.local scripts/import-state-json.mjs              # dry run
//   node --env-file=.env.local scripts/import-state-json.mjs --write
//   node --env-file=.env.local scripts/import-state-json.mjs --write --wipe
//
// Requires ADMIN_EMAIL in .env.local to resolve which user owns the rows.

import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATE_PATH = resolve(__dirname, "../data/state.json");
const BATCH = 100;
const PROJECT = "agent-monitor";

const args = new Set(process.argv.slice(2));
const DRY_RUN = !args.has("--write");
const WIPE = args.has("--wipe");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;

if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
if (!ADMIN_EMAIL) {
  console.error("Missing ADMIN_EMAIL in .env.local.");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const iso = (ms) => (ms == null ? null : new Date(ms).toISOString());

function agentToRow(a, userId) {
  const log = Array.isArray(a.activityLog) ? a.activityLog : [];
  const lastActivityMs =
    log.length > 0 ? log[log.length - 1].timestamp : a.completedAt ?? a.startedAt;
  return {
    id: a.id,
    user_id: userId,
    project: PROJECT,
    description: a.description ?? "unnamed agent",
    prompt: (a.prompt ?? "").slice(0, 500),
    subagent_type: a.subagentType ?? "general-purpose",
    background: !!a.background,
    status: a.status,
    started_at: iso(a.startedAt) ?? new Date().toISOString(),
    completed_at: iso(a.completedAt),
    elapsed_ms: a.elapsed ?? null,
    session_id: a.sessionId ?? null,
    result_preview: a.resultPreview ?? null,
    usage: a.usage ?? null,
    current_activity: a.currentActivity ?? null,
    activity_log: log,
    last_activity_at: iso(lastActivityMs),
  };
}

function eventToRow(e, userId) {
  const payload = {};
  if (e.agent) payload.agent = e.agent;
  if (e.usage) payload.usage = e.usage;
  return {
    type: e.type,
    agent_id: e.agentId ?? null,
    user_id: userId,
    project: PROJECT,
    timestamp: iso(e.timestamp) ?? new Date().toISOString(),
    payload,
  };
}

async function chunkedInsert(table, rows) {
  for (let i = 0; i < rows.length; i += BATCH) {
    const slice = rows.slice(i, i + BATCH);
    const { error } = await supabase.from(table).insert(slice);
    if (error) {
      console.error(`insert ${table} [${i}..${i + slice.length}] failed:`, error.message);
      throw error;
    }
    process.stdout.write(`  ${table}: ${Math.min(i + BATCH, rows.length)}/${rows.length}\r`);
  }
  console.log("");
}

async function findAdminId() {
  const { data, error } = await supabase.auth.admin.listUsers({ perPage: 200 });
  if (error) throw error;
  const u = data.users.find((u) => u.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase());
  if (!u) {
    throw new Error(
      `No Supabase user with email ${ADMIN_EMAIL}. Run scripts/seed-users.mjs first.`
    );
  }
  return u.id;
}

async function main() {
  const raw = await readFile(STATE_PATH, "utf8");
  const state = JSON.parse(raw);

  const adminId = await findAdminId();

  const agentRows = state.agents.map((a) => agentToRow(a, adminId));
  const eventRows = state.events.map((e) => eventToRow(e, adminId));
  const nextId = state.nextId ?? Math.max(...state.agents.map((a) => a.id)) + 1;
  const sessionStartedAt = iso(state.sessionStartedAt) ?? new Date().toISOString();
  const usage = state.usage ?? { totalTokens: 0, totalToolUses: 0, totalDurationMs: 0 };

  console.log(`source: ${STATE_PATH}`);
  console.log(`  owner user_id: ${adminId}  (${ADMIN_EMAIL})`);
  console.log(`  project: ${PROJECT}`);
  console.log(`  agents: ${agentRows.length}   events: ${eventRows.length}`);
  console.log(`  nextId: ${nextId}   sessionStartedAt: ${sessionStartedAt}`);
  console.log(`  totals: tokens=${usage.totalTokens} toolUses=${usage.totalToolUses} durationMs=${usage.totalDurationMs}`);
  console.log(`  mode:   ${DRY_RUN ? "DRY RUN (no writes)" : WIPE ? "WRITE + WIPE existing for this user" : "WRITE (append)"}`);

  const { count: existingAgents } = await supabase
    .from("agents")
    .select("*", { count: "exact", head: true })
    .eq("user_id", adminId);
  console.log(`  existing agents for this user: ${existingAgents ?? 0}`);

  if (DRY_RUN) {
    console.log("\nDry run — pass --write to apply.");
    console.log("Sample agent row:", JSON.stringify(agentRows[0], null, 2).slice(0, 600));
    return;
  }

  if (WIPE) {
    console.log("wiping existing rows for this user…");
    await supabase.from("agent_events").delete().eq("user_id", adminId);
    await supabase.from("agents").delete().eq("user_id", adminId);
  } else if ((existingAgents ?? 0) > 0) {
    console.error(
      `\nRefusing: ${existingAgents} agents already exist for ${ADMIN_EMAIL}. ` +
        `Re-run with --wipe to replace.`
    );
    process.exit(1);
  }

  console.log("inserting agents…");
  await chunkedInsert("agents", agentRows);

  console.log("inserting events…");
  await chunkedInsert("agent_events", eventRows);

  console.log("updating global_state…");
  const { error: gsErr } = await supabase
    .from("global_state")
    .upsert(
      {
        user_id: adminId,
        total_tokens: usage.totalTokens ?? 0,
        total_tool_uses: usage.totalToolUses ?? 0,
        total_duration_ms: usage.totalDurationMs ?? 0,
        session_started_at: sessionStartedAt,
      },
      { onConflict: "user_id" }
    );
  if (gsErr) throw gsErr;

  console.log("\nDone.");
  console.log(
    `\nIMPORTANT — run this ONCE in the Supabase SQL editor to bump the agents sequence\n` +
      `so new inserts don't collide with imported IDs:\n\n` +
      `  select setval('agents_id_seq', ${nextId - 1}, true);\n`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
