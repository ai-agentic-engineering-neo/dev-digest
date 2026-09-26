#!/usr/bin/env bash
#
# gate.sh — PreToolUse hook for Bash. Blocks `gh pr create` and `git push`
# unless a fresh, passing review stamp exists for the current tree. It runs
# no review itself: judgment stays in the skill, the hook only refuses to let
# unreviewed or blocked changes leave the machine.
#
# Exit 2 + stderr = block (Claude Code shows the reason to the model).
# Bypass for a deliberate emergency push: PR_SELF_REVIEW_SKIP=1.
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
payload="$(cat)"
cmd="$(printf '%s' "$payload" | jq -r '.tool_input.command // empty' 2>/dev/null)"
[[ -n "$cmd" ]] || exit 0
if ! printf '%s' "$cmd" | grep -Eq '(^|[;&|[:space:]])(gh[[:space:]]+pr[[:space:]]+create|git[[:space:]]+push)([[:space:]]|$)'; then
  exit 0
fi
[[ "${PR_SELF_REVIEW_SKIP:-}" == "1" ]] && exit 0
if reason="$("$HERE/stamp.sh" check 2>&1)"; then
  exit 0
fi
{
  echo "pr-self-review gate: refusing to run '$(printf '%s' "$cmd" | head -c 80)'."
  echo "$reason"
  echo "Run /pr-self-review, fix every critical finding, and try again. Emergency bypass: PR_SELF_REVIEW_SKIP=1."
} >&2
exit 2
