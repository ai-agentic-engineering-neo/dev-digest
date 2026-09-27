#!/usr/bin/env bash
# PreToolUse(Bash) gate: refuse `gh pr create` / `gh pr ready` until a fresh,
# non-blocking pr-self-review verdict exists for exactly this working copy.
#
#   guard-pr.sh                 # hook mode: reads the hook payload on stdin
#   guard-pr.sh --check "<cmd>" # same logic, command passed as an argument
#
# exit 0 = allow, exit 2 = block (stderr is fed back to Claude).
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"

ROOT="${CLAUDE_PROJECT_DIR:-$(psr_repo_root)}"
[[ -n "$ROOT" && -d "$ROOT" ]] || exit 0
cd "$ROOT" || exit 0

CMD=""
MODE=hook
if [[ "${1:-}" == "--check" ]]; then
  MODE=check
  CMD="${2:-}"
else
  payload="$(cat)"
  if command -v jq >/dev/null 2>&1; then
    CMD="$(jq -r '.tool_input.command // empty' <<<"$payload" 2>/dev/null)"
  fi
fi

[[ -z "$CMD" ]] && exit 0

# A command that runs this script is the gate testing itself, not a PR being opened.
[[ "$MODE" == "hook" ]] && grep -q 'guard-pr\.sh' <<<"$CMD" && exit 0

# Only PR-opening commands are gated, and only when `gh` sits in command position:
# `echo "gh pr create"` or `--check "gh pr create"` must not trip the gate.
GATE_RE='(^|[;&|(]|&&|\|\|)[[:space:]]*([A-Za-z_][A-Za-z0-9_]*=[^[:space:]]*[[:space:]]+)*(env[[:space:]]+([A-Za-z_][A-Za-z0-9_]*=[^[:space:]]*[[:space:]]+)*)?gh[[:space:]]+pr[[:space:]]+(create|ready)([[:space:]]|$)'
grep -Eq "$GATE_RE" <<<"$CMD" || exit 0

if [[ "${PR_SELF_REVIEW_OVERRIDE:-}" == "1" ]] || grep -q 'PR_SELF_REVIEW_OVERRIDE=1' <<<"$CMD"; then
  echo "pr-self-review: gate bypassed via PR_SELF_REVIEW_OVERRIDE=1" >&2
  exit 0
fi

ART=".claude/pr-self-review/last-run.json"

block() {
  {
    echo "BLOCKED by pr-self-review — PR не відкривається."
    echo
    printf '%s\n' "$@"
    echo
    echo "Далі: запусти скіл /pr-self-review, виправ усі CRITICAL і повтори команду."
    echo "Свідомий обхід (тільки за прямим розпорядженням користувача): PR_SELF_REVIEW_OVERRIDE=1 <команда>."
  } >&2
  exit 2
}

command -v jq >/dev/null 2>&1 || block "jq не знайдено — вердикт неможливо прочитати, тому гейт закритий."
[[ -f "$ART" ]] || block "Вердикту немає ($ART): самоперевірка ще жодного разу не запускалась для цієї гілки."

head_now="$(git rev-parse HEAD 2>/dev/null)"
dirty_now="$(psr_dirty_hash)"
head_art="$(jq -r '.head_sha // ""' "$ART")"
dirty_art="$(jq -r '.dirty_hash // ""' "$ART")"
# jq's // treats false as empty, so `.blocked // true` would turn a passing verdict into a block.
blocked="$(jq -r 'if has("blocked") then .blocked else true end' "$ART")"
generated="$(jq -r '.generated_at // "?"' "$ART")"

if [[ "$head_art" != "$head_now" ]]; then
  block "Вердикт від $generated зроблений для коміту ${head_art:0:12}, а HEAD зараз ${head_now:0:12}." \
        "Код змінився після самоперевірки — старий вердикт нічого не доводить."
fi
if [[ "$dirty_art" != "$dirty_now" ]]; then
  block "Вердикт від $generated більше не відповідає робочому дереву (незакомічені зміни змінились)." \
        "Код змінився після самоперевірки — старий вердикт нічого не доводить."
fi

if [[ "$blocked" == "true" ]]; then
  crit="$(jq -r '[.findings[]? | select(.severity == "CRITICAL")]
                 | if length == 0 then "  (лічильник CRITICAL > 0, але список порожній)"
                   else map("  • " + .title + " — " + .file + (if .line then ":" + (.line|tostring) else "" end)) | join("\n")
                   end' "$ART")"
  block "Самоперевірка від $generated знайшла $(jq -r '.counts.CRITICAL' "$ART") CRITICAL:" "$crit"
fi

exit 0
