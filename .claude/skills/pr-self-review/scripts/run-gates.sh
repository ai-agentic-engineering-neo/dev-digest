#!/usr/bin/env bash
#
# run-gates.sh — the deterministic gates, for the buckets that are actually
# touched. Runs BEFORE any subagent: these are cheap, they are truth, and their
# results are fed to the reviewers as "already known, do not re-report".
#
# Writes:
#   $PSR_DIR/gates.json        one record per gate (pass|fail|skipped|timeout)
#   $PSR_DIR/gate-findings.json findings derived from failures
#   $PSR_DIR/gates/<id>.log    raw output, cited by every finding
#
# A gate that CANNOT RUN is never CRITICAL. Missing Docker, a missing config or
# an uninstalled binary is a coverage hole (WARNING), not a proven failure —
# making it blocking would stop every developer without Docker running, which is
# the likeliest source of a false block.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$SCRIPT_DIR/_lib.sh"
ROOT="$(psr_repo_root)" || psr_die "not a git repository"; cd "$ROOT" || exit 1
psr_need jq

CHANGESET="$PSR_DIR/changeset.json"
[ -f "$CHANGESET" ] || psr_die "run collect-diff.sh first"
LOGS="$PSR_DIR/gates"; mkdir -p "$LOGS"
GATE_TIMEOUT="${PSR_GATE_TIMEOUT:-300}"

ADDED="$(awk -f "$SCRIPT_DIR/added-lines.awk" "$PSR_DIR/diff.patch")"

# Portable timeout: macOS has no coreutils `timeout`.
psr_run() {
  local secs="$1" log="$2"; shift 2
  ( "$@" ) > "$log" 2>&1 &
  local pid=$!
  ( sleep "$secs"; kill -0 "$pid" 2>/dev/null && kill -TERM "$pid" 2>/dev/null ) >/dev/null 2>&1 &
  local watchdog=$!
  wait "$pid"; local rc=$?
  kill -TERM "$watchdog" 2>/dev/null; wait "$watchdog" 2>/dev/null
  return $rc
}

RESULTS="$(mktemp)"; : > "$RESULTS"

record() { # id cmd status exit duration log skip_reason
  jq -n -c --arg id "$1" --arg cmd "$2" --arg st "$3" --argjson ex "$4" \
    --argjson ms "$5" --arg log "$6" --arg skip "${7:-}" '
    { id:$id, cmd:$cmd, status:$st, exit_code:$ex, duration_ms:$ms, log:$log,
      skip_reason: (if $skip == "" then null else $skip end) }' >> "$RESULTS"
}

skip() { record "$1" "$2" skipped 0 0 "" "$3"; printf '  skip  %-20s %s\n' "$1" "$3"; }

gate() { # id "cmd words..."
  local id="$1"; shift
  local log="$LOGS/${id//:/-}.log"
  local t0 t1 rc
  t0=$(date +%s)
  psr_run "$GATE_TIMEOUT" "$log" "$@"; rc=$?
  t1=$(date +%s)
  local ms=$(( (t1 - t0) * 1000 ))
  local st=pass
  [ $rc -ne 0 ] && st=fail
  [ $rc -eq 143 ] && st=timeout
  record "$id" "$*" "$st" "$rc" "$ms" "gates/${id//:/-}.log" ""
  printf '  %-5s %-20s %ss\n' "$st" "$id" "$(( (t1 - t0) ))"
}

want() { jq -e --arg g "$1" '.gates | index($g)' "$CHANGESET" >/dev/null 2>&1; }

# ---- config / tooling probes ------------------------------------------------
probe() { # gate-id  file-or-binary  reason
  if [ ! -e "$2" ]; then skip "$1" "-" "$3"; return 1; fi
  return 0
}

printf 'gates:\n'

want server:typecheck && gate server:typecheck pnpm --dir server typecheck
want server:arch      && { probe server:arch server/.dependency-cruiser.cjs \
      "server/.dependency-cruiser.cjs missing" && gate server:arch pnpm --dir server arch; }
want server:lint      && { probe server:lint server/eslint.config.mjs \
      "server/eslint.config.mjs missing (currently untracked — git add it)" && \
      gate server:lint pnpm --dir server exec eslint . --format json; }
want server:test-unit && gate server:test-unit pnpm --dir server exec vitest run --exclude '**/*.it.test.ts'

if want server:test-it; then
  if docker info >/dev/null 2>&1; then
    gate server:test-it pnpm --dir server exec vitest run .it.test
  else
    skip server:test-it "pnpm --dir server exec vitest run .it.test" \
      "Docker is not running — the DB-backed lane could not be proven locally (it still runs in server-integration.yml)"
  fi
fi

want client:typecheck && gate client:typecheck pnpm --dir client typecheck
want client:arch      && { probe client:arch client/.dependency-cruiser.cjs \
      "client/.dependency-cruiser.cjs missing (currently untracked — git add it)" && \
      gate client:arch pnpm --dir client arch; }
want client:lint      && { probe client:lint client/eslint.config.mjs \
      "client/eslint.config.mjs missing (currently untracked — git add it)" && \
      gate client:lint pnpm --dir client exec eslint . --format json; }
want client:test      && gate client:test pnpm --dir client test

want core:typecheck && gate core:typecheck npm --prefix reviewer-core run typecheck
want core:test      && gate core:test      npm --prefix reviewer-core test
want e2e:typecheck  && gate e2e:typecheck  npm --prefix e2e run typecheck

if want sh:syntax; then
  bad=0; log="$LOGS/sh-syntax.log"; : > "$log"
  while read -r f; do
    [ -z "$f" ] && continue; [ -f "$f" ] || continue
    bash -n "$f" >> "$log" 2>&1 || bad=1
  done < <(jq -r '.files[].path | select(test("\\.sh$"))' "$CHANGESET")
  record sh:syntax "bash -n <changed .sh>" "$([ $bad -eq 0 ] && echo pass || echo fail)" "$bad" 0 "gates/sh-syntax.log" ""
  printf '  %-5s %-20s\n' "$([ $bad -eq 0 ] && echo pass || echo fail)" "sh:syntax"
fi

if want yaml:parse; then
  # A missing parser is a coverage hole, not a broken workflow file. Classifying
  # it as `fail` would turn "this machine has no pyyaml" into a blocking CRITICAL.
  if ! python3 -c "import yaml" >/dev/null 2>&1; then
    skip yaml:parse "yaml.safe_load <changed yaml>" \
      "no YAML parser available (python3 -m pip install pyyaml) — workflow files were not syntax-checked"
  else
  bad=0; log="$LOGS/yaml-parse.log"; : > "$log"
  while read -r f; do
    [ -z "$f" ] && continue; [ -f "$f" ] || continue
    python3 -c "import sys,yaml;yaml.safe_load(open(sys.argv[1]))" "$f" >> "$log" 2>&1 || bad=1
  done < <(jq -r '.files[].path | select(test("\\.ya?ml$"))' "$CHANGESET")
  record yaml:parse "yaml.safe_load <changed yaml>" "$([ $bad -eq 0 ] && echo pass || echo fail)" "$bad" 0 "gates/yaml-parse.log" ""
  printf '  %-5s %-20s\n' "$([ $bad -eq 0 ] && echo pass || echo fail)" "yaml:parse"
  fi
fi

jq -s '.' "$RESULTS" > "$PSR_DIR/gates.json"; rm -f "$RESULTS"

# ---- failures → findings ----------------------------------------------------
# eslint gates are parsed from JSON and filtered to CHANGED LINES ONLY, so that
# a brand-new lint config does not block the PR on pre-existing violations in
# files nobody touched. Everything else is all-or-nothing.
: > "$PSR_DIR/.gate-findings.ndjson"
i=0
emit_gate() { # rule sev cat file line title rationale suggestion
  i=$((i + 1))
  jq -n -c --arg id "psr-gate-$(printf '%04d' "$i")" --arg rule "$1" --arg sev "$2" \
    --arg cat "$3" --arg file "$4" --argjson line "$5" --arg title "$6" \
    --arg rat "$7" --arg sug "$8" '
    { id:$id, severity:$sev, category:$cat, title:$title, file:$file,
      start_line:$line, end_line:$line, rationale:$rat,
      suggestion:(if $sug=="" then null else $sug end), confidence:1.0, kind:"hook",
      psr_bucket:null, psr_source:"gate", psr_rule:$rule, psr_skill:null }' \
    >> "$PSR_DIR/.gate-findings.ndjson"
}

changed_line() { # path line -> 0 if that line is in the added set
  printf '%s\n' "$ADDED" | awk -F'\t' -v p="$1" -v l="$2" '$1==p && $2==l {found=1} END{exit !found}'
}

while IFS=$'\t' read -r id cmd status log skipr; do
  [ "$log" = "-" ] && log=""
  [ "$skipr" = "-" ] && skipr=""
  case "$status" in
    skipped)
      sev=WARNING; rule=gate-skipped
      case "$skipr" in *untracked*) rule=gate-config-untracked ;; esac
      emit_gate "$rule" "$sev" test "CLAUDE.md" 1 \
        "Gate \`$id\` did not run" \
        "$skipr. A gate that cannot run proves nothing; this is a coverage hole, not a failure." \
        "$(case "$rule" in gate-config-untracked) echo 'git add the config file so the gate runs on every checkout.';; *) echo 'Re-run once the prerequisite is available.';; esac)"
      ;;
    timeout)
      emit_gate gate-timeout WARNING test CLAUDE.md 1 \
        "Gate \`$id\` timed out after ${GATE_TIMEOUT}s" \
        "\`$cmd\` did not finish. The gate could not be proven either way." \
        "Run \`$cmd\` by hand."
      ;;
    fail)
      full="$PSR_DIR/$log"
      case "$id" in
        *:lint)
          pkg="${id%%:*}"
          # eslint --format json, filtered to lines that this change actually added
          while IFS=$'\t' read -r fp ln msg rid; do
            [ -z "$fp" ] && continue
            rel="${fp#$ROOT/}"
            changed_line "$rel" "$ln" || continue
            emit_gate "lint:${rid:-error}" CRITICAL style "$rel" "$ln" \
              "eslint: ${rid:-error}" \
              "\`pnpm --dir $pkg lint\` failed on a line this change adds: $msg (rule \`${rid:-n/a}\`). Full log: \`$log\`" \
              "Fix it, or justify a targeted eslint-disable with a comment."
          done < <(jq -r '.[] | .filePath as $f | .messages[] | select(.severity==2)
                          | [$f, (.line|tostring), .message, (.ruleId // "")] | @tsv' "$full" 2>/dev/null)
          ;;
        *)
          # tsc: src/a.ts(12,5): error TS...   depcruise: error rule: a → b   vitest: FAIL path
          read -r ff lll < <(
            { grep -oE '^[^ (]+\([0-9]+,[0-9]+\)' "$full" 2>/dev/null | head -1 | tr '(' ' ' | tr -d ',' | awk '{print $1, $2}'
              grep -oE '(src|test)/[A-Za-z0-9._/-]+\.tsx?' "$full" 2>/dev/null | head -1 | awk '{print $1, 1}'
            } | head -1 )
          pkgdir="${id%%:*}"; case "$pkgdir" in core) pkgdir=reviewer-core ;; esac
          f="${ff:+$pkgdir/$ff}"; f="${f:-$pkgdir/package.json}"
          emit_gate "gate-fail:$id" CRITICAL bug "$f" "${lll:-1}" \
            "Gate \`$id\` failed" \
            "\`$cmd\` exited non-zero. First 40 lines of \`$log\`:\n\n\`\`\`\n$(head -40 "$full" 2>/dev/null)\n\`\`\`" \
            "Fix the failure, then re-run /pr-self-review."
          ;;
      esac
      ;;
  esac
  # Tab is IFS whitespace, so two consecutive tabs collapse into one delimiter
  # and an empty middle field silently shifts everything after it. Emit "-" and
  # translate it back rather than relying on read to preserve empties.
done < <(jq -r '.[] | [.id, .cmd, .status,
                       ((.log // "") | if . == "" then "-" else . end),
                       ((.skip_reason // "") | if . == "" then "-" else . end)] | @tsv' "$PSR_DIR/gates.json")

jq -s '.' "$PSR_DIR/.gate-findings.ndjson" > "$PSR_DIR/gate-findings.json" 2>/dev/null || echo '[]' > "$PSR_DIR/gate-findings.json"
rm -f "$PSR_DIR/.gate-findings.ndjson"
printf 'gate findings: %s (%s critical)\n' \
  "$(jq 'length' "$PSR_DIR/gate-findings.json")" \
  "$(jq '[.[]|select(.severity=="CRITICAL")]|length' "$PSR_DIR/gate-findings.json")"
