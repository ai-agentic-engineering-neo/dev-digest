#!/usr/bin/env bash
#
# precheck.sh — the deterministic half of a PR self review. Runs before any
# model call so that mechanical facts (does it compile, do tests pass, did a
# forbidden file change, is there a secret in the diff) come from tools, not
# from an LLM's opinion. Each failure is a finding; criticals block.
#
#   precheck.sh [mode flags] [--no-tests] [--no-toolchain] [--with-it]
#
#   mode flags      forwarded to changed-files.sh (--all | --staged | --branch | --base <ref>)
#   --no-tests      skip unit tests (keep typecheck, lint, lint:arch)
#   --no-toolchain  skip typecheck, lint, lint:arch and tests entirely (CI, where
#                   the per-package workflows already run them)
#   --with-it       server: run the full suite including *.it.test.ts (needs Postgres)
#
# Output: findings as JSON to .git/pr-self-review/precheck.json, tool logs under
# .git/pr-self-review/logs/, a summary on stdout. Exit 1 when any critical.
#
# Finding shape (same as the skill's LLM findings, so the report can merge them):
#   {severity, rule, file, line, summary, evidence, dismissable}
# `dismissable: true` marks pattern hits the reviewer may downgrade with a
# reason (a placeholder that looks like a key). Tool failures are never dismissable.

set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

OUT_DIR="$ROOT/.git/pr-self-review"
LOG_DIR="$OUT_DIR/logs"
mkdir -p "$LOG_DIR"
FINDINGS="$OUT_DIR/precheck.json"
: > "$FINDINGS.tmp"

MODE_FLAGS=()
RUN_TESTS=1
RUN_TOOLCHAIN=1
WITH_IT=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-tests) RUN_TESTS=0; shift ;;
    --no-toolchain) RUN_TOOLCHAIN=0; shift ;;
    --with-it) WITH_IT=1; shift ;;
    --base) MODE_FLAGS+=("$1" "$2"); shift 2 ;;
    *) MODE_FLAGS+=("$1"); shift ;;
  esac
done

# The system node on this machine is v14 and pnpm is not on PATH; the nvm
# Node 22 install is. Prefer it when present so the checks match CI.
if ! command -v pnpm >/dev/null 2>&1; then
  for d in "$HOME"/.nvm/versions/node/v22*/bin; do
    [[ -d "$d" ]] && export PATH="$d:$PATH" && break
  done
fi

finding() { # severity rule file line summary evidence [dismissable]
  jq -n -c --arg sev "$1" --arg rule "$2" --arg file "$3" --arg line "$4" \
        --arg summary "$5" --arg evidence "$6" --argjson dis "${7:-false}" \
    '{severity:$sev, rule:$rule, file:$file, line:(if $line=="" then null else ($line|tonumber) end), summary:$summary, evidence:$evidence, dismissable:$dis}' \
    >> "$FINDINGS.tmp"
}

# ---------------------------------------------------------------- change set
CHANGES="$("$HERE/changed-files.sh" "${MODE_FLAGS[@]}" list)"
paths_with_status() { printf '%s\n' "$CHANGES" | awk -F'\t' -v s="$1" 'index(s,$1) {print $2}'; }
ALL_PATHS="$(printf '%s\n' "$CHANGES" | cut -f2)"
has_path() { printf '%s\n' "$ALL_PATHS" | grep -qx -- "$1"; }

touched_packages() {
  printf '%s\n' "$ALL_PATHS" | awk -F/ '$1=="server"||$1=="client"||$1=="reviewer-core"||$1=="e2e" {print $1}' | sort -u
}
PACKAGES="$(touched_packages)"
# server type-checks reviewer-core's raw source, so a reviewer-core change is a server change too.
if printf '%s\n' "$PACKAGES" | grep -qx reviewer-core && ! printf '%s\n' "$PACKAGES" | grep -qx server; then
  PACKAGES="$(printf '%s\nserver\n' "$PACKAGES" | sort -u)"
fi

echo "pr-self-review precheck"
echo "$("$HERE/changed-files.sh" "${MODE_FLAGS[@]}" base | paste -sd' ' -)"
echo "files: $(printf '%s\n' "$ALL_PATHS" | sed '/^$/d' | wc -l)   packages: $(printf '%s' "$PACKAGES" | paste -sd, -)"
echo

# ---------------------------------------------------------------- do-not-touch
VENDORED_SKILLS="$(jq -r '.skills | keys[]' skills-lock.json 2>/dev/null || true)"
while IFS=$'\t' read -r status p; do
  [[ -n "$p" ]] || continue
  case "$p" in
    .claude/skills/*/*)
      skill="${p#.claude/skills/}"; skill="${skill%%/*}"
      if printf '%s\n' "$VENDORED_SKILLS" | grep -qx -- "$skill"; then
        finding critical do-not-touch "$p" "" "Vendored skill '$skill' edited by hand" "skills-lock.json pins it by hash; re-vendor instead of editing"
      fi ;;
    skills-lock.json)
      finding warning do-not-touch "$p" "" "skills-lock.json changed" "Fine only if a skill was re-vendored on purpose" ;;
    client/src/vendor/ui/*)
      finding warning do-not-touch "$p" "" "Design system file changed" "Allowed only when the task is about the design system; new components go on /showcase" ;;
    server/src/db/migrations/meta/_journal.json)
      # The journal legitimately changes when a new migration is generated.
      if [[ "$status" == "M" ]] && ! printf '%s\n' "$CHANGES" | grep -q $'^A\tserver/src/db/migrations/.*\.sql$'; then
        finding warning do-not-touch "$p" "" "Migration journal changed without a new migration file" "Only pnpm db:generate should write it"
      fi ;;
    server/src/db/migrations/*)
      if [[ "$status" == "M" || "$status" == "D" ]]; then
        finding critical do-not-touch "$p" "" "Committed migration rewritten or deleted" "Migrations are generated by pnpm db:generate and never rewritten; add a new one"
      fi ;;
    */pnpm-lock.yaml|*/package-lock.json)
      pkg="${p%%/*}"
      if ! has_path "$pkg/package.json"; then
        finding warning do-not-touch "$p" "" "Lockfile changed without $pkg/package.json" "Only the package manager writes lockfiles; confirm this came from an install, not a hand edit"
      fi ;;
    server/clones/*|e2e/test-results/*|.idea/*|*/node_modules/*|*/.next/*|*/dist/*|*.log|.env|.env.*|*/.env|*/.env.*)
      case "$p" in *.env.example|*/.env.example) continue ;; esac
      if [[ "$status" == "U" ]]; then
        finding warning do-not-touch "$p" "" "Runtime or local file is not git-ignored" "It shows up as untracked; add it to .gitignore rather than committing it"
      else
        finding critical do-not-touch "$p" "" "Runtime or local data tracked in the change set" "Never commit runtime data, env files, or build output"
      fi ;;
  esac
done <<< "$CHANGES"

# ---------------------------------------------------------------- contract copy
if [[ -d server/src/vendor/shared && -d client/src/vendor/shared ]]; then
  drift="$(diff -rq server/src/vendor/shared client/src/vendor/shared 2>&1 | grep -v '/node_modules/' || true)"
  if [[ -n "$drift" ]]; then
    while read -r line; do
      f="$(printf '%s' "$line" | grep -o 'server/src/vendor/shared/[^ ]*' | head -1)"
      [[ -n "$f" ]] || f="$(printf '%s' "$line" | grep -o 'client/src/vendor/shared/[^ ]*' | head -1)"
      rel="${f#server/src/vendor/shared/}"; rel="${rel#client/src/vendor/shared/}"
      if has_path "server/src/vendor/shared/$rel" || has_path "client/src/vendor/shared/$rel"; then
        finding critical contract-copy "${f:-server/src/vendor/shared}" "" "Contract copies differ in a file this change touches" "$line. Edit server/src/vendor/shared, then copy over client/src/vendor/shared"
      else
        finding warning contract-copy "${f:-server/src/vendor/shared}" "" "Contract copies already differ on the base branch (not introduced here)" "$line. Worth a separate fix; not this PR's fault"
      fi
    done <<< "$drift"
  fi
fi

# ---------------------------------------------------------------- secrets in added lines
# Walk the unified diff and keep new-file line numbers for '+' lines.
SECRET_RE='(sk-or-v1-[A-Za-z0-9]{8,}|sk-ant-[A-Za-z0-9_-]{8,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----|(OPENROUTER_API_KEY|ANTHROPIC_API_KEY|OPENAI_API_KEY|GITHUB_TOKEN)[[:space:]]*[:=][[:space:]]*["'"'"']?[A-Za-z0-9_-]{16,}|(api[_-]?key|secret|token|password)[[:space:]]*[:=][[:space:]]*["'"'"'][A-Za-z0-9_/+=-]{20,}["'"'"'])'
"$HERE/changed-files.sh" "${MODE_FLAGS[@]}" diff \
  | awk -v re="$SECRET_RE" '
      /^\+\+\+ / { f=$2; sub(/^b\//,"",f); next }
      /^@@/ { split($3,a,","); n=substr(a[1],2)+0; next }
      /^\+/ { line=substr($0,2); if (line ~ re && f != "/dev/null") printf "%s\t%d\t%s\n", f, n, line; n++; next }
      /^-/ { next }
      { n++ }' \
  | while IFS=$'\t' read -r f n line; do
      case "$f" in *.test.*|*/test/*|*/mocks.ts|*.md) sev=warning ;; *) sev=critical ;; esac
      finding "$sev" secret "$f" "$n" "Possible secret in added line" "$(printf '%s' "$line" | cut -c1-120)" true
    done

# ---------------------------------------------------------------- e2e flow naming
for p in $(paths_with_status "AMU" | grep '^e2e/specs/.*\.flow\.json$' || true); do
  base="$(basename "$p")"
  [[ "$base" =~ ^[0-9]{2}-[a-z0-9]+(-[a-z0-9]+)*\.flow\.json$ ]] || \
    finding warning naming "$p" "" "Flow file name is not NN-kebab-name.flow.json" "See e2e/CLAUDE.md"
done

# ---------------------------------------------------------------- toolchain
run_check() { # pkg name cmd...
  local pkg="$1" name="$2"; shift 2
  local log="$LOG_DIR/$pkg-$name.log"
  printf '  %-14s %-10s ' "$pkg" "$name"
  if (cd "$pkg" && "$@") > "$log" 2>&1; then
    echo "ok"
  else
    echo "FAIL  ($log)"
    finding critical "toolchain:$name" "$pkg" "" "$pkg: $name failed" "$(tail -n 25 "$log" | cut -c1-200 | tr '\n' '\n')"
  fi
}

if [[ $RUN_TOOLCHAIN -eq 1 && -n "$PACKAGES" ]]; then
  if ! command -v pnpm >/dev/null 2>&1; then
    echo "pnpm not on PATH; toolchain checks skipped (export PATH=~/.nvm/versions/node/v22.16.0/bin:\$PATH)"
    finding warning toolchain:missing "" "" "Toolchain checks skipped: pnpm not on PATH" "Run again with the nvm Node 22 bin on PATH"
  else
    echo "toolchain:"
    for pkg in $PACKAGES; do
      case "$pkg" in
        server)
          [[ -d reviewer-core/node_modules ]] || finding warning toolchain:deps "reviewer-core" "" "reviewer-core/node_modules missing" "server typecheck needs it: cd reviewer-core && npm ci"
          run_check server typecheck pnpm typecheck
          run_check server lint pnpm lint
          run_check server lint:arch pnpm lint:arch
          if [[ $RUN_TESTS -eq 1 ]]; then
            if [[ $WITH_IT -eq 1 ]]; then run_check server test pnpm test
            else run_check server test:unit pnpm exec vitest run --exclude '**/*.it.test.ts'; fi
          fi ;;
        client)
          run_check client typecheck pnpm typecheck
          run_check client lint pnpm lint
          [[ $RUN_TESTS -eq 1 ]] && run_check client test pnpm test ;;
        reviewer-core)
          run_check reviewer-core typecheck npm run typecheck
          run_check reviewer-core lint npm run lint
          [[ $RUN_TESTS -eq 1 ]] && run_check reviewer-core test npm test ;;
        e2e)
          run_check e2e typecheck npm run typecheck
          run_check e2e lint npm run lint ;;
      esac
    done
  fi
fi

# ---------------------------------------------------------------- summary
jq -s '.' "$FINDINGS.tmp" > "$FINDINGS" && rm -f "$FINDINGS.tmp"
crit="$(jq '[.[] | select(.severity=="critical")] | length' "$FINDINGS")"
warn="$(jq '[.[] | select(.severity=="warning")] | length' "$FINDINGS")"
echo
echo "precheck findings: $crit critical, $warn warning  → $FINDINGS"
jq -r '.[] | "  [\(.severity)] \(.rule)  \(.file)\(if .line then ":\(.line)" else "" end)  \(.summary)"' "$FINDINGS"
[[ "$crit" -eq 0 ]]
