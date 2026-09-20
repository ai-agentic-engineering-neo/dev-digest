#!/usr/bin/env bash
#
# PreToolUse hook — blocks `gh pr create` / `gh pr merge` / `git push` while
# a CRITICAL finding from the pr-self-review skill is open, or while the
# cached result is stale for the current commit.
#
# Wired in .claude/settings.json:
#   hooks.PreToolUse[].matcher == "Bash", filtered by "if": "Bash(gh pr create *)"
#   etc., so this script only runs for the commands that matter.
#
# Contract (see code.claude.com/docs/en/hooks.md): exit 2 blocks the tool
# call and its stderr becomes the reason shown to the user/model. Any other
# exit code allows it. Must stay fast — a PreToolUse hook that times out
# fails OPEN (does not block).

set -euo pipefail

# Drain stdin (Claude Code pipes hook-event JSON here); unused — the `if`
# matcher in settings.json already filtered which commands reach us.
cat >/dev/null || true

ROOT="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)}"
STATE_FILE="$ROOT/.claude/skills/pr-self-review/.state/last-review.json"

block() {
  echo "pr-self-review: $*" >&2
  exit 2
}

git -C "$ROOT" rev-parse --git-dir >/dev/null 2>&1 || block "not a git repository — cannot verify review state."

HEAD_SHA="$(git -C "$ROOT" rev-parse HEAD 2>/dev/null)" ||
  block "could not resolve HEAD — cannot verify review state."

BASE_SHA="$(git -C "$ROOT" merge-base main HEAD 2>/dev/null)" ||
  block "could not compute merge-base with 'main' (do you have a local 'main'? try: git fetch origin main:main) — run /pr-self-review to establish one."

[ -f "$STATE_FILE" ] ||
  block "no PR Self Review found for this branch — run /pr-self-review before opening a PR."

# Extract fields — prefer jq (robust), fall back to grep/sed since we
# control the writer and the file is always this flat single-object shape.
if command -v jq >/dev/null 2>&1; then
  STATE_HEAD="$(jq -r '.headSha // empty' "$STATE_FILE")"
  STATE_BASE="$(jq -r '.baseSha // empty' "$STATE_FILE")"
  STATE_CRITICAL="$(jq -r '.hasCritical // false' "$STATE_FILE")"
  STATE_COUNT="$(jq -r '.criticalCount // 0' "$STATE_FILE")"
else
  extract() { grep -o "\"$1\"[[:space:]]*:[[:space:]]*[^,}]*" "$STATE_FILE" | head -1 | sed -E 's/.*:[[:space:]]*"?([^"]*)"?/\1/'; }
  STATE_HEAD="$(extract headSha)"
  STATE_BASE="$(extract baseSha)"
  STATE_CRITICAL="$(extract hasCritical)"
  STATE_COUNT="$(extract criticalCount)"
fi

[ "$STATE_HEAD" = "$HEAD_SHA" ] && [ "$STATE_BASE" = "$BASE_SHA" ] ||
  block "cached review is stale for this commit (branch moved, or rebased onto a newer main) — run /pr-self-review again."

[ "$STATE_CRITICAL" = "true" ] &&
  block "$STATE_COUNT unresolved CRITICAL finding(s) from the last /pr-self-review run — fix them, then re-run /pr-self-review to clear this gate."

exit 0
