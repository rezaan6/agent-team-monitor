"use client";

import { Zap, Play, CheckCircle, AlertCircle } from "lucide-react";
import type { AgentEvent } from "@/lib/types";

interface TimelineProps {
  events: AgentEvent[];
  embedded?: boolean;
}

export function Timeline({ events, embedded }: TimelineProps) {
  const reversedEvents = [...events].reverse().slice(0, 50);

  if (reversedEvents.length === 0) {
    return (
      <div className={`flex flex-col items-center justify-center text-center animate-in fade-in duration-500 ${embedded ? "py-12" : "h-48 rounded-xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm"}`}>
        <Zap className="mb-2 h-6 w-6 text-gray-300 dark:text-gray-600" />
        <p className="text-xs font-medium text-gray-400 dark:text-gray-500">No events yet</p>
      </div>
    );
  }

  if (embedded) {
    return (
      <div className="divide-y divide-gray-50 dark:divide-gray-800">
        {reversedEvents.map((event, idx) => (
          <TimelineEvent key={`${event.agentId}-${event.type}-${idx}`} event={event} />
        ))}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm">
      <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 px-4 py-3">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Timeline</h2>
        <span className="rounded-full bg-gray-100 dark:bg-gray-800 px-2 py-0.5 text-[11px] font-medium text-gray-600 dark:text-gray-400 tabular-nums">
          {events.length} events
        </span>
      </div>
      <div className="max-h-[calc(100vh-16rem)] overflow-y-auto">
        <div className="divide-y divide-gray-50 dark:divide-gray-800">
          {reversedEvents.map((event, idx) => (
            <TimelineEvent key={`${event.agentId}-${event.type}-${idx}`} event={event} />
          ))}
        </div>
      </div>
    </div>
  );
}

function TimelineEvent({ event }: { event: AgentEvent }) {
  const time = new Date(event.timestamp).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const isStarted = event.type === "agent_started";
  const isError = event.agent?.status === "error";

  return (
    <div className="flex items-start gap-3 px-4 py-2.5 transition-colors hover:bg-gray-50/50 dark:hover:bg-gray-800/50 animate-in fade-in-up duration-200">
      <div className="mt-0.5 shrink-0">
        {isStarted ? (
          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-50 dark:bg-blue-900/30">
            <Play className="h-2.5 w-2.5 text-blue-600" fill="currentColor" />
          </div>
        ) : isError ? (
          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-red-50 dark:bg-red-900/30">
            <AlertCircle className="h-3 w-3 text-red-600" />
          </div>
        ) : (
          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-900/30">
            <CheckCircle className="h-3 w-3 text-emerald-600" />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium text-gray-800 dark:text-gray-200">
          <span className="text-gray-400 dark:text-gray-500">#{event.agentId}</span>{" "}
          {event.agent?.description || "Unknown agent"}
        </p>
        <p className="text-[11px] text-gray-500 dark:text-gray-400">
          {isStarted ? "Spawned" : isError ? "Failed" : "Completed"}
          <span className="ml-1.5 text-gray-400 dark:text-gray-500">{time}</span>
        </p>
      </div>
    </div>
  );
}
