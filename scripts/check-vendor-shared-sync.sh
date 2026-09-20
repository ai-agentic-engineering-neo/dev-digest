#!/usr/bin/env bash
#
# server/src/vendor/shared/ and client/src/vendor/shared/ are hand-mirrored
# copies of the same @devdigest/shared Zod contracts (no workspace/symlink —
# see root CLAUDE.md "Non-default conventions"). A change to one must be
# manually copied to the other; nothing enforces that today, so they can (and
# did, once) silently drift into two different contract shapes.
#
# This script fails loudly when the two copies disagree.
#
#   ./scripts/check-vendor-shared-sync.sh
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVER_DIR="$ROOT/server/src/vendor/shared"
CLIENT_DIR="$ROOT/client/src/vendor/shared"

if [ ! -d "$SERVER_DIR" ] || [ ! -d "$CLIENT_DIR" ]; then
  echo "check-vendor-shared-sync: expected both $SERVER_DIR and $CLIENT_DIR to exist" >&2
  exit 1
fi

if diff -rq "$SERVER_DIR" "$CLIENT_DIR" > /tmp/vendor-shared-sync.diff 2>&1; then
  echo "vendor/shared is in sync between server/ and client/"
  exit 0
fi

echo "server/src/vendor/shared and client/src/vendor/shared have drifted:" >&2
cat /tmp/vendor-shared-sync.diff >&2
echo >&2
echo "Fix: copy whichever side is current onto the other so the two directories" >&2
echo "are byte-identical, then re-run this script." >&2
exit 1
