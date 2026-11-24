#!/bin/sh
# PreToolUse(Bash) gate: refuse `gh pr create` / `gh pr merge` unless a FRESH
# /pr-self-review result exists for the current changes and its verdict is PASS.
# Exit 2 = block the tool call; stderr is shown to Claude.
root="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
input=$(cat)
cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // empty' 2>/dev/null) || cmd="$input"

printf '%s' "$cmd" | grep -Eq '(^|[;&|(])[[:space:]]*gh[[:space:]]+pr[[:space:]]+(create|merge)([^[:alnum:]_-]|$)' || exit 0

result="$root/.claude/pr-self-review/last.json"
stale="PR gate: no fresh /pr-self-review for the current changes. Tell the user to run /pr-self-review (it is manual-only), then retry."

[ -f "$result" ] || { echo "$stale" >&2; exit 2; }

current=$("$root/.claude/skills/pr-self-review/scripts/diff-hash.sh" 2>/dev/null) || { echo "$stale" >&2; exit 2; }
saved=$(jq -r '.diff_hash // empty' "$result" 2>/dev/null)
[ -n "$saved" ] && [ "$saved" = "$current" ] || { echo "$stale" >&2; exit 2; }

verdict=$(jq -r '.verdict // empty' "$result" 2>/dev/null)
if [ "$verdict" != "PASS" ]; then
  n=$(jq -r '.critical // 0' "$result" 2>/dev/null)
  echo "PR gate: /pr-self-review verdict is '$verdict' ($n CRITICAL). Fix the findings, then re-run /pr-self-review. Do not open or merge the PR." >&2
  exit 2
fi
exit 0
