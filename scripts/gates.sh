#!/usr/bin/env bash
# gates.sh — run the deterministic gates once per working-tree state; see scripts/gates.py.
exec python3 "$(dirname "${BASH_SOURCE[0]}")/gates.py" "$@"
