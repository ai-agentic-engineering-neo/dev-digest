#!/usr/bin/env bash
# review-delta.sh — changed files since the last review round; see scripts/review-delta.py.
exec python3 "$(dirname "${BASH_SOURCE[0]}")/review-delta.py" "$@"
