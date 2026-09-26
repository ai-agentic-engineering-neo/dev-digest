#!/usr/bin/env bash
#
# tally.sh — merge every finding source into one numbered list, apply the
# verification verdicts, and print the counts plus the report tables. The
# numbering is stable (precheck first, then lanes alphabetically, in file
# order) so the verifier can refer to findings by index.
#
#   tally.sh list       → numbered JSON lines of all findings (what the verifier gets)
#   tally.sh apply      → same, with verdicts.jsonl applied; writes final.json
#   tally.sh report     → markdown tables from final.json (or the raw list if no verdicts yet)
#
# Inputs under .git/pr-self-review/: precheck.json, findings/<lane>.jsonl,
# verdicts.jsonl ({"index","verdict","severity","reason"} per line).
set -euo pipefail
ROOT="$(git rev-parse --show-toplevel)"
D="$ROOT/.git/pr-self-review"
CMD="${1:-list}"

merged() {
  {
    [[ -f "$D/precheck.json" ]] && jq -c '.[] | . + {source:"precheck"}' "$D/precheck.json"
    for f in "$D"/findings/*.jsonl; do
      [[ -f "$f" ]] || continue
      lane="$(basename "$f" .jsonl)"
      [[ "$lane" == "to-verify" ]] && continue
      jq -c --arg l "$lane" '. + {source:$l, dismissable:(.dismissable // true)}' "$f"
    done
  } | jq -c -s 'to_entries | map(.value + {index:(.key+1)}) | .[]'
}

case "$CMD" in
  list) merged ;;
  apply)
    if [[ -f "$D/verdicts.jsonl" ]]; then
      merged | jq -c -s --slurpfile v <(jq -c -s '.' "$D/verdicts.jsonl") '
        ($v[0] | map({key:(.index|tostring), value:.}) | from_entries) as $vd
        | map( . as $f | ($vd[($f.index|tostring)] // null) as $x
            | if $x == null then $f + {verdict:"UNVERIFIED"}
              elif ($f.dismissable == false and $x.verdict == "DISMISSED") then $f + {verdict:"CONFIRMED", reason:"not dismissable: tool result"}
              else $f + {verdict:$x.verdict, severity:($x.severity // $f.severity), reason:$x.reason} end )' > "$D/final.json"
    else
      merged | jq -s 'map(. + {verdict:"UNVERIFIED"})' > "$D/final.json"
    fi
    jq -r '"critical=\([.[] | select(.verdict!="DISMISSED" and .severity=="critical")] | length) warning=\([.[] | select(.verdict!="DISMISSED" and .severity=="warning")] | length) info=\([.[] | select(.verdict!="DISMISSED" and .severity=="info")] | length) dismissed=\([.[] | select(.verdict=="DISMISSED")] | length)"' "$D/final.json"
    ;;
  report)
    [[ -f "$D/final.json" ]] || "$0" apply >/dev/null
    row() { jq -r --arg s "$1" '.[] | select(.verdict!="DISMISSED" and .severity==$s) | "| \(.index) | `\(.file)\(if .line then ":\(.line)" else "" end)` | \(.rule) | \(.summary) | \(.fix // "") |"' "$D/final.json"; }
    for sev in critical warning; do
      n="$(jq -r --arg s "$sev" '[.[] | select(.verdict!="DISMISSED" and .severity==$s)] | length' "$D/final.json")"
      echo "## ${sev^} ($n)"; echo
      if [[ "$n" -gt 0 ]]; then echo "| # | File | Rule | Finding | Fix |"; echo "|---|---|---|---|---|"; row "$sev"; else echo "none"; fi
      echo
    done
    echo "## Info"; echo
    jq -r '.[] | select(.verdict!="DISMISSED" and .severity=="info") | "- \(.index). `\(.file)\(if .line then ":\(.line)" else "" end)` — \(.summary)"' "$D/final.json"
    echo; echo "## Dismissed"; echo
    if [[ "$(jq '[.[] | select(.verdict=="DISMISSED")] | length' "$D/final.json")" -gt 0 ]]; then
      echo "| # | Original | Why |"; echo "|---|---|---|"
      jq -r '.[] | select(.verdict=="DISMISSED") | "| \(.index) | \(.rule) at `\(.file)` | \(.reason) |"' "$D/final.json"
    else echo "none"; fi
    ;;
  *) echo "tally: list | apply | report" >&2; exit 2 ;;
esac
