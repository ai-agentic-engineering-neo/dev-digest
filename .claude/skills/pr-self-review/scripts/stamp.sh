#!/usr/bin/env bash
#
# stamp.sh — records the verdict of the last review so the gate can trust it.
# The stamp lives in .git/ (never committed) and is keyed by a hash of the
# exact tree that was reviewed: change one byte and it goes stale.
#
#   stamp.sh write --verdict pass|block --critical N --warning N [mode flags]
#   stamp.sh check            → 0 fresh and passing; 1 missing or stale; 3 blocked. Reason on stdout.
#   stamp.sh show             → the stamp JSON, if any
#   stamp.sh clear

set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(git rev-parse --show-toplevel)"
STAMP="$ROOT/.git/pr-self-review/stamp.json"
mkdir -p "$(dirname "$STAMP")"

CMD="${1:-show}"; shift || true
case "$CMD" in
  write)
    verdict=""; crit=0; warn=0; MODE_FLAGS=()
    while [[ $# -gt 0 ]]; do
      case "$1" in
        --verdict) verdict="$2"; shift 2 ;;
        --critical) crit="$2"; shift 2 ;;
        --warning) warn="$2"; shift 2 ;;
        --base) MODE_FLAGS+=("$1" "$2"); shift 2 ;;
        *) MODE_FLAGS+=("$1"); shift ;;
      esac
    done
    [[ "$verdict" == "pass" || "$verdict" == "block" ]] || { echo "stamp: --verdict pass|block required" >&2; exit 2; }
    mode="$("$HERE/changed-files.sh" "${MODE_FLAGS[@]}" base | sed -n 's/^mode=//p')"
    tree="$("$HERE/changed-files.sh" "${MODE_FLAGS[@]}" tree)"
    jq -n --arg v "$verdict" --argjson c "$crit" --argjson w "$warn" --arg t "$tree" \
          --arg h "$(git rev-parse HEAD)" --arg m "$mode" --arg at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
      '{verdict:$v, critical:$c, warning:$w, tree:$t, head:$h, mode:$m, reviewed_at:$at}' > "$STAMP"
    cat "$STAMP"
    ;;
  check)
    if [[ ! -f "$STAMP" ]]; then echo "no review stamp: run /pr-self-review first"; exit 1; fi
    mode="$(jq -r .mode "$STAMP")"
    now="$("$HERE/changed-files.sh" "--$mode" tree)"
    if [[ "$now" != "$(jq -r .tree "$STAMP")" ]]; then
      echo "review stamp is stale: files changed since the last /pr-self-review (mode $mode, $(jq -r .reviewed_at "$STAMP"))"; exit 1
    fi
    if [[ "$(jq -r .verdict "$STAMP")" == "block" ]]; then
      echo "last review BLOCKED: $(jq -r .critical "$STAMP") critical finding(s). See .git/pr-self-review/report.md"; exit 3
    fi
    echo "review stamp fresh and passing ($(jq -r .warning "$STAMP") warning(s), reviewed $(jq -r .reviewed_at "$STAMP"))"
    ;;
  show) [[ -f "$STAMP" ]] && cat "$STAMP" || echo "no stamp" ;;
  clear) rm -f "$STAMP"; echo "stamp cleared" ;;
  *) echo "stamp: unknown command $CMD" >&2; exit 2 ;;
esac
