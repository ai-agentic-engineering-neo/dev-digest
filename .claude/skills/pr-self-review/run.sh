#!/usr/bin/env bash
# PreToolUse hook shim for the pr-self-review skill.
#
# Fires on every Bash tool call; no-ops unless the command is `gh pr create ...`
# or `git push <branch> origin` / `git push origin ...`. When it matches, runs
# the pr-self-review skill headlessly and propagates its exit code so a CRITICAL
# finding blocks the tool call.
#
# Hook contract (Claude Code):
#   - stdin: JSON { tool_name, tool_input: { command, description }, ... }
#   - exit 0        → allow the tool call
#   - exit 2        → block the tool call; stderr is surfaced to Claude
#   - exit other    → non-blocking error, Claude sees stderr as a warning

set -euo pipefail

payload="$(cat)"

# Only gate Bash tool calls. Anything else: allow.
tool_name="$(printf '%s' "$payload" | jq -r '.tool_name // empty')"
if [[ "$tool_name" != "Bash" ]]; then
  exit 0
fi

command_str="$(printf '%s' "$payload" | jq -r '.tool_input.command // empty')"

# Match `gh pr create ...` or a `git push` that targets origin.
if [[ ! "$command_str" =~ (^|[[:space:]])gh[[:space:]]+pr[[:space:]]+create([[:space:]]|$) ]] \
   && [[ ! "$command_str" =~ (^|[[:space:]])git[[:space:]]+push([[:space:]].*)?[[:space:]]+origin([[:space:]]|$) ]]; then
  exit 0
fi

# Resolve project root (the hook is invoked from the repo root, but be explicit).
repo_root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$repo_root"

# Headless skill invocation. --print returns a single final message; non-zero
# exit indicates CRITICAL findings per the skill's workflow.
if ! command -v claude >/dev/null 2>&1; then
  echo "pr-self-review: 'claude' CLI not on PATH; skipping gate" >&2
  exit 0
fi

set +e
PR_SELF_REVIEW_IN_PROGRESS=1 claude -p "/pr-self-review" --output-format text
status=$?
set -e

if [[ $status -ne 0 ]]; then
  echo "pr-self-review: BLOCKED — CRITICAL findings detected. Resolve them before opening the PR." >&2
  exit 2
fi

exit 0
