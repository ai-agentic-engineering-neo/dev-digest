#!/usr/bin/env bash
# PR Self Review gate.
#
# Two callers:
#   1. The PreToolUse hook (see ../README.md#hook-wiring) — invoked with the hook's JSON
#      payload on stdin. Only gates Bash commands that actually run `gh pr create`/
#      `gh pr merge`; anything else is allowed through untouched.
#   2. Manual/skill use — `check-gate.sh` (status check) or
#      `check-gate.sh --acknowledge "<reason>"` (record an explicit user override).
#
# Exit 0 = allow. Exit 2 = block, with the reason on stderr (Claude Code reads a blocking
# hook's stderr back into the conversation).
set -euo pipefail

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE_REF="${PR_SELF_REVIEW_BASE:-main}"
STATUS_FILE="$(git rev-parse --git-dir)/pr-self-review-status"

# --- Mode: hook invocation (JSON on stdin) — only gate PR-opening/merging commands ---
# Read with a per-line timeout rather than `cat`: stdin here can be "not a tty but also
# never closed" (plain manual invocation in some shells/sandboxes), and a bare `cat` would
# block forever waiting for an EOF that never comes. A real hook payload arrives as a
# single fast, EOF-terminated write, so this reads it in full without waiting it out.
HOOK_INPUT=""
if [ ! -t 0 ]; then
  while IFS= read -r -t 0.2 hook_line; do
    HOOK_INPUT+="$hook_line"$'\n'
  done
  if [ -n "$HOOK_INPUT" ]; then
    if command -v jq >/dev/null 2>&1; then
      CMD="$(printf '%s' "$HOOK_INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null || true)"
    else
      CMD="$(printf '%s' "$HOOK_INPUT" | grep -o '"command"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed -E 's/.*:[[:space:]]*"(.*)"/\1/')"
    fi
    if ! printf '%s' "$CMD" | grep -Eq 'gh[[:space:]]+pr[[:space:]]+(create|merge)'; then
      exit 0
    fi
  fi
fi

CURRENT_HASH="$(bash "$SKILL_DIR/scripts/diff-hash.sh" "$BASE_REF")"

if [ "$CURRENT_HASH" = "EMPTY" ]; then
  echo "pr-self-review: no reviewable changes vs $BASE_REF. Allowing." >&2
  exit 0
fi

# --- Mode: record an explicit user override ---
if [ "${1:-}" = "--acknowledge" ]; then
  REASON="${2:-no reason given}"
  if [ ! -f "$STATUS_FILE" ]; then
    echo "pr-self-review: no status found — run the pr-self-review skill before acknowledging." >&2
    exit 2
  fi
  # shellcheck disable=SC1090
  source "$STATUS_FILE"
  if [ "${diff_hash:-}" != "$CURRENT_HASH" ]; then
    echo "pr-self-review: status is stale for the current diff — re-run the skill before acknowledging." >&2
    exit 2
  fi
  {
    echo "diff_hash=$diff_hash"
    echo "verdict=$verdict"
    echo "critical_count=$critical_count"
    echo "high_count=${high_count:-0}"
    echo "medium_count=${medium_count:-0}"
    echo "timestamp=$timestamp"
    echo "ack=true"
    echo "ack_hash=$CURRENT_HASH"
    echo "ack_reason=\"$REASON\""
    echo "ack_timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  } > "$STATUS_FILE"
  echo "pr-self-review: override acknowledged and recorded ($critical_count critical finding(s)): $REASON" >&2
  exit 0
fi

# --- Mode: plain gate check ---
if [ ! -f "$STATUS_FILE" ]; then
  echo "pr-self-review: has not run yet for this branch. Run the pr-self-review skill before opening/merging the PR." >&2
  exit 2
fi

# shellcheck disable=SC1090
source "$STATUS_FILE"

if [ "${diff_hash:-}" != "$CURRENT_HASH" ]; then
  echo "pr-self-review: status is stale (diff changed since last run). Re-run the pr-self-review skill." >&2
  exit 2
fi

if [ "${verdict:-}" = "BLOCKED" ]; then
  if [ "${ack:-false}" = "true" ] && [ "${ack_hash:-}" = "$CURRENT_HASH" ]; then
    echo "pr-self-review: BLOCKED ($critical_count critical) but explicitly acknowledged: $ack_reason" >&2
    exit 0
  fi
  echo "pr-self-review: BLOCKED — $critical_count critical finding(s) at $timestamp." >&2
  echo "Do not proceed until findings are fixed, or the user explicitly confirms an override in chat." >&2
  echo "After explicit user confirmation, run: bash .claude/skills/pr-self-review/scripts/check-gate.sh --acknowledge \"<reason>\"" >&2
  exit 2
fi

echo "pr-self-review: PASS ($timestamp)." >&2
exit 0
