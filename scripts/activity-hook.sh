#!/bin/bash
# Claude Code activity hook — forwards per-tool-use summaries to the monitor.
#
# Required env (set via .claude/settings.json "env"):
#   MONITOR_URL            e.g. https://agent-team-monitor-ten.vercel.app
#   MONITOR_INGEST_TOKEN   the plaintext token printed by scripts/seed-users.mjs
# Optional:
#   MONITOR_PROJECT        short tag identifying the repo

PHASE="${1:-pre}"
BASE="${MONITOR_URL:-http://localhost:7777}"
ENDPOINT="${BASE%/}/api/activity"
PROJECT="${MONITOR_PROJECT:-}"
TOKEN="${MONITOR_INGEST_TOKEN:-}"

if [ -z "$TOKEN" ]; then
  exit 0
fi

TMPFILE=$(mktemp)
cat > "$TMPFILE"

export PHASE TMPFILE PROJECT
PAYLOAD=$(/usr/bin/python3 << 'PYEOF'
import sys, json, os

phase = os.environ.get("PHASE", "pre")
tmpfile = os.environ.get("TMPFILE", "")
project = os.environ.get("PROJECT", "")

try:
    with open(tmpfile) as f:
        data = json.load(f)
except Exception:
    sys.exit(1)

tool_name = data.get("tool_name", "")
session_id = data.get("session_id", "unknown")
tool_input = data.get("tool_input", {})

# Skip Agent tool — handled by hook.sh
if tool_name == "Agent":
    sys.exit(0)

summary = ""
if tool_name == "Read":
    fp = tool_input.get("file_path", "")
    if fp: summary = "Reading " + fp.split("/")[-1]
elif tool_name == "Write":
    fp = tool_input.get("file_path", "")
    if fp: summary = "Writing " + fp.split("/")[-1]
elif tool_name == "Edit":
    fp = tool_input.get("file_path", "")
    if fp: summary = "Editing " + fp.split("/")[-1]
elif tool_name == "Bash":
    summary = "Running: " + tool_input.get("command", "")[:80]
elif tool_name == "Grep":
    summary = "Searching: " + tool_input.get("pattern", "")[:60]
elif tool_name == "Glob":
    summary = "Finding: " + tool_input.get("pattern", "")[:60]
elif tool_name == "WebFetch":
    summary = "Fetching URL"
elif tool_name == "WebSearch":
    summary = "Searching web: " + tool_input.get("query", "")[:60]
else:
    summary = tool_name

out = {
    "phase": phase,
    "tool_name": tool_name,
    "session_id": session_id,
    "summary": summary,
}
if project:
    out["project"] = project
print(json.dumps(out))
PYEOF
)

rm -f "$TMPFILE"

if [ -z "$PAYLOAD" ]; then
  exit 0
fi

curl -s -m 2 -X POST "$ENDPOINT" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "$PAYLOAD" > /dev/null 2>&1 &

exit 0
