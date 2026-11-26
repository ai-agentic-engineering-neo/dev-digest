#!/usr/bin/env bash
# Append-only guard for INSIGHTS.md.
#   append-guard.sh snapshot <file>   # before editing
#   append-guard.sh verify   <file>   # after editing: fails if any existing line was changed or removed
set -euo pipefail
mode="${1:-}"; file="${2:-}"
[[ -n "$mode" && -f "$file" ]] || { echo "usage: $0 snapshot|verify <existing INSIGHTS.md>" >&2; exit 2; }
dir="${TMPDIR:-/tmp}/engineering-insights"; mkdir -p "$dir"
snap="$dir/$(printf '%s' "$(cd "$(dirname "$file")" && pwd)/$(basename "$file")" | shasum | cut -c1-16).snap"
case "$mode" in
  snapshot) cp "$file" "$snap"; echo "snapshot: $(wc -l < "$file" | tr -d ' ') lines" ;;
  verify)
    [[ -f "$snap" ]] || { echo "FAIL: no snapshot — run 'snapshot' before editing" >&2; exit 1; }
    removed="$(diff "$snap" "$file" | grep '^<' || true)"
    if [[ -n "$removed" ]]; then
      echo "FAIL: existing lines were changed or removed. Original kept at $snap — restore these lines:" >&2; echo "$removed" >&2; exit 1
    fi
    added="$(diff "$snap" "$file" | grep -c '^>' || true)"
    echo "OK: append-only, $added line(s) added"; rm -f "$snap" ;;
  *) echo "usage: $0 snapshot|verify <file>" >&2; exit 2 ;;
esac
