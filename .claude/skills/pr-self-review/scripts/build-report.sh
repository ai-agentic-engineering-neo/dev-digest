#!/usr/bin/env bash
#
# build-report.sh — merge, ground, dedupe, score, and write the report.
#
# Inputs (whatever exists):
#   $PSR_DIR/hard-rules.json      deterministic findings
#   $PSR_DIR/gate-findings.json   findings derived from gate results
#   $PSR_DIR/agents/*.json        one file per reviewer subagent
#   $PSR_DIR/baseline.json        pre-existing violations that may never block
#
# Outputs: report.json, report.md, report.review.json
#
# Doing this in a script rather than in the model's head is deliberate: the
# verdict is the one number the hook trusts, so it must be reproducible.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$SCRIPT_DIR/_lib.sh"
ROOT="$(psr_repo_root)" || psr_die "not a git repository"; cd "$ROOT" || exit 1
psr_need jq

CHANGESET="$PSR_DIR/changeset.json"
[ -f "$CHANGESET" ] || psr_die "run collect-diff.sh first"
LIMITS="$SCRIPT_DIR/../reference/routing.json"

[ -f "$PSR_DIR/hard-rules.json" ]    || echo '[]' > "$PSR_DIR/hard-rules.json"
[ -f "$PSR_DIR/gate-findings.json" ] || echo '[]' > "$PSR_DIR/gate-findings.json"
[ -f "$PSR_DIR/gates.json" ]         || echo '[]' > "$PSR_DIR/gates.json"
mkdir -p "$PSR_DIR/agents"

# hunk ranges, for grounding: { "path": [[start,end], ...] }
awk -f "$SCRIPT_DIR/hunks.awk" "$PSR_DIR/diff.patch" \
  | jq -R -s '[ split("\n")[] | select(length>0) | split("\t")
                | {path: .[0], s: (.[1]|tonumber), e: (.[2]|tonumber)} ]
              | group_by(.path) | map({key: .[0].path, value: map([.s,.e])}) | from_entries' \
  > "$PSR_DIR/.hunks.json"

# agent findings, normalised
jq -s '[ .[] as $a | ($a.findings // [])[] | . + {psr_bucket: $a.bucket, psr_source: "agent", kind: "finding"} ]' \
  "$PSR_DIR"/agents/*.json 2>/dev/null > "$PSR_DIR/.agent-findings.json" || echo '[]' > "$PSR_DIR/.agent-findings.json"
[ -s "$PSR_DIR/.agent-findings.json" ] || echo '[]' > "$PSR_DIR/.agent-findings.json"

BASELINE="$PSR_DIR/baseline.json"
[ -s "$BASELINE" ] || echo '{"schema_version":1,"fingerprints":[]}' > "$BASELINE"

jq -n \
  --slurpfile hard   "$PSR_DIR/hard-rules.json" \
  --slurpfile gatef  "$PSR_DIR/gate-findings.json" \
  --slurpfile agentf "$PSR_DIR/.agent-findings.json" \
  --slurpfile hunks  "$PSR_DIR/.hunks.json" \
  --slurpfile cs     "$CHANGESET" \
  --slurpfile gates  "$PSR_DIR/gates.json" \
  --slurpfile base   "$BASELINE" \
  --slurpfile routing "$LIMITS" \
  --arg now "$(psr_now)" '
  ($cs[0]) as $CS | ($hunks[0]) as $H | ($routing[0].limits) as $L
  | ($base[0].fingerprints // []) as $BASE
  | ($CS.files | map(.path)) as $changed

  # --- agent findings: id them, then ground them -----------------------------
  | ( $agentf[0] | to_entries | map(.value + {id: ("psr-ag-" + (.key + 1 | tostring))}) ) as $agents_raw
  | ( $agents_raw
      | map(select(.file as $f | $changed | index($f)))
      | map(select(. as $x | ($H[$x.file] // []) | any(.[0] <= $x.start_line and $x.start_line <= .[1]))) ) as $grounded
  | (($agents_raw | length) - ($grounded | length)) as $ungrounded_dropped

  # --- confidence floor, then the CRITICAL confidence cap --------------------
  | ( $grounded | map(select((.confidence // 1) >= $L.min_confidence)) ) as $above_floor
  | ( $above_floor
      | map(if .severity == "CRITICAL" and (.confidence // 1) < $L.agent_critical_confidence
            then .severity = "WARNING"
               | .rationale = (.rationale + "\n\n_Downgraded from CRITICAL: agent confidence "
                               + ((.confidence // 1)|tostring) + " is below the "
                               + ($L.agent_critical_confidence|tostring) + " bar for a blocking finding._")
            else . end) ) as $agent_final
  | ( [ $above_floor[] | select(.severity == "CRITICAL" and (.confidence // 1) < $L.agent_critical_confidence) ] | length ) as $downgraded

  # --- deterministic findings win: drop overlapping agent findings -----------
  | ($hard[0] + $gatef[0]) as $det
  | ( $agent_final | map(select(. as $a |
        ($det | any(.file == $a.file and (.start_line - 3) <= $a.start_line and $a.start_line <= (.end_line + 3))) | not)) ) as $agent_kept
  | (($agent_final | length) - ($agent_kept | length)) as $agent_dupes

  # --- merge, then dedupe on file + line + normalised title ------------------
  | ($det + $agent_kept) as $all
  | ( $all
      | map(. + {_k: (.file + ":" + (.start_line|tostring) + ":"
                      + (.title | ascii_downcase | gsub("[^a-z0-9 ]";"") | gsub(" +";" ")))})
      | group_by(._k)
      | map( (sort_by( (if .severity=="CRITICAL" then 3 elif .severity=="WARNING" then 2 else 1 end),
                       (.confidence // 0),
                       (if .psr_source=="hard-rule" then 3 elif .psr_source=="gate" then 2 else 1 end) )
              | reverse | .[0])
             + { rationale: ( (sort_by(.psr_source) | .[0].rationale) ) } )
      | map(del(._k)) ) as $deduped

  # --- baseline: a pre-existing violation may never be CRITICAL --------------
  | ( $deduped
      | map(. + {_fp: ((.psr_rule // "") + "|" + .file + "|" + (.title|ascii_downcase))})
      | map(._fp as $fp | if (.severity == "CRITICAL") and ($BASE | index($fp))
            then .severity = "WARNING"
               | .rationale = (.rationale + "\n\n_Pre-existing on `main` (in baseline.json) — reported, but not blocking._")
            else . end) ) as $based
  | ( [ $based[] | select(._fp as $f | $BASE | index($f)) ] | length ) as $baseline_suppressed
  | ( $based | map(del(._fp)) ) as $findings_pre

  | ( $findings_pre
      | sort_by( (if .severity=="CRITICAL" then 0 elif .severity=="WARNING" then 1 else 2 end),
                 .file, .start_line ) ) as $findings

  | ($findings | map(select(.severity=="CRITICAL")) | length) as $crit
  | {
      schema_version: 1,
      tool_version: "pr-self-review@1.0.0",
      generated_at: $now,
      base_ref: $CS.base_ref, base_sha: $CS.base_sha, base_mode: $CS.base_mode,
      head_sha: $CS.head_sha, diff_hash: $CS.diff_hash,
      fail_on: "critical",
      verdict: (if $crit >= 1 then "block" else "pass" end),
      degraded: $CS.stats.degraded,
      partial: ([ $CS.buckets[] | select((.files|length) > $L.max_files_per_bucket) ] | length > 0),
      counts: {
        CRITICAL: $crit,
        WARNING:  ($findings | map(select(.severity=="WARNING"))    | length),
        SUGGESTION: ($findings | map(select(.severity=="SUGGESTION")) | length)
      },
      stats: $CS.stats,
      buckets: $CS.buckets,
      agents: ($CS.agents | keys),
      gates: $gates[0],
      unrouted: $CS.unrouted,
      suppressed: {
        agent_dupes_of_gates: $agent_dupes,
        ungrounded_dropped: $ungrounded_dropped,
        confidence_downgraded: $downgraded,
        baseline: $baseline_suppressed
      },
      findings: $findings,
      override: null
    }' > "$PSR_DIR/report.json"

rc=$?; [ $rc -eq 0 ] || psr_die "failed to build report.json"
rm -f "$PSR_DIR/.hunks.json" "$PSR_DIR/.agent-findings.json"

# ---- the Review-shaped twin, for diffing against DevDigest's own agents -----
jq '{
  verdict: (if .verdict == "block" then "request_changes" else (if (.counts.WARNING + .counts.SUGGESTION) > 0 then "comment" else "approve" end) end),
  summary: ("pr-self-review on \(.head_sha[0:7]): \(.counts.CRITICAL) critical · \(.counts.WARNING) warning · \(.counts.SUGGESTION) suggestion across \(.stats.file_count) files"),
  score: ([100 - (.counts.CRITICAL * 35) - (.counts.WARNING * 8) - (.counts.SUGGESTION * 2), 0] | max),
  findings: [ .findings[] | {id, severity, category, title, file, start_line, end_line, rationale, suggestion, confidence, kind} ]
}' "$PSR_DIR/report.json" > "$PSR_DIR/report.review.json"

# ---- report.md --------------------------------------------------------------
{
  jq -r '
    "# PR self-review\n",
    "\(.counts.CRITICAL) critical · \(.counts.WARNING) warning · \(.counts.SUGGESTION) suggestion",
    "",
    "**Verdict: \(if .verdict == "block" then "BLOCK — do not open the PR" else "pass" end)**",
    "",
    "| | |",
    "|---|---|",
    "| base | `\(.base_ref)` @ `\(.base_sha[0:7])` |",
    "| head | `\(.head_sha[0:7])` |",
    "| files | \(.stats.file_count) (\(.stats.review_lines // .stats.diff_lines) review lines) |",
    "| agents | \(.agents | join(", ")) |",
    "| generated | \(.generated_at) |",
    ""
    ' "$PSR_DIR/report.json"

  for sev in CRITICAL WARNING SUGGESTION; do
    cnt=$(jq --arg s "$sev" '[.findings[]|select(.severity==$s)]|length' "$PSR_DIR/report.json")
    [ "$cnt" = "0" ] && continue
    printf '## %s (%s)\n\n' "$sev" "$cnt"
    jq -r --arg s "$sev" '.findings[] | select(.severity==$s) |
      "### \(.title)\n\n`\(.file):\(.start_line)` · \(.category) · \(.psr_source)\(if .psr_rule then " · `" + .psr_rule + "`" else "" end)\(if .psr_skill then " · skill: `" + .psr_skill + "`" else "" end)\n\n\(.rationale)\n\(if .suggestion then "\n**Fix:** \(.suggestion)\n" else "" end)"' \
      "$PSR_DIR/report.json"
  done

  printf '## Gates\n\n| gate | status | note |\n|---|---|---|\n'
  jq -r '.gates[] | "| `\(.id)` | \(.status) | \(.skip_reason // "") |"' "$PSR_DIR/report.json"
  printf '\n'

  if [ "$(jq '.unrouted|length' "$PSR_DIR/report.json")" != "0" ]; then
    printf '## Not covered by any routing rule — check these yourself\n\n'
    jq -r '.unrouted[] | "- `\(.)`"' "$PSR_DIR/report.json"
    printf '\nA path that keeps appearing here needs a row in `reference/routing.json`.\n\n'
  fi

  jq -r '"## Suppressed\n\n- dropped as ungrounded (cited a line outside the diff): \(.suppressed.ungrounded_dropped)\n- dropped as duplicates of a gate/hard rule: \(.suppressed.agent_dupes_of_gates)\n- downgraded from CRITICAL on low confidence: \(.suppressed.confidence_downgraded)\n- pre-existing on main (baseline): \(.suppressed.baseline)\n"' "$PSR_DIR/report.json"
} > "$PSR_DIR/report.md"

jq -r '"verdict: \(.verdict)  —  \(.counts.CRITICAL) critical · \(.counts.WARNING) warning · \(.counts.SUGGESTION) suggestion"' "$PSR_DIR/report.json"
