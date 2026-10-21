#!/usr/bin/env bash
# Onion boundary check for server/. Wraps dependency-cruiser with the repo's
# config and baseline. Run from anywhere in the repo.
#
#   check-arch.sh              gated run: fails only on violations not in the baseline (what CI runs)
#   check-arch.sh --all        show every violation, baseline included, with the rule comments
#   check-arch.sh --baseline   regenerate the baseline (only after REMOVING violations)
#
# Needs the server toolchain on PATH (see server/CLAUDE.md; on this machine
# `export PATH=~/.nvm/versions/node/v22.16.0/bin:$PATH`).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
SERVER="$ROOT/server"
CONFIG=".dependency-cruiser.cjs"
BASELINE=".dependency-cruiser-known-violations.json"

cd "$SERVER"

if ! command -v pnpm >/dev/null 2>&1; then
  echo "check-arch: pnpm not on PATH (see server/CLAUDE.md)" >&2
  exit 2
fi

case "${1:-}" in
  --all)
    pnpm exec depcruise --config "$CONFIG" --no-ignore-known --output-type text src || true
    echo
    pnpm exec depcruise --config "$CONFIG" --no-ignore-known src || true
    ;;
  --baseline)
    before=$(python3 -c "import json;print(len(json.load(open('$BASELINE'))))" 2>/dev/null || echo 0)
    pnpm exec depcruise --config "$CONFIG" --output-type baseline --output-to "$BASELINE" src
    after=$(python3 -c "import json;print(len(json.load(open('$BASELINE'))))")
    echo "check-arch: baseline $before → $after entries"
    if [ "$after" -gt "$before" ]; then
      echo "check-arch: the baseline GREW. Never commit a larger baseline; fix the new violation instead." >&2
      exit 1
    fi
    ;;
  "")
    pnpm exec depcruise --config "$CONFIG" --ignore-known "$BASELINE" src
    ;;
  *)
    echo "usage: check-arch.sh [--all | --baseline]" >&2
    exit 2
    ;;
esac
