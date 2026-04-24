#!/usr/bin/env node
// Seeds N running demo agents for the TEST user so the demo dashboard has
// live-looking cards in the Running section. Does NOT wipe anything —
// appends new rows alongside whatever already exists.
//
// Usage:
//   node --env-file=.env.local scripts/seed-running-demo.mjs              # dry run, N=3
//   node --env-file=.env.local scripts/seed-running-demo.mjs --write
//   node --env-file=.env.local scripts/seed-running-demo.mjs --write --count=5

import { createClient } from "@supabase/supabase-js";

const args = new Set(process.argv.slice(2));
const DRY_RUN = !args.has("--write");
const countArg = [...args].find((a) => a.startsWith("--count="));
const COUNT = countArg ? parseInt(countArg.split("=")[1], 10) : 3;
const PROJECT = "demo-project";

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

const SUBAGENTS = ["general-purpose", "Explore", "Plan"];
const TOOLS = ["Bash", "Read", "Grep", "Glob", "Edit", "Write", "WebFetch"];
const VERBS = ["Analyzing", "Searching", "Fetching", "Refactoring", "Debugging", "Reviewing"];
const NOUNS = [
  "user auth flow",
  "API endpoints",
  "test harness",
  "caching layer",
  "queue worker",
  "type definitions",
  "logging schema",
];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomActivityLog(n) {
  const out = [];
  let t = Date.now() - n * 4_000;
  for (let i = 0; i < n; i++) {
    const tool = pick(TOOLS);
    out.push({
      toolName: tool,
      summary: `${tool}: ${pick(VERBS).toLowerCase()} ${pick(NOUNS)}`,
      timestamp: t,
    });
    t += 3_000 + Math.floor(Math.random() * 4_000);
  }
  return out;
}

function randomRunningAgent(userId) {
  const startedAt = Date.now() - Math.floor(Math.random() * 5 * 60 * 1000);
  const logSize = Math.floor(Math.random() * 4) + 2;
  const activityLog = randomActivityLog(logSize);
  const description = `${pick(VERBS)} ${pick(NOUNS)}`;
  return {
    user_id: userId,
    project: PROJECT,
    description,
    prompt: `Demo agent: ${description.toLowerCase()}`,
    subagent_type: pick(SUBAGENTS),
    background: false,
    status: "running",
    started_at: new Date(startedAt).toISOString(),
    completed_at: null,
    elapsed_ms: null,
    session_id: `demo-${Math.floor(Math.random() * 1000)}`,
    current_activity: activityLog[activityLog.length - 1],
    activity_log: activityLog,
    last_activity_at: new Date().toISOString(),
  };
}

async function findTestUserId() {
  const { data, error } = await supabase.auth.admin.listUsers({ perPage: 200 });
  if (error) throw error;
  const u = data.users.find(
    (u) => u.email?.toLowerCase() === TEST_EMAIL.toLowerCase()
  );
  if (!u) throw new Error(`No user ${TEST_EMAIL}. Run scripts/seed-users.mjs first.`);
  return u.id;
}

async function main() {
  const testId = await findTestUserId();
  const agents = Array.from({ length: COUNT }, () => randomRunningAgent(testId));

  console.log(`owner: ${testId} (${TEST_EMAIL})   project: ${PROJECT}`);
  console.log(`running agents to insert: ${agents.length}`);
  console.log(`mode: ${DRY_RUN ? "DRY RUN" : "WRITE (append)"}`);

  if (DRY_RUN) {
    console.log(
      "\nSample:\n" + JSON.stringify(agents[0], null, 2).slice(0, 500)
    );
    console.log("\nRe-run with --write to actually insert.");
    return;
  }

  const { data: inserted, error } = await supabase
    .from("agents")
    .insert(agents)
    .select("id, started_at");
  if (error) throw error;

  const events = inserted.map((a) => ({
    type: "agent_started",
    agent_id: a.id,
    user_id: testId,
    project: PROJECT,
    timestamp: a.started_at,
    payload: {},
  }));

  const { error: evErr } = await supabase.from("agent_events").insert(events);
  if (evErr) throw evErr;

  console.log(
    `\nInserted ${inserted.length} running agents: ${inserted
      .map((a) => `#${a.id}`)
      .join(", ")}`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
