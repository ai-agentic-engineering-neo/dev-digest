#!/usr/bin/env bash
# Deterministic critical checks (no LLM). Prints JSON array of findings on stdout; exit 0 always.
# Finding: {skill:"guard", severity:"critical", file, line, rule, problem, scenario, fix}
set -uo pipefail
cd "$(git rev-parse --show-toplevel)"
S="$(dirname "$0")"
BASE=$(git merge-base main HEAD 2>/dev/null || git rev-parse HEAD)
ALL=$("$S/changed-files.sh" --all)
OUT=$(mktemp); trap 'rm -f "$OUT"' EXIT
add() { jq -nc --arg file "$1" --arg rule "$2" --arg problem "$3" --arg fix "$4" \
  '{skill:"guard",severity:"critical",file:$file,line:1,rule:$rule,problem:$problem,scenario:$problem,fix:$fix}' >> "$OUT"; }
has() { echo "$ALL" | grep -qx "$1"; }

# 1. lock file changed without its package.json
for pair in client/pnpm-lock.yaml:client/package.json server/pnpm-lock.yaml:server/package.json \
            reviewer-core/package-lock.json:reviewer-core/package.json e2e/package-lock.json:e2e/package.json; do
  lock=${pair%%:*}; pkg=${pair##*:}
  if has "$lock" && ! has "$pkg"; then
    add "$lock" "lockfile-hand-edit" "$lock changed but $pkg did not: lock files must only change via the package manager." "git checkout $BASE -- $lock (or change package.json and run pnpm/npm install)"
  fi
done

# 2. migrations journal: history is append-only
J=server/src/db/migrations/meta/_journal.json
if has "$J"; then
  if git diff "$BASE" -- "$J" | grep -E '^-[^-]' | grep -Ev '^-\s*[\]\}],?\s*$' | grep -qE '"(idx|tag|when|version|dialect|breakpoints)"'; then
    add "$J" "journal-not-append-only" "Existing entries in $J were modified or removed." "Restore the file and re-run pnpm db:generate; resolve conflicts by appending."
  fi
fi

# 3. vendor/shared copies out of sync for touched files
for f in $ALL; do
  case "$f" in
    client/src/vendor/shared/*|server/src/vendor/shared/*|reviewer-core/src/vendor/shared/*)
      rel=${f#*/src/vendor/shared/}
      for m in client server reviewer-core; do
        o="$m/src/vendor/shared/$rel"
        [ "$o" = "$f" ] && continue
        [ -f "$o" ] && ! diff -q "$f" "$o" >/dev/null && add "$f" "vendor-shared-drift" "$f differs from its duplicate $o." "Apply the same edit to every copy of vendor/shared/$rel."
      done;;
  esac
done

# 4. architecture (dependency-cruiser) + typecheck
if echo "$ALL" | grep -qE '^(server|reviewer-core)/'; then
  o=$(cd server && pnpm arch 2>&1) || add "server" "dependency-rule" "pnpm arch failed: $(echo "$o" | tail -5 | tr '\n' ' ')" "Fix the import (do not regenerate the baseline)."
fi
for m in client server; do
  if echo "$ALL" | grep -q "^$m/"; then
    o=$(cd $m && pnpm typecheck 2>&1) || add "$m" "typecheck" "pnpm typecheck failed in $m: $(echo "$o" | tail -5 | tr '\n' ' ')" "Fix the type errors."
  fi
done

jq -s '.' "$OUT"
