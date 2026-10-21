#!/usr/bin/env bash
# PreToolUse guard (Bash) for the test-writer subagent. First applies the
# implementer's denylist (no git writes, gh, docker down, baseline, protected
# shell writes), then adds: no shell file writes at all (tests are written with
# Edit/Write so the path hook sees them), no dependency changes, no db scripts,
# no snapshot updates or autofix. Exit 2 + stderr = block.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
payload="$(cat)"
cmd="$(printf '%s' "$payload" | jq -r '.tool_input.command // ""')"
[[ -n "$cmd" ]] || exit 0

deny() {
  echo "test-writer: blocked — $1. Write tests with Edit/Write; report anything else under 'Needs implementer' or 'Not done'." >&2
  exit 2
}

# Any non-zero exit from the inherited guard is a block, not only exit 2.
if ! out="$(printf '%s' "$payload" | bash "$HERE/implementer-bash-guard.sh" 2>&1)"; then
  deny "${out#implementer: blocked — }"
fi

sep='(^|[;&|({[:space:]])'

# insight.sh is the sanctioned writer of INSIGHTS.md, but only as a lone command.
if grep -q 'engineering-insights/scripts/insight.sh' <<<"$cmd"; then
  case "$cmd" in
    *$'\n'* | *';'* | *'&'* | *'|'* | *'>'* | *'<'* | *'`'* | *'$('*) deny "run insight.sh on its own, without shell operators" ;;
  esac
  exit 0
fi

# Shell file writes. Harmless redirects are removed before matching.
scrubbed="$(sed -E 's#[0-9]?>>?[[:space:]]*/dev/null##g; s#2>&1##g' <<<"$cmd")"
if grep -Eq '>' <<<"$scrubbed" \
  || grep -Eq "${sep}(tee|touch|truncate|mv|cp|rm|ln|dd|patch)[[:space:]]" <<<"$scrubbed" \
  || grep -Eq "${sep}(sed|perl)[[:space:]]+(-[a-zA-Z]*i|--in-place)" <<<"$scrubbed" \
  || grep -Eq "${sep}git[[:space:]]+apply" <<<"$scrubbed"; then
  deny "shell file writes are not allowed"
fi

# Dependencies: lockfile-exact installs only.
if grep -Eq "${sep}pnpm[[:space:]]+(add|remove|rm|up|update|upgrade|i|install)([[:space:]]|$)" <<<"$cmd"; then
  grep -Eq "${sep}pnpm[[:space:]]+(i|install)[[:space:]]+--frozen-lockfile([[:space:]]|$)" <<<"$cmd" || deny "dependency changes belong to the implementer"
fi
grep -Eq "${sep}npm[[:space:]]+(i|install|uninstall|un|rm|update|up)([[:space:]]|$)" <<<"$cmd" && deny "dependency changes belong to the implementer (npm ci is allowed)"

# Schema and dev database.
grep -Eq 'db:(generate|migrate|seed|push)' <<<"$cmd" && deny "schema and dev database scripts belong to the implementer"

# Snapshot rewrites and autofix.
grep -Eq "(^|[[:space:]])(-u|--update|--fix)([[:space:]=]|$)" <<<"$cmd" && deny "snapshot updates and autofix rewrite files"

exit 0
