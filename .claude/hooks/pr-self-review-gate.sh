#!/usr/bin/env bash
# Claude Code hook for the pr-self-review skill (registered in .claude/settings.json).
#   pre  — PreToolUse(Bash): blocks `gh pr create|ready|merge` unless /pr-self-review passed
#          for the committed state of HEAD (exit 2 → Claude sees the reason).
#   post — PostToolUse(Bash): after `git push`, posts the `devdigest/self-review` commit status.
# Every other Bash call exits here without starting node.
set -u
mode="${1:-pre}"
input="$(cat)"
case "$input" in
  *gh*pr*|*git*push*) ;;
  *) exit 0 ;;
esac
root="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
printf '%s' "$input" | exec node "$root/.claude/skills/pr-self-review/scripts/gate.mjs" "$mode"
