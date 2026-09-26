#!/usr/bin/env bash
#
# prepare-lanes.sh — write everything a lane subagent needs to disk, so the
# orchestrating agent hands each reviewer a path instead of pasting a diff.
#
#   prepare-lanes.sh [mode flags]
#
# Writes under .git/pr-self-review/:
#   routing.json          route.sh --json
#   lanes/<package>.diff  unified diff of that lane's files
#   lanes/<package>.txt   the lane block from route.sh --lanes (files + skills)
# Prints the lane summary.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(git rev-parse --show-toplevel)"
OUT="$ROOT/.git/pr-self-review"
rm -rf "$OUT/lanes"; mkdir -p "$OUT/lanes"
"$HERE/route.sh" "$@" --json > "$OUT/routing.json"
"$HERE/changed-files.sh" "$@" base > "$OUT/base.txt"
for pkg in $(jq -r '.lanes[].package' "$OUT/routing.json"); do
  mapfile -t files < <(jq -r --arg p "$pkg" '.lanes[] | select(.package==$p) | .files[].path' "$OUT/routing.json")
  "$HERE/changed-files.sh" "$@" diff "${files[@]}" > "$OUT/lanes/$pkg.diff"
  {
    echo "lane: $pkg"
    echo "skills: $(jq -r --arg p "$pkg" '.lanes[] | select(.package==$p) | .skills | join(", ")' "$OUT/routing.json")"
    echo "files:"
    jq -r --arg p "$pkg" '.lanes[] | select(.package==$p) | .files[] | "  \(.path)  [\(.skills|join(","))]"' "$OUT/routing.json"
  } > "$OUT/lanes/$pkg.txt"
  printf '  %-14s %3d files  %6d diff lines  skills: %s\n' "$pkg" "${#files[@]}" "$(wc -l < "$OUT/lanes/$pkg.diff")" \
    "$(jq -r --arg p "$pkg" '.lanes[] | select(.package==$p) | .skills | join(",")' "$OUT/routing.json")"
done
n_ex="$(jq '.excluded | length' "$OUT/routing.json")"
echo "  excluded from lanes: $n_ex (see routing.json)"
echo "written to $OUT/lanes/"
