#!/usr/bin/env bash
# PreToolUse guard for project subagents. Usage: agent-guard.sh <profile>
# Profiles: test-writer | plan-verifier | doc-writer
# Reads the hook JSON on stdin. Exit 2 blocks the tool call; stderr goes back to the agent.
# Best-effort guard, not a sandbox: it exists because a `tools` allowlist does not stop Bash from writing.
set -u
profile="${1:-}"
input="$(cat)"
tool="$(printf '%s' "$input" | jq -r '.tool_name // empty')"
root="${CLAUDE_PROJECT_DIR:-$PWD}"

deny() { echo "agent-guard($profile): $1" >&2; exit 2; }

# ---------- Edit / Write: path allowlist ----------
if [ "$tool" = "Edit" ] || [ "$tool" = "Write" ]; then
  path="$(printf '%s' "$input" | jq -r '.tool_input.file_path // empty')"
  rel="${path#"$root"/}"
  case "$rel" in
    server/clones/*|*/node_modules/*|*/src/vendor/*|*pnpm-lock.yaml|*package-lock.json|*/migrations/*|*/drizzle/*)
      deny "'$rel' is on the do-not-touch list." ;;
  esac
  case "$profile" in
    test-writer)
      case "$rel" in
        *.test.ts|*.test.tsx|*.it.test.ts|*/test/*|*/__tests__/*|e2e/*) exit 0 ;;
      esac
      deny "test-writer may only write test files (*.test.ts[x], *.it.test.ts, test/, __tests__/, e2e/). '$rel' is source: report the needed change instead of editing it." ;;
    doc-writer)
      case "$rel" in
        INSIGHTS.md|*/INSIGHTS.md|CLAUDE.md|*/CLAUDE.md) deny "doc-writer must not write '$rel'; return insight candidates instead." ;;
        docs/*|*/docs/*|specs/*|*/specs/*) exit 0 ;;
      esac
      deny "doc-writer may only write under docs/, <pkg>/docs/, specs/, <pkg>/specs/. '$rel' is out of scope." ;;
    *) deny "profile '$profile' has no write access." ;;
  esac
fi

# ---------- Bash ----------
if [ "$tool" = "Bash" ]; then
  cmd="$(printf '%s' "$input" | jq -r '.tool_input.command // empty')"

  # Hard denials for every profile.
  printf '%s' "$cmd" | grep -Eq 'git[[:space:]]+(add|commit|push|reset|checkout|clean|stash|rebase|merge|rm|mv|restore|cherry-pick)\b' && deny "git commands that change history, index or worktree are forbidden."
  printf '%s' "$cmd" | grep -Eq 'db:(generate|migrate)|drizzle-kit' && deny "migrations are forbidden."
  printf '%s' "$cmd" | grep -Eq 'docker[[:space:]]+compose[[:space:]]+down' && deny "docker compose down is forbidden."
  printf '%s' "$cmd" | grep -Eq '(^|[^[:alnum:]_])(rm|mv|cp|tee|dd|truncate|chmod|chown)[[:space:]]|sed[[:space:]]+(-[a-zA-Z]*i|--in-place)|\$\(|`' && deny "file-mutating commands and command substitution are forbidden."
  # Redirects: allow 2>&1 and >/dev/null, block anything else.
  stripped="$(printf '%s' "$cmd" | sed -E 's#[0-9]*>&[0-9]##g; s#[0-9]*>[[:space:]]*/dev/null##g')"
  printf '%s' "$stripped" | grep -q '>' && deny "output redirection to files is forbidden."

  [ "$profile" = "test-writer" ] && exit 0

  # Allowlist for read-mostly profiles: every segment must match.
  case "$profile" in
    plan-verifier) allow='^(cd [^ ]+|git (diff|log|show|status|blame)( .*)?|rg( .*)?|ls( .*)?|wc( .*)?|pnpm (typecheck|test|exec vitest .*)|npm (test|run typecheck)|(\./)?scripts/check-all\.sh( --(force|build))*)( .*)?$' ;;
    doc-writer)    allow='^(cd [^ ]+|git (diff|log|show|status|blame)( .*)?|rg( .*)?|ls( .*)?|wc( .*)?)$' ;;
    *) deny "profile '$profile' has no Bash access." ;;
  esac
  segs="$(printf '%s' "$cmd" | sed -E 's/(&&|\|\||;|\|)/\n/g')"
  while IFS= read -r seg; do
    seg="$(printf '%s' "$seg" | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//')"
    [ -z "$seg" ] && continue
    printf '%s' "$seg" | grep -Eq "$allow" || deny "'$seg' is not on the Bash allowlist."
  done <<< "$segs"
fi

exit 0
