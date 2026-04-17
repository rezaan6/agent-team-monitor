"use client";

import { Activity, CheckCircle, AlertCircle, Users } from "lucide-react";

interface StatsBarProps {
  stats: {
    running: number;
    completed: number;
    errors: number;
    total: number;
  };
}

export function StatsBar({ stats }: StatsBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <StatPill
        icon={<Activity className="h-3 w-3" />}
        label="Running"
        value={stats.running}
        color="blue"
        pulse={stats.running > 0}
      />
      <StatPill
        icon={<CheckCircle className="h-3 w-3" />}
        label="Done"
        value={stats.completed}
        color="emerald"
      />
      {stats.errors > 0 && (
        <StatPill
          icon={<AlertCircle className="h-3 w-3" />}
          label="Errors"
          value={stats.errors}
          color="red"
        />
      )}
      <StatPill
        icon={<Users className="h-3 w-3" />}
        label="Total"
        value={stats.total}
        color="gray"
      />
    </div>
  );
}

const colorMap = {
  blue: "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 ring-blue-600/10 dark:ring-blue-400/10",
  emerald: "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 ring-emerald-600/10 dark:ring-emerald-400/10",
  red: "bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 ring-red-600/10 dark:ring-red-400/10",
  gray: "bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 ring-gray-600/10 dark:ring-gray-400/10",
} as const;

function StatPill({
  icon,
  label,
  value,
  color,
  pulse,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  color: keyof typeof colorMap;
  pulse?: boolean;
}) {
  return (
    <div
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${colorMap[color]}`}
    >
      <span className={pulse ? "animate-pulse" : ""}>{icon}</span>
      <span className="tabular-nums">{value}</span>
      <span className="text-[10px] opacity-70">{label}</span>
    </div>
  );
}
