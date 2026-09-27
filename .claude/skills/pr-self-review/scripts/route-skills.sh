#!/usr/bin/env bash
# Map the collected files onto the skills in .claude/skills/.
#
#   route-skills.sh [--base <ref>] [--scope branch|working] [--files-from <path>|-]
#
# Rules live in ../rules/routing.md; this script is that table, executable.
# Output: JSON { lanes: [{skill, skill_file, file_count, files}], unrouted, totals }
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"

BASE=""
SCOPE=branch
FILES_FROM=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --base) BASE="$2"; shift 2 ;;
    --scope) SCOPE="$2"; shift 2 ;;
    --files-from) FILES_FROM="$2"; shift 2 ;;
    *) echo "route-skills.sh: unknown argument $1" >&2; exit 64 ;;
  esac
done

ROOT="$(psr_repo_root)" || { echo "route-skills.sh: not a git repository" >&2; exit 3; }
cd "$ROOT"

if [[ -n "$FILES_FROM" ]]; then
  if [[ "$FILES_FROM" == "-" ]]; then mapfile -t FILES; else mapfile -t FILES < "$FILES_FROM"; fi
else
  mapfile -t FILES < <("$SCRIPT_DIR/collect-diff.sh" --base "$BASE" --scope "$SCOPE" --format list)
fi

BASE_REF="$(psr_resolve_base "$BASE")" || BASE_REF=""
MB=""
[[ -n "$BASE_REF" && "$SCOPE" == "branch" ]] && MB="$(psr_merge_base "$BASE_REF")" || true

added_lines() {
  local file="$1"
  if git ls-files --error-unmatch "$file" >/dev/null 2>&1; then
    {
      [[ -n "$MB" ]] && git diff --unified=0 "$MB" HEAD -- "$file"
      git diff --unified=0 HEAD -- "$file"
    } 2>/dev/null | grep '^+' | grep -v '^+++' || true
  else
    cat "$file" 2>/dev/null || true
  fi
}

SECURITY_RE='dangerouslySetInnerHTML|innerHTML|child_process|execSync|spawn\(|\bexec\(|eval\(|new Function|Authorization|password|passwd|secret|token|apiKey|api_key|jwt|bcrypt|cookie|cors|helmet|\.query\.|\.body\.|\.params\.|redirect\(|upload'
TS_RE='(^|[^A-Za-z])any([^A-Za-z]|$)|as unknown as|as [A-Z]|@ts-(ignore|expect-error)|\binfer \b|\bkeyof \b|satisfies |declare module'

declare -A LANE
UNROUTED=()

add() { LANE["$1"]+="$2"$'\n'; }

for f in "${FILES[@]}"; do
  [[ -n "$f" ]] || continue
  matched=0

  # ---- client ---------------------------------------------------------------
  if [[ "$f" =~ ^client/.*\.(test|spec)\.(ts|tsx)$ ]]; then
    add react-testing-library "$f"; matched=1
  elif [[ "$f" =~ ^client/src/app/.*/(page|layout|route|loading|error|template|not-found|default)\.(ts|tsx)$ ]] \
    || [[ "$f" =~ ^client/src/app/[^/]+\.(ts|tsx)$ ]]; then
    add next-best-practices "$f"; add react-best-practices "$f"; add frontend-ui-architecture "$f"; matched=1
  elif [[ "$f" =~ ^client/.*\.tsx$ ]]; then
    add react-best-practices "$f"; add frontend-ui-architecture "$f"; matched=1
  elif [[ "$f" =~ ^client/src/.*\.ts$ ]]; then
    add frontend-ui-architecture "$f"; matched=1
  fi

  # ---- server ---------------------------------------------------------------
  if [[ "$f" =~ ^server/src/modules/[^/]+/routes\.ts$ ]]; then
    add fastify-best-practices "$f"; add onion-architecture "$f"; add security "$f"; add zod "$f"; matched=1
  elif [[ "$f" =~ ^server/src/platform/(sse|jobs|http)\.ts$ ]]; then
    add fastify-best-practices "$f"; add onion-architecture "$f"; matched=1
  elif [[ "$f" =~ ^server/src/modules/[^/]+/repository\.ts$ ]]; then
    add onion-architecture "$f"; add drizzle-orm-patterns "$f"; matched=1
  elif [[ "$f" =~ ^server/src/(modules|domain|adapters|platform)/ ]]; then
    add onion-architecture "$f"; matched=1
  fi

  if [[ "$f" =~ ^server/src/db/(schema|rows)\.ts$ ]] || [[ "$f" =~ ^server/src/db/migrations/ ]]; then
    add drizzle-orm-patterns "$f"; add postgresql-table-design "$f"; matched=1
  fi

  # ---- contracts (two copies) ------------------------------------------------
  if [[ "$f" =~ ^(server|client)/src/vendor/shared/ ]]; then
    add zod "$f"; add onion-architecture "$f"; matched=1
  fi

  # ---- reviewer-core ---------------------------------------------------------
  if [[ "$f" =~ ^reviewer-core/src/ ]]; then
    add onion-architecture "$f"; add typescript-expert "$f"; add zod "$f"; matched=1
  fi

  # ---- content triggers ------------------------------------------------------
  if [[ "$f" =~ \.(ts|tsx|js|jsx|mjs|cjs)$ ]]; then
    body="$(added_lines "$f")"
    if [[ -n "$body" ]] && grep -Eq "$SECURITY_RE" <<<"$body"; then
      add security "$f"; matched=1
    fi
    if [[ -n "$body" ]] && grep -Eq "$TS_RE" <<<"$body"; then
      add typescript-expert "$f"; matched=1
    fi
  fi
  if [[ "$f" =~ tsconfig.*\.json$ ]]; then
    add typescript-expert "$f"; matched=1
  fi

  (( matched == 0 )) && UNROUTED+=("$f")
done

lanes_json="[]"
if (( ${#LANE[@]} > 0 )); then
  lanes_json=$(
    for skill in "${!LANE[@]}"; do
      printf '%s' "${LANE[$skill]}" | grep -v '^$' | sort -u | jq -Rsc --arg s "$skill" \
        '{skill:$s, skill_file:(".claude/skills/" + $s + "/SKILL.md"),
          files:(split("\n") | map(select(length > 0)))}
         | .file_count = (.files | length)'
    done | jq -sc 'sort_by(-.file_count)'
  )
fi

jq -n \
  --argjson lanes "$lanes_json" \
  --argjson unrouted "$(printf '%s\n' "${UNROUTED[@]:-}" | grep -v '^$' | jq -Rsc 'split("\n") | map(select(length > 0))')" \
  --argjson total "${#FILES[@]}" \
  '{lanes:$lanes, unrouted:$unrouted,
    totals:{files:$total, lanes:($lanes|length),
            routed:($lanes | map(.files) | flatten | unique | length)}}'
