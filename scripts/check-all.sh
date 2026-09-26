#!/usr/bin/env bash
# The package checks CI runs, in one command, with a ledger keyed by the state
# of the working tree — so a tree that has already been checked is not checked
# again by the next agent in the pipeline.
#
#   scripts/check-all.sh                     all packages, reuse the ledger
#   scripts/check-all.sh --force             re-run everything
#   scripts/check-all.sh --pkg server,client only these packages
#   scripts/check-all.sh --no-it             skip the server .it.test suite
#
# Checks (the same commands as .github/workflows/*.yml):
#   reviewer-core  npm run typecheck · npm test
#   server         pnpm typecheck · vitest (unit) · vitest .it.test (Docker)
#   client         pnpm typecheck · pnpm test
# The .it.test suite runs through scripts/hermetic.sh — never against the real
# provider keys this machine may store (server/INSIGHTS.md, 2026-09-24). Without
# Docker it is recorded as "skipped", never "pass" (the tests self-skip).
# e2e is not here: it needs agent-browser and a running stack (e2e/README.md).
#
# Ledger: <git dir>/devdigest/checks/<tree>/<pkg>-<check>.{status,log}. <tree>
# is a hash of the committed state, the diff and every untracked, non-ignored
# file under reviewer-core/, server/, client/ and the two scripts — so any edit
# there (including to this script) produces a new key, and an edit to docs,
# specs or .claude/ does not. A reused result is printed with "(reused)" and the
# time it was recorded.
# Who re-runs: the implementer and plan-verifier (--force — its evidence must be
# its own); everyone else reuses. See .claude/agents/README.md § Token budget.
#
# Exit status: 1 if any check failed, else 0. "skipped" does not fail the run
# but is printed, so nobody mistakes it for a pass.
set -uo pipefail

ROOT=$(git rev-parse --show-toplevel)
cd "$ROOT"

FORCE=0
RUN_IT=1
PKGS="reviewer-core,server,client"
while [ $# -gt 0 ]; do
  case "$1" in
    --force) FORCE=1 ;;
    --no-it) RUN_IT=0 ;;
    --pkg) shift; PKGS=${1:?--pkg needs a comma-separated list} ;;
    --pkg=*) PKGS=${1#--pkg=} ;;
    -h|--help) sed -n '2,32p' "$0"; exit 0 ;;
    *) echo "unknown option: $1 (see --help)" >&2; exit 2 ;;
  esac
  shift
done

# Only what the checks can depend on: the three packages and the two scripts.
# Editing docs, specs or .claude/ does not invalidate a green ledger.
KEY_PATHS=(reviewer-core server client scripts/check-all.sh scripts/hermetic.sh)
tree_key() {
  {
    for p in "${KEY_PATHS[@]}"; do git rev-parse "HEAD:$p" 2>/dev/null || echo "absent:$p"; done
    git diff HEAD --binary -- "${KEY_PATHS[@]}"
    git ls-files -o --exclude-standard -z -- "${KEY_PATHS[@]}" | while IFS= read -r -d '' f; do
      printf '%s\n' "$f"
      shasum "$f" | cut -d' ' -f1
    done
  } | shasum | cut -c1-16
}

TREE=$(tree_key)
LEDGER="$(git rev-parse --git-dir)/devdigest/checks/$TREE"
mkdir -p "$LEDGER"
echo "check-all · tree $TREE · ledger $LEDGER"

FAILED=0

# summarize <log>: the one line worth reading — vitest's "Tests" line, or tsc's error count.
summarize() {
  local line
  line=$(awk '/^[[:space:]]*Tests[[:space:]]+[0-9]/ { sub(/^[[:space:]]+/, ""); gsub(/[[:space:]]+/, " "); l = $0 } END { print l }' "$1")
  if [ -z "$line" ]; then
    local n
    n=$(awk '/error TS[0-9]+/ { c++ } END { print c + 0 }' "$1")
    if [ "$n" -gt 0 ]; then line="$n TypeScript error(s)"; else line="ok"; fi
  fi
  printf '%s' "$line"
}

# run <pkg> <check> <dir> <command...>
run() {
  local pkg=$1 check=$2 dir=$3; shift 3
  local base="$LEDGER/$pkg-$check"
  if [ "$FORCE" = 0 ] && [ -f "$base.status" ]; then
    IFS=$'\t' read -r status code summary stamp < "$base.status"
    printf '%-7s %-14s %-10s exit %-3s %s  (reused, %s)\n' "$(echo "$status" | tr a-z A-Z)" "$pkg" "$check" "$code" "$summary" "$stamp"
    [ "$status" = fail ] && FAILED=1
    return
  fi
  local code status summary
  (cd "$ROOT/$dir" && "$@") > "$base.log" 2>&1
  code=$?
  summary=$(summarize "$base.log")
  if [ "$code" -ne 0 ]; then status=fail; FAILED=1; else status=pass; fi
  # A green vitest run in which every test skipped is not a pass.
  case "$summary" in
    *skipped*) case "$summary" in *passed*) ;; *) [ "$status" = pass ] && status=skipped ;; esac ;;
  esac
  printf '%s\t%s\t%s\t%s\n' "$status" "$code" "$summary" "$(date '+%Y-%m-%d %H:%M')" > "$base.status"
  printf '%-7s %-14s %-10s exit %-3s %s\n' "$(echo "$status" | tr a-z A-Z)" "$pkg" "$check" "$code" "$summary"
  [ "$status" = fail ] && tail -n 30 "$base.log" | sed 's/^/        | /'
}

skip() { # <pkg> <check> <reason>
  printf 'SKIPPED %-14s %-10s %s\n' "$1" "$2" "$3"
}

has_pkg() { case ",$PKGS," in *",$1,"*) return 0 ;; *) return 1 ;; esac; }

if has_pkg reviewer-core; then
  run reviewer-core typecheck reviewer-core npm run typecheck
  run reviewer-core test      reviewer-core npm test
fi

if has_pkg server; then
  run server typecheck server pnpm typecheck
  run server unit      server pnpm exec vitest run --exclude '**/*.it.test.ts'
  if [ "$RUN_IT" = 0 ]; then
    skip server it "--no-it"
  elif ! docker info >/dev/null 2>&1; then
    skip server it "Docker is not running — the suite would self-skip; not a pass"
  else
    run server it server "$ROOT/scripts/hermetic.sh" pnpm exec vitest run .it.test
  fi
fi

if has_pkg client; then
  run client typecheck client pnpm typecheck
  run client test      client pnpm test
fi

exit "$FAILED"
