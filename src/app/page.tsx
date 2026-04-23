"use client";

import { useState } from "react";
import { useAgentStream } from "@/hooks/use-agent-stream";
import { Header } from "@/components/header";
import { AgentCard } from "@/components/agent-card";
import { Timeline } from "@/components/timeline";
import { AgentGridSkeleton, SummarySkeleton, TimelineSkeleton } from "@/components/skeletons";
import { Activity, PanelRightClose, PanelRightOpen, Loader2, CheckCircle, AlertCircle, ChevronDown } from "lucide-react";
import type { Agent } from "@/lib/types";

function summarizeActivity(agents: Map<number, Agent>): string {
  const all = Array.from(agents.values());
  const running = all.filter((a) => a.status === "running");
  const completed = all.filter((a) => a.status === "completed");
  const errors = all.filter((a) => a.status === "error");

  if (all.length === 0) return "No agents have been spawned yet. Start a task to see agents appear here.";

  const parts: string[] = [];

  if (running.length > 0) {
    const descs = running.slice(0, 3).map((a) => a.description);
    const more = running.length > 3 ? ` and ${running.length - 3} more` : "";
    parts.push(`${running.length} agent${running.length > 1 ? "s" : ""} working: ${descs.join(", ")}${more}`);
  }

  if (completed.length > 0) {
    parts.push(`${completed.length} completed`);
  }

  if (errors.length > 0) {
    parts.push(`${errors.length} failed`);
  }

  return parts.join(" · ");
}

export default function Dashboard() {
  const {
    agents,
    events,
    connectionStatus,
    stats,
    clearAll,
  } = useAgentStream();

  const [showTimeline, setShowTimeline] = useState(true);
  const [sectionsOpen, setSectionsOpen] = useState<Record<string, boolean>>({
    working: true,
    completed: true,
    failed: true,
  });

  const toggleSection = (key: string) =>
    setSectionsOpen((prev) => ({ ...prev, [key]: !prev[key] }));

  const isInitialLoading = connectionStatus === "connecting" && agents.size === 0;

  // Render-layer dedupe: if two rows with different ids share the same
  // (sessionId, description) and started within 5s of each other, they
  // represent the same spawn that leaked past the server-side dedupe (e.g.
  // an existing row from before the dedupe was deployed). Keep the earliest
  // id so the visible card stays stable.
  const DEDUPE_WINDOW_MS = 5_000;
  const rawAgents = Array.from(agents.values());
  const dedupeKey = (a: Agent) =>
    `${a.sessionId ?? "unknown"}::${a.description}`;
  const keeperById = new Map<string, Agent>();
  for (const a of rawAgents) {
    const key = dedupeKey(a);
    const existing = keeperById.get(key);
    if (!existing) {
      keeperById.set(key, a);
      continue;
    }
    const aStart = new Date(a.startedAt).getTime();
    const exStart = new Date(existing.startedAt).getTime();
    const withinWindow = Math.abs(aStart - exStart) < DEDUPE_WINDOW_MS;
    if (!withinWindow) continue;
    // Prefer the lowest-id row as the canonical one, since it was the
    // winner of the server-side dedupe race.
    if (a.id < existing.id) keeperById.set(key, a);
  }
  const allAgents = Array.from(keeperById.values());
  const running = allAgents.filter((a) => a.status === "running");
  const finished = allAgents
    .filter((a) => a.status === "completed")
    .sort((a, b) => new Date(b.completedAt || 0).getTime() - new Date(a.completedAt || 0).getTime());
  const failed = allAgents
    .filter((a) => a.status === "error")
    .sort((a, b) => new Date(b.completedAt || 0).getTime() - new Date(a.completedAt || 0).getTime());

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-gray-50/50 dark:bg-gray-950">
      <Header connectionStatus={connectionStatus} />

      <div className="relative flex-1 overflow-hidden">
        <main className={`h-full overflow-y-auto transition-[margin-right] duration-300 ease-out will-change-[margin-right] ${showTimeline ? "lg:mr-80" : ""}`}>
          <div className="px-6 pt-5 pb-0">
            {/* Summary card */}
            {isInitialLoading ? (
              <SummarySkeleton />
            ) : (
              <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-5 py-4 animate-in fade-in-scale duration-300">
                <div className="flex items-start justify-between gap-4">
                  <p className="max-h-20 overflow-y-auto text-sm leading-relaxed text-gray-600 dark:text-gray-400">{summarizeActivity(agents)}</p>
                  {running.length > 0 && (
                    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-blue-50 dark:bg-blue-900/30 px-2.5 py-1 text-xs font-medium text-blue-600 dark:text-blue-400 ring-1 ring-inset ring-blue-600/10 dark:ring-blue-400/10 animate-in fade-in duration-300">
                      <span className="relative flex h-1.5 w-1.5">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
                        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-blue-500" />
                      </span>
                      {running.length} active
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="px-6 py-5 space-y-5">
            {isInitialLoading && <AgentGridSkeleton count={6} />}
            {/* Active agents — always open, always on top */}
            {running.length > 0 && (
              <section className="animate-in fade-in-up duration-300">
                <div className="mb-3 flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                  <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Working</h2>
                  <span className="rounded-full bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 text-[11px] font-medium text-blue-600 dark:text-blue-400 tabular-nums">
                    {running.length}
                  </span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {running.map((agent) => (
                    <AgentCard key={agent.id} agent={agent} />
                  ))}
                </div>
              </section>
            )}

            {/* Completed agents — collapsible */}
            {finished.length > 0 && (
              <section className="animate-in fade-in-up duration-300">
                <button
                  onClick={() => toggleSection("completed")}
                  className="mb-3 flex w-full cursor-pointer items-center gap-2 rounded-lg px-1 py-0.5 transition-[background-color] duration-150 hover:bg-gray-100 dark:hover:bg-gray-800/60"
                >
                  <ChevronDown className={`h-3.5 w-3.5 text-gray-400 transition-transform duration-200 ${sectionsOpen.completed ? "" : "-rotate-90"}`} />
                  <CheckCircle className="h-4 w-4 text-emerald-500" />
                  <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Completed</h2>
                  <span className="rounded-full bg-emerald-50 dark:bg-emerald-900/30 px-2 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400 tabular-nums">
                    {finished.length}
                  </span>
                </button>
                {sectionsOpen.completed && (
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 animate-in fade-in-up duration-200">
                    {finished.map((agent) => (
                      <AgentCard key={agent.id} agent={agent} />
                    ))}
                  </div>
                )}
              </section>
            )}

            {/* Failed agents — collapsible */}
            {failed.length > 0 && (
              <section className="animate-in fade-in-up duration-300">
                <button
                  onClick={() => toggleSection("failed")}
                  className="mb-3 flex w-full cursor-pointer items-center gap-2 rounded-lg px-1 py-0.5 transition-[background-color] duration-150 hover:bg-gray-100 dark:hover:bg-gray-800/60"
                >
                  <ChevronDown className={`h-3.5 w-3.5 text-gray-400 transition-transform duration-200 ${sectionsOpen.failed ? "" : "-rotate-90"}`} />
                  <AlertCircle className="h-4 w-4 text-red-500" />
                  <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Failed</h2>
                  <span className="rounded-full bg-red-50 dark:bg-red-900/30 px-2 py-0.5 text-[11px] font-medium text-red-600 dark:text-red-400 tabular-nums">
                    {failed.length}
                  </span>
                </button>
                {sectionsOpen.failed && (
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 animate-in fade-in-up duration-200">
                    {failed.map((agent) => (
                      <AgentCard key={agent.id} agent={agent} />
                    ))}
                  </div>
                )}
              </section>
            )}

            {allAgents.length === 0 && !isInitialLoading && (
              <div className="flex h-64 flex-col items-center justify-center text-center animate-in fade-in duration-500">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
                  <Activity className="h-6 w-6 text-gray-400 dark:text-gray-500" />
                </div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Waiting for agents</p>
                <p className="mt-1 max-w-xs text-xs text-gray-400 dark:text-gray-500">
                  When you give Claude a task, agents will appear here in real time showing what they are working on.
                </p>
              </div>
            )}

            {/* Mobile timeline */}
            <div className="lg:hidden">
              {isInitialLoading ? <TimelineSkeleton /> : <Timeline events={events} agents={agents} />}
            </div>
          </div>
        </main>

        {/* Desktop timeline sidebar — slides via transform, main pushes via margin */}
        <aside
          className={`absolute right-0 top-0 bottom-0 z-30 hidden w-80 border-l border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 lg:block transition-transform duration-300 ease-out will-change-transform ${
            showTimeline ? "translate-x-0" : "translate-x-full"
          }`}
        >
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 px-4 py-3">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Activity</h2>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-gray-100 dark:bg-gray-800 px-2 py-0.5 text-[11px] font-medium tabular-nums text-gray-600 dark:text-gray-400">
                  {events.length}
                </span>
                <button
                  onClick={() => setShowTimeline(false)}
                  className="cursor-pointer rounded-md p-1 text-gray-400 transition-[background-color,color,transform] duration-150 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300 active:scale-95"
                >
                  <PanelRightClose className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {isInitialLoading ? <TimelineSkeleton /> : <Timeline events={events} agents={agents} embedded />}
            </div>
          </div>
        </aside>

        {/* Toggle button — top right */}
        <button
          onClick={() => setShowTimeline(true)}
          className={`fixed top-14 right-4 z-40 hidden items-center gap-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-xs font-medium text-gray-600 dark:text-gray-300 shadow-md cursor-pointer transition-[background-color,opacity,transform] duration-200 ease-out hover:bg-gray-50 dark:hover:bg-gray-700 active:scale-95 lg:flex ${
            showTimeline ? "opacity-0 pointer-events-none translate-x-4" : "opacity-100 translate-x-0"
          }`}
        >
          <PanelRightOpen className="h-3.5 w-3.5" />
          Activity
        </button>
      </div>
    </div>
  );
}
