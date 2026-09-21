#!/usr/bin/env bash
# Hashes the review-relevant diff for the current branch, so a verdict can be cached
# and correctly invalidated when the diff changes. See gate.md for how the result is used.
#
# Usage: diff-hash.sh [base-ref]   (default base: main)
#
# Scope matches SKILL.md Step 0: committed diff since the merge-base with $BASE_REF,
# plus uncommitted (staged/unstaged/untracked) changes, excluding generated/do-not-touch
# paths (migrations, lock files).
set -euo pipefail

BASE_REF="${1:-main}"
if ! git rev-parse --verify "$BASE_REF" >/dev/null 2>&1; then
  BASE_REF="origin/$BASE_REF"
fi

MERGE_BASE="$(git merge-base "$BASE_REF" HEAD)"

EXCLUDE=(
  ':(exclude)server/src/db/migrations/**'
  ':(exclude)**/pnpm-lock.yaml'
  ':(exclude)**/package-lock.json'
)

UNTRACKED_BLOB=""
while IFS= read -r f; do
  [ -n "$f" ] && [ -f "$f" ] || continue
  UNTRACKED_BLOB+="UNTRACKED:${f}
$(cat "$f")
"
done < <(git status --porcelain=v1 | awk '$1 == "??" {print substr($0, 4)}')

COMBINED="$(
  {
    git diff "$MERGE_BASE"...HEAD -- . "${EXCLUDE[@]}"
    git diff HEAD -- . "${EXCLUDE[@]}"
    printf '%s' "$UNTRACKED_BLOB"
  } 2>/dev/null
)"

if [ -z "$COMBINED" ]; then
  echo "EMPTY"
  exit 0
fi

printf '%s' "$COMBINED" | sha256sum | awk '{print $1}'
