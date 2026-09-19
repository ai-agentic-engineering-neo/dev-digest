#!/usr/bin/env bash
# Self-check: gate.sh decisions + every skill named in skill-map.md exists.
set -uo pipefail
S="$(cd "$(dirname "$0")" && pwd)"; ROOT=$(git rev-parse --show-toplevel)
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT; export PR_SELF_REVIEW_DIR="$T"
fail=0
run() { jq -nc --arg c "$1" '{tool_input:{command:$c}}' | "$S/gate.sh"; }
expect() { # name, want(allow|deny), output
  local got=allow; echo "$3" | grep -q '"deny"' && got=deny
  [ "$got" = "$2" ] && echo "ok   $1" || { echo "FAIL $1 (want $2, got $got)"; fail=1; }; }
FP=$("$S/fingerprint.sh")
expect "non-PR command"     allow "$(run 'git status')"
expect "gh pr text inside commit msg" allow "$(run 'git commit -m "blocks gh pr create via hook"')"
expect "no verdict"        deny  "$(run 'gh pr create --fill')"
echo "{\"status\":\"PASS\",\"fingerprint\":\"stale\",\"critical_count\":0}" > "$T/verdict.json"
expect "stale fingerprint"  deny  "$(run 'gh pr create')"
echo "{\"status\":\"BLOCKED\",\"fingerprint\":\"$FP\",\"critical_count\":2}" > "$T/verdict.json"
expect "BLOCKED"            deny  "$(run 'cd x && gh pr merge 3')"
echo "{\"status\":\"PASS\",\"fingerprint\":\"$FP\",\"critical_count\":0}" > "$T/verdict.json"
expect "PASS + fresh"       allow "$(run 'gh pr create')"
for s in $(grep -oE '\b(frontend-ui-architecture|react-best-practices|next-best-practices|react-testing-library|onion-architecture|fastify-best-practices|drizzle-orm-patterns|postgresql-table-design|zod|security)\b' "$ROOT/.claude/skills/pr-self-review/references/skill-map.md" | sort -u); do
  [ -f "$ROOT/.claude/skills/$s/SKILL.md" ] && echo "ok   skill exists: $s" || { echo "FAIL missing skill: $s"; fail=1; }
done
exit $fail
