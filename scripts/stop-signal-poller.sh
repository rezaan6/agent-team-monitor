#!/bin/bash
# Poll the remote monitor for pending stop requests and drop local signal
# files at /tmp/claude-stop-session-${sessionId} that PreToolUse hooks
# read to block further tool calls from the stopped agent.
#
# Why this exists: the dashboard runs on Vercel (serverless), but stopping a
# running Claude Code agent must happen on the machine actually executing
# it. The dashboard writes stop requests to Supabase; this script runs
# locally and polls /api/signals every few seconds.
#
# Required env:
#   MONITOR_URL            e.g. https://your-app.vercel.app
#   MONITOR_INGEST_TOKEN   bearer token issued by scripts/seed-users.mjs
#
# Run in the background:
#   export MONITOR_URL="https://your-app.vercel.app"
#   export MONITOR_INGEST_TOKEN="…"
#   bash scripts/stop-signal-poller.sh &

BASE="${MONITOR_URL:-http://localhost:7777}"
ENDPOINT="${BASE%/}/api/signals"
INTERVAL="${POLL_INTERVAL:-3}"
TOKEN="${MONITOR_INGEST_TOKEN:-}"

if [ -z "$TOKEN" ]; then
  echo "[stop-signal-poller] MONITOR_INGEST_TOKEN is required" >&2
  exit 1
fi

echo "[stop-signal-poller] polling $ENDPOINT every ${INTERVAL}s"

while true; do
  RESP=$(curl -s -m 5 -H "Authorization: Bearer $TOKEN" "$ENDPOINT" 2>/dev/null)
  if [ -n "$RESP" ]; then
    LINES=$(/usr/bin/python3 -c "
import sys, json
try:
    data = json.loads(sys.argv[1])
    for s in data.get('stops', []):
        aid = s.get('agentId')
        sid = s.get('sessionId') or ''
        if aid is not None:
            print(f'{aid}\t{sid}')
except Exception:
    pass
" "$RESP" 2>/dev/null)

    if [ -n "$LINES" ]; then
      while IFS=$'\t' read -r AID SID; do
        # Session-keyed file: PreToolUse hooks check this to block tools.
        if [ -n "$SID" ]; then
          SESS_SIG="/tmp/claude-stop-session-${SID}"
          echo "agent ${AID} stop requested at $(date -Iseconds)" > "$SESS_SIG"
          echo "[stop-signal-poller] wrote $SESS_SIG (agent $AID)"
        else
          echo "[stop-signal-poller] agent $AID has no session_id, skipping signal"
        fi
      done <<< "$LINES"
    fi
  fi
  sleep "$INTERVAL"
done
