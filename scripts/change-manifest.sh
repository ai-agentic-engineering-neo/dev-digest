#!/usr/bin/env bash
# What changed, and where — so a reviewer reads hunks instead of whole files.
#
#   scripts/change-manifest.sh              uncommitted change: working tree vs HEAD
#   scripts/change-manifest.sh <base> <head> a commit range
#
# One markdown row per file: status (A/M/D/R), path, +added/-removed, and the
# changed line ranges on the NEW side ("12-40, 88" — read them with
# `sed -n '12,40p' <path>` or `git diff -U5 HEAD -- <path>`). New files list
# their length instead: read those whole. The implementer pastes this into its
# report; plan-verifier and architecture-reviewer start from it.
# Read-only: writes nothing.
set -uo pipefail

ROOT=$(git rev-parse --show-toplevel)
cd "$ROOT"

if [ $# -eq 2 ]; then
  RANGE=("$1" "$2"); LABEL="$1..$2"; UNTRACKED=""
elif [ $# -eq 0 ]; then
  RANGE=(HEAD); LABEL="working tree vs HEAD"
  UNTRACKED=$(git ls-files -o --exclude-standard)
else
  echo "usage: scripts/change-manifest.sh [<base> <head>]" >&2; exit 2
fi

# new-side ranges from a zero-context diff: "@@ -a,b +c,d @@" → c..c+d-1 (d = 0 is a pure deletion at c)
ranges() {
  git diff -U0 "${RANGE[@]}" -- "$1" | awk '
    /^@@/ {
      split($3, p, ","); s = substr(p[1], 2) + 0; n = (p[2] == "") ? 1 : p[2] + 0
      r = (n == 0) ? "del@" s : ((n == 1) ? s : s "-" (s + n - 1))
      out = (out == "") ? r : out ", " r
    }
    END { print out }'
}

echo "Change manifest · $LABEL"
echo
echo "| St | Path | +/- | Changed lines (new side) |"
echo "|---|---|---|---|"

COUNT=0
while IFS=$'\t' read -r st a b; do
  [ -n "$st" ] || continue
  s=${st:0:1}
  path=$a; [ "$s" = R ] || [ "$s" = C ] && path=$b
  num=$(git diff --numstat "${RANGE[@]}" -- "$path" | awk '{ print "+" $1 "/-" $2; exit }')
  case "$s" in
    D) lines="(deleted)" ;;
    A) if [ "${#RANGE[@]}" -eq 1 ]; then len=$(wc -l < "$path" | tr -d ' ')
       else len=$(git show "${RANGE[1]}:$path" 2>/dev/null | wc -l | tr -d ' '); fi
       lines="new file, $len lines — read whole" ;;
    R) lines="renamed from $a; $(ranges "$path")" ;;
    *) lines=$(ranges "$path") ;;
  esac
  printf '| %s | `%s` | %s | %s |\n' "$s" "$path" "${num:--}" "$lines"
  COUNT=$((COUNT + 1))
done < <(git diff --name-status -M "${RANGE[@]}")

while IFS= read -r f; do
  [ -n "$f" ] || continue
  printf '| A | `%s` | +%s | new file (untracked) — read whole |\n' "$f" "$(wc -l < "$f" | tr -d ' ')"
  COUNT=$((COUNT + 1))
done <<< "$UNTRACKED"

echo
echo "$COUNT file(s)."
