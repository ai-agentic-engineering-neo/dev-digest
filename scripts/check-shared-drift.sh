#!/usr/bin/env bash
# check-shared-drift.sh — fail when the two vendored copies of @devdigest/shared
# differ. server/src/vendor/shared is the source of truth; the client copy must
# be byte-identical. Fix drift with:
#   cp -r server/src/vendor/shared/. client/src/vendor/shared/
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVER="$ROOT/server/src/vendor/shared"
CLIENT="$ROOT/client/src/vendor/shared"

for dir in "$SERVER" "$CLIENT"; do
  if [[ ! -d "$dir" ]]; then
    echo "check-shared-drift: missing directory $dir" >&2
    exit 2
  fi
done

if ! out="$(diff -r "$SERVER" "$CLIENT")"; then
  echo "$out"
  echo >&2
  echo "check-shared-drift: @devdigest/shared copies differ (server/src/vendor/shared vs client/src/vendor/shared)." >&2
  echo "The server copy is the source of truth. Sync with:" >&2
  echo "  cp -r server/src/vendor/shared/. client/src/vendor/shared/" >&2
  exit 1
fi

echo "check-shared-drift: @devdigest/shared copies are identical."
