#!/usr/bin/env bash
# Shared helpers for the pr-self-review scripts.
#
# NEVER `set -e` here: `git diff` and `git diff --no-index` exit 1 on difference,
# and every caller relies on that exit code being survivable.
set -uo pipefail

PSR_DIR="${PSR_DIR:-.claude/pr-self-review}"
PSR_SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Repo root, so the scripts work from any cwd (the hook runs from the session cwd).
psr_repo_root() { git rev-parse --show-toplevel 2>/dev/null; }

psr_die() { printf '%s\n' "$*" >&2; exit 1; }

psr_need() {
  command -v "$1" >/dev/null 2>&1 || psr_die "pr-self-review: \`$1\` is required but not on PATH."
}

psr_now() { date -u +%Y-%m-%dT%H:%M:%SZ; }

# Resolve the base ref: origin/main, then main, then HEAD (degraded).
# Prints "<ref>\t<sha>\t<mode>".
psr_base() {
  local ref sha
  for ref in origin/main main; do
    if git rev-parse --verify --quiet "$ref" >/dev/null 2>&1; then
      sha="$(git merge-base HEAD "$ref" 2>/dev/null)"
      if [ -n "$sha" ]; then printf '%s\t%s\t%s\n' "$ref" "$sha" "merge-base"; return 0; fi
    fi
  done
  printf '%s\t%s\t%s\n' "HEAD" "$(git rev-parse HEAD)" "head-only"
}
