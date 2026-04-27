"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type {
  RealtimeChannel,
  RealtimePostgresChangesPayload,
} from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { toast } from "@/lib/toast";
import type { Agent, AgentEvent, GlobalUsage } from "@/lib/types";

export type ConnectionStatus = "connecting" | "connected" | "disconnected";

interface AgentRow {
  id: number;
  description: string;
  prompt: string | null;
  subagent_type: string | null;
  background: boolean | null;
  status: Agent["status"];
  started_at: string;
  completed_at: string | null;
  elapsed_ms: number | null;
  session_id: string | null;
  cwd: string | null;
  project: string | null;
  tag_fallback: string | null;
  result_preview: string | null;
  usage: Agent["usage"] | null;
  current_activity: Agent["currentActivity"] | null;
  activity_log: Agent["activityLog"] | null;
}

interface AgentEventRow {
  id: number;
  type: string;
  agent_id: number;
  timestamp: string;
  payload: { agent?: Agent; usage?: Agent["usage"] } | null;
}

function rowToAgent(row: AgentRow): Agent {
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
    cwd: row.cwd ?? undefined,
    project: row.project ?? undefined,
    tagFallback: row.tag_fallback ?? undefined,
    resultPreview: row.result_preview ?? undefined,
    usage: row.usage ?? undefined,
    currentActivity: row.current_activity ?? undefined,
    activityLog: row.activity_log ?? [],
  };
}

export function useAgentStream() {
  const [agents, setAgents] = useState<Map<number, Agent>>(new Map());
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [usage, setUsage] = useState<GlobalUsage>({
    totalTokens: 0,
    totalToolUses: 0,
    totalDurationMs: 0,
  });
  const [sessionStartedAt, setSessionStartedAt] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("connecting");
  const [hasMoreTerminal, setHasMoreTerminal] = useState(false);
  const [terminalCursor, setTerminalCursor] = useState<string | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let channel: RealtimeChannel | null = null;
    const supabase = getSupabaseBrowserClient();

    // Keep realtime auth in sync with the Supabase session. On production
    // builds, the session can hydrate from cookies after this effect runs,
    // so we re-apply the JWT via setAuth whenever the auth state changes so
    // RLS-protected postgres_changes frames pass through.
    const { data: authSub } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        if (newSession?.access_token) {
          supabase.realtime.setAuth(newSession.access_token);
        }
      }
    );

    async function hydrate() {
      setConnectionStatus("connecting");
      try {
        const res = await fetch("/api/state", { cache: "no-store" });
        const data = await res.json();
        if (cancelled) return;

        const agentMap = new Map<number, Agent>();
        if (Array.isArray(data.agents)) {
          for (const a of data.agents as Agent[]) agentMap.set(a.id, a);
        }
        setAgents(agentMap);
        setEvents((data.events as AgentEvent[]) ?? []);
        if (data.usage) setUsage(data.usage as GlobalUsage);
        if (data.sessionStartedAt) setSessionStartedAt(data.sessionStartedAt);
        setHasMoreTerminal(Boolean(data.hasMoreTerminal));
        setTerminalCursor(data.oldestTerminalStartedAt ?? null);
        setConnectionStatus("connected");
      } catch (err) {
        console.error("Failed to hydrate initial state:", err);
        setConnectionStatus("disconnected");
      }
    }

    function applyAgentRow(row: AgentRow, prevAgent: Agent | undefined) {
      const agent = rowToAgent(row);
      setAgents((prev) => {
        const next = new Map(prev);
        next.set(agent.id, agent);
        return next;
      });

      // Toast only on status transition into a terminal state
      if (
        prevAgent?.status === "running" &&
        (agent.status === "completed" || agent.status === "error")
      ) {
        const desc = agent.description || `Agent #${agent.id}`;
        if (agent.status === "completed") toast.success(`${desc} completed`);
        else toast.error(`${desc} failed`);
      }
    }

    hydrate().then(async () => {
      if (cancelled) return;

      // Ensure the realtime socket has the current JWT before subscribing.
      // Without this, on production the WebSocket can connect anonymously
      // and RLS filters out every postgres_changes frame.
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (cancelled) return;
      if (session?.access_token) {
        supabase.realtime.setAuth(session.access_token);
      }

      channel = supabase
        .channel("agent-monitor")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "agents" },
          (payload: RealtimePostgresChangesPayload<AgentRow>) => {
            if (payload.eventType === "DELETE") {
              const old = payload.old as AgentRow;
              setAgents((prev) => {
                if (!old?.id) return prev;
                const next = new Map(prev);
                next.delete(old.id);
                return next;
              });
              return;
            }
            const row = payload.new as AgentRow;
            if (!row?.id) return;
            setAgents((prev) => {
              const prevAgent = prev.get(row.id);
              // Defer toast side-effect via microtask so we don't update
              // other state inside this setter
              queueMicrotask(() => applyAgentRow(row, prevAgent));
              return prev;
            });
          }
        )
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "agent_events" },
          (payload: RealtimePostgresChangesPayload<AgentEventRow>) => {
            const row = payload.new as AgentEventRow;
            if (!row) return;
            const evt: AgentEvent = {
              type: row.type as AgentEvent["type"],
              agentId: row.agent_id,
              agent: row.payload?.agent as Agent,
              timestamp: row.timestamp,
              usage: row.payload?.usage,
            };
            setEvents((prev) => [...prev, evt].slice(-500));
          }
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "global_state" },
          (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
            const row = payload.new as Record<string, unknown>;
            setUsage({
              totalTokens: (row.total_tokens as number) ?? 0,
              totalToolUses: (row.total_tool_uses as number) ?? 0,
              totalDurationMs: (row.total_duration_ms as number) ?? 0,
            });
            if (row.session_started_at) {
              setSessionStartedAt(row.session_started_at as string);
            }
          }
        )
        .subscribe((status) => {
          if (status === "SUBSCRIBED") setConnectionStatus("connected");
          else if (status === "CHANNEL_ERROR" || status === "CLOSED") {
            setConnectionStatus("disconnected");
          }
        });
    });

    return () => {
      cancelled = true;
      authSub.subscription.unsubscribe();
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  const clearAll = useCallback(async () => {
    try {
      await fetch("/api/clear", { method: "POST" });
    } catch (err) {
      console.error("Failed to clear:", err);
    }
  }, []);

  // Cursor lives in a ref so rapid loadMore clicks always read the latest
  // value, not a stale closure capture between paint and re-render. The
  // loading guard is also a ref so concurrent clicks short-circuit
  // synchronously, before React batches the state update.
  const cursorRef = useRef<string | null>(null);
  const loadingRef = useRef(false);
  useEffect(() => {
    cursorRef.current = terminalCursor;
  }, [terminalCursor]);

  const loadMore = useCallback(async () => {
    const cursor = cursorRef.current;
    if (!cursor || loadingRef.current) return;
    loadingRef.current = true;
    setIsLoadingMore(true);
    try {
      const url = `/api/agents?before=${encodeURIComponent(cursor)}&limit=50`;
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(`load more failed: ${res.status}`);
      const data = (await res.json()) as {
        agents: Agent[];
        hasMore: boolean;
        oldestTerminalStartedAt: string | null;
      };
      setAgents((prev) => {
        const next = new Map(prev);
        for (const a of data.agents ?? []) {
          // Don't overwrite a fresher in-memory copy (e.g. a row that was
          // running when first loaded and has since been updated by realtime).
          if (!next.has(a.id)) next.set(a.id, a);
        }
        return next;
      });
      setHasMoreTerminal(Boolean(data.hasMore));
      setTerminalCursor(data.oldestTerminalStartedAt ?? null);
    } catch (err) {
      console.error("Failed to load older agents:", err);
    } finally {
      loadingRef.current = false;
      setIsLoadingMore(false);
    }
  }, []);

  const stats = {
    running: Array.from(agents.values()).filter((a) => a.status === "running")
      .length,
    completed: Array.from(agents.values()).filter(
      (a) => a.status === "completed"
    ).length,
    errors: Array.from(agents.values()).filter((a) => a.status === "error")
      .length,
    total: agents.size,
  };

  return {
    agents,
    events,
    usage,
    sessionStartedAt,
    connectionStatus,
    stats,
    clearAll,
    hasMoreTerminal,
    isLoadingMore,
    loadMore,
  };
}
