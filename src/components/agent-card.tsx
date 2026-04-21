"use client";

import { useState, useEffect, useRef } from "react";
import { ChevronRight, Wrench, FileText, Pencil, Terminal, Search, FolderSearch, Globe, Check } from "lucide-react";
import type { Agent } from "@/lib/types";
import { formatDuration, getAgentTypeColor, formatNumber } from "@/lib/formatters";
import { getSessionTag } from "@/lib/agents/session-tag";

interface AgentCardProps {
  agent: Agent;
}

export function AgentCard({ agent }: AgentCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [elapsed, setElapsed] = useState("");
  const typeColor = getAgentTypeColor(agent.subagentType);
  const sessionTag = getSessionTag(agent);

  useEffect(() => {
    const update = () => {
      if (agent.elapsed) {
        setElapsed(formatDuration(agent.elapsed));
      } else {
        setElapsed(formatDuration(Date.now() - new Date(agent.startedAt).getTime()));
      }
    };
    update();
    if (agent.status === "running") {
      const interval = setInterval(update, 1000);
      return () => clearInterval(interval);
    }
  }, [agent.elapsed, agent.startedAt, agent.status]);

  const promptPreview = agent.prompt.length > 150 ? agent.prompt.slice(0, 150) + "..." : agent.prompt;

  return (
    <div
      className={`group relative overflow-hidden rounded-xl border bg-white dark:bg-gray-900 transition-[border-color,box-shadow] duration-300 animate-in fade-in-up [content-visibility:auto] [contain-intrinsic-size:200px] ${
        agent.status === "running"
          ? "border-blue-200/60 dark:border-blue-800/60 shadow-sm shadow-blue-100/50 dark:shadow-blue-900/20"
          : agent.status === "error"
            ? "border-red-200 dark:border-red-800 shadow-sm"
            : "border-gray-100 dark:border-gray-800 shadow-sm"
      }`}
    >
      {/* Running shimmer – flush with card top */}
      {agent.status === "running" && (
        <div className="absolute inset-x-0 top-0 h-[2px] bg-blue-100/60 dark:bg-blue-900/40">
          <div className="h-full w-1/3 animate-[shimmer_1.5s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-blue-500/80 to-transparent" />
        </div>
      )}

      <div className="p-4">
        {/* Header: type + id + session tag */}
        <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px]">
          <span className={`rounded-md px-1.5 py-0.5 font-medium ${typeColor}`}>
            {agent.subagentType || "general"}
          </span>
          <span className="text-gray-400 dark:text-gray-500">#{agent.id}</span>
          <span
            title={sessionTag.tooltip}
            className={`max-w-[14rem] truncate rounded-md px-1.5 py-0.5 font-mono text-[10px] font-medium ring-1 ring-inset ${sessionTag.colorClasses}`}
          >
            {sessionTag.label}
          </span>
          {agent.background && (
            <span className="text-gray-400 dark:text-gray-500">· background</span>
          )}
        </div>

        {/* Description — the hero */}
        <h3 className="mb-2 text-[13px] font-semibold leading-snug text-gray-900 dark:text-gray-100">
          {agent.description}
        </h3>

        {/* Activity log */}
        <ActivityLog
          activities={agent.activityLog ?? []}
          isRunning={agent.status === "running"}
        />


        {/* Status sentence */}
        <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
          {agent.status === "running" && (
            <span className="text-blue-600">
              Working for <span className="font-medium tabular-nums">{elapsed}</span>
            </span>
          )}
          {agent.status === "completed" && (
            <span className="text-emerald-600">
              Finished in <span className="font-medium tabular-nums">{elapsed}</span>
              {agent.usage && (
                <span className="text-gray-400">
                  {" · "}{formatNumber(agent.usage.totalTokens)} tokens · {agent.usage.toolUses} tools
                </span>
              )}
            </span>
          )}
          {agent.status === "error" && (
            <span className="text-red-600">
              Failed after <span className="font-medium tabular-nums">{elapsed}</span>
            </span>
          )}
        </p>

        {/* Prompt preview / expandable */}
        <div className="mb-1">
          <button
            onClick={() => setExpanded(!expanded)}
            className="cursor-pointer flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-gray-400 dark:text-gray-500 transition-[background-color,color] duration-150 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300"
          >
            <ChevronRight className={`h-3 w-3 transition-transform duration-200 ${expanded ? "rotate-90" : ""}`} />
            Task details
          </button>
          {!expanded && (
            <p className="mt-1 text-[11px] leading-relaxed text-gray-400 dark:text-gray-500 line-clamp-2 animate-in fade-in duration-200">
              {promptPreview}
            </p>
          )}
          {expanded && (
            <pre className="mt-2 max-h-48 overflow-auto rounded-lg bg-gray-50 dark:bg-gray-800 p-3 text-[11px] leading-relaxed text-gray-600 dark:text-gray-300 whitespace-pre-wrap break-words font-mono animate-in fade-in-up duration-200">
              {agent.prompt}
            </pre>
          )}
        </div>

        {/* Result */}
        {agent.resultPreview && (
          <div className="mt-3 rounded-lg bg-emerald-50/50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800 p-3 animate-in fade-in-up duration-300">
            <p className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400 mb-1">Result</p>
            <p className="text-[11px] leading-relaxed text-emerald-900/70 dark:text-emerald-300/70 line-clamp-4">
              {agent.resultPreview}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function getToolIcon(toolName: string) {
  switch (toolName) {
    case "Read": return <FileText className="h-3 w-3" />;
    case "Write": return <Pencil className="h-3 w-3" />;
    case "Edit": return <Pencil className="h-3 w-3" />;
    case "Bash": return <Terminal className="h-3 w-3" />;
    case "Grep": return <Search className="h-3 w-3" />;
    case "Glob": return <FolderSearch className="h-3 w-3" />;
    case "WebFetch": return <Globe className="h-3 w-3" />;
    case "WebSearch": return <Globe className="h-3 w-3" />;
    default: return <Wrench className="h-3 w-3" />;
  }
}

import type { AgentActivity } from "@/lib/types";

function ActivityLog({ activities, isRunning }: { activities: AgentActivity[]; isRunning: boolean }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [activities.length]);

  return (
    <div className="mb-2 rounded-lg border border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/50 overflow-hidden">
      <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800">
        <span className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Steps</span>
        <span className="text-[10px] font-medium text-gray-400 dark:text-gray-500 tabular-nums">{activities.length}</span>
      </div>
      <div ref={scrollRef} className="h-36 overflow-y-auto">
        {activities.map((activity, idx) => {
          const isCurrent = isRunning && idx === activities.length - 1;
          return (
            <div
              key={idx}
              className={`flex items-center gap-2 px-2.5 py-1 ${
                idx !== activities.length - 1 ? "border-b border-gray-50 dark:border-gray-800" : ""
              } ${isCurrent ? "bg-blue-50/50 dark:bg-blue-900/20" : ""}`}
            >
              <div className={`shrink-0 ${isCurrent ? "text-blue-500" : "text-gray-400"}`}>
                {isCurrent ? (
                  <span className="relative flex h-3 w-3 items-center justify-center">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-40" />
                    {getToolIcon(activity.toolName)}
                  </span>
                ) : (
                  <span className="flex h-3 w-3 items-center justify-center text-emerald-400">
                    <Check className="h-2.5 w-2.5" />
                  </span>
                )}
              </div>
              <p className={`truncate text-[11px] ${isCurrent ? "font-medium text-blue-700 dark:text-blue-400" : "text-gray-500 dark:text-gray-400"}`}>
                {activity.summary}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
