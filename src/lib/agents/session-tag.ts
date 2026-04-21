import type { Agent } from "@/lib/types";

/**
 * Session tag — a small, stable, human-readable badge rendered on each agent
 * card so the user can tell at a glance which Claude Code session spawned it
 * (useful when running multiple sessions across different repos).
 *
 * Preference order for the visible label:
 *   1. `project` — explicit tag set by the hook script's MONITOR_PROJECT env.
 *   2. `cwd` basename — the repo folder name the session was started in.
 *   3. `sess-XXXXXX` — last 6 chars of the session_id as a stable fallback.
 *
 * The colour is derived deterministically from the strongest identifier
 * available (project | cwd | sessionId) so the same session always paints
 * the same colour, and different sessions are visually distinct.
 */

export interface SessionTag {
  label: string;
  tooltip: string;
  /** Tailwind class string for the badge background + text + border. */
  colorClasses: string;
}

// Hand-picked pastel-ish palette that reads well on both light and dark
// backgrounds. Avoid colours already used by status/type chips (blue =
// running/general, emerald = completed, red = error, amber = Plan, purple =
// Explore) so the session tag stays visually distinct.
const PALETTE: readonly string[] = [
  "bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300 ring-sky-200/60 dark:ring-sky-700/40",
  "bg-fuchsia-100 dark:bg-fuchsia-900/40 text-fuchsia-700 dark:text-fuchsia-300 ring-fuchsia-200/60 dark:ring-fuchsia-700/40",
  "bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300 ring-teal-200/60 dark:ring-teal-700/40",
  "bg-pink-100 dark:bg-pink-900/40 text-pink-700 dark:text-pink-300 ring-pink-200/60 dark:ring-pink-700/40",
  "bg-lime-100 dark:bg-lime-900/40 text-lime-700 dark:text-lime-300 ring-lime-200/60 dark:ring-lime-700/40",
  "bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 ring-violet-200/60 dark:ring-violet-700/40",
  "bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-300 ring-yellow-200/60 dark:ring-yellow-700/40",
  "bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300 ring-rose-200/60 dark:ring-rose-700/40",
  "bg-cyan-100 dark:bg-cyan-900/40 text-cyan-700 dark:text-cyan-300 ring-cyan-200/60 dark:ring-cyan-700/40",
  "bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 ring-indigo-200/60 dark:ring-indigo-700/40",
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

function pickColor(key: string): string {
  return PALETTE[hash32(key) % PALETTE.length];
}

function basename(cwd: string): string {
  const trimmed = cwd.replace(/\/+$/, "");
  const idx = trimmed.lastIndexOf("/");
  return idx === -1 ? trimmed : trimmed.slice(idx + 1);
}

function truncate(s: string): string {
  if (s.length <= MAX_LABEL_LEN) return s;
  return s.slice(0, MAX_LABEL_LEN - 1) + "…";
}

function shortSessionId(sessionId: string | undefined): string {
  if (!sessionId || sessionId === "unknown") return "sess-?";
  const tail = sessionId.slice(-6);
  return `sess-${tail}`;
}

export function getSessionTag(agent: Agent): SessionTag {
  const { project, cwd, sessionId } = agent;

  // Colour key: prefer the strongest stable identifier so distinct sessions
  // in the same project still look the same colour (intentional — they ARE
  // the same working context). If only sessionId is available, colour by
  // that so every session still gets its own hue.
  const colorKey = project || cwd || sessionId || "unknown";

  let label: string;
  if (project && project.trim().length > 0) {
    label = truncate(project.trim());
  } else if (cwd && cwd.trim().length > 0) {
    label = truncate(basename(cwd));
  } else {
    label = shortSessionId(sessionId);
  }

  const tooltipParts: string[] = [];
  if (project) tooltipParts.push(`project: ${project}`);
  if (cwd) tooltipParts.push(`cwd: ${cwd}`);
  if (sessionId) tooltipParts.push(`session: ${sessionId}`);
  const tooltip = tooltipParts.length > 0 ? tooltipParts.join("\n") : "session: unknown";

  return {
    label,
    tooltip,
    colorClasses: pickColor(colorKey),
  };
}
