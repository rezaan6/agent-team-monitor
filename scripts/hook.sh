#!/bin/bash
# Claude Code hook script for Agent Teams Monitor (Vercel + Supabase edition).
# Forwards PreToolUse / PostToolUse JSON from Claude Code into the monitor's
# /api/hook endpoint.
#
# Required env (set via .claude/settings.json "env"):
#   MONITOR_URL            e.g. https://agent-team-monitor-ten.vercel.app
#   MONITOR_INGEST_TOKEN   the plaintext token printed by scripts/seed-users.mjs
# Optional:
#   MONITOR_PROJECT        short tag identifying the repo, e.g. "agent-monitor"

PHASE="${1:-pre}"
BASE="${MONITOR_URL:-http://localhost:7777}"
ENDPOINT="${BASE%/}/api/hook"
PROJECT="${MONITOR_PROJECT:-}"
TOKEN="${MONITOR_INGEST_TOKEN:-}"

# No token => silently skip. Prevents spamming 401s when the token hasn't
# been provisioned yet for a given repo.
if [ -z "$TOKEN" ]; then
  exit 0
fi

INPUT=$(cat)

PAYLOAD=$(/usr/bin/python3 -c "
import sys, json
data = json.loads(sys.argv[1])
data['phase'] = sys.argv[2]
if sys.argv[3]:
    data['project'] = sys.argv[3]
print(json.dumps(data))
" "$INPUT" "$PHASE" "$PROJECT" 2>/dev/null)

if [ -z "$PAYLOAD" ]; then
  PAYLOAD="{\"phase\":\"$PHASE\",\"tool_input\":{},\"session_id\":\"unknown\",\"project\":\"$PROJECT\"}"
fi

curl -s -m 2 -X POST "$ENDPOINT" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "$PAYLOAD" > /dev/null 2>&1 &

exit 0
