#!/usr/bin/env bash
# Fails when the two vendored copies of the Zod contracts differ.
# server/src/vendor/shared is the source of truth; sync with:
#   cp -R server/src/vendor/shared/. client/src/vendor/shared/
set -euo pipefail
cd "$(dirname "$0")/.."
if ! diff -r server/src/vendor/shared client/src/vendor/shared; then
  echo "::error::server/src/vendor/shared and client/src/vendor/shared differ — copy server → client (see scripts/check-contracts.sh)"
  exit 1
fi
echo "vendored contracts in sync"
