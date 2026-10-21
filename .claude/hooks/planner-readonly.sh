#!/usr/bin/env bash
# PreToolUse guard for the implementation-planner subagent (and, by delegation, doc-writer
# and the reviewers): its Bash may run only read-only
# git (delegated to the researcher guard) or insight.sh read subcommands.
# Anything else is blocked (exit 2, reason on stderr).
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
payload="$(cat)"
cmd="$(printf '%s' "$payload" | jq -r '.tool_input.command // ""')"

deny() {
  echo "planner: blocked — $1. Allowed: one plain read-only git command (log|blame|show|diff|shortlog|grep|ls-files|rev-parse) or '.claude/skills/engineering-insights/scripts/insight.sh module|list|sections|check …'." >&2
  exit 2
}

[[ -n "$cmd" ]] || deny "empty command"

read -r -a argv <<<"$cmd"
case "${argv[0]}" in
  git)
    printf '%s' "$payload" | "$HERE/researcher-git-readonly.sh"
    exit $?
    ;;
esac

case "$cmd" in
  *$'\n'* | *';'* | *'&'* | *'|'* | *'>'* | *'<'* | *'`'* | *'$('* | *'${'*) deny "shell operators are not allowed" ;;
esac

# Optional leading 'bash', then the insight script by relative or absolute path.
i=0
[[ "${argv[0]}" == "bash" ]] && i=1
script="${argv[$i]:-}"
[[ "$script" == ".claude/skills/engineering-insights/scripts/insight.sh" || "$script" == */.claude/skills/engineering-insights/scripts/insight.sh ]] \
  || deny "command '${argv[0]}' is not allowed"
case "${argv[$((i + 1))]:-}" in
  module | list | sections | check) exit 0 ;;
  *) deny "insight.sh subcommand '${argv[$((i + 1))]:-}' is not read-only" ;;
esac
