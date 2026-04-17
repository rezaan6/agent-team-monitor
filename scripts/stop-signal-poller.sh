#!/bin/bash
# Poll the remote monitor for pending stop requests and drop local signal
# files at /tmp/claude-stop-${agentId} that your Claude Code hooks can read
# to abort specific agents.
#
# Why this exists: the dashboard runs on Vercel (serverless), but stopping a
# running Claude Code agent must happen on the machine actually executing
# it. The dashboard writes stop requests to Supabase; this script runs
# locally and polls /api/signals every few seconds.
#
# Configure MONITOR_URL to your deployed Vercel URL. Run in the background:
#   export MONITOR_URL="https://your-app.vercel.app"
#   bash scripts/stop-signal-poller.sh &

BASE="${MONITOR_URL:-http://localhost:7777}"
ENDPOINT="${BASE%/}/api/signals"
INTERVAL="${POLL_INTERVAL:-3}"

echo "[stop-signal-poller] polling $ENDPOINT every ${INTERVAL}s"

while true; do
  RESP=$(curl -s -m 5 "$ENDPOINT" 2>/dev/null)
  if [ -n "$RESP" ]; then
    IDS=$(/usr/bin/python3 -c "
import sys, json
try:
    print(' '.join(str(i) for i in json.loads(sys.argv[1]).get('stopAgentIds', [])))
except Exception:
    pass
" "$RESP" 2>/dev/null)

    for AID in $IDS; do
      SIG="/tmp/claude-stop-${AID}"
      echo "stop requested at $(date -Iseconds)" > "$SIG"
      echo "[stop-signal-poller] wrote $SIG"
    done
  fi
  sleep "$INTERVAL"
done
