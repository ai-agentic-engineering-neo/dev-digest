#!/usr/bin/env bash
#
# pr-body.sh — render a PR body from a passing report.
#
# This is what stops the gate from being a pure tax: it hands back a filled-in
# PR description, so `gh pr create --body-file` is less work than writing one.
set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$SCRIPT_DIR/_lib.sh"
ROOT="$(psr_repo_root)" || psr_die "not a git repository"; cd "$ROOT" || exit 1
psr_need jq
R="$PSR_DIR/report.json"
[ -f "$R" ] || psr_die "no report — run /pr-self-review first"

OUT="$PSR_DIR/pr-body.md"
BASE="$(jq -r .base_sha "$R")"
{
  printf '## What changed\n\n'
  git log --format='- %s' "$BASE..HEAD" 2>/dev/null | grep -v '^- *$' || printf '_Uncommitted work — describe it here._\n'
  printf '\n## Where\n\n| area | files |\n|---|---|\n'
  jq -r '.buckets | to_entries[] | "| `\(.key)` | \(.value.files | length) |"' "$R"

  printf '\n## Self-review\n\n'
  jq -r '"`/pr-self-review` on `\(.head_sha[0:7])`: **\(.counts.CRITICAL) critical · \(.counts.WARNING) warning · \(.counts.SUGGESTION) suggestion**  \n"' "$R"
  printf 'Gates run: '
  jq -r '[.gates[] | select(.status=="pass") | .id] | join("`, `") | "`" + . + "`"' "$R"
  SKIPPED="$(jq -r '[.gates[] | select(.status=="skipped") | .id] | join(", ")' "$R")"
  [ -n "$SKIPPED" ] && printf '\nNot run: `%s` — see the warnings below.\n' "$SKIPPED"

  if [ "$(jq '.counts.WARNING' "$R")" != "0" ]; then
    printf '\n<details><summary>Known and accepted (%s warnings)</summary>\n\n' "$(jq -r .counts.WARNING "$R")"
    jq -r '.findings[] | select(.severity=="WARNING") | "- `\(.file):\(.start_line)` — \(.title)"' "$R"
    printf '\n</details>\n'
  fi

  if [ "$(jq -r '.override // "null"' "$R")" != "null" ]; then
    printf '\n> **Self-review was overridden** with `# psr-skip` at %s. Reviewer: please look at the CRITICAL findings in the report before approving.\n' \
      "$(jq -r '.override.at' "$R")"
  fi
  [ "$(jq -r .degraded "$R")" = "true" ] && printf '\n> Diff exceeded the review budget — only the deterministic gates ran, no LLM review.\n'
  printf '\n🤖 Generated with [Claude Code](https://claude.com/claude-code)\n'
} > "$OUT"

printf '%s\n' "$OUT"
