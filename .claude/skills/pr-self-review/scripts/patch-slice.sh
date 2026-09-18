#!/usr/bin/env bash
#
# patch-slice.sh <agent> — print only the diff.patch hunks for that agent's files.
#
# Each reviewer gets its own slice, never the whole diff: an agent handed
# everything reviews files that are not its job and produces duplicates the
# merge step then throws away.
set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$SCRIPT_DIR/_lib.sh"
ROOT="$(psr_repo_root)" || psr_die "not a git repository"; cd "$ROOT" || exit 1
psr_need jq
AGENT="${1:?usage: patch-slice.sh <agent>}"
CS="$PSR_DIR/changeset.json"
[ -f "$CS" ] || psr_die "run collect-diff.sh first"

jq -e --arg a "$AGENT" '.agents[$a]' "$CS" >/dev/null 2>&1 \
  || psr_die "unknown agent '$AGENT'. Known: $(jq -r '.agents|keys|join(", ")' "$CS")"

jq -r --arg a "$AGENT" '.agents[$a].files[]' "$CS" > "$PSR_DIR/.slice-files"

# A file section runs from its `diff --git` (or the first `---`) to the next one.
awk -v list="$PSR_DIR/.slice-files" '
  BEGIN { while ((getline l < list) > 0) want[l] = 1 }
  /^diff --git / { keep = 0; p = $0; sub(/^diff --git a\/.* b\//, "", p); keep = (p in want) }
  /^--- / && !seen_git { }
  { if (keep) print }
' "$PSR_DIR/diff.patch"

# `git diff --no-index` output for untracked files has no `diff --git` header,
# so those sections are emitted separately.
awk -v list="$PSR_DIR/.slice-files" '
  BEGIN { while ((getline l < list) > 0) want[l] = 1 }
  /^diff --git / { skip_block = 1; keep = 0; next }
  /^--- / { hdr = $0; getline nxt
            p = nxt; sub(/^\+\+\+ b\//, "", p)
            keep = ((p in want) && (hdr ~ /\/dev\/null/))
            if (keep) { print hdr; print nxt }
            next }
  { if (keep) print }
' "$PSR_DIR/diff.patch"

rm -f "$PSR_DIR/.slice-files"
