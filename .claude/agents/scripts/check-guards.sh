#!/usr/bin/env bash
# Runs every row of guard-cases.tsv through its guard and compares the exit code.
#
#   check-guards.sh [--guard <name>] [--cases <file>] [--verbose]
#
# Row (tab-separated): guard · args · mode · input · expected_exit
#   guard  — script name without .sh, e.g. readonly-guard
#   args   — extra arguments before the mode flag, or "-" for none
#   mode   — cmd (--check), path (--check-path) or tool (--check-tool)
# Blank lines and lines starting with # are skipped. Exit 1 on any mismatch.
set -uo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CASES="$DIR/guard-cases.tsv"
ONLY=""
VERBOSE=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --guard) ONLY="$2"; shift 2 ;;
    --cases) CASES="$2"; shift 2 ;;
    --verbose) VERBOSE=1; shift ;;
    *) echo "check-guards.sh: unknown argument $1" >&2; exit 64 ;;
  esac
done

[[ -f "$CASES" ]] || { echo "check-guards.sh: no case table at $CASES" >&2; exit 3; }

total=0
failed=0
while IFS=$'\t' read -r guard args mode input expected || [[ -n "$guard" ]]; do
  [[ -z "$guard" || "$guard" == \#* ]] && continue
  [[ -n "$ONLY" && "$guard" != "$ONLY" ]] && continue

  extra=()
  [[ "$args" != "-" ]] && read -ra extra <<<"$args"
  case "$mode" in
    cmd)  flag=--check ;;
    path) flag=--check-path ;;
    tool) flag=--check-tool ;;
    *) echo "check-guards.sh: bad mode '$mode' in row: $guard $input" >&2; exit 64 ;;
  esac

  "$DIR/$guard.sh" "${extra[@]}" "$flag" "$input" >/dev/null 2>&1
  actual=$?
  total=$((total + 1))
  if [[ "$actual" != "$expected" ]]; then
    failed=$((failed + 1))
    printf 'FAIL  %s %s %s %s  expected %s, got %s\n' "$guard" "$args" "$mode" "$input" "$expected" "$actual"
  elif [[ "$VERBOSE" == 1 ]]; then
    printf 'ok    %s %s %s %s  → %s\n' "$guard" "$args" "$mode" "$input" "$actual"
  fi
done <"$CASES"

echo "check-guards: $((total - failed))/$total rows match"
[[ "$failed" == 0 ]]
