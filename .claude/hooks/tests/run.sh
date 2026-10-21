#!/usr/bin/env bash
# Hook test runner. Each cases/<name>.tsv starts with
#   # hook: <script> [arg]
#   # tool: Bash|Write
# followed by rows  ALLOW|BLOCK<TAB><command or file path><TAB><note>.
# {ROOT} in an input is replaced by the repo root. Exit 0 = ALLOW, 2 = BLOCK
# (with non-empty stderr); anything else is an ERROR. Cases live in files so
# that inputs containing gate-hook tokens never appear in a Bash command.
#
#   run.sh              all case files
#   run.sh <name>...    cases/<name>.tsv only
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
CASES="$HERE/cases"

if [[ $# -gt 0 ]]; then
  files=()
  for n in "$@"; do files+=("$CASES/$n.tsv"); done
else
  files=("$CASES"/*.tsv)
fi

total=0 failed=0
for f in "${files[@]}"; do
  [[ -f "$f" ]] || { echo "missing case file: $f" >&2; failed=$((failed + 1)); continue; }
  hook="$(sed -n 's/^# hook:[[:space:]]*//p' "$f" | head -1)"
  tool="$(sed -n 's/^# tool:[[:space:]]*//p' "$f" | head -1)"
  read -r -a hook_argv <<<"$hook"
  script="$ROOT/.claude/hooks/${hook_argv[0]}"
  n=0 bad=0
  while IFS=$'\t' read -r want input note || [[ -n "$want" ]]; do
    [[ -z "$want" || "$want" == \#* ]] && continue
    input="${input//\{ROOT\}/$ROOT}"
    if [[ "$tool" == "Bash" ]]; then
      payload="$(jq -n --arg c "$input" '{tool_name:"Bash",tool_input:{command:$c}}')"
    else
      payload="$(jq -n --arg p "$input" --arg t "$tool" '{tool_name:$t,tool_input:{file_path:$p}}')"
    fi
    err="$(printf '%s' "$payload" | CLAUDE_PROJECT_DIR="$ROOT" bash "$script" "${hook_argv[@]:1}" 2>&1 >/dev/null)"
    code=$?
    case "$code" in
      0) got=ALLOW ;;
      2) got=BLOCK; [[ -n "$err" ]] || got="BLOCK(no stderr)" ;;
      *) got="ERROR($code)" ;;
    esac
    n=$((n + 1)) total=$((total + 1))
    if [[ "$got" != "$want" ]]; then
      bad=$((bad + 1)) failed=$((failed + 1))
      printf '  FAIL want=%s got=%s :: %s%s\n' "$want" "$got" "$input" "${note:+  ($note)}"
      [[ -n "$err" ]] && printf '       %s\n' "$(head -c 200 <<<"$err")"
    fi
  done <"$f"
  printf '%-40s %3d cases, %d failed\n' "$(basename "$f" .tsv)" "$n" "$bad"
done
echo "total: $total cases, $failed failed"
[[ $failed -eq 0 ]]
