# Agent Teams Monitor

Real-time dashboard for monitoring Claude Code agents. Built on Next.js 16 + Supabase (Postgres + Realtime), deployable to Vercel.

## What it shows

Live segregated view of every Claude Code sub-agent spawned from your sessions:

- **Working** — running agents with live per-tool-use activity
- **Completed** — finished agents with duration + usage stats
- **Failed** — agents that errored

Plus a rolling activity timeline and aggregate token/tool-use totals.

## Architecture

```
Claude Code hooks ──POST──▶ Next.js API routes ──▶ Supabase Postgres
                                                        │
Browser dashboard ◀──── Supabase Realtime ◀─────────────┘
```

- `scripts/hook.sh` + `scripts/activity-hook.sh` — Claude Code hooks that POST to `/api/hook` and `/api/activity`.
- `/api/hook` — writes agent lifecycle events (pre/post) to `agents` + `agent_events`.
- `/api/activity` — attributes tool uses to the currently-active running agent (gap-based rotation).
- `/api/stop/[id]` — enqueues a stop request for an agent.
- `/api/signals` — polled by `scripts/stop-signal-poller.sh` on the machine running Claude Code; writes `/tmp/claude-stop-${id}` which your hooks read to abort an agent.
- Dashboard subscribes to `agents`, `agent_events`, and `global_state` via Supabase Realtime for live updates.

## Local dev

1. Install deps:

   ```bash
   npm install
   ```

2. Copy `.env.example` → `.env.local` and fill in your Supabase keys.

3. Apply the schema in your Supabase project (SQL editor):

   ```bash
   # Paste supabase/migrations/0001_init.sql into the Supabase SQL editor
   ```

4. Run:

   ```bash
   npm run dev
   ```

   Dashboard is on http://localhost:7777.

## Deploy to Vercel

1. Push to GitHub.
2. Import the repo into Vercel.
3. Add env vars in the Vercel project settings:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
4. Deploy.

## Connecting Claude Code to a deployed monitor

On the machine running Claude Code:

```bash
export MONITOR_URL="https://your-app.vercel.app"
```

Then configure the hooks in `~/.claude/settings.json`:

```json
{
  "hooks": {
    "PreToolUse": [
      { "matcher": "Agent", "hooks": [{ "type": "command", "command": "bash /path/to/repo/scripts/hook.sh pre" }] },
      { "matcher": "*",     "hooks": [{ "type": "command", "command": "bash /path/to/repo/scripts/activity-hook.sh pre" }] }
    ],
    "PostToolUse": [
      { "matcher": "Agent", "hooks": [{ "type": "command", "command": "bash /path/to/repo/scripts/hook.sh post" }] }
    ]
  }
}
```

To wire up the Stop button, run the poller in the background on the machine executing Claude Code:

```bash
MONITOR_URL="https://your-app.vercel.app" bash scripts/stop-signal-poller.sh &
```
