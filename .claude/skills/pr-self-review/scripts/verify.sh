#!/usr/bin/env bash
#
# verify.sh — run the deterministic checks once and let every agent reuse the
# result. The pipeline used to re-run typecheck/lint/tests in the implementer,
# the plan-verifier, the reviewers and the main session; now the implementer
# runs `verify.sh run` once and everyone else runs `verify.sh check`.
#
#   verify.sh run   [--with-it] [--e2e] [mode flags]   precheck.sh (+ server *.it.test.ts) (+ ./scripts/e2e.sh),
#                                                      then prepare-lanes.sh (per-package diff packs for reviewers)
#   verify.sh check [--with-it] [--e2e]                0 fresh, passing and at least that level;
#                                                      1 missing, stale or a lower level; 3 failed
#   verify.sh show                                     the result JSON
#
#   mode flags   forwarded to changed-files.sh / precheck.sh (--all | --staged | --branch | --base <ref>)
#
# Output: .git/pr-self-review/verify.json, tool logs in .git/pr-self-review/logs/,
# diff packs in .git/pr-self-review/lanes/ (see prepare-lanes.sh).
#
# Freshness is a hash of the working tree with every *.md removed, so an
# INSIGHTS.md entry, a plan amendment or a pipeline report written after the run
# does not force a re-run; any code, test, config or schema byte does.

set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"
OUT="$ROOT/.git/pr-self-review"
RESULT="$OUT/verify.json"

# Same toolchain fallback as precheck.sh. precheck sets PATH only inside its
# own process, and ./scripts/e2e.sh needs pnpm too.
if ! command -v pnpm >/dev/null 2>&1; then
  for d in "$HOME"/.nvm/versions/node/v22*/bin; do
    [[ -d "$d" ]] && export PATH="$d:$PATH" && break
  done
fi
mkdir -p "$OUT/logs"

fingerprint() {
  local tmp
  tmp="$(mktemp)"
  cp "$(git rev-parse --git-path index)" "$tmp"
  GIT_INDEX_FILE="$tmp" git add -A >/dev/null 2>&1
  GIT_INDEX_FILE="$tmp" git rm -r --cached -q --ignore-unmatch -- '*.md' >/dev/null 2>&1
  GIT_INDEX_FILE="$tmp" git write-tree
  rm -f "$tmp"
}

CMD="${1:-show}"; shift || true
WITH_IT=0; E2E=0; MODE_FLAGS=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --with-it) WITH_IT=1; shift ;;
    --e2e) E2E=1; shift ;;
    --base) MODE_FLAGS+=("$1" "$2"); shift 2 ;;
    *) MODE_FLAGS+=("$1"); shift ;;
  esac
done

case "$CMD" in
  run)
    started="$(date +%s)"
    flags=("${MODE_FLAGS[@]}")
    [[ $WITH_IT -eq 1 ]] && flags+=(--with-it)
    "$HERE/precheck.sh" "${flags[@]}" | tee "$OUT/logs/precheck.out"
    pre_rc=${PIPESTATUS[0]}

    # One line per toolchain check: "  <pkg> <name> ok|FAIL  (<log>)"
    checks="$(awk '$1 ~ /^(server|client|reviewer-core|e2e)$/ && ($3=="ok" || $3=="FAIL") {printf "{\"pkg\":\"%s\",\"name\":\"%s\",\"status\":\"%s\"}\n", $1, $2, ($3=="ok"?"pass":"fail")}' "$OUT/logs/precheck.out" | jq -s '.')"

    e2e_status="not_run"; e2e_summary=""
    if [[ $E2E -eq 1 ]]; then
      if ./scripts/e2e.sh > "$OUT/logs/e2e.log" 2>&1; then e2e_status="pass"; else e2e_status="fail"; fi
      e2e_summary="$(grep -E '[0-9]+/[0-9]+ flows passed' "$OUT/logs/e2e.log" | tail -1)"
      echo "  e2e            flows      $e2e_status  ${e2e_summary}"
    fi

    "$HERE/prepare-lanes.sh" "${MODE_FLAGS[@]}" > "$OUT/logs/lanes.out" 2>&1 || echo "  (prepare-lanes.sh failed: $OUT/logs/lanes.out)"

    crit="$(jq '[.[] | select(.severity=="critical")] | length' "$OUT/precheck.json" 2>/dev/null || echo 1)"
    warn="$(jq '[.[] | select(.severity=="warning")] | length' "$OUT/precheck.json" 2>/dev/null || echo 0)"
    verdict="pass"
    [[ $pre_rc -ne 0 || "$e2e_status" == "fail" ]] && verdict="fail"
    jq -n --arg tree "$(fingerprint)" --arg head "$(git rev-parse HEAD)" \
          --arg at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" --argjson secs "$(( $(date +%s) - started ))" \
          --argjson it "$WITH_IT" --argjson e2e "$E2E" --argjson checks "$checks" \
          --arg e2e_status "$e2e_status" --arg e2e_summary "$e2e_summary" \
          --argjson crit "$crit" --argjson warn "$warn" --arg verdict "$verdict" \
      '{verdict:$verdict, tree:$tree, head:$head, at:$at, seconds:$secs,
        level:{unit:true, it:($it==1), e2e:($e2e==1)},
        checks:$checks, e2e:{status:$e2e_status, summary:$e2e_summary},
        precheck:{critical:$crit, warning:$warn, findings:".git/pr-self-review/precheck.json"},
        lanes:".git/pr-self-review/lanes/"}' > "$RESULT"
    echo
    echo "verify: $verdict  (unit$([[ $WITH_IT -eq 1 ]] && echo ' + it')$([[ $E2E -eq 1 ]] && echo ' + e2e'), $crit critical, $warn warning)  → $RESULT"
    [[ "$verdict" == "pass" ]]
    ;;
  check)
    if [[ ! -f "$RESULT" ]]; then echo "verify: no result — run verify.sh run"; exit 1; fi
    if [[ "$(fingerprint)" != "$(jq -r .tree "$RESULT")" ]]; then
      echo "verify: stale — code changed since $(jq -r .at "$RESULT"); run verify.sh run"; exit 1
    fi
    if [[ $WITH_IT -eq 1 && "$(jq -r .level.it "$RESULT")" != "true" ]]; then
      echo "verify: last run did not include *.it.test.ts; run verify.sh run --with-it"; exit 1
    fi
    if [[ $E2E -eq 1 && "$(jq -r .level.e2e "$RESULT")" != "true" ]]; then
      echo "verify: last run did not include e2e; run verify.sh run --e2e"; exit 1
    fi
    summary="$(jq -r '"\(.verdict) at \(.at) · unit\(if .level.it then " + it" else "" end)\(if .level.e2e then " + e2e (\(.e2e.summary))" else "" end) · \(.precheck.critical) critical, \(.precheck.warning) warning"' "$RESULT")"
    jq -r '.checks[] | "  \(.pkg) \(.name): \(.status)"' "$RESULT"
    if [[ "$(jq -r .verdict "$RESULT")" != "pass" ]]; then
      echo "verify: FAILED — $summary (logs: .git/pr-self-review/logs/)"; exit 3
    fi
    echo "verify: fresh — $summary"
    ;;
  show) [[ -f "$RESULT" ]] && cat "$RESULT" || echo "verify: no result" ;;
  *) echo "verify: unknown command '$CMD' (run | check | show)" >&2; exit 2 ;;
esac
