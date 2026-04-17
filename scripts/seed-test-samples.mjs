#!/usr/bin/env node
// Seeds 200 fake agents + events for the TEST user, so the demo login has
// something interesting to look at without exposing real data.
//
// Usage:
//   node --env-file=.env.local scripts/seed-test-samples.mjs              # dry run
//   node --env-file=.env.local scripts/seed-test-samples.mjs --write
//   node --env-file=.env.local scripts/seed-test-samples.mjs --write --wipe

import { createClient } from "@supabase/supabase-js";

const COUNT = 200;
const PROJECT = "demo-project";
const BATCH = 100;

const args = new Set(process.argv.slice(2));
const DRY_RUN = !args.has("--write");
const WIPE = args.has("--wipe");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TEST_EMAIL = process.env.TEST_EMAIL ?? "test@demo.local";

if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const SUBAGENTS = ["general-purpose", "Explore", "Plan", "claude-code-guide"];
const TOOLS = ["Bash", "Read", "Grep", "Glob", "Edit", "Write", "WebFetch"];
const VERBS = ["Analyzing", "Searching", "Fetching", "Refactoring", "Debugging", "Reviewing", "Extracting", "Generating", "Parsing"];
const NOUNS = ["user auth flow", "API endpoints", "test harness", "build config", "migration plan", "caching layer", "queue worker", "error handler", "type definitions", "logging schema"];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomActivityLog(n) {
  const out = [];
  let t = Date.now() - Math.floor(Math.random() * 3 * 24 * 3600 * 1000);
  for (let i = 0; i < n; i++) {
    const tool = pick(TOOLS);
    out.push({
      toolName: tool,
      summary: `${tool}: ${pick(VERBS).toLowerCase()} ${pick(NOUNS)}`,
      timestamp: t,
    });
    t += Math.floor(Math.random() * 15_000) + 500;
  }
  return out;
}

function randomAgent(userId) {
  const statusRoll = Math.random();
  const status = statusRoll < 0.85 ? "completed" : statusRoll < 0.97 ? "error" : "running";
  const startedAt = Date.now() - Math.floor(Math.random() * 7 * 24 * 3600 * 1000);
  const elapsed = Math.floor(Math.random() * 180_000) + 2_000;
  const completedAt = status === "running" ? null : startedAt + elapsed;
  const logSize = Math.floor(Math.random() * 10) + 1;
  const activityLog = randomActivityLog(logSize);
  const description = `${pick(VERBS)} ${pick(NOUNS)}`;
  return {
    user_id: userId,
    project: PROJECT,
    description,
    prompt: `Demo agent: ${description.toLowerCase()}`,
    subagent_type: pick(SUBAGENTS),
    background: Math.random() < 0.15,
    status,
    started_at: new Date(startedAt).toISOString(),
    completed_at: completedAt ? new Date(completedAt).toISOString() : null,
    elapsed_ms: status === "running" ? null : elapsed,
    session_id: `demo-${Math.floor(Math.random() * 1000)}`,
    result_preview: status === "error" ? "Demo failure: simulated error for UI testing" : status === "completed" ? "Demo completed successfully." : null,
    usage:
      status === "completed"
        ? {
            totalTokens: Math.floor(Math.random() * 40000),
            toolUses: logSize,
            durationMs: elapsed,
          }
        : null,
    current_activity: status === "running" ? activityLog[activityLog.length - 1] : null,
    activity_log: activityLog,
    last_activity_at: new Date(activityLog[activityLog.length - 1].timestamp).toISOString(),
  };
}

async function findTestUserId() {
  const { data, error } = await supabase.auth.admin.listUsers({ perPage: 200 });
  if (error) throw error;
  const u = data.users.find((u) => u.email?.toLowerCase() === TEST_EMAIL.toLowerCase());
  if (!u) throw new Error(`No user ${TEST_EMAIL}. Run scripts/seed-users.mjs first.`);
  return u.id;
}

async function chunkedInsert(table, rows) {
  for (let i = 0; i < rows.length; i += BATCH) {
    const slice = rows.slice(i, i + BATCH);
    const { error } = await supabase.from(table).insert(slice);
    if (error) {
      console.error(`insert ${table} failed:`, error.message);
      throw error;
    }
    process.stdout.write(`  ${table}: ${Math.min(i + BATCH, rows.length)}/${rows.length}\r`);
  }
  console.log("");
}

async function main() {
  const testId = await findTestUserId();
  const agents = Array.from({ length: COUNT }, () => randomAgent(testId));

  const totalTokens = agents.reduce((a, r) => a + (r.usage?.totalTokens ?? 0), 0);
  const totalToolUses = agents.reduce((a, r) => a + (r.usage?.toolUses ?? 0), 0);
  const totalDurationMs = agents.reduce((a, r) => a + (r.elapsed_ms ?? 0), 0);
  const earliest = agents.reduce(
    (min, r) => (new Date(r.started_at) < min ? new Date(r.started_at) : min),
    new Date()
  );

  console.log(`owner: ${testId} (${TEST_EMAIL})   project: ${PROJECT}`);
  console.log(`agents: ${agents.length}   totalTokens: ${totalTokens}`);
  console.log(`mode: ${DRY_RUN ? "DRY RUN" : WIPE ? "WRITE + WIPE existing" : "WRITE (append)"}`);

  const { count: existing } = await supabase
    .from("agents")
    .select("*", { count: "exact", head: true })
    .eq("user_id", testId);
  console.log(`existing agents for test user: ${existing ?? 0}`);

  if (DRY_RUN) {
    console.log("\nDry run. Sample:", JSON.stringify(agents[0], null, 2).slice(0, 400));
    return;
  }

  if (WIPE) {
    await supabase.from("agent_events").delete().eq("user_id", testId);
    await supabase.from("agents").delete().eq("user_id", testId);
  } else if ((existing ?? 0) > 0) {
    console.error(
      `\nRefusing: test user already has ${existing} agents. Re-run with --wipe.`
    );
    process.exit(1);
  }

  // Insert agents, capture IDs, then synthesize started/completed events
  console.log("inserting agents…");
  const inserted = [];
  for (let i = 0; i < agents.length; i += BATCH) {
    const slice = agents.slice(i, i + BATCH);
    const { data, error } = await supabase.from("agents").insert(slice).select("id, status, started_at, completed_at");
    if (error) throw error;
    inserted.push(...data);
    process.stdout.write(`  agents: ${inserted.length}/${agents.length}\r`);
  }
  console.log("");

  const events = [];
  for (const a of inserted) {
    events.push({
      type: "agent_started",
      agent_id: a.id,
      user_id: testId,
      project: PROJECT,
      timestamp: a.started_at,
      payload: {},
    });
    if (a.status !== "running" && a.completed_at) {
      events.push({
        type: "agent_completed",
        agent_id: a.id,
        user_id: testId,
        project: PROJECT,
        timestamp: a.completed_at,
        payload: {},
      });
    }
  }

  console.log("inserting events…");
  await chunkedInsert("agent_events", events);

  console.log("updating global_state…");
  await supabase
    .from("global_state")
    .upsert(
      {
        user_id: testId,
        total_tokens: totalTokens,
        total_tool_uses: totalToolUses,
        total_duration_ms: totalDurationMs,
        session_started_at: earliest.toISOString(),
      },
      { onConflict: "user_id" }
    );

  console.log("\nDone.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
