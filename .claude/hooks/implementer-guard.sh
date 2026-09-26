#!/bin/sh
# Implementer guard — PreToolUse hook declared in .claude/agents/implementer.md
# frontmatter, so it runs ONLY while the `implementer` subagent is active.
#
# It turns the "do not touch" rules of the root AGENTS.md into a mechanical check:
#   deny  — migrations, lock files, dependency changes, git history/state changes,
#           anything under .claude/ (its own guard rails), CLAUDE.md, and test
#           files (the test-writer agent owns them)
#   ask   — DB schema and package.json (allowed only with the user's say-so)
#   allow — everything else: prints nothing, exits 0, normal permission flow.
#
# Deliberately POSIX sh with no node: a hook that cannot start exits non-zero,
# which Claude Code treats as an ERROR and RUNS THE TOOL ANYWAY (root INSIGHTS.md,
# 2026-09-21). Anything this script cannot parse is answered with "ask", never
# with silence.
#
# Test: .claude/hooks/test-implementer-guard.sh

set -u
PATH="/usr/bin:/bin${PATH:+:$PATH}"

decide() { # $1 = deny|ask, $2 = reason (no double quotes, backslashes or newlines)
  printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"%s","permissionDecisionReason":"%s"}}' "$1" "Implementer guard: $2"
  exit 0
}

INPUT=$(cat | tr '\n\r' '  ')
[ -n "$INPUT" ] || decide ask "empty hook input - cannot check this call."

# field <jq path> <json key>: jq when present (exact), sed otherwise (good enough
# for flat string fields; GUARD_NO_JQ=1 forces the fallback in tests).
field() {
  if [ -z "${GUARD_NO_JQ:-}" ] && command -v jq >/dev/null 2>&1; then
    printf '%s' "$INPUT" | jq -r "$1 // empty" 2>/dev/null
  else
    printf '%s' "$INPUT" | sed -E -n "s/.*\"$2\"[[:space:]]*:[[:space:]]*\"(([^\"\\\\]|\\\\.)*)\".*/\\1/p" | sed 's/\\"/"/g; s/\\\\/\\/g'
  fi
}

matches() { printf '%s' "$1" | grep -E -q -- "$2"; }

TOOL=$(field '.tool_name' tool_name)

case "$TOOL" in
  Edit|Write|NotebookEdit|MultiEdit)
    FILE=$(field '.tool_input.file_path // .tool_input.notebook_path' file_path)
    [ -n "$FILE" ] || decide ask "could not read the target path of $TOOL - check it by hand."
    case "$FILE" in
      */server/src/db/migrations/*|server/src/db/migrations/*)
        decide deny "migrations are off-limits (root AGENTS.md). Stop and report BLOCKED - the user adds migrations by hand (docs/hand-written-migrations.md)." ;;
      *pnpm-lock.yaml|*package-lock.json|*skills-lock.json|*yarn.lock)
        decide deny "lock files are off-limits (root AGENTS.md). Stop and report BLOCKED." ;;
      */.claude/*|.claude/*)
        decide deny "the implementer may not change .claude/ (its own guard rails, agents, skills, settings). Report it as an out-of-scope observation." ;;
      *CLAUDE.md|*CLAUDE.local.md)
        decide deny "a CLAUDE.md silently disables every AGENTS.md in this repo (root INSIGHTS.md, 2026-09-20)." ;;
      *.test.ts|*.test.tsx|*/server/test/*|server/test/*|*/reviewer-core/test/*|reviewer-core/test/*|*/client/src/test/*|client/src/test/*|*/e2e/specs/*.flow.json|e2e/specs/*.flow.json)
        decide deny "tests are written by the test-writer agent, not the implementer. List what needs a test (and any existing test your change is meant to break) under Handoff to test-writer." ;;
      */server/src/db/schema.ts|*/server/src/db/schema/*)
        decide ask "DB schema change implies a migration (root AGENTS.md). Approve only if the plan's Gates section was approved for this." ;;
      */package.json|package.json)
        decide ask "package.json edit - dependency changes are off-limits (root AGENTS.md); approve only for a non-dependency change the plan names." ;;
    esac
    exit 0 ;;

  Bash)
    CMD=$(field '.tool_input.command' command)
    [ -n "$CMD" ] || decide ask "could not read the Bash command - check it by hand."
    B='(^|[;&|(`[:space:]])'   # start of a command word
    # Quoted text is data (grep patterns, test names), not commands: the dependency
    # and db checks read BARE, so vitest -t 'rolls up costs' is not a dependency
    # change. git state, --frozen-lockfile and the write-path checks read the raw
    # command, where a quoted path still counts.
    # One left-to-right pass: the FIRST quote decides the span's kind, so an
    # apostrophe inside "isn't" cannot open a '...' span that swallows && sed -i.
    BARE=$(printf '%s' "$CMD" | sed -E "s/'[^']*'|\"[^\"]*\"//g")
    if matches "$CMD" "${B}git([[:space:]]+-C[[:space:]]+[^[:space:]]+)?[[:space:]]+(commit|push|reset|rebase|merge|pull|clean|stash|checkout|restore|switch|cherry-pick|revert|am|apply|tag|branch[[:space:]]+-[dDmM])([[:space:]]|$)"; then
      decide deny "git history and working-tree state are not the implementer's to change (no commit, push, reset, checkout, stash...). Leave the diff uncommitted and report."
    fi
    if matches "$CMD" "${B}gh[[:space:]]+(pr|release|repo)[[:space:]]"; then
      decide deny "the implementer does not open PRs or touch GitHub."
    fi
    if matches "$BARE" "${B}(pnpm|npm|yarn|npx|pnpx)[[:space:]]+([^;&|]*[[:space:]])?(add|remove|rm|uninstall|un|update|up|upgrade|dedupe|link|unlink)([[:space:]]|$)"; then
      decide deny "dependency changes are off-limits (root AGENTS.md). Report BLOCKED with the dependency you need."
    fi
    if matches "$BARE" "${B}(pnpm|npm)[[:space:]]+([^;&|]*[[:space:]])?(i|install)([[:space:]]|$)" && ! matches "$CMD" "--frozen-lockfile"; then
      decide deny "installs must not touch lock files - use pnpm install --frozen-lockfile or npm ci."
    fi
    if matches "$BARE" "${B}(yarn)([[:space:]]|$)"; then
      decide deny "this repo uses pnpm/npm; yarn would write a new lock file."
    fi
    if matches "$BARE" "db:generate|drizzle-kit[[:space:]]+(generate|push|drop|migrate)"; then
      decide deny "db:generate / drizzle-kit writes migrations or the DB, both off-limits (root AGENTS.md)."
    fi
    P='(server/src/db/migrations|pnpm-lock\.yaml|package-lock\.json|skills-lock\.json|\.claude/)'
    if matches "$CMD" ">>?[[:space:]]*[^[:space:]&|;]*$P" \
       || { matches "$CMD" "$P" \
            && matches "$CMD" "${B}(rm|mv|cp|tee|touch|truncate|ln)[[:space:]]|sed[[:space:]]+(-[a-zA-Z]*i|--in-place)|perl[[:space:]]+-[a-zA-Z]*i"; }; then
      decide deny "Bash write to a protected path (migrations, lock files or .claude/)."
    fi
    exit 0 ;;
esac

exit 0
