#!/usr/bin/env bash
# PreToolUse guard (Bash) for the read-only reviewers. Usage in frontmatter:
#   reviewer-bash-allowlist.sh arch     architecture-reviewer
#   reviewer-bash-allowlist.sh verify   plan-verifier (adds package checks)
#   reviewer-bash-allowlist.sh security security-reviewer (adds dependency audits)
# A strict allowlist. One optional `PATH=<nvm node 22 bin>:$PATH ` prefix is
# accepted so pnpm runs on Node 22 without chaining. Anything not listed falls
# through to planner-readonly.sh (read-only git, insight.sh reads).
# Exit 2 + stderr = block.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
profile="${1:-arch}"
case "$profile" in
  arch) who="architecture-reviewer" ;;
  verify) who="plan-verifier" ;;
  security) who="security-reviewer" ;;
  *) echo "reviewer-bash-allowlist: unknown profile '$profile'" >&2; exit 2 ;;
esac

payload="$(cat)"
cmd="$(printf '%s' "$payload" | jq -r '.tool_input.command // ""')"

deny() {
  {
    echo "$who: blocked — $1."
    echo "Allowed: [PATH=~/.nvm/versions/node/v22.x/bin:\$PATH] pnpm -C server lint:arch | .claude/skills/onion-architecture-backend/scripts/check-arch.sh [--all] | .claude/skills/pr-self-review/scripts/changed-files.sh [flags] base|list|diff | .claude/skills/pr-self-review/scripts/route.sh [flags] | .claude/skills/pr-self-review/scripts/verify.sh check [--with-it] [--e2e]|show"
    [[ "$profile" == security ]] && echo "  plus: pnpm -C server|client audit [--prod] | npm --prefix reviewer-core|e2e audit [--omit=dev] (read-only; --fix is refused)"
    [[ "$profile" == verify ]] && echo "  plus: pnpm -C server|client typecheck|lint|test | pnpm -C server|client exec vitest run [args] | npm --prefix reviewer-core test|run typecheck|run lint | npm --prefix e2e run typecheck|lint"
    echo "  plus one plain read-only git command or insight.sh module|list|sections|check. No pipes, redirects or chaining. If Node 22 moved, the PATH pattern in this hook must follow."
  } >&2
  exit 2
}

[[ -n "$cmd" ]] || deny "empty command"

rest="$cmd"
prefixed=0
if [[ "$rest" =~ ^PATH=(~|\$HOME|/home/[^/[:space:]]+)/\.nvm/versions/node/v22[0-9.]*/bin:\$PATH[[:space:]]+(.*)$ ]]; then
  rest="${BASH_REMATCH[2]}"
  prefixed=1
fi

case "$rest" in
  *$'\n'* | *';'* | *'&'* | *'|'* | *'>'* | *'<'* | *'`'* | *'$('* | *'${'*) deny "shell operators are not allowed" ;;
esac

read -r -a argv <<<"$rest"
for a in "${argv[@]}"; do
  case "$a" in
    --baseline | lint:arch:baseline | --fix | -u | --update | --outputFile* | --output* | --watch | -w)
      deny "option '$a' writes files or keeps running" ;;
  esac
done

# Optional leading `bash` and `./` for the skill scripts.
i=0
[[ "${argv[0]}" == "bash" ]] && i=1
script="${argv[$i]:-}"
script="${script#./}"
args=("${argv[@]:$((i + 1))}")

case "$script" in
  .claude/skills/onion-architecture-backend/scripts/check-arch.sh)
    [[ ${#args[@]} -eq 0 || "${args[*]}" == "--all" ]] && exit 0
    deny "check-arch.sh takes no arguments or --all" ;;
  .claude/skills/pr-self-review/scripts/changed-files.sh)
    j=0
    while [[ $j -lt ${#args[@]} ]]; do
      case "${args[$j]}" in
        --all | --staged | --branch) j=$((j + 1)) ;;
        --base) j=$((j + 2)) ;;
        base | list | diff) exit 0 ;;
        *) deny "changed-files.sh mode '${args[$j]}' is not allowed (base|list|diff)" ;;
      esac
    done
    deny "changed-files.sh needs a mode: base|list|diff" ;;
  .claude/skills/pr-self-review/scripts/route.sh)
    for a in "${args[@]}"; do
      [[ "$a" == "-" ]] && deny "route.sh - needs a pipe; pass mode flags instead"
    done
    exit 0 ;;
  .claude/skills/pr-self-review/scripts/verify.sh)
    # Reviewers read the implementer's verification result; only `run` executes checks.
    case "${args[0]:-}" in
      check)
        for a in "${args[@]:1}"; do
          [[ "$a" == "--with-it" || "$a" == "--e2e" ]] || deny "verify.sh check takes only --with-it and --e2e"
        done
        exit 0 ;;
      show) [[ ${#args[@]} -eq 1 ]] && exit 0; deny "verify.sh show takes no arguments" ;;
      *) deny "verify.sh '${args[0]:-}' is not allowed for reviewers (check | show); the implementer runs the checks" ;;
    esac ;;
esac

joined="${argv[*]}"
[[ "$joined" == "pnpm -C server lint:arch" ]] && exit 0

if [[ "$profile" == verify ]]; then
  [[ "$joined" =~ ^pnpm\ -C\ (server|client)\ (typecheck|lint|test)$ ]] && exit 0
  [[ "$joined" =~ ^pnpm\ -C\ (server|client)\ exec\ vitest\ run(\ .*)?$ ]] && exit 0
  [[ "$joined" =~ ^npm\ --prefix\ reviewer-core\ (test|run\ typecheck|run\ lint)$ ]] && exit 0
  [[ "$joined" =~ ^npm\ --prefix\ e2e\ run\ (typecheck|lint)$ ]] && exit 0
fi

if [[ "$profile" == security ]]; then
  # Audits only read the lockfile and query the advisory DB; --fix is refused above.
  [[ "$joined" =~ ^pnpm\ -C\ (server|client)\ audit(\ --prod)?$ ]] && exit 0
  [[ "$joined" =~ ^npm\ --prefix\ (reviewer-core|e2e)\ audit(\ --omit=dev)?$ ]] && exit 0
fi

# The PATH prefix is only for the commands above.
[[ $prefixed -eq 0 ]] || deny "the PATH prefix is allowed only on the listed pnpm/npm/script commands"

if ! out="$(printf '%s' "$payload" | bash "$HERE/planner-readonly.sh" 2>&1)"; then
  deny "${out#planner: blocked — }"
fi
exit 0
