#!/usr/bin/env bash
# PreToolUse guard for the researcher and brainstorm subagents: Bash may run
# only a single read-only git command. Anything else is blocked (exit 2, reason
# on stderr). Usage in frontmatter:  researcher-git-readonly.sh [agent-name]
set -euo pipefail

who="${1:-researcher}"

cmd=$(jq -r '.tool_input.command // ""')

deny() {
  echo "$who: blocked — $1. Allowed: one plain 'git log|blame|show|diff|shortlog|grep|ls-files|rev-parse' command, no pipes, redirects or chaining." >&2
  exit 2
}

[[ -n "$cmd" ]] || deny "empty command"

# No chaining, pipes, redirects, substitution, subshells or multi-line input.
case "$cmd" in
  *$'\n'* | *';'* | *'&'* | *'|'* | *'>'* | *'<'* | *'`'* | *'$('* | *'${'*) deny "shell operators are not allowed" ;;
esac

# Subcommand must come straight after 'git' (no -c, -C, --exec-path, etc.).
read -r -a argv <<<"$cmd"
[[ "${argv[0]}" == "git" ]] || deny "only git is allowed"
case "${argv[1]:-}" in
  log | blame | show | diff | shortlog | grep | ls-files | rev-parse) ;;
  *) deny "git subcommand '${argv[1]:-}' is not allowed" ;;
esac

# Read-only subcommands that can still write files or run programs.
for arg in "${argv[@]:2}"; do
  case "$arg" in
    --output | --output=* | -O* | --open-files-in-pager* | --ext-diff | --textconv | --exec* | --upload-pack*)
      deny "option '$arg' can write files or run programs" ;;
  esac
done

exit 0
