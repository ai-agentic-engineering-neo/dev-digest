#!/usr/bin/env bash
# PreToolUse guard (Edit|Write|NotebookEdit) for the spec-creator subagent: it
# may write only feature specifications in the root specs/ folder and that
# folder's README (the index). Paths are normalised first. Exit 2 + stderr = block.
set -euo pipefail

payload="$(cat)"
file="$(printf '%s' "$payload" | jq -r '.tool_input.file_path // .tool_input.notebook_path // ""')"
[[ -n "$file" ]] || exit 0

root="$(realpath -m -- "${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel)}")"
[[ "$file" == /* ]] || file="$root/$file"
abs="$(realpath -m -- "$file")"
rel="${abs#"$root"/}"

deny() {
  echo "spec-creator: blocked edit of '$rel' — $1. Specifications live only in specs/<kebab-feature>.md and specs/README.md; everything else goes into your hand-back as a suggestion." >&2
  exit 2
}

[[ "$rel" != "$abs" ]] || deny "path is outside the repository"
[[ "$rel" == *.md ]] || deny "spec-creator writes Markdown only"

case "$rel" in
  specs/README.md) exit 0 ;;
  specs/*/*) deny "no subfolders under specs/" ;;
  server/specs/* | client/specs/* | reviewer-core/specs/* | mcp/specs/*) deny "package specs/ folders hold implemented specs owned by doc-writer" ;;
  e2e/specs/*) deny "e2e/specs holds flow contracts owned by test-writer" ;;
  docs/plans/*) deny "plans are owned by the implementation-planner" ;;
  *INSIGHTS.md) deny "INSIGHTS.md is written only through insight.sh" ;;
  AGENTS.md | */AGENTS.md | CLAUDE.md | */CLAUDE.md) deny "AGENTS.md / CLAUDE.md are maintained by humans" ;;
  .claude/* | */vendor/* | */node_modules/*) deny "agent configuration or vendored files" ;;
esac

[[ "$rel" =~ ^specs/[a-z0-9]+(-[a-z0-9]+)*\.md$ ]] && exit 0

deny "not a specification path"
