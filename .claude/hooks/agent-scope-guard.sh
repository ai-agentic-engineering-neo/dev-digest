#!/bin/sh
# Agent scope guard — PreToolUse hook declared in the frontmatter of the
# planner, test-writer, doc-writer, architecture-reviewer and plan-verifier
# subagents, so it runs ONLY while one of them is active. One argument selects the profile:
#
#   test-writer — may write test files only (+ its red-proof worktree in $TMPDIR)
#   doc-writer  — may write markdown docs only
#   read-only   — may write nothing, and Bash may not write either
#
# Every profile shares the deny core of implementer-guard.sh (migrations, lock
# files, dependency changes, git history/state, .claude/, CLAUDE.md) and adds its
# own allowlist on top. Anything not on the allowlist is denied.
#
# Deliberately POSIX sh with no node: a hook that cannot start exits non-zero,
# which Claude Code treats as an ERROR and RUNS THE TOOL ANYWAY (root INSIGHTS.md,
# 2026-09-21). Anything this script cannot parse is answered with "ask", never
# with silence. It never prints "allow" — an allowed call exits 0 silently and
# goes through the normal permission flow.
#
# Not a sandbox: it pattern-matches command text. See ../hooks/README.md.
#
# Test: .claude/hooks/test-agent-scope-guard.sh

set -u
PATH="/usr/bin:/bin${PATH:+:$PATH}"
PROFILE=${1:-}

decide() { # $1 = deny|ask, $2 = reason (no double quotes, backslashes or newlines)
  printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"%s","permissionDecisionReason":"%s"}}' "$1" "Agent scope guard ($PROFILE): $2"
  exit 0
}

case "$PROFILE" in
  test-writer|doc-writer|read-only) ;;
  *) decide ask "missing or unknown profile - the hook command must name test-writer, doc-writer or read-only." ;;
esac

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

MARK='devdigest-redproof-'   # the test-writer's throwaway worktrees and files in $TMPDIR
TOOL=$(field '.tool_name' tool_name)

case "$TOOL" in
  Edit|Write|NotebookEdit|MultiEdit)
    [ "$PROFILE" = read-only ] && decide deny "this agent is read-only - it reports, it does not edit."
    FILE=$(field '.tool_input.file_path // .tool_input.notebook_path' file_path)
    [ -n "$FILE" ] || decide ask "could not read the target path of $TOOL - check it by hand."
    case "$FILE" in
      *../*|*/..|..) decide deny "path contains .. - use the normalised absolute path." ;;
    esac

    # Resolve to a repo-relative path; outside the project only the test-writer's
    # red-proof worktree is writable.
    case "$FILE" in
      /*)
        [ -n "${CLAUDE_PROJECT_DIR:-}" ] || decide ask "CLAUDE_PROJECT_DIR is not set - cannot tell whether $FILE is inside the project."
        case "$FILE" in
          "$CLAUDE_PROJECT_DIR"/*) REL=${FILE#"$CLAUDE_PROJECT_DIR"/} ;;
          *)
            if [ "$PROFILE" = test-writer ] && matches "$FILE" "/$MARK"; then exit 0; fi
            decide deny "$FILE is outside the project." ;;
        esac ;;
      *) REL=$FILE ;;
    esac

    # Deny core — the same for every profile.
    case "$REL" in
      server/src/db/migrations/*)
        decide deny "migrations are off-limits (root AGENTS.md)." ;;
      *pnpm-lock.yaml|*package-lock.json|*skills-lock.json|*yarn.lock)
        decide deny "lock files are off-limits (root AGENTS.md)." ;;
      .claude/*|*/.claude/*)
        decide deny "agents may not change .claude/ (their own guard rails, agents, skills, settings)." ;;
      *CLAUDE.md|*CLAUDE.local.md)
        decide deny "a CLAUDE.md silently disables every AGENTS.md in this repo (root INSIGHTS.md, 2026-09-20)." ;;
      INSIGHTS.md|*/INSIGHTS.md)
        decide deny "INSIGHTS.md is written by the engineering-insights skill in the main session - report Insight candidates instead." ;;
      package.json|*/package.json|*vitest.config.*|*tsconfig*.json|*next.config.*|*drizzle.config.*)
        decide deny "package and build configuration is not this agent's to change - report BLOCKED with the change you need." ;;
      */src/vendor/*)
        decide deny "vendored code (shared contracts, design system) is not this agent's to change." ;;
    esac

    if [ "$PROFILE" = test-writer ]; then
      case "$REL" in
        server/test/helpers/*|client/src/test/*|server/src/adapters/mocks.ts)
          decide ask "shared test infrastructure - every test in the package depends on it. Approve only if the change is additive." ;;
        server/test/*.it.test.ts) exit 0 ;;
        server/test/*.test.ts)
          # The raw input holds content (Write) or new_string (Edit) in both jq and sed mode.
          if matches "$INPUT" 'helpers/pg'; then
            decide deny "a test importing test/helpers/pg must end in .it.test.ts (TESTING.md) - rename the file."
          fi
          exit 0 ;;
        server/test/*|reviewer-core/test/*|client/src/*.test.ts|client/src/*.test.tsx|e2e/specs/*.flow.json)
          exit 0 ;;
      esac
      decide deny "test-writer writes test files only - if production code looks wrong, leave the test red and report it under Suspected defects."
    fi

    # doc-writer
    case "$REL" in
      AGENTS.md|*/AGENTS.md)
        decide ask "AGENTS.md is loaded into every session - approve only a change the user asked for." ;;
      *specs/*.md|docs/agent-prompts/*.md)
        case "$REL" in
          docs/agent-prompts/README.md) exit 0 ;;
        esac
        decide ask "specs are intent written before code, and docs/agent-prompts mirror the seeded prompts - approve only if the user asked for this edit." ;;
      docs/*.md|server/docs/*.md|client/docs/*.md|reviewer-core/docs/*.md|e2e/docs/*.md|README.md|*/README.md|TESTING.md)
        exit 0 ;;
    esac
    decide deny "doc-writer writes markdown documentation only (docs/, <pkg>/docs/, README.md, TESTING.md)." ;;

  Bash)
    CMD=$(field '.tool_input.command' command)
    [ -n "$CMD" ] || decide ask "could not read the Bash command - check it by hand."
    B='(^|[;&|(`[:space:]])'   # start of a command word
    # Quoted text is data (grep patterns, test names, commit-free messages), not
    # commands or redirects: strip it before looking for dependency, db, snapshot
    # and write verbs, so grep -n '</div>' and vitest -t 'rolls up costs' pass.
    # git-state checks and --frozen-lockfile still read the raw command.
    # One left-to-right pass: the FIRST quote decides the span's kind, so an
    # apostrophe inside "isn't" cannot open a '...' span that swallows && sed -i.
    BARE=$(printf '%s' "$CMD" | sed -E "s/'[^']*'|\"[^\"]*\"//g")
    HAS_MARK=0; matches "$CMD" "$MARK" && HAS_MARK=1

    if matches "$CMD" "${B}git([[:space:]]+-C[[:space:]]+[^[:space:]]+)?[[:space:]]+(commit|push|reset|rebase|merge|pull|clean|stash|checkout|restore|switch|cherry-pick|revert|am|apply|tag|branch[[:space:]]+-[dDmM])([[:space:]]|$)"; then
      decide deny "git history and working-tree state are not this agent's to change - leave the tree as it is and report."
    fi
    if matches "$CMD" "${B}git([[:space:]]+-C[[:space:]]+[^[:space:]]+)?[[:space:]]+worktree[[:space:]]+(add|remove|prune|move|lock|unlock|repair)"; then
      if [ "$PROFILE" = test-writer ] && { [ "$HAS_MARK" = 1 ] || matches "$CMD" "worktree[[:space:]]+prune"; }; then :; else
        decide deny "git worktree is allowed only for the test-writer red-proof, in a path containing $MARK."
      fi
    fi
    if [ "$PROFILE" != test-writer ] && matches "$CMD" "${B}git([[:space:]]+-C[[:space:]]+[^[:space:]]+)?[[:space:]]+(add|rm|mv|fetch|config|gc|notes|update-ref|update-index)([[:space:]]|$)"; then
      decide deny "this agent does not change the index, refs, remotes or git config."
    fi
    if matches "$CMD" "${B}gh[[:space:]]+(pr|release|repo|issue|api)[[:space:]]"; then
      decide deny "agents do not touch GitHub."
    fi
    if matches "$BARE" "${B}(pnpm|npm|yarn|npx|pnpx)[[:space:]]+([^;&|]*[[:space:]])?(add|remove|rm|uninstall|un|update|up|upgrade|dedupe|link|unlink)([[:space:]]|$)" \
       || matches "$BARE" "${B}yarn([[:space:]]|$)"; then
      decide deny "dependency changes are off-limits (root AGENTS.md). Report BLOCKED with the dependency you need."
    fi
    if matches "$BARE" "${B}(pnpm|npm)[[:space:]]+([^;&|]*[[:space:]])?(i|install|ci)([[:space:]]|$)"; then
      if [ "$PROFILE" = test-writer ] && { matches "$CMD" "--frozen-lockfile" || matches "$CMD" "${B}npm[[:space:]]+ci([[:space:]]|$)"; }; then :; else
        decide deny "installs are not this agent's job - with missing dependencies, report the check as not run."
      fi
    fi
    if matches "$BARE" "${B}(pnpx|pnpm[[:space:]]+dlx)([[:space:]]|$)|${B}npx[[:space:]]+(-y|--yes)"; then
      decide deny "npx -y / pnpm dlx download and run packages that are not in the lock file."
    fi
    if [ "$PROFILE" != test-writer ] && matches "$BARE" "${B}npx[[:space:]]"; then
      decide deny "npx can fetch and run an arbitrary package - use the package's own scripts (pnpm test, npm test, pnpm typecheck)."
    fi
    if matches "$BARE" "db:(generate|migrate|seed|push)|drizzle-kit[[:space:]]+(generate|push|drop|migrate)"; then
      decide deny "db:* / drizzle-kit write migrations or the database, both off-limits (root AGENTS.md)."
    fi
    if matches "$CMD" "${B}docker[[:space:]]+(rm|rmi|kill|stop|volume|system|network[[:space:]]+rm)|${B}docker[[:space:]]+compose[^;&|]*[[:space:]]down"; then
      decide deny "agents do not stop or delete containers and volumes."
    fi
    if matches "$BARE" "(vitest|test)[^;&|]*[[:space:]](-u|--update)([[:space:]]|$)"; then
      decide deny "updating snapshots rewrites the expected values to whatever the code does now - assert behaviour instead."
    fi
    if matches "$BARE" "${B}(node|bun|deno)[[:space:]]+(-e|--eval|-p|--print)|${B}python3?[[:space:]]+-c|${B}(ruby|perl)[[:space:]]+-[a-zA-Z]*e|${B}(sh|bash|zsh)[[:space:]]+-c|${B}eval[[:space:]]|${B}(curl|wget)[[:space:]]"; then
      decide deny "inline interpreters, eval and network fetches can write anywhere - use a plain command."
    fi

    # Writes through the shell. Strip redirects that write nothing, then look for
    # any remaining > and for write verbs.
    REDIR=$(printf '%s' "$BARE" | sed -E -e 's/[0-9]*>&[0-9-]//g' -e 's/&>>?[[:space:]]*\/dev\/null//g' -e 's/[0-9]*>>?[[:space:]]*\/dev\/null//g' -e 's/[=-]>//g')
    WRITES=0
    case "$REDIR" in *'>'*) WRITES=1 ;; esac
    if matches "$BARE" "${B}(rm|rmdir|mv|cp|tee|touch|truncate|ln|mkdir|chmod|chown|dd)[[:space:]]|${B}sed[[:space:]]+(-[a-zA-Z]*i|--in-place)|${B}perl[[:space:]]+-[a-zA-Z]*i|${B}find[[:space:]][^;&|]*-(delete|exec|execdir|ok)([[:space:]]|$)"; then
      WRITES=1
    fi
    if [ "$WRITES" = 1 ]; then
      if [ "$PROFILE" = test-writer ] && [ "$HAS_MARK" = 1 ]; then exit 0; fi
      case "$PROFILE" in
        test-writer) decide deny "shell writes are allowed only inside the red-proof worktree (a path containing $MARK) - write test files with Write/Edit." ;;
        doc-writer)  decide deny "shell writes are not allowed - write docs with Write/Edit." ;;
        *)           decide deny "this agent is read-only - no redirects into files, rm, mv, cp, tee, sed -i." ;;
      esac
    fi
    exit 0 ;;
esac

exit 0
