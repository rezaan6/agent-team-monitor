import "server-only";

import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Agent, AgentActivity } from "@/lib/types";

// --- Row types (snake_case, matching the Postgres schema) ---

interface AgentRow {
  id: number;
  description: string;
  prompt: string;
  subagent_type: string;
  background: boolean;
  status: "running" | "completed" | "error";
  started_at: string;
  completed_at: string | null;
  elapsed_ms: number | null;
  session_id: string | null;
  result_preview: string | null;
  usage: Agent["usage"] | null;
  current_activity: AgentActivity | null;
  activity_log: AgentActivity[] | null;
  last_activity_at: string | null;
}

// Background-agent auto-complete sweep: if a running background agent has
// had no activity for 30s, mark it completed on the next write.
const INACTIVITY_TIMEOUT_MS = 30_000;
// Gap-based rotation: if the last tool-use was within this window we keep
// attributing to the same agent; otherwise rotate.
const ROTATION_GAP_MS = 500;

// --- Mappers ---

export function rowToAgent(row: AgentRow): Agent {
  return {
    id: row.id,
    description: row.description,
    prompt: row.prompt ?? "",
    subagentType: row.subagent_type ?? "general-purpose",
    background: row.background ?? false,
    status: row.status,
    startedAt: row.started_at,
    completedAt: row.completed_at ?? undefined,
    elapsed: row.elapsed_ms ?? undefined,
    sessionId: row.session_id ?? undefined,
    resultPreview: row.result_preview ?? undefined,
    usage: row.usage ?? undefined,
    currentActivity: row.current_activity ?? undefined,
    activityLog: row.activity_log ?? [],
  };
}

// --- Hook payloads ---

export interface HookPayload {
  phase: "pre" | "post";
  tool_input?: {
    description?: string;
    prompt?: string;
    subagent_type?: string;
    run_in_background?: boolean;
  };
  tool_result?: string;
  session_id?: string;
  error?: boolean;
}

export interface ActivityPayload {
  phase?: string;
  tool_name?: string;
  summary?: string;
  session_id?: string;
}

// --- Usage parsing (copied from server.mjs) ---

function parseUsage(toolResult: string | undefined) {
  if (!toolResult) return null;
  const usageMatch = toolResult.match(/<usage>([\s\S]*?)<\/usage>/);
  if (!usageMatch) return null;
  const block = usageMatch[1];
  const tokens = block.match(/total_tokens:\s*(\d+)/);
  const tools = block.match(/tool_uses:\s*(\d+)/);
  const duration = block.match(/duration_ms:\s*(\d+)/);
  if (!tokens && !tools && !duration) return null;
  return {
    totalTokens: tokens ? parseInt(tokens[1], 10) : 0,
    toolUses: tools ? parseInt(tools[1], 10) : 0,
    durationMs: duration ? parseInt(duration[1], 10) : 0,
  };
}

// Sweep any background "running" agents that haven't had activity for 30s.
// Called opportunistically on every write — replaces the per-agent timer
// that lived in-memory in the old Express server.
async function sweepStaleBackgroundAgents() {
  const supabase = getSupabaseAdminClient();
  const cutoff = new Date(Date.now() - INACTIVITY_TIMEOUT_MS).toISOString();

  const { data: stale } = await supabase
    .from("agents")
    .select("id, started_at, last_activity_at")
    .eq("status", "running")
    .eq("background", true)
    .lt("last_activity_at", cutoff);

  if (!stale || stale.length === 0) return;

  const now = new Date().toISOString();
  for (const row of stale) {
    const elapsedMs = Date.now() - new Date(row.started_at).getTime();
    await supabase
      .from("agents")
      .update({
        status: "completed",
        completed_at: now,
        elapsed_ms: elapsedMs,
      })
      .eq("id", row.id)
      .eq("status", "running");

    await supabase.from("agent_events").insert({
      type: "agent_completed",
      agent_id: row.id,
      payload: { reason: "inactivity_timeout" },
    });
  }
}

// --- Hook event (Agent tool pre/post) ---

export async function processHookEvent(hook: HookPayload) {
  const supabase = getSupabaseAdminClient();
  const toolInput = hook.tool_input ?? {};
  const description = toolInput.description || "unnamed agent";
  const sessionId = hook.session_id || "unknown";
  const nowIso = new Date().toISOString();

  // Opportunistic cleanup
  await sweepStaleBackgroundAgents();

  if (hook.phase === "pre") {
    const { data: inserted, error } = await supabase
      .from("agents")
      .insert({
        description,
        prompt: (toolInput.prompt || "").slice(0, 500),
        subagent_type: toolInput.subagent_type || "general-purpose",
        background: toolInput.run_in_background || false,
        status: "running",
        session_id: sessionId,
        last_activity_at: nowIso,
      })
      .select()
      .single();

    if (error || !inserted) throw error ?? new Error("insert failed");

    await supabase.from("agent_events").insert({
      type: "agent_started",
      agent_id: inserted.id,
      payload: { agent: rowToAgent(inserted) },
    });

    // New agent becomes the active one for activity attribution
    await supabase
      .from("global_state")
      .update({ active_agent_id: inserted.id, last_activity_ts: nowIso })
      .eq("id", 1);

    return { agentId: inserted.id };
  }

  // --- post phase: find the matching running agent ---

  const { data: matches } = await supabase
    .from("agents")
    .select("*")
    .eq("status", "running")
    .eq("description", description)
    .order("started_at", { ascending: true });

  if (!matches || matches.length === 0) return {};

  // Prefer the one with matching session_id
  let agent =
    matches.find((a) => a.session_id === sessionId) ?? matches[0];

  const startedAtMs = new Date(agent.started_at).getTime();
  const elapsedMs = Date.now() - startedAtMs;

  // Background agents: PostToolUse fires immediately when spawned, not when
  // the agent actually finishes.  If the post arrives <3s after the pre,
  // keep it running — the inactivity sweep will complete it later.
  if (agent.background && elapsedMs < 3000 && !hook.error) {
    await supabase
      .from("agents")
      .update({ last_activity_at: nowIso })
      .eq("id", agent.id);
    return {};
  }

  const toolResult = (hook.tool_result || "").toString();
  const usage = parseUsage(toolResult);
  const status: "completed" | "error" = hook.error ? "error" : "completed";

  // Build update patch
  const patch: Partial<AgentRow> = {
    status,
    completed_at: nowIso,
    elapsed_ms: elapsedMs,
    result_preview: toolResult.slice(0, 300),
    last_activity_at: nowIso,
  };
  if (usage) patch.usage = usage;

  const { data: updated } = await supabase
    .from("agents")
    .update(patch)
    .eq("id", agent.id)
    .eq("status", "running")
    .select()
    .single();

  if (!updated) return {};

  // Accumulate global totals
  if (usage) {
    const { data: gs } = await supabase
      .from("global_state")
      .select("total_tokens, total_tool_uses, total_duration_ms")
      .eq("id", 1)
      .single();

    await supabase
      .from("global_state")
      .update({
        total_tokens: (gs?.total_tokens ?? 0) + usage.totalTokens,
        total_tool_uses: (gs?.total_tool_uses ?? 0) + usage.toolUses,
        total_duration_ms: (gs?.total_duration_ms ?? 0) + usage.durationMs,
      })
      .eq("id", 1);
  }

  await supabase.from("agent_events").insert({
    type: "agent_completed",
    agent_id: agent.id,
    payload: { agent: rowToAgent(updated) },
  });

  return {};
}

// --- Activity (tool-use within an agent) ---

export async function processActivity(data: ActivityPayload) {
  if (data.phase !== "pre") return;
  const toolName = data.tool_name || "";
  const summary = data.summary || toolName;
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();

  const supabase = getSupabaseAdminClient();

  await sweepStaleBackgroundAgents();

  const { data: running } = await supabase
    .from("agents")
    .select("*")
    .eq("status", "running")
    .order("started_at", { ascending: true });

  if (!running || running.length === 0) return;

  let target: AgentRow;
  if (running.length === 1) {
    target = running[0];
  } else {
    const { data: gs } = await supabase
      .from("global_state")
      .select("active_agent_id, last_activity_ts")
      .eq("id", 1)
      .single();

    const current = gs?.active_agent_id
      ? running.find((a) => a.id === gs.active_agent_id)
      : null;
    const lastTs = gs?.last_activity_ts
      ? new Date(gs.last_activity_ts).getTime()
      : 0;
    const gap = nowMs - lastTs;

    if (current && gap < ROTATION_GAP_MS) {
      target = current;
    } else {
      // Rotate: pick the running agent with the fewest recorded steps
      let best = running[0];
      let fewest = Infinity;
      for (const a of running) {
        const steps = Array.isArray(a.activity_log) ? a.activity_log.length : 0;
        if (steps < fewest) {
          fewest = steps;
          best = a;
        }
      }
      target = best;
    }
  }

  const activity: AgentActivity = { toolName, summary, timestamp: nowMs };
  const newLog = [...(target.activity_log ?? []), activity];

  await supabase
    .from("agents")
    .update({
      current_activity: activity,
      activity_log: newLog,
      last_activity_at: nowIso,
    })
    .eq("id", target.id);

  await supabase
    .from("global_state")
    .update({ active_agent_id: target.id, last_activity_ts: nowIso })
    .eq("id", 1);
}

// --- Stop / clear ---

export async function requestStop(agentId: number) {
  const supabase = getSupabaseAdminClient();
  await supabase.from("stop_requests").insert({ agent_id: agentId });
}

export async function clearAllState() {
  const supabase = getSupabaseAdminClient();
  await supabase.from("agent_events").delete().gt("id", 0);
  await supabase.from("agents").delete().gt("id", 0);
  await supabase.from("stop_requests").delete().gt("id", 0);
  await supabase
    .from("global_state")
    .update({
      total_tokens: 0,
      total_tool_uses: 0,
      total_duration_ms: 0,
      session_started_at: new Date().toISOString(),
      active_agent_id: null,
      last_activity_ts: null,
    })
    .eq("id", 1);
}

// --- Pending stop signals (polled by local hook scripts) ---

export async function fetchAndConsumePendingStops(): Promise<number[]> {
  const supabase = getSupabaseAdminClient();
  const nowIso = new Date().toISOString();

  const { data: pending } = await supabase
    .from("stop_requests")
    .select("id, agent_id")
    .is("consumed_at", null)
    .order("requested_at", { ascending: true });

  if (!pending || pending.length === 0) return [];

  const ids = pending.map((p) => p.id);
  await supabase
    .from("stop_requests")
    .update({ consumed_at: nowIso })
    .in("id", ids);

  return pending.map((p) => p.agent_id);
}

// --- Initial state snapshot (dashboard loads this on mount) ---

export async function getInitialSnapshot() {
  const supabase = getSupabaseAdminClient();

  const [agentsRes, eventsRes, gsRes] = await Promise.all([
    supabase.from("agents").select("*").order("started_at", { ascending: true }),
    supabase
      .from("agent_events")
      .select("*")
      .order("timestamp", { ascending: true })
      .limit(200),
    supabase.from("global_state").select("*").eq("id", 1).single(),
  ]);

  return {
    agents: (agentsRes.data ?? []).map(rowToAgent),
    events: (eventsRes.data ?? []).map((e) => ({
      type: e.type,
      agentId: e.agent_id,
      agent: e.payload?.agent ?? null,
      timestamp: e.timestamp,
      usage: e.payload?.usage ?? null,
    })),
    usage: {
      totalTokens: gsRes.data?.total_tokens ?? 0,
      totalToolUses: gsRes.data?.total_tool_uses ?? 0,
      totalDurationMs: gsRes.data?.total_duration_ms ?? 0,
    },
    sessionStartedAt: gsRes.data?.session_started_at ?? new Date().toISOString(),
  };
}
