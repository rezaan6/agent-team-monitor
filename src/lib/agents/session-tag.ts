import type { Agent } from "@/lib/types";

/**
 * Session pills — two small, independent badges rendered on each agent card.
 *
 *   1. **Project pill** — rendered ONLY if the hook script supplied
 *      MONITOR_PROJECT. Its label is that string. Useful for tagging every
 *      agent from a given repo (e.g. "hobber-vendor", "agent-monitor").
 *
 *   2. **Session pill** — always rendered. Shows `sess-XXXXXX` (last 6 chars
 *      of the Claude Code session id). If no session id is available, falls
 *      back to the `MONITOR_LABEL_FALLBACK` env value, else the literal
 *      "sess-?".
 *
 * Each pill picks its colour from its own disjoint palette so the two pills
 * on a single card are always visually distinct — you can tell at a glance
 * which is the project and which is the session.
 */

export interface Pill {
  label: string;
  tooltip: string;
  /** Tailwind class string for the badge background + text + ring. */
  colorClasses: string;
}

export interface SessionPills {
  /** Null when MONITOR_PROJECT is not set on the originating session. */
  project: Pill | null;
  session: Pill;
}

// Two disjoint palettes so the project pill and session pill on the same card
// always look different. Both read well on light and dark backgrounds and
// avoid clashing with status/type chips (blue, emerald, red, amber, purple).
const PROJECT_PALETTE: readonly string[] = [
  "bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300 ring-teal-200/60 dark:ring-teal-700/40",
  "bg-lime-100 dark:bg-lime-900/40 text-lime-700 dark:text-lime-300 ring-lime-200/60 dark:ring-lime-700/40",
  "bg-cyan-100 dark:bg-cyan-900/40 text-cyan-700 dark:text-cyan-300 ring-cyan-200/60 dark:ring-cyan-700/40",
  "bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 ring-indigo-200/60 dark:ring-indigo-700/40",
  "bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300 ring-sky-200/60 dark:ring-sky-700/40",
] as const;

const SESSION_PALETTE: readonly string[] = [
  "bg-fuchsia-100 dark:bg-fuchsia-900/40 text-fuchsia-700 dark:text-fuchsia-300 ring-fuchsia-200/60 dark:ring-fuchsia-700/40",
  "bg-pink-100 dark:bg-pink-900/40 text-pink-700 dark:text-pink-300 ring-pink-200/60 dark:ring-pink-700/40",
  "bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 ring-violet-200/60 dark:ring-violet-700/40",
  "bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-300 ring-yellow-200/60 dark:ring-yellow-700/40",
  "bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300 ring-rose-200/60 dark:ring-rose-700/40",
] as const;

const MAX_LABEL_LEN = 22;

function hash32(str: string): number {
  // FNV-1a — small, deterministic, non-cryptographic. We only need a stable
  // bucket index for colour selection, not a strong hash.
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function pickColor(palette: readonly string[], key: string): string {
  return palette[hash32(key) % palette.length];
}

function truncate(s: string): string {
  if (s.length <= MAX_LABEL_LEN) return s;
  return s.slice(0, MAX_LABEL_LEN - 1) + "…";
}

function shortSessionId(sessionId: string): string {
  const tail = sessionId.slice(-6);
  return `sess-${tail}`;
}

export function getSessionPills(agent: Agent): SessionPills {
  const { project, sessionId, tagFallback, cwd } = agent;

  let projectPill: Pill | null = null;
  if (project && project.trim().length > 0) {
    const trimmed = project.trim();
    projectPill = {
      label: truncate(trimmed),
      tooltip: `project: ${trimmed}`,
      colorClasses: pickColor(PROJECT_PALETTE, trimmed),
    };
  }

  // Session pill — always rendered.
  let sessionLabel: string;
  let sessionColorKey: string;
  if (sessionId && sessionId !== "unknown") {
    sessionLabel = shortSessionId(sessionId);
    sessionColorKey = sessionId;
  } else if (tagFallback && tagFallback.trim().length > 0) {
    sessionLabel = truncate(tagFallback.trim());
    sessionColorKey = tagFallback.trim();
  } else {
    sessionLabel = "sess-?";
    sessionColorKey = "unknown";
  }

  const tooltipParts: string[] = [];
  if (sessionId) tooltipParts.push(`session: ${sessionId}`);
  if (cwd) tooltipParts.push(`cwd: ${cwd}`);
  if (tagFallback && !sessionId) tooltipParts.push(`fallback: ${tagFallback}`);

  return {
    project: projectPill,
    session: {
      label: sessionLabel,
      tooltip: tooltipParts.length > 0 ? tooltipParts.join("\n") : "session: unknown",
      colorClasses: pickColor(SESSION_PALETTE, sessionColorKey),
    },
  };
}
