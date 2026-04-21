"use client";

import { Bot } from "lucide-react";
import type { Agent } from "@/lib/types";
import { AgentCard } from "./agent-card";

interface AgentGridProps {
  agents: Map<number, Agent>;
}

export function AgentGrid({ agents }: AgentGridProps) {
  const sortedAgents = Array.from(agents.values()).sort((a, b) => {
    // Running agents first, then by most recent
    if (a.status === "running" && b.status !== "running") return -1;
    if (b.status === "running" && a.status !== "running") return 1;
    return new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime();
  });

  if (sortedAgents.length === 0) {
    return (
      <div className="flex h-64 flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-center">
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
          <Bot className="h-6 w-6 text-gray-400 dark:text-gray-500" />
        </div>
        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">No agents yet</p>
        <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">Agents will appear here when spawned</p>
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {sortedAgents.map((agent) => (
        <AgentCard key={agent.id} agent={agent} />
      ))}
    </div>
  );
}
