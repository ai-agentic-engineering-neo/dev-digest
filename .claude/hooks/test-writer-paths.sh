#!/usr/bin/env bash
# PreToolUse guard (Edit|Write|NotebookEdit) for the test-writer subagent: an
# allowlist of test paths. Everything else is refused. Paths are normalised
# first so `server/test/../src/app.ts` cannot pass. Exit 2 + stderr = block.
set -euo pipefail

payload="$(cat)"
file="$(printf '%s' "$payload" | jq -r '.tool_input.file_path // .tool_input.notebook_path // ""')"
[[ -n "$file" ]] || exit 0

root="$(realpath -m -- "${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel)}")"
[[ "$file" == /* ]] || file="$root/$file"
abs="$(realpath -m -- "$file")"
rel="${abs#"$root"/}"

deny() {
  echo "test-writer: blocked edit of '$rel' — $1. A change to source, mocks, config or fixtures outside test dirs goes under 'Needs implementer' in your report." >&2
  exit 2
}

[[ "$rel" != "$abs" ]] || deny "path is outside the repository"

case "$rel" in
  client/src/vendor/* | .env* | */.env* | */node_modules/* | *INSIGHTS.md) deny "protected path" ;;
esac

# Its own pipeline report (git-ignored).
[[ "$rel" =~ ^\.pipeline/[a-z0-9]+(-[a-z0-9]+)*/test-writer\.md$ ]] && exit 0

case "$rel" in
  client/src/*.test.ts | client/src/*.test.tsx | client/src/test/*) exit 0 ;;
  server/test/* | reviewer-core/test/*) exit 0 ;;
  e2e/specs/flows.md | e2e/README.md) exit 0 ;;
  e2e/specs/*.flow.json)
    base="${rel##*/}"
    [[ "$rel" == "e2e/specs/$base" && "$base" =~ ^[0-9]{2}-[a-z0-9]+(-[a-z0-9]+)*\.flow\.json$ ]] && exit 0
    deny "flows are named NN-kebab-name.flow.json directly under e2e/specs"
    ;;
esac

deny "test-writer edits test files only"
