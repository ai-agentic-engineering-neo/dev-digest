#!/usr/bin/env bash
# PreToolUse hook (matcher: Bash). Denies `gh pr create` / `gh pr merge` without a fresh PASS verdict.
set -uo pipefail
S="$(cd "$(dirname "$0")" && pwd)"
CMD=$(jq -r '.tool_input.command // ""' 2>/dev/null)
echo "$CMD" | grep -Eq '(^|;|&&|\|\|?|\()[[:space:]]*gh[[:space:]]+pr[[:space:]]+(create|merge)\b' || exit 0
ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
V="${PR_SELF_REVIEW_DIR:-$ROOT/.claude/.pr-self-review}/verdict.json"
deny() { jq -nc --arg r "$1" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$r}}'; exit 0; }
[ -f "$V" ] || deny "PR self-review has not been run. Run /pr-self-review first."
FP=$("$S/fingerprint.sh")
[ "$(jq -r .fingerprint "$V")" = "$FP" ] || deny "Code changed since the last PR self-review. Re-run /pr-self-review (cached, only changed files are re-reviewed)."
if [ "$(jq -r .status "$V")" != "PASS" ]; then
  deny "PR self-review is BLOCKED: $(jq -r .critical_count "$V") critical finding(s). See ${V%verdict.json}report.md, fix them and re-run /pr-self-review."
fi
exit 0
