#!/usr/bin/env bash
# Files that would land in the PR: branch vs merge-base(main) + staged + unstaged + untracked.
# Deleted files and generated/skip-listed files are dropped. Usage: changed-files.sh [--all]
#   --all  keep skip-listed files (guards need lock files etc.)
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
BASE=$(git merge-base main HEAD 2>/dev/null || git rev-parse HEAD)
{
  git diff --name-only --diff-filter=d "$BASE"
  git diff --name-only --diff-filter=d --cached
  git ls-files --others --exclude-standard
} | sort -u | while read -r f; do [ -f "$f" ] && echo "$f"; done | {
  if [ "${1:-}" = "--all" ]; then cat; else
    grep -Ev '(\.snap$|pnpm-lock\.yaml$|package-lock\.json$|\.dependency-cruiser-known-violations\.json$|server/src/db/migrations/meta/|^\.claude/\.pr-self-review/)' || true
  fi
}
