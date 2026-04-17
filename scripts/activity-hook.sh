#!/bin/bash
# Claude Code activity hook — forwards per-tool-use summaries to the monitor.
#
# Configure MONITOR_URL to your deployed Vercel URL. Falls back to localhost.
#
# Usage in settings.json hooks:
#   PreToolUse:  bash ~/agent-team-monitor/scripts/activity-hook.sh pre
#   PostToolUse: bash ~/agent-team-monitor/scripts/activity-hook.sh post

PHASE="${1:-pre}"
BASE="${MONITOR_URL:-http://localhost:7777}"
ENDPOINT="${BASE%/}/api/activity"

TMPFILE=$(mktemp)
cat > "$TMPFILE"

export PHASE TMPFILE
PAYLOAD=$(/usr/bin/python3 << 'PYEOF'
import sys, json, os

phase = os.environ.get("PHASE", "pre")
tmpfile = os.environ.get("TMPFILE", "")

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

print(json.dumps({
    "phase": phase,
    "tool_name": tool_name,
    "session_id": session_id,
    "summary": summary,
}))
PYEOF
)

rm -f "$TMPFILE"

if [ -z "$PAYLOAD" ]; then
  exit 0
fi

curl -s -m 2 -X POST "$ENDPOINT" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD" > /dev/null 2>&1 &

exit 0
