#!/usr/bin/env bash
# Collect the open changes of this working copy.
#
#   collect-diff.sh [--base <ref>] [--scope branch|working] [--format json|list|diff]
#
# json  (default) — metadata + included files + skipped files + deleted files
# list            — one included file per line
# diff            — the unified diff of the included files only
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"

BASE=""
SCOPE=branch
FORMAT=json
MAX_LINES=1500

while [[ $# -gt 0 ]]; do
  case "$1" in
    --base) BASE="$2"; shift 2 ;;
    --scope) SCOPE="$2"; shift 2 ;;
    --format) FORMAT="$2"; shift 2 ;;
    --max-lines) MAX_LINES="$2"; shift 2 ;;
    *) echo "collect-diff.sh: unknown argument $1" >&2; exit 64 ;;
  esac
done

[[ "$SCOPE" == "all" ]] && SCOPE=branch
case "$SCOPE" in branch|working) ;; *) echo "collect-diff.sh: --scope must be branch or working" >&2; exit 64 ;; esac

ROOT="$(psr_repo_root)" || { echo "collect-diff.sh: not a git repository" >&2; exit 3; }
cd "$ROOT"

if ! BASE_REF="$(psr_resolve_base "$BASE")"; then
  echo "collect-diff.sh: cannot resolve a base ref — pass --base <ref> explicitly" >&2
  exit 3
fi

MB=""
if [[ "$SCOPE" == "branch" ]]; then
  MB="$(psr_merge_base "$BASE_REF")" || true
  if [[ -z "$MB" ]]; then
    echo "collect-diff.sh: no merge base between $BASE_REF and HEAD — pass --base <ref> explicitly" >&2
    exit 3
  fi
fi

collect_names() {
  local filter="$1"
  [[ -n "$MB" ]] && git diff --name-only --diff-filter="$filter" "$MB" HEAD
  git diff --name-only --diff-filter="$filter" HEAD
}

mapfile -t TRACKED < <(collect_names ACMRT | sort -u)
mapfile -t DELETED < <(collect_names D | sort -u)
mapfile -t UNTRACKED < <(git ls-files --others --exclude-standard | sort -u)

changed_lines() {
  local file="$1" n
  n=$( {
        [[ -n "$MB" ]] && git diff --numstat "$MB" HEAD -- "$file"
        git diff --numstat HEAD -- "$file"
      } 2>/dev/null | awk '$1 ~ /^[0-9]+$/ && $2 ~ /^[0-9]+$/ { s += $1 + $2 } END { print s + 0 }')
  [[ -z "$n" || "$n" == "0" ]] && n=0
  printf '%s\n' "$n"
}

INCLUDED=()
EXCLUDED_COUNT=0
SKIPPED_FILE=()
SKIPPED_REASON=()
SKIPPED_LINES=()

consider() {
  local file="$1" untracked="$2" lines
  [[ -f "$file" ]] || return 0
  if psr_is_excluded "$file"; then
    EXCLUDED_COUNT=$((EXCLUDED_COUNT + 1))
    return 0
  fi
  if [[ "$untracked" == "yes" ]]; then
    lines=$(wc -l < "$file" | tr -d ' ')
  else
    lines=$(changed_lines "$file")
  fi
  if (( lines > MAX_LINES )); then
    SKIPPED_FILE+=("$file"); SKIPPED_REASON+=("too-large"); SKIPPED_LINES+=("$lines")
    return 0
  fi
  INCLUDED+=("$file")
}

for f in "${TRACKED[@]:-}";   do [[ -n "$f" ]] && consider "$f" no;  done
for f in "${UNTRACKED[@]:-}"; do [[ -n "$f" ]] && consider "$f" yes; done

mapfile -t INCLUDED < <(printf '%s\n' "${INCLUDED[@]:-}" | grep -v '^$' | sort -u)

case "$FORMAT" in
  list)
    printf '%s\n' "${INCLUDED[@]:-}"
    ;;
  diff)
    [[ ${#INCLUDED[@]} -eq 0 ]] && exit 0
    [[ -n "$MB" ]] && git diff "$MB" HEAD -- "${INCLUDED[@]}"
    git diff HEAD -- "${INCLUDED[@]}"
    for f in "${UNTRACKED[@]:-}"; do
      [[ -n "$f" ]] || continue
      printf '%s\n' "${INCLUDED[@]}" | grep -qxF "$f" || continue
      git --no-pager diff --no-index -- /dev/null "$f" || true
    done
    ;;
  json)
    skipped_json='[]'
    if (( ${#SKIPPED_FILE[@]} > 0 )); then
      skipped_json=$(
        for i in "${!SKIPPED_FILE[@]}"; do
          jq -nc --arg f "${SKIPPED_FILE[$i]}" --arg r "${SKIPPED_REASON[$i]}" \
                 --argjson l "${SKIPPED_LINES[$i]}" '{file:$f, reason:$r, lines:$l}'
        done | jq -sc '.'
      )
    fi
    jq -n \
      --arg base "$BASE_REF" \
      --arg merge_base "${MB:-}" \
      --arg head_sha "$(git rev-parse HEAD)" \
      --arg branch "$(git rev-parse --abbrev-ref HEAD)" \
      --arg dirty_hash "$(psr_dirty_hash)" \
      --arg scope "$SCOPE" \
      --argjson files "$(printf '%s\n' "${INCLUDED[@]:-}" | grep -v '^$' | jq -Rsc 'split("\n") | map(select(length > 0))')" \
      --argjson deleted "$(printf '%s\n' "${DELETED[@]:-}" | grep -v '^$' | jq -Rsc 'split("\n") | map(select(length > 0))')" \
      --argjson skipped "$skipped_json" \
      --argjson excluded_count "$EXCLUDED_COUNT" \
      '{base:$base, merge_base:$merge_base, branch:$branch, head_sha:$head_sha,
        dirty_hash:$dirty_hash, scope:$scope, file_count:($files|length),
        files:$files, deleted:$deleted, skipped:$skipped, excluded_count:$excluded_count}'
    ;;
  *)
    echo "collect-diff.sh: --format must be json, list or diff" >&2; exit 64 ;;
esac
