import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Agent, AgentActivity } from "@/lib/types";

// --- Row types (snake_case, matching the Postgres schema) ---

interface AgentRow {
  id: number;
  user_id: string | null;
  project: string | null;
  description: string;
  prompt: string;
  subagent_type: string;
  background: boolean;
  status: "running" | "completed" | "error";
  cancelled: boolean | null;
  started_at: string;
  completed_at: string | null;
  elapsed_ms: number | null;
  session_id: string | null;
  // Added in migration 0003_agent_cwd.sql. Nullable so rows created before the
  // migration still round-trip cleanly.
  cwd: string | null;
  // Added in migration 0004_tag_fallback.sql.
  tag_fallback: string | null;
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
// Pre-spawn dedupe window: a single Agent tool invocation must never create
// more than one row. Claude Code hook configs occasionally fire PreToolUse
// twice (e.g. the same "Agent" matcher is defined at both user and project
// level, or an `.*` matcher overlaps an `Agent` matcher), which produces two
// POSTs to /api/hook within a few ms. Any pre event arriving this soon after
// an identical (session_id, description) running agent is treated as the
// echo of the same spawn and reuses the existing row.
const PRE_DEDUPE_WINDOW_MS = 5_000;

// --- Mappers ---

export function rowToAgent(row: AgentRow): Agent {
  return {
    id: row.id,
    description: row.description,
    prompt: row.prompt ?? "",
    subagentType: row.subagent_type ?? "general-purpose",
    background: row.background ?? false,
    status: row.status,
    cancelled: row.cancelled ?? false,
    startedAt: row.started_at,
    completedAt: row.completed_at ?? undefined,
    elapsed: row.elapsed_ms ?? undefined,
    sessionId: row.session_id ?? undefined,
    cwd: row.cwd ?? undefined,
    project: row.project ?? undefined,
    tagFallback: row.tag_fallback ?? undefined,
    resultPreview: row.result_preview ?? undefined,
    usage: row.usage ?? undefined,
    currentActivity: row.current_activity ?? undefined,
    activityLog: row.activity_log ?? [],
  };
}

// --- Hook payloads ---

export interface HookPayload {
  phase: "pre" | "post";
  project?: string;
  /**
   * Optional label shown on the session pill only when `session_id` is missing.
   * Injected by the hook script from the MONITOR_LABEL_FALLBACK env var.
   */
  tag_fallback?: string;
  /**
   * Claude Code injects `cwd` into every hook payload — the absolute path of
   * the repo the session was started in. Surfaced in the session-pill tooltip.
   */
  cwd?: string;
  transcript_path?: string;
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
  project?: string;
  tool_name?: string;
  summary?: string;
  session_id?: string;
}

// --- Usage parsing ---

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

async function sweepStaleBackgroundAgents(userId: string) {
  const supabase = getSupabaseAdminClient();
  const cutoff = new Date(Date.now() - INACTIVITY_TIMEOUT_MS).toISOString();

  const { data: stale } = await supabase
    .from("agents")
    .select("id, started_at, last_activity_at")
    .eq("user_id", userId)
    .eq("status", "running")
    .eq("background", true)
    .lt("last_activity_at", cutoff);

  if (!stale || stale.length === 0) return;

  const now = new Date().toISOString();
  for (const row of stale) {
    const elapsedMs = Date.now() - new Date(row.started_at).getTime();
    // .select() so we can embed the updated agent in the event payload.
    // If the row was already completed by a concurrent path, the filter
    // matches 0 rows — skip the event so the sidebar doesn't show a
    // duplicate "Unknown agent" completion.
    const { data: updated } = await supabase
      .from("agents")
      .update({
        status: "completed",
        completed_at: now,
        elapsed_ms: elapsedMs,
      })
      .eq("id", row.id)
      .eq("status", "running")
      .select()
      .maybeSingle();

    if (!updated) continue;

    await supabase.from("agent_events").insert({
      type: "agent_completed",
      agent_id: row.id,
      user_id: userId,
      payload: { agent: rowToAgent(updated), reason: "inactivity_timeout" },
    });
  }
}

// --- Hook event (Agent tool pre/post) ---

export async function processHookEvent(
  hook: HookPayload,
  userId: string,
  project: string | null,
  tagFallback: string | null
) {
  const supabase = getSupabaseAdminClient();
  const toolInput = hook.tool_input ?? {};
  const description = toolInput.description || "unnamed agent";
  const sessionId = hook.session_id || "unknown";
  const nowIso = new Date().toISOString();

  await sweepStaleBackgroundAgents(userId);

  if (hook.phase === "pre") {
    // Dedupe: if an identical running agent was just inserted for this
    // (user, session, description) pair, reuse it instead of inserting a
    // second row. Guards against hook configs that fire PreToolUse twice
    // for the same Agent spawn (e.g. overlapping matchers at user + project
    // scope), which would otherwise render two cards for one invocation.
    const dedupeCutoff = new Date(
      Date.now() - PRE_DEDUPE_WINDOW_MS
    ).toISOString();
    const { data: recent } = await supabase
      .from("agents")
      .select("*")
      .eq("user_id", userId)
      .eq("session_id", sessionId)
      .eq("description", description)
      .eq("status", "running")
      .gte("started_at", dedupeCutoff)
      .order("started_at", { ascending: false })
      .limit(1);

    if (recent && recent.length > 0) {
      return { agentId: recent[0].id, deduped: true };
    }

    const { data: inserted, error } = await supabase
      .from("agents")
      .insert({
        user_id: userId,
        project,
        description,
        prompt: (toolInput.prompt || "").slice(0, 500),
        subagent_type: toolInput.subagent_type || "general-purpose",
        background: toolInput.run_in_background || false,
        status: "running",
        session_id: sessionId,
        cwd: hook.cwd ?? null,
        tag_fallback: tagFallback,
        last_activity_at: nowIso,
      })
      .select()
      .single();

    if (error || !inserted) throw error ?? new Error("insert failed");

    await supabase.from("agent_events").insert({
      type: "agent_started",
      agent_id: inserted.id,
      user_id: userId,
      project,
      payload: { agent: rowToAgent(inserted) },
    });

    await supabase
      .from("global_state")
      .update({ active_agent_id: inserted.id, last_activity_ts: nowIso })
      .eq("user_id", userId);

    return { agentId: inserted.id };
  }

  const { data: matches } = await supabase
    .from("agents")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "running")
    .eq("description", description)
    .order("started_at", { ascending: true });

  if (!matches || matches.length === 0) return {};

  const agent =
    matches.find((a) => a.session_id === sessionId) ?? matches[0];

  const startedAtMs = new Date(agent.started_at).getTime();
  const elapsedMs = Date.now() - startedAtMs;

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

  if (usage) {
    const { data: gs } = await supabase
      .from("global_state")
      .select("total_tokens, total_tool_uses, total_duration_ms")
      .eq("user_id", userId)
      .single();

    await supabase
      .from("global_state")
      .update({
        total_tokens: (gs?.total_tokens ?? 0) + usage.totalTokens,
        total_tool_uses: (gs?.total_tool_uses ?? 0) + usage.toolUses,
        total_duration_ms: (gs?.total_duration_ms ?? 0) + usage.durationMs,
      })
      .eq("user_id", userId);
  }

  await supabase.from("agent_events").insert({
    type: "agent_completed",
    agent_id: agent.id,
    user_id: userId,
    project,
    payload: { agent: rowToAgent(updated) },
  });

  return {};
}

// --- Activity (tool-use within an agent) ---

export async function processActivity(data: ActivityPayload, userId: string) {
  if (data.phase !== "pre") return;
  const toolName = data.tool_name || "";
  const summary = data.summary || toolName;
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();

  const supabase = getSupabaseAdminClient();

  await sweepStaleBackgroundAgents(userId);

  const { data: running } = await supabase
    .from("agents")
    .select("*")
    .eq("user_id", userId)
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
      .eq("user_id", userId)
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
    .eq("user_id", userId);
}

// =============================================================================
// Dashboard path — uses the user-scoped SSR client. RLS enforces isolation;
// even a buggy query here cannot return another user's rows.
// =============================================================================

export async function cancelAgent(supabase: SupabaseClient, agentId: number) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("unauthenticated");

  const admin = getSupabaseAdminClient();
  const nowIso = new Date().toISOString();

  const { data: row } = await admin
    .from("agents")
    .select("started_at")
    .eq("id", agentId)
    .eq("user_id", user.id)
    .eq("status", "running")
    .maybeSingle();

  if (!row) return { cancelled: false };

  const elapsedMs = Date.now() - new Date(row.started_at).getTime();

  const { data: updated } = await admin
    .from("agents")
    .update({
      status: "completed",
      cancelled: true,
      completed_at: nowIso,
      elapsed_ms: elapsedMs,
      last_activity_at: nowIso,
    })
    .eq("id", agentId)
    .eq("user_id", user.id)
    .eq("status", "running")
    .select()
    .maybeSingle();

  if (!updated) return { cancelled: false };

  await admin.from("agent_events").insert({
    type: "agent_completed",
    agent_id: agentId,
    user_id: user.id,
    payload: { agent: rowToAgent(updated), reason: "manual_cancel" },
  });

  return { cancelled: true };
}

export async function clearAllState(supabase: SupabaseClient) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("unauthenticated");

  const admin = getSupabaseAdminClient();
  await admin.from("agent_events").delete().eq("user_id", user.id);
  await admin.from("agents").delete().eq("user_id", user.id);
  await admin
    .from("global_state")
    .update({
      total_tokens: 0,
      total_tool_uses: 0,
      total_duration_ms: 0,
      session_started_at: new Date().toISOString(),
      active_agent_id: null,
      last_activity_ts: null,
    })
    .eq("user_id", user.id);
}

// Initial snapshot loads ALL running agents (bounded — they're live) plus the
// most recent N terminal agents. Older terminal pages are fetched on demand
// via getOlderTerminalAgents (keyset pagination on started_at).
const INITIAL_TERMINAL_LIMIT = 100;
const TERMINAL_PAGE_LIMIT = 50;
const TERMINAL_PAGE_LIMIT_MAX = 200;

export async function getInitialSnapshot(supabase: SupabaseClient) {
  const [runningRes, terminalRes, eventsRes, gsRes] = await Promise.all([
    supabase
      .from("agents")
      .select("*")
      .eq("status", "running")
      .order("started_at", { ascending: true }),
    // Fetch one extra row to detect whether more pages exist without a count.
    supabase
      .from("agents")
      .select("*")
      .in("status", ["completed", "error"])
      .order("started_at", { ascending: false })
      .limit(INITIAL_TERMINAL_LIMIT + 1),
    supabase
      .from("agent_events")
      .select("*")
      .order("timestamp", { ascending: true })
      .limit(200),
    supabase.from("global_state").select("*").maybeSingle(),
  ]);

  const running = (runningRes.data ?? []).map(rowToAgent);
  const terminalRows = terminalRes.data ?? [];
  const hasMoreTerminal = terminalRows.length > INITIAL_TERMINAL_LIMIT;
  const visibleTerminal = hasMoreTerminal
    ? terminalRows.slice(0, INITIAL_TERMINAL_LIMIT)
    : terminalRows;
  const terminal = visibleTerminal.map(rowToAgent);
  const oldestTerminalStartedAt =
    visibleTerminal.length > 0
      ? visibleTerminal[visibleTerminal.length - 1].started_at
      : null;

  return {
    agents: [...running, ...terminal],
    hasMoreTerminal,
    oldestTerminalStartedAt,
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

export async function getOlderTerminalAgents(
  supabase: SupabaseClient,
  before: string,
  limit: number = TERMINAL_PAGE_LIMIT
) {
  const safeLimit = Math.min(
    Math.max(1, Math.floor(limit)),
    TERMINAL_PAGE_LIMIT_MAX
  );

  const { data } = await supabase
    .from("agents")
    .select("*")
    .in("status", ["completed", "error"])
    .lt("started_at", before)
    .order("started_at", { ascending: false })
    .limit(safeLimit + 1);

  const rows = data ?? [];
  const hasMore = rows.length > safeLimit;
  const visible = hasMore ? rows.slice(0, safeLimit) : rows;
  const agents = visible.map(rowToAgent);
  const oldestTerminalStartedAt =
    visible.length > 0 ? visible[visible.length - 1].started_at : before;

  return { agents, hasMore, oldestTerminalStartedAt };
}
