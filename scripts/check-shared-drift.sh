#!/usr/bin/env bash
#
# Fails when the two vendored copies of @devdigest/shared differ.
#   server/src/vendor/shared  (canonical; also used by reviewer-core)
#   client/src/vendor/shared  (client copy)
# A contract change must land in BOTH copies — see root AGENTS.md.
#
#   ./scripts/check-shared-drift.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVER="$ROOT/server/src/vendor/shared"
CLIENT="$ROOT/client/src/vendor/shared"

if diff -r "$SERVER" "$CLIENT"; then
  echo "✓ @devdigest/shared copies are identical"
else
  echo "✗ @devdigest/shared drift: server/src/vendor/shared and client/src/vendor/shared differ (see diff above)." >&2
  echo "  Update both copies — the server copy is canonical." >&2
  exit 1
fi
