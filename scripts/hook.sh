#!/bin/bash
# Claude Code hook script for Agent Teams Monitor (Vercel + Supabase edition).
# Forwards PreToolUse / PostToolUse JSON from Claude Code into the monitor's
# /api/hook endpoint.
#
# Configure MONITOR_URL to your deployed Vercel URL, e.g.:
#   export MONITOR_URL="https://your-app.vercel.app"
# Falls back to localhost:7777 for local dev.
#
# Usage in settings.json hooks:
#   PreToolUse:  bash ~/agent-team-monitor/scripts/hook.sh pre
#   PostToolUse: bash ~/agent-team-monitor/scripts/hook.sh post

PHASE="${1:-pre}"
BASE="${MONITOR_URL:-http://localhost:7777}"
ENDPOINT="${BASE%/}/api/hook"

INPUT=$(cat)

PAYLOAD=$(/usr/bin/python3 -c "
import sys, json
data = json.loads(sys.argv[1])
data['phase'] = sys.argv[2]
print(json.dumps(data))
" "$INPUT" "$PHASE" 2>/dev/null)

if [ -z "$PAYLOAD" ]; then
  PAYLOAD="{\"phase\":\"$PHASE\",\"tool_input\":{},\"session_id\":\"unknown\"}"
fi

curl -s -m 2 -X POST "$ENDPOINT" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD" > /dev/null 2>&1 &

exit 0
