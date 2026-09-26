#!/usr/bin/env bash
# The architecture fitness checks, run by subtraction — the mechanical half of
# architecture-reviewer's Step 3, so the model only reads the hits.
#
#   scripts/fitness-greps.sh              uncommitted change: working tree vs HEAD
#   scripts/fitness-greps.sh <base> <head> a commit range
#
# Source of truth for the patterns and the method: .claude/skills/pr-self-review/greps.md
# (patterns, "compare by (file, normalised match), never by line number",
# scoping table) and routing.md § Vendored-contract twin check. The
# reviewer-core purity pattern is architecture-reviewer.md Step 3.4. If a
# pattern changes there, change it here.
#
# Output: one row per check (before → after, new hits), then every new hit with
# its class from greps.md § Scoping a new hit:
#   A-file → WARNING · M-file → SUGGESTION · test/fixture → SUGGESTION ·
#   not in the diff → drift (never blocks) · onion-13-tenancy-guard on an A-file → CRITICAL?
# A hit is evidence, not a finding: two onion rules are heuristics with known
# benign hits, and a comment can match. Read every hit before reporting it.
# Read-only: writes nothing. Exit 0 always.
set -uo pipefail

ROOT=$(git rev-parse --show-toplevel)
cd "$ROOT"

if [ $# -eq 2 ]; then
  BEFORE=$1; AFTER=$2; LABEL="$1..$2"
  STATUS=$(git diff --name-status -M "$BEFORE" "$AFTER")
elif [ $# -eq 0 ]; then
  BEFORE=HEAD; AFTER=WORKTREE; LABEL="working tree vs HEAD"
  STATUS=$( { git diff --name-status -M HEAD; git ls-files -o --exclude-standard | sed 's/^/A\t/'; } )
else
  echo "usage: scripts/fitness-greps.sh [<base> <head>]" >&2; exit 2
fi

# path → status (A/M/D/R); for a rename the NEW path carries R.
FILE_STATUS=$(printf '%s\n' "$STATUS" | awk -F'\t' 'NF >= 2 { s = substr($1, 1, 1); p = (s == "R" || s == "C") ? $3 : $2; print p "\t" s }')
touched() { printf '%s\n' "$FILE_STATUS" | awk -F'\t' -v pre="$1" 'index($1, pre) == 1 { f = 1 } END { exit f ? 0 : 1 }'; }

# hits <rev|WORKTREE> <mode: n|l|L> <pattern> <pathspec...>  → "file<TAB>normalised text" per hit
hits() {
  local rev=$1 mode=$2 pat=$3; shift 3
  local out
  if [ "$rev" = WORKTREE ]; then
    out=$(git grep --untracked "-$mode" -E "$pat" -- "$@" 2>/dev/null)
  else
    out=$(git grep "-$mode" -E "$pat" "$rev" -- "$@" 2>/dev/null | sed "s|^$rev:||")
  fi
  if [ "$mode" = n ]; then
    printf '%s\n' "$out" | awk 'NF { f = $0; sub(/:.*/, "", f); r = $0; sub(/^[^:]*:/, "", r); ln = r; sub(/:.*/, "", ln); t = r; sub(/^[^:]*:/, "", t); gsub(/[[:space:]]+/, " ", t); print f "\t" ln "\t" t }'
  else
    printf '%s\n' "$out" | awk 'NF { print $0 "\t-\t(file)" }'
  fi
}

TOTAL_NEW=0
REPORT=""

# check <id> <mode> <pattern> <pathspec...>
check() {
  local id=$1 mode=$2 pat=$3; shift 3
  local before after new nb na nn
  before=$(hits "$BEFORE" "$mode" "$pat" "$@")
  after=$(hits "$AFTER" "$mode" "$pat" "$@")
  # multiset difference on (file, text): line numbers are ignored
  new=$(awk -F'\t' 'NR == FNR { if (NF) c[$1 FS $3]++; next } NF { k = $1 FS $3; if (c[k] > 0) c[k]--; else print }' \
          <(printf '%s\n' "$before") <(printf '%s\n' "$after"))
  nb=$(printf '%s\n' "$before" | awk 'NF' | wc -l | tr -d ' ')
  na=$(printf '%s\n' "$after" | awk 'NF' | wc -l | tr -d ' ')
  nn=$(printf '%s\n' "$new" | awk 'NF' | wc -l | tr -d ' ')
  local verdict=pass; [ "$nn" -gt 0 ] && verdict=regression
  printf '%-32s %-10s %4s → %-4s new %s\n' "$id" "$verdict" "$nb" "$na" "$nn"
  if [ "$nn" -gt 0 ]; then
    TOTAL_NEW=$((TOTAL_NEW + nn))
    # FILE_STATUS goes through ENVIRON: BSD awk rejects a newline in a -v value.
    REPORT+=$(printf '%s\n' "$new" | FS_DATA="$FILE_STATUS" awk -F'\t' -v id="$id" '
      BEGIN { n = split(ENVIRON["FS_DATA"], rows, "\n"); for (i = 1; i <= n; i++) { split(rows[i], kv, "\t"); st[kv[1]] = kv[2] } }
      NF {
        s = ($1 in st) ? st[$1] : ""
        if ($1 ~ /(\.test\.|(^|\/)test\/|(^|\/)fixtures\/)/ && s != "") cls = "SUGGESTION (test/fixture)"
        else if (s == "A" && id == "onion-13-tenancy-guard") cls = "CRITICAL? (A-file; read it — §7 heuristic)"
        else if (s == "A") cls = "WARNING (A-file)"
        else if (s == "M" || s == "R") cls = "SUGGESTION (" s "-file)"
        else cls = "drift (not in the diff — never blocks)"
        loc = ($2 == "-") ? $1 : $1 ":" $2
        printf "  %s  %s\n      %s\n      %s\n", id, cls, loc, $3
      }')
    REPORT+=$'\n'
  fi
}

echo "fitness-greps · $LABEL"
printf '%-32s %-10s %s\n' "check" "result" "before → after"

if touched server/src/; then
  check onion-13-db-in-boundary       n 'drizzle-orm'                      ':(glob)server/src/modules/*/routes.ts'
  check onion-13-framework-in-service n "from 'fastify"                    ':(glob)server/src/modules/*/service.ts'
  check onion-13-rowtype-leak         n '\$inferSelect'                    ':(glob)server/src/modules/*/service.ts'
  check onion-13-cross-module-reach   n "from '\.\./[a-z-]+/repository"    'server/src/modules'
  check onion-13-config-bypass        n 'process\.env'                     'server/src' ':(exclude)server/src/platform/config.ts' ':(exclude)server/src/adapters/secrets'
  check onion-13-tenancy-guard        L 'workspaceId'                      ':(glob)server/src/modules/*/repository.ts'
else
  echo "(server/src not in the change — onion-13 checks not run)"
fi

if touched client/src/; then
  check fe-15-deep-relatives          n '\.\./\.\./\.\.'                   'client/src'
  check fe-15-fetch-in-ui             n '[^a-zA-Z.]fetch\('                ':(glob)client/src/app/**/*.tsx' ':(glob)client/src/components/**/*.tsx'
  check fe-15-wildcard-barrels        l 'export \*'                        'client/src'
  # junk drawer is a path check (greps.md): files or dirs named utils / utils.ts
  if [ "$AFTER" = WORKTREE ]; then JD_AFTER=$( { git ls-files -- client/src; git ls-files -o --exclude-standard -- client/src; } )
  else JD_AFTER=$(git ls-tree -r --name-only "$AFTER" -- client/src); fi
  JD_BEFORE=$(git ls-tree -r --name-only "$BEFORE" -- client/src)
  JD_NEW=$(awk 'NR == FNR { b[$0]; next } !($0 in b)' <(printf '%s\n' "$JD_BEFORE" | awk '/(^|\/)utils(\.ts|\/)/') <(printf '%s\n' "$JD_AFTER" | awk '/(^|\/)utils(\.ts|\/)/'))
  if [ -n "$JD_NEW" ]; then
    printf '%-32s %-10s new %s\n' fe-15-junk-drawer regression "$(printf '%s\n' "$JD_NEW" | wc -l | tr -d ' ')"
    REPORT+=$(printf '%s\n' "$JD_NEW" | awk 'NF { printf "  fe-15-junk-drawer  WARNING\n      %s\n", $0 }')$'\n'
  else
    printf '%-32s %-10s\n' fe-15-junk-drawer pass
  fi
else
  echo "(client/src not in the change — fe-15 checks not run)"
fi

if touched reviewer-core/src/; then
  check reviewer-core-purity          n "from '(pg|postgres|drizzle-orm[^']*|simple-git|@octokit/[^']*|node:fs[^']*|fs|fs/promises|node:child_process|child_process)'" 'reviewer-core/src'
fi

# Vendored twin (routing.md): every changed <side>/src/vendor/shared/<rel> needs its mirror in the diff.
TWIN=$(printf '%s\n' "$FILE_STATUS" | awk -F'\t' '
  $1 ~ /^(server|client)\/src\/vendor\/shared\// { rel = $1; side = rel; sub(/\/.*/, "", side); sub(/^(server|client)\/src\/vendor\/shared\//, "", rel); seen[side "|" rel] = 1; rels[rel] = 1 }
  END { for (r in rels) { if (!(("server|" r) in seen)) print "client/src/vendor/shared/" r " changed, server/src/vendor/shared/" r " did not"; if (!(("client|" r) in seen)) print "server/src/vendor/shared/" r " changed, client/src/vendor/shared/" r " did not" } }')
if [ -n "$TWIN" ]; then
  printf '%-32s %-10s\n' vendored-twin regression
  REPORT+=$(printf '%s\n' "$TWIN" | awk 'NF { printf "  vendored-twin  CRITICAL (routing.md synthetic finding)\n      %s\n", $0 }')$'\n'
else
  printf '%-32s %-10s\n' vendored-twin pass
fi

# Module registration (server/AGENTS.md): a new server/src/modules/<name>/ must appear in modules/index.ts.
NEW_MODULES=$(printf '%s\n' "$FILE_STATUS" | awk -F'\t' '$2 == "A" && $1 ~ /^server\/src\/modules\/[^\/_][^\/]*\// { m = $1; sub(/^server\/src\/modules\//, "", m); sub(/\/.*/, "", m); print m }' | sort -u)
UNREG=""
for m in $NEW_MODULES; do
  if [ "$AFTER" = WORKTREE ]; then IDX=$(cat server/src/modules/index.ts 2>/dev/null); else IDX=$(git show "$AFTER:server/src/modules/index.ts" 2>/dev/null); fi
  if git cat-file -e "$BEFORE:server/src/modules/$m" 2>/dev/null; then continue; fi
  printf '%s' "$IDX" | awk -v m="$m" 'index($0, "./" m "/") { f = 1 } END { exit f ? 0 : 1 }' || UNREG+="$m "
done
if [ -n "$UNREG" ]; then
  printf '%-32s %-10s %s\n' module-registration regression "$UNREG"
  REPORT+="  module-registration  WARNING  not imported in server/src/modules/index.ts: $UNREG"$'\n'
elif [ -n "$NEW_MODULES" ]; then
  printf '%-32s %-10s %s\n' module-registration pass "$(echo $NEW_MODULES)"
fi

echo
if [ -n "$REPORT" ]; then
  echo "New hits — read each one before reporting it:"
  printf '%s' "$REPORT"
else
  echo "No new hits."
fi
exit 0
