export function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
}

export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) return `${minutes}m ${remainingSeconds}s`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}

export function formatNumber(num: number): string {
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}k`;
  return num.toString();
}

export function getAgentTypeColor(type: string): string {
  const colors: Record<string, string> = {
    "general-purpose": "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400",
    "Explore": "bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-400",
    "Plan": "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400",
    "researcher": "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400",
    "reviewer": "bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-400",
    "test-writer": "bg-cyan-100 dark:bg-cyan-900/40 text-cyan-700 dark:text-cyan-400",
    "security-fixer": "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400",
    "decomposer": "bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-400",
    "api-auditor": "bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-400",
  };
  return colors[type] || "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-400";
}

export function getStatusColor(status: string): { bg: string; text: string; dot: string } {
  switch (status) {
    case "running":
      return { bg: "bg-blue-50 dark:bg-blue-900/30", text: "text-blue-700 dark:text-blue-400", dot: "bg-blue-500" };
    case "completed":
      return { bg: "bg-emerald-50 dark:bg-emerald-900/30", text: "text-emerald-700 dark:text-emerald-400", dot: "bg-emerald-500" };
    case "error":
      return { bg: "bg-red-50 dark:bg-red-900/30", text: "text-red-700 dark:text-red-400", dot: "bg-red-500" };
    default:
      return { bg: "bg-gray-50 dark:bg-gray-800", text: "text-gray-700 dark:text-gray-400", dot: "bg-gray-500" };
  }
}
