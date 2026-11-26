#!/usr/bin/env bash
# Fails when the two copies of the Zod contracts diverge.
#
# The contracts live twice (root AGENTS.md → "Cross-package gotchas"):
#   server/src/vendor/shared   (also used by reviewer-core)
#   client/src/vendor/shared
# Typecheck passes on a stale copy, so drift is silent without this check.
# Fix: copy the changed files from the server copy to the client copy (or the
# other way round) so both folders are byte-identical.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
server="$root/server/src/vendor/shared"
client="$root/client/src/vendor/shared"

if diff -rq "$server" "$client"; then
  echo "contracts: server and client copies are identical"
else
  echo ""
  echo "contracts: the two copies of vendor/shared differ (see above)."
  echo "Update both copies in the same change. Full diff:"
  echo "  diff -ru server/src/vendor/shared client/src/vendor/shared"
  exit 1
fi
