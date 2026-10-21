#!/usr/bin/env bash
#
# route.sh — map changed files to the review lanes and skills that apply.
# The table in reference/routing.md is the human-readable twin of the rules
# below; keep them in sync.
#
#   route.sh [changed-files.sh mode flags]          → TSV: path<TAB>package<TAB>skills (comma-separated)
#   route.sh ... --lanes                            → one block per lane: package, skills, files
#   route.sh ... --json                             → {"lanes":[{package,skills:[],files:[]}],"excluded":[{path,reason}]}
#
# Reads the file list from changed-files.sh with the same mode flags, or from
# stdin when `-` is given (one path per line).

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

OUT="tsv"
MODE_FLAGS=()
FROM_STDIN=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --lanes) OUT="lanes"; shift ;;
    --json)  OUT="json"; shift ;;
    -)       FROM_STDIN=1; shift ;;
    --base)  MODE_FLAGS+=("$1" "$2"); shift 2 ;;
    *)       MODE_FLAGS+=("$1"); shift ;;
  esac
done

# Package (lane) of a path: first segment when it is one of the four packages.
package_of() {
  case "$1" in
    server/*)        echo server ;;
    client/*)        echo client ;;
    reviewer-core/*) echo reviewer-core ;;
    e2e/*)           echo e2e ;;
    *)               echo none ;;
  esac
}

# Files no skill lane reads. precheck.sh still checks most of them
# (lockfiles, migrations, vendored copies, do-not-touch paths).
excluded_reason() {
  case "$1" in
    */pnpm-lock.yaml|*/package-lock.json)        echo "lockfile: package manager owns it" ;;
    server/src/db/migrations/*)                  echo "generated migration: reviewed by precheck only" ;;
    client/src/vendor/shared/*)                  echo "contract copy: precheck compares it to server/src/vendor/shared" ;;
    client/src/vendor/ui/*)                      echo "design system: precheck flags it, no skill lane" ;;
    *.md|*.mdc|*.txt)                            echo "docs: no code lane" ;;
    .github/*|.claude/*|skills-lock.json)        echo "tooling: no code lane" ;;
    *.json|*.yml|*.yaml|*.toml|*.mjs|*.cjs)      echo "config: no code lane" ;;
    *.sql|*.snap|*.svg|*.png|*.ico|*.lock)       echo "non-source: no code lane" ;;
    *) echo "" ;;
  esac
}

# Skills for a path, one per line. Rules accumulate: a file can hit several.
skills_of() {
  local p="$1"
  case "$p" in
    client/src/*.test.tsx|client/src/*.test.ts)
      echo react-testing-library ;;
    client/src/*.tsx)
      echo react-frontend-architecture; echo react-best-practices; echo next-best-practices ;;
    client/src/app/*/route.ts|client/src/middleware.ts)
      echo next-best-practices ;;
    client/src/*.ts)
      echo react-frontend-architecture ;;
  esac
  case "$p" in
    server/src/modules/*/routes.ts|server/src/app.ts|server/src/server.ts|server/src/modules/_shared/*)
      echo fastify-best-practices; echo onion-architecture-backend ;;
    server/src/modules/*/repository.ts|server/src/modules/*/repository/*|server/src/db/*)
      echo drizzle-orm-patterns; echo postgresql-table-design; echo onion-architecture-backend ;;
    server/src/modules/*|server/src/adapters/*|server/src/platform/*)
      echo onion-architecture-backend ;;
    server/src/vendor/shared/*)
      echo zod ;;
  esac
  case "$p" in
    reviewer-core/src/*)
      echo zod ;;
  esac
  case "$p" in
    *.ts|*.tsx)
      echo typescript-expert; echo security ;;
  esac
}

if [[ $FROM_STDIN -eq 1 ]]; then
  mapfile -t FILES < <(sed '/^$/d')
else
  mapfile -t FILES < <("$HERE/changed-files.sh" "${MODE_FLAGS[@]}" list | awk -F'\t' '$1 != "D" {print $2}')
fi

# path<TAB>package<TAB>skills   and   path<TAB>reason  (excluded)
ROUTED=()
EXCLUDED=()
for f in "${FILES[@]}"; do
  reason="$(excluded_reason "$f")"
  if [[ -n "$reason" ]]; then EXCLUDED+=("$f"$'\t'"$reason"); continue; fi
  skills="$(skills_of "$f" | awk '!seen[$0]++' | paste -sd, -)"
  if [[ -z "$skills" ]]; then EXCLUDED+=("$f"$'\t'"no rule matched: review by hand if it is source"); continue; fi
  ROUTED+=("$f"$'\t'"$(package_of "$f")"$'\t'"$skills")
done

case "$OUT" in
  tsv)
    printf '%s\n' "${ROUTED[@]:-}" | sed '/^$/d'
    if [[ ${#EXCLUDED[@]} -gt 0 ]]; then
      echo
      echo "# excluded from skill lanes"
      printf '%s\n' "${EXCLUDED[@]}"
    fi
    ;;
  lanes)
    for pkg in server client reviewer-core e2e none; do
      lane=$(printf '%s\n' "${ROUTED[@]:-}" | awk -F'\t' -v p="$pkg" '$2==p')
      [[ -n "$lane" ]] || continue
      echo "## lane: $pkg"
      echo "skills: $(printf '%s\n' "$lane" | cut -f3 | tr ',' '\n' | awk '!seen[$0]++' | paste -sd, -)"
      echo "files:"
      printf '%s\n' "$lane" | awk -F'\t' '{print "  " $1 "  [" $3 "]"}'
      echo
    done
    if [[ ${#EXCLUDED[@]} -gt 0 ]]; then
      echo "## excluded from skill lanes (precheck still covers them)"
      printf '%s\n' "${EXCLUDED[@]}" | awk -F'\t' '{print "  " $1 "  — " $2}'
    fi
    ;;
  json)
    {
      printf '%s\n' "${ROUTED[@]:-}" | sed '/^$/d' | jq -R -s -c '
        split("\n") | map(select(length>0) | split("\t") | {path:.[0], package:.[1], skills:(.[2]|split(","))})
        | group_by(.package) | map({package:.[0].package, skills:(map(.skills)|add|unique), files:(map({path,skills}))})'
      printf '%s\n' "${EXCLUDED[@]:-}" | sed '/^$/d' | jq -R -s -c '
        split("\n") | map(select(length>0) | split("\t") | {path:.[0], reason:.[1]})'
    } | jq -s '{lanes:.[0], excluded:.[1]}'
    ;;
esac
