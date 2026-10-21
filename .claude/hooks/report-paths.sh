#!/usr/bin/env bash
# PreToolUse guard (Edit|Write) for the implementation-planner, the only read-only agent that
# writes a file: its plan. Usage in frontmatter:  report-paths.sh implementation-planner
#
#   implementation-planner docs/plans/<kebab>.md (the plan is its report; the agent was named "planner" until 2026-10-18)
#
# researcher, architecture-reviewer, plan-verifier, security-reviewer and
# brainstorm have no Write tool at all (2026-10-07): they return the report
# in their final message and the main session saves it to .pipeline/<slug>/.
# Any other agent name is refused.
# Paths are normalised (`..`). Exit 2 + stderr = block.
set -euo pipefail

agent="${1:-}"
payload="$(cat)"
file="$(printf '%s' "$payload" | jq -r '.tool_input.file_path // .tool_input.notebook_path // ""')"
[[ -n "$file" ]] || exit 0

root="$(realpath -m -- "${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel)}")"
[[ "$file" == /* ]] || file="$root/$file"
abs="$(realpath -m -- "$file")"
rel="${abs#"$root"/}"

deny() {
  echo "$agent: blocked write to '$rel' — $1. You write only your own report; everything else goes in it." >&2
  exit 2
}

[[ "$rel" != "$abs" ]] || deny "path is outside the repository"

slug='[a-z0-9]+(-[a-z0-9]+)*'
case "$agent" in
  implementation-planner)
    [[ "$rel" =~ ^docs/plans/${slug}\.md$ ]] && exit 0
    deny "the implementation-planner writes only docs/plans/<kebab>.md; specs, docs and READMEs belong to doc-writer" ;;
  researcher | architecture-reviewer | plan-verifier | security-reviewer | brainstorm)
    deny "the $agent is read-only and writes no files; return the report in your final message" ;;
  *)
    deny "report-paths.sh: unknown agent '$agent'" ;;
esac
