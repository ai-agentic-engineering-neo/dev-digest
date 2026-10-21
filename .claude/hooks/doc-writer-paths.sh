#!/usr/bin/env bash
# PreToolUse guard (Edit|Write|NotebookEdit) for the doc-writer subagent: an
# allowlist of Markdown documentation paths, plus the root specs/ feature
# specs and their index so it can flip a spec's Status to implemented.
# Paths are normalised first.
# Each refusal names who owns the path instead. Exit 2 + stderr = block.
set -euo pipefail

payload="$(cat)"
file="$(printf '%s' "$payload" | jq -r '.tool_input.file_path // .tool_input.notebook_path // ""')"
[[ -n "$file" ]] || exit 0

root="$(realpath -m -- "${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel)}")"
[[ "$file" == /* ]] || file="$root/$file"
abs="$(realpath -m -- "$file")"
rel="${abs#"$root"/}"

deny() {
  echo "doc-writer: blocked edit of '$rel' — $1. Put proposed text under 'For the main session to apply' in your report." >&2
  exit 2
}

[[ "$rel" != "$abs" ]] || deny "path is outside the repository"
[[ "$rel" == *.md ]] || deny "doc-writer writes Markdown only"

# Its own pipeline report (git-ignored).
[[ "$rel" =~ ^\.pipeline/[a-z0-9]+(-[a-z0-9]+)*/doc-writer\.md$ ]] && exit 0

case "$rel" in
  AGENTS.md | */AGENTS.md | CLAUDE.md | */CLAUDE.md) deny "AGENTS.md / CLAUDE.md are maintained by humans" ;;
  *INSIGHTS.md) deny "INSIGHTS.md is written only through insight.sh" ;;
  TESTING.md) deny "TESTING.md is maintained by humans" ;;
  docs/plans/*) deny "plans are owned by the implementation-planner and the main session" ;;
  e2e/specs/*) deny "e2e/specs holds flow contracts owned by test-writer" ;;
  docs/skills/examples/*) deny "skill import fixtures, not documentation" ;;
  */vendor/* | .claude/* | */node_modules/*) deny "vendored or agent configuration files" ;;
esac

case "$rel" in
  README.md | docs/*.md | specs/README.md) exit 0 ;;
  server/docs/*.md | client/docs/*.md | reviewer-core/docs/*.md | e2e/docs/*.md) exit 0 ;;
  server/specs/*.md | client/specs/*.md | reviewer-core/specs/*.md) exit 0 ;;
  server/README.md | client/README.md | reviewer-core/README.md | e2e/README.md) exit 0 ;;
esac
[[ "$rel" =~ ^server/src/modules/[a-z0-9-]+/README\.md$ ]] && exit 0
# Root feature specs: only the Status line and the index line change (doc-writer.md §3).
[[ "$rel" =~ ^specs/[a-z0-9]+(-[a-z0-9]+)*\.md$ ]] && exit 0

deny "not a documentation path (see the placement table in doc-writer.md)"
