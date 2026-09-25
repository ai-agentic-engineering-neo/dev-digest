#!/usr/bin/env bash
# Stop-hook nudge for engineering-insights. Reads the hook payload on stdin and,
# unless this stop was itself caused by a hook (stop_hook_active), returns a
# non-blocking reminder to run the wrap-up. It never writes INSIGHTS.md itself:
# judgment stays in the skill, the hook only makes the reminder unconditional.
set -euo pipefail
payload="$(cat)"
if printf '%s' "$payload" | grep -q '"stop_hook_active"[[:space:]]*:[[:space:]]*true'; then
  exit 0
fi
cat <<'JSON'
{"hookSpecificOutput":{"hookEventName":"Stop","additionalContext":"Before finishing: run the engineering-insights wrap-up for every package touched this session (insight.sh module <path>, then the wrap-up checklist). An empty sweep is fine; skipping it is not."}}
JSON
