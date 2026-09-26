#!/usr/bin/env bash
#
# changed-files.sh — the change set a PR self review looks at.
# Deterministic: the agent calls this instead of guessing what "my changes"
# means, so every run (manual, gate, CI) reviews the same set of files.
#
#   changed-files.sh [mode] base                 → resolved base ref and merge-base sha
#   changed-files.sh [mode] list                 → TSV: status<TAB>path   (A M D R U)
#   changed-files.sh [mode] diff [path ...]      → unified diff of those paths (all if none)
#   changed-files.sh [mode] tree                 → sha of the exact tree reviewed (for the stamp)
#
# mode:  --all      merge-base .. working tree, including untracked files  (default)
#        --staged   merge-base .. index (branch commits + staged changes)
#        --branch   merge-base .. HEAD  (branch commits only; what CI sees)
#        --base <ref>   override the base branch
#
# Base resolution when --base is absent: upstream/main, then origin/main, then
# main. PRs target the org repo, so upstream/main is the true base; run
# `git fetch upstream` first when it looks stale.

set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

MODE="all"
BASE=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --all|--staged|--branch) MODE="${1#--}"; shift ;;
    --base) BASE="$2"; shift 2 ;;
    *) break ;;
  esac
done
CMD="${1:-list}"; [[ $# -gt 0 ]] && shift

resolve_base() {
  if [[ -n "$BASE" ]]; then echo "$BASE"; return; fi
  for ref in upstream/main origin/main main; do
    if git rev-parse --verify -q "$ref" >/dev/null; then echo "$ref"; return; fi
  done
  echo "changed-files: no base ref found (upstream/main, origin/main, main)" >&2
  exit 2
}

BASE_REF="$(resolve_base)"
MERGE_BASE="$(git merge-base HEAD "$BASE_REF")"

# Tracked changes relative to the merge base, in the selected mode.
tracked_status() {
  case "$MODE" in
    all)    git diff --name-status --no-renames "$MERGE_BASE" ;;
    staged) git diff --name-status --no-renames --cached "$MERGE_BASE" ;;
    branch) git diff --name-status --no-renames "$MERGE_BASE" HEAD ;;
  esac
}

untracked() {
  [[ "$MODE" == "all" ]] || return 0
  git ls-files --others --exclude-standard | sed 's/^/U\t/'
}

case "$CMD" in
  base)
    echo "base_ref=$BASE_REF"
    echo "merge_base=$MERGE_BASE"
    echo "mode=$MODE"
    ;;
  list)
    { tracked_status; untracked; } | sort -k2 -u
    ;;
  diff)
    if [[ $# -gt 0 ]]; then paths=("$@"); else mapfile -t paths < <({ tracked_status; untracked; } | cut -f2); fi
    for p in "${paths[@]}"; do
      if git ls-files --error-unmatch -- "$p" >/dev/null 2>&1 || git cat-file -e "$MERGE_BASE:$p" 2>/dev/null; then
        case "$MODE" in
          all)    git diff --no-color "$MERGE_BASE" -- "$p" ;;
          staged) git diff --no-color --cached "$MERGE_BASE" -- "$p" ;;
          branch) git diff --no-color "$MERGE_BASE" HEAD -- "$p" ;;
        esac
      elif [[ "$MODE" == "all" && -f "$p" ]]; then
        git diff --no-color --no-index -- /dev/null "$p" || true
      fi
    done
    ;;
  tree)
    # Hash of exactly what was reviewed, so the gate can tell a stale stamp.
    case "$MODE" in
      branch) git rev-parse "HEAD^{tree}" ;;
      staged) git write-tree ;;
      all)
        tmp="$(mktemp)"; trap 'rm -f "$tmp"' EXIT
        cp "$(git rev-parse --git-path index)" "$tmp"
        GIT_INDEX_FILE="$tmp" git add -A >/dev/null 2>&1
        GIT_INDEX_FILE="$tmp" git write-tree
        ;;
    esac
    ;;
  *)
    echo "changed-files: unknown command '$CMD' (base | list | diff | tree)" >&2
    exit 2
    ;;
esac
