#!/usr/bin/env bash
#
# state.sh — the resumable state of one /implement pipeline run, kept in
# .pipeline/<slug>/state.json (git-ignored), plus the merge of the reviewers'
# findings for a review round.
#
#   state.sh init <slug> [--spec <path>] [--mode <mode>] [--plan <path>]   create (or keep) the state
#   state.sh set  <slug> <stage> <status> [note]                           status: pending|running|waiting|done|skipped|failed
#   state.sh show <slug>                                                   the state as a table
#   state.sh next <slug>                                                   first stage that is not done/skipped
#   state.sh findings <slug>                                               merge .pipeline/<slug>/*.findings.json (latest round of
#                                                                          each agent), print a numbered list, write review-round-<n>.json
#
# <slug> is the pipeline folder name, e.g. feat-blast-radius.
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
STAGES=(intake implement tests review fix docs gate)

CMD="${1:-show}"; shift || true
SLUG="${1:-}"; shift || true
[[ -n "$SLUG" ]] || { echo "state.sh: <slug> required" >&2; exit 2; }
DIR="$ROOT/.pipeline/$SLUG"
STATE="$DIR/state.json"

stages_json() { printf '%s\n' "${STAGES[@]}" | jq -R . | jq -s 'map({key:., value:{status:"pending"}}) | from_entries'; }

case "$CMD" in
  init)
    mkdir -p "$DIR"
    spec=""; mode=""; plan=""
    while [[ $# -gt 0 ]]; do
      case "$1" in
        --spec) spec="$2"; shift 2 ;;
        --mode) mode="$2"; shift 2 ;;
        --plan) plan="$2"; shift 2 ;;
        *) echo "state.sh init: unknown option $1" >&2; exit 2 ;;
      esac
    done
    if [[ -f "$STATE" ]]; then
      jq --arg s "$spec" --arg m "$mode" --arg p "$plan" \
         '.spec = (if $s != "" then $s else .spec end) | .mode = (if $m != "" then $m else .mode end) | .plan = (if $p != "" then $p else .plan end)' \
         "$STATE" > "$STATE.tmp" && mv "$STATE.tmp" "$STATE"
      echo "state: kept existing $STATE"
    else
      jq -n --arg slug "$SLUG" --arg s "$spec" --arg m "$mode" --arg p "$plan" \
            --arg at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" --argjson stages "$(stages_json)" \
        '{slug:$slug, spec:$s, mode:$m, plan:$p, created:$at, fix_rounds:0, stages:$stages}' > "$STATE"
      echo "state: created $STATE"
    fi
    ;;
  set)
    stage="${1:-}"; status="${2:-}"; note="${3:-}"
    [[ -f "$STATE" ]] || { echo "state.sh: no state for $SLUG (run init)" >&2; exit 1; }
    printf '%s\n' "${STAGES[@]}" | grep -qx -- "$stage" || { echo "state.sh: unknown stage '$stage'" >&2; exit 2; }
    case "$status" in pending|running|waiting|done|skipped|failed) ;; *) echo "state.sh: unknown status '$status'" >&2; exit 2 ;; esac
    jq --arg st "$stage" --arg s "$status" --arg n "$note" --arg at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
       '.stages[$st] = {status:$s, at:$at} + (if $n != "" then {note:$n} else {} end)
        | if $st == "fix" and $s == "done" then .fix_rounds += 1 else . end' \
       "$STATE" > "$STATE.tmp" && mv "$STATE.tmp" "$STATE"
    echo "state: $stage = $status${note:+ ($note)}"
    ;;
  show)
    [[ -f "$STATE" ]] || { echo "state: none for $SLUG"; exit 1; }
    jq -r '"slug: \(.slug)   spec: \(.spec // "-")   plan: \(.plan // "-")   mode: \(.mode // "-")   fix rounds: \(.fix_rounds)"' "$STATE"
    for st in "${STAGES[@]}"; do
      jq -r --arg st "$st" '.stages[$st] | "  \($st | . + "          " | .[0:10])  \(.status | . + "        " | .[0:8])  \(.at // "")  \(.note // "")"' "$STATE"
    done
    ;;
  next)
    [[ -f "$STATE" ]] || { echo "intake"; exit 0; }
    for st in "${STAGES[@]}"; do
      s="$(jq -r --arg st "$st" '.stages[$st].status' "$STATE")"
      [[ "$s" == "done" || "$s" == "skipped" ]] || { echo "$st"; exit 0; }
    done
    echo "complete"
    ;;
  findings)
    [[ -d "$DIR" ]] || { echo "state.sh: no pipeline folder $DIR" >&2; exit 1; }
    round="$(jq -r '.fix_rounds + 1' "$STATE" 2>/dev/null || echo 1)"
    out="$DIR/review-round-$round.json"
    # Latest findings file per agent: <agent>.roundN.findings.json beats <agent>.findings.json.
    files=()
    for agent in architecture-reviewer security-reviewer plan-verifier; do
      latest="$(ls -1 "$DIR/$agent".round*.findings.json "$DIR/$agent.findings.json" 2>/dev/null | sort -V | tail -1 || true)"
      [[ -n "$latest" ]] && files+=("$latest")
    done
    if [[ ${#files[@]} -eq 0 ]]; then echo "findings: none saved under $DIR" >&2; exit 1; fi
    for f in "${files[@]}"; do
      agent="$(basename "$f")"; agent="${agent%%.*}"
      jq -c --arg a "$agent" '.[] | . + {source:$a}' "$f"
    done | jq -s 'sort_by(if .severity=="critical" then 0 elif .severity=="warning" then 1 else 2 end)
                  | to_entries | map(.value + {index:(.key+1)})' > "$out"
    jq -r '.[] | "\(.index). [\(.severity)] \(.source) · \(.file)\(if .line then ":\(.line)" else "" end) · \(.rule) — \(.summary)"' "$out"
    jq -r '"findings: \([.[] | select(.severity=="critical")] | length) critical, \([.[] | select(.severity=="warning")] | length) warning, \([.[] | select(.severity=="info")] | length) info  → \(input_filename)"' "$out" | sed "s|$ROOT/||"
    ;;
  *) echo "state.sh: unknown command '$CMD' (init | set | show | next | findings)" >&2; exit 2 ;;
esac
