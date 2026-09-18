#!/usr/bin/env bash
#
# gate.sh — the PreToolUse hook. Denies `gh pr create` / `gh pr merge` /
# `git push` unless a FRESH, PASSING pr-self-review report exists.
#
# It fires on every Bash call, so the command match is the very first thing it
# does and the non-matching path costs nothing.
#
# Two transports on purpose: the JSON `permissionDecision` on stdout AND the
# same text on stderr with exit 2. Sources disagree about which one a given
# Claude Code build honours and whether the reason reaches the model; emitting
# both is cheap and they can only ever agree.
#
# Fails CLOSED on a corrupt report — it is a blocking gate, and `# psr-skip` is
# the escape hatch that makes that safe. The one exception is a missing `jq`:
# bricking every push on a machine that never had the tool is not a safety win.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PSR_DIR="${PSR_DIR:-.claude/pr-self-review}"
TTL_DEFAULT=28800

allow() { printf '{}\n'; exit 0; }

deny() { # $1 = message
  jq -n --arg m "$1" '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: $m
    },
    systemMessage: $m
  }' 2>/dev/null || printf '%s\n' "$1"
  printf '%s\n' "$1" >&2
  exit 2
}

command -v jq >/dev/null 2>&1 || {
  printf 'pr-self-review: jq not found; gate degraded to allow.\n' >&2; allow; }

INPUT="$(cat)"
TOOL="$(printf '%s' "$INPUT" | jq -r '.tool_name // ""' 2>/dev/null)"
[ "$TOOL" = "Bash" ] || allow
CMD="$(printf '%s' "$INPUT" | jq -r '.tool_input.command // ""' 2>/dev/null)"
[ -n "$CMD" ] || allow

# ---- 1. is this our business? ----------------------------------------------
printf '%s' "$CMD" | grep -qE '(^|[;&|[:space:]])(gh[[:space:]]+pr[[:space:]]+(create|merge|ready)|git[[:space:]]+push)([[:space:]]|$)' || allow
printf '%s' "$CMD" | grep -qE -- '--dry-run|--help|-h([[:space:]]|$)' && allow

# ---- 2. escape hatch --------------------------------------------------------
if printf '%s' "$CMD" | grep -qE '#[[:space:]]*psr-skip' || [ "${DEVDIGEST_PSR_SKIP:-}" = "1" ]; then
  ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" && {
    mkdir -p "$ROOT/$PSR_DIR"
    printf '%s\t%s\t%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$(git -C "$ROOT" rev-parse HEAD 2>/dev/null)" "$CMD" \
      >> "$ROOT/$PSR_DIR/overrides.log"
    [ -f "$ROOT/$PSR_DIR/report.json" ] && {
      tmp="$(mktemp)"
      jq --arg at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" --arg cmd "$CMD" \
         '.override = {at: $at, command: $cmd}' "$ROOT/$PSR_DIR/report.json" > "$tmp" \
        && mv "$tmp" "$ROOT/$PSR_DIR/report.json"
    }
  }
  printf 'pr-self-review: override accepted and recorded in %s/overrides.log\n' "$PSR_DIR" >&2
  allow
fi

ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || allow   # not a repo: not ours
cd "$ROOT" || allow
REPORT="$PSR_DIR/report.json"

HINT="Run /pr-self-review, fix what it reports, then retry.
Deliberate override: append \`# psr-skip\` to the command (it is recorded)."

[ -f "$REPORT" ] || deny "BLOCKED by pr-self-review: no report for these changes.

$HINT"

jq -e . "$REPORT" >/dev/null 2>&1 || deny "BLOCKED by pr-self-review: $REPORT is unreadable.

$HINT"

# ---- 3. freshness — recomputed here, never taken on trust -------------------
read -r CUR_HEAD CUR_HASH < <("$SCRIPT_DIR/collect-diff.sh" --hash-only 2>/dev/null)
R_HEAD="$(jq -r '.head_sha // ""' "$REPORT")"
R_HASH="$(jq -r '.diff_hash // ""' "$REPORT")"
R_WHEN="$(jq -r '.generated_at // ""' "$REPORT")"
R_VERDICT="$(jq -r '.verdict // ""' "$REPORT")"

[ "$R_HEAD" = "$CUR_HEAD" ] && [ "$R_HASH" = "$CUR_HASH" ] || deny \
"BLOCKED by pr-self-review: the report is stale — the diff has changed since it was written.

  report HEAD  $R_HEAD  hash ${R_HASH:0:12}
  current HEAD $CUR_HEAD  hash ${CUR_HASH:0:12}

$HINT"

if [ -n "$R_WHEN" ]; then
  then_s="$(date -j -f '%Y-%m-%dT%H:%M:%SZ' "$R_WHEN" +%s 2>/dev/null || date -d "$R_WHEN" +%s 2>/dev/null)"
  now_s="$(date -u +%s)"
  if [ -n "$then_s" ] && [ $((now_s - then_s)) -gt "${PSR_TTL:-$TTL_DEFAULT}" ]; then
    deny "BLOCKED by pr-self-review: the report expired (written $R_WHEN).

The diff hash still matches, but \`main\` may have moved under it.

$HINT"
  fi
fi

# ---- 4. the verdict ---------------------------------------------------------
if [ "$R_VERDICT" != "pass" ]; then
  LIST="$(jq -r '[.findings[] | select(.severity=="CRITICAL")][0:8][]
                 | "  • \(.file):\(.start_line) — \(.title)"' "$REPORT" 2>/dev/null)"
  N="$(jq -r '.counts.CRITICAL // 0' "$REPORT")"
  deny "BLOCKED by pr-self-review: $N CRITICAL finding(s).

$LIST

Full report: $PSR_DIR/report.md

$HINT"
fi

W="$(jq -r '.counts.WARNING // 0' "$REPORT")"; S="$(jq -r '.counts.SUGGESTION // 0' "$REPORT")"
printf 'pr-self-review: passed (%s warning, %s suggestion). Report: %s/report.md\n' "$W" "$S" "$PSR_DIR" >&2
allow
