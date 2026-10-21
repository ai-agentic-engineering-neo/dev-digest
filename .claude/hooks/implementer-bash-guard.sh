#!/usr/bin/env bash
# PreToolUse guard (Bash) for the implementer subagent. A denylist: builds,
# tests, package scripts and db:generate/db:migrate run freely; history
# rewrites, anything that leaves the machine, destructive Docker commands and
# shell writes into protected paths are refused. Exit 2 + stderr = block.
set -euo pipefail

cmd="$(jq -r '.tool_input.command // ""')"
[[ -n "$cmd" ]] || exit 0

deny() {
  echo "implementer: blocked — $1. Stop and report it under 'Not done / blockers'; commits, pushes and PRs happen after review." >&2
  exit 2
}

sep='(^|[;&|({[:space:]])'

# Git: no commits, pushes, history rewrites or discarding work.
if grep -Eq "${sep}git([[:space:]]+-C[[:space:]]+[^[:space:]]+)?[[:space:]]+(push|commit|merge|rebase|cherry-pick|revert|tag|clean|restore|switch|reset[[:space:]]+--hard|checkout[[:space:]]+(--|\\.|-b|-B)|branch[[:space:]]+-[dDmM]|stash[[:space:]]+(drop|clear|pop))([[:space:]]|$)" <<<"$cmd"; then
  deny "git write or history operation"
fi
grep -Eq "${sep}gh[[:space:]]" <<<"$cmd" && deny "GitHub CLI is not available to the implementer"

# Docker: never drop the dev volume (root AGENTS.md).
grep -Eq "docker([[:space:]]+|-)compose[[:space:]]+down|docker[[:space:]]+(volume|system)[[:space:]]+(rm|prune)" <<<"$cmd" \
  && deny "docker down/volume removal deletes the dev database"

# Baseline and toolchain.
grep -q 'lint:arch:baseline' <<<"$cmd" && deny "the lint:arch baseline is regenerated only by a human after removing violations"
grep -Eq "${sep}corepack[[:space:]]+enable" <<<"$cmd" && deny "corepack is broken on this machine"
grep -Eq "${sep}rm[[:space:]]+-[a-zA-Z]*r[a-zA-Z]*f?[[:space:]]+(/|~|\\.|\\*)([[:space:]]|$)" <<<"$cmd" && deny "recursive delete of a root, home or working directory"

# Shell writes into protected paths (the Edit/Write hook cannot see these).
protected='(pnpm-lock\.yaml|package-lock\.json|skills-lock\.json|\.claude/|client/src/vendor/ui/|db/migrations/|known-violations\.json|INSIGHTS\.md|docs/plans/|(^|[[:space:]/"'"'"'])\.env)'
writes='(>|[[:space:]]tee[[:space:]]|sed[[:space:]]+(-[a-zA-Z]*i|--in-place)|perl[[:space:]]+-[a-zA-Z]*i|[[:space:]]mv[[:space:]]|^mv[[:space:]]|[[:space:]]rm[[:space:]]|^rm[[:space:]]|truncate[[:space:]]|[[:space:]]cp[[:space:]]|^cp[[:space:]])'
if grep -Eq "$protected" <<<"$cmd" && grep -Eq "$writes" <<<"$cmd"; then
  # insight.sh is the sanctioned writer of INSIGHTS.md.
  grep -q 'engineering-insights/scripts/insight.sh' <<<"$cmd" || deny "shell write touching a protected path"
fi
# The client contract copy may change only by copying the server copy over it.
if grep -q 'client/src/vendor/shared' <<<"$cmd" && grep -Eq "$writes" <<<"$cmd"; then
  grep -Eq "(^|[[:space:]])cp[[:space:]]+(-[a-zA-Z]+[[:space:]]+)*[^[:space:]]*server/src/vendor/shared" <<<"$cmd" \
    || deny "client/src/vendor/shared changes only via 'cp' from server/src/vendor/shared"
fi

exit 0
