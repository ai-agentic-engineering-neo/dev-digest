#!/usr/bin/env bash
# Offline test for the agent scope guard hook. No model, no network, no API key.
#
#   .claude/hooks/test-agent-scope-guard.sh
#
# Every case asserts on the decision the hook prints (deny | ask | allow = nothing)
# and on exit 0, which together are the whole contract Claude Code sees. Each case
# runs twice: with jq, and with GUARD_NO_JQ=1 to exercise the sed fallback.

set -u

HOOK_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
GUARD="$HOOK_DIR/agent-scope-guard.sh"
ROOT="/repo"
export CLAUDE_PROJECT_DIR="$ROOT"
RP="/tmp/devdigest-redproof-1"   # a red-proof worktree path
PASS=0
FAIL=0

decision_of() { # stdout of the hook -> deny | ask | allow | garbage
  case "$1" in
    "") echo allow ;;
    *'"permissionDecision":"deny"'*) echo deny ;;
    *'"permissionDecision":"ask"'*) echo ask ;;
    *) echo "garbage:$1" ;;
  esac
}

run_case() { # profile, expected, name, json
  local profile=$1 expected=$2 name=$3 json=$4 mode out rc got
  for mode in jq sed; do
    if [ "$mode" = sed ]; then
      out=$(printf '%s' "$json" | GUARD_NO_JQ=1 "$GUARD" $profile); rc=$?
    else
      out=$(printf '%s' "$json" | "$GUARD" $profile); rc=$?
    fi
    got=$(decision_of "$out")
    if [ "$rc" -eq 0 ] && [ "$got" = "$expected" ]; then
      PASS=$((PASS + 1))
    else
      FAIL=$((FAIL + 1))
      printf 'FAIL [%s/%s] %s: expected %s, got %s (exit %s)\n' "$profile" "$mode" "$name" "$expected" "$got" "$rc"
    fi
  done
}

edit()  { printf '{"tool_name":"%s","tool_input":{"file_path":"%s","old_string":"a","new_string":"%s"}}' "$1" "$2" "${3:-b}"; }
bash_() { printf '{"tool_name":"Bash","tool_input":{"command":"%s","description":"x"}}' "$1"; }
tw()  { run_case test-writer "$@"; }
dw()  { run_case doc-writer  "$@"; }
ro()  { run_case read-only   "$@"; }

# ================================================================ test-writer
# ---- Edit / Write: allowed
tw allow "server unit test"            "$(edit Write "$ROOT/server/test/x.test.ts")"
tw allow "server it test with pg"      "$(edit Write "$ROOT/server/test/x.it.test.ts" "import { startPg } from './helpers/pg.js'")"
tw allow "server fixture"              "$(edit Write "$ROOT/server/test/fixtures/a.json")"
tw allow "client colocated test"       "$(edit Write "$ROOT/client/src/app/a/_components/B/B.test.tsx")"
tw allow "client lib test"             "$(edit Edit  "$ROOT/client/src/lib/format.test.ts")"
tw allow "reviewer-core test"          "$(edit Write "$ROOT/reviewer-core/test/y.test.ts")"
tw allow "e2e flow"                    "$(edit Write "$ROOT/e2e/specs/09-x.flow.json")"
tw allow "red-proof worktree file"     "$(edit Edit  "$RP/server/src/modules/reviews/service.ts")"
# ---- Edit / Write: ask
tw ask   "pg helper"                   "$(edit Edit  "$ROOT/server/test/helpers/pg.ts")"
tw ask   "client test setup"           "$(edit Edit  "$ROOT/client/src/test/setup.ts")"
tw ask   "mocks.ts"                    "$(edit Edit  "$ROOT/server/src/adapters/mocks.ts")"
# ---- Edit / Write: denied
tw deny  "dot-dot escape"              "$(edit Write "$ROOT/server/test/../src/a.ts")"
tw deny  "unit test importing pg"      "$(edit Write "$ROOT/server/test/a.test.ts" "import { startPg } from './helpers/pg.js'")"
tw deny  "server service"              "$(edit Edit  "$ROOT/server/src/modules/reviews/service.ts")"
tw deny  "client api"                  "$(edit Edit  "$ROOT/client/src/lib/api.ts")"
tw deny  "client component"            "$(edit Edit  "$ROOT/client/src/app/a/_components/B/B.tsx")"
tw deny  "client package.json"         "$(edit Edit  "$ROOT/client/package.json")"
tw deny  "vitest config"               "$(edit Edit  "$ROOT/client/vitest.config.ts")"
tw deny  "tsconfig"                    "$(edit Edit  "$ROOT/server/tsconfig.json")"
tw deny  "lock file"                   "$(edit Edit  "$ROOT/server/pnpm-lock.yaml")"
tw deny  "migration"                   "$(edit Write "$ROOT/server/src/db/migrations/0013_x.sql")"
tw deny  "agent definition"            "$(edit Edit  "$ROOT/.claude/agents/test-writer.md")"
tw deny  "INSIGHTS.md"                 "$(edit Edit  "$ROOT/INSIGHTS.md")"
tw deny  "vendored contract test"      "$(edit Write "$ROOT/client/src/vendor/shared/contracts/x.test.ts")"
tw deny  "e2e runner"                  "$(edit Edit  "$ROOT/e2e/run.ts")"
tw deny  "docs"                        "$(edit Edit  "$ROOT/docs/x.md")"
tw deny  "outside the project"         "$(edit Write "/etc/x")"
tw deny  "tmp without marker"          "$(edit Write "/tmp/x/server/src/a.ts")"
# ---- Bash: allowed
tw allow "server unit tests"           "$(bash_ "cd server && pnpm exec vitest run --exclude '**/*.it.test.ts'")"
tw allow "client tests"                "$(bash_ 'cd client && pnpm test 2>&1 | tail -20')"
tw allow "frozen install"              "$(bash_ 'cd server && pnpm install --frozen-lockfile')"
tw allow "worktree add with marker"    "$(bash_ "git worktree add --detach $RP HEAD")"
tw allow "copy test into worktree"     "$(bash_ "cp server/test/a.test.ts $RP/server/test/")"
tw allow "symlink node_modules"        "$(bash_ "ln -s \$PWD/server/node_modules $RP/server/node_modules")"
tw allow "mutate in worktree"          "$(bash_ "sed -i '' 's/>= 0/> 0/' $RP/server/src/a.ts")"
tw allow "run in worktree"             "$(bash_ "cd $RP/server && pnpm exec vitest run test/a.test.ts")"
tw allow "worktree remove with marker" "$(bash_ "git worktree remove --force $RP")"
tw allow "worktree prune"              "$(bash_ 'git worktree prune')"
tw allow "git status/diff"             "$(bash_ 'git status --short && git diff --stat')"
# ---- Bash: denied
tw deny  "git commit"                  "$(bash_ 'git commit -m wip')"
tw deny  "git checkout file"           "$(bash_ 'git checkout -- src/a.ts')"
tw deny  "git stash"                   "$(bash_ 'git stash')"
tw deny  "pnpm add msw"                "$(bash_ 'cd client && pnpm add -D msw')"
tw deny  "plain install"               "$(bash_ 'pnpm install')"
tw deny  "vitest -u"                   "$(bash_ 'pnpm exec vitest run -u')"
tw deny  "pnpm test -- --update"       "$(bash_ 'pnpm test -- --update')"
tw deny  "sed -i production"           "$(bash_ 'sed -i s/a/b/ server/src/a.ts')"
tw deny  "redirect into production"    "$(bash_ 'echo x > client/src/a.ts')"
tw deny  "worktree add without marker" "$(bash_ 'git worktree add /tmp/x HEAD')"
tw deny  "npx -y"                      "$(bash_ 'npx -y stryker run')"
tw deny  "node -e"                     "$(bash_ "node -e 'require(1)'")"
tw deny  "db:migrate"                  "$(bash_ 'pnpm db:migrate')"

# ================================================================ doc-writer
# ---- Edit / Write: allowed
dw allow "root docs"                   "$(edit Write "$ROOT/docs/x.md")"
dw allow "agent-prompts README"        "$(edit Edit  "$ROOT/docs/agent-prompts/README.md")"
dw allow "package docs"                "$(edit Write "$ROOT/server/docs/review-flow.md")"
dw allow "package ADR"                 "$(edit Write "$ROOT/server/docs/adr/0001-x.md")"
dw allow "client README"               "$(edit Edit  "$ROOT/client/README.md")"
dw allow "root README"                 "$(edit Edit  "$ROOT/README.md")"
dw allow "module README"               "$(edit Write "$ROOT/server/src/modules/repo-intel/README.md")"
dw allow "TESTING.md"                  "$(edit Edit  "$ROOT/TESTING.md")"
# ---- Edit / Write: ask
dw ask   "root AGENTS.md"              "$(edit Edit  "$ROOT/AGENTS.md")"
dw ask   "package AGENTS.md"           "$(edit Edit  "$ROOT/server/AGENTS.md")"
dw ask   "spec"                        "$(edit Edit  "$ROOT/server/specs/L03-x.md")"
dw ask   "reviewer prompt"             "$(edit Edit  "$ROOT/docs/agent-prompts/general-reviewer.md")"
# ---- Edit / Write: denied
dw deny  "root INSIGHTS.md"            "$(edit Edit  "$ROOT/INSIGHTS.md")"
dw deny  "client INSIGHTS.md"          "$(edit Edit  "$ROOT/client/INSIGHTS.md")"
dw deny  "agents README"               "$(edit Edit  "$ROOT/.claude/agents/README.md")"
dw deny  "vendored ui README"          "$(edit Edit  "$ROOT/client/src/vendor/ui/README.md")"
dw deny  "png diagram"                 "$(edit Write "$ROOT/docs/diagram.png")"
dw deny  "source file"                 "$(edit Edit  "$ROOT/server/src/a.ts")"
dw deny  "test file"                   "$(edit Edit  "$ROOT/server/test/a.test.ts")"
dw deny  "CLAUDE.md"                   "$(edit Write "$ROOT/CLAUDE.md")"
dw deny  "red-proof path"              "$(edit Write "$RP/docs/x.md")"
# ---- Bash
dw allow "read and grep"               "$(bash_ "git log -5 --oneline && grep -rn 'register' server/src/modules/index.ts")"
dw allow "ls links"                    "$(bash_ 'ls server/docs docs 2>/dev/null')"
dw deny  "redirect a doc"              "$(bash_ 'cat a.md > docs/b.md')"
dw deny  "tee a doc"                   "$(bash_ 'echo x | tee docs/b.md')"
dw deny  "git add"                     "$(bash_ 'git add docs/b.md')"
dw deny  "mermaid-cli via npx"         "$(bash_ 'npx -y @mermaid-js/mermaid-cli -i a.mmd -o a.svg')"
dw deny  "worktree add"                "$(bash_ "git worktree add --detach $RP HEAD")"

# ================================================================ read-only
# ---- Edit / Write: everything denied
ro deny  "edit source"                 "$(edit Edit  "$ROOT/server/src/a.ts")"
ro deny  "write test"                  "$(edit Write "$ROOT/server/test/a.test.ts")"
ro deny  "write docs"                  "$(edit Write "$ROOT/docs/x.md")"
ro deny  "write tmp"                   "$(edit Write "/tmp/x.md")"
# ---- Bash: allowed
ro allow "diff stat"                   "$(bash_ 'git diff --stat 2>&1')"
ro allow "name-status + untracked"     "$(bash_ 'git diff --name-status -M HEAD && git ls-files --others --exclude-standard')"
ro allow "git grep at a revision"      "$(bash_ "git grep -nE 'drizzle-orm' HEAD -- ':(glob)server/src/modules/*/routes.ts' >/dev/null")"
ro allow "grep a JSX tag"              "$(bash_ "grep -rn '</Modal>' client/src/app")"
ro allow "grep an arrow"               "$(bash_ "grep -rn '=> {' server/src/modules/reviews")"
ro allow "sed -n a line"               "$(bash_ "sed -n '40,45p' server/src/app.ts")"
ro allow "grep for rm"                 "$(bash_ "grep -rn 'rm -rf' scripts")"
ro allow "typecheck"                   "$(bash_ 'cd server && pnpm typecheck')"
ro allow "integration tests"           "$(bash_ 'cd server && pnpm exec vitest run .it.test')"
ro allow "reviewer-core tests"         "$(bash_ 'cd reviewer-core && npm test')"
ro allow "docker info"                 "$(bash_ 'docker info >/dev/null 2>&1 && echo up')"
ro allow "merge-base"                  "$(bash_ 'git merge-base main HEAD')"
ro allow "worktree list"               "$(bash_ 'git worktree list')"
# ---- Bash: denied
ro deny  "echo into file"              "$(bash_ 'echo a > f')"
ro deny  "append into file"            "$(bash_ 'git log >> notes.txt')"
ro deny  "diff into patch"             "$(bash_ 'git diff > p.patch')"
ro deny  "tee"                         "$(bash_ 'git diff | tee p.patch')"
ro deny  "rm"                          "$(bash_ 'rm -rf server/test')"
ro deny  "sed -i"                      "$(bash_ 'sed -i s/a/b/ server/src/a.ts')"
ro deny  "find -delete"                "$(bash_ 'find . -name x -delete')"
ro deny  "git add"                     "$(bash_ 'git add -A')"
ro deny  "git config"                  "$(bash_ 'git config user.name x')"
ro deny  "git worktree add"            "$(bash_ "git worktree add --detach $RP HEAD")"
ro deny  "git push"                    "$(bash_ 'git push origin HEAD')"
ro deny  "gh pr create"                "$(bash_ 'gh pr create --fill')"
ro deny  "npm ci"                      "$(bash_ 'cd e2e && npm ci')"
ro deny  "frozen install"              "$(bash_ 'pnpm install --frozen-lockfile')"
ro deny  "npx"                         "$(bash_ 'npx tsc --noEmit')"
ro deny  "node -e"                     "$(bash_ 'node -e 1')"
ro deny  "sh -c"                       "$(bash_ "sh -c 'echo x'")"
ro deny  "curl"                        "$(bash_ 'curl https://example.com')"
ro deny  "db:migrate"                  "$(bash_ 'pnpm db:migrate')"
ro deny  "drizzle-kit push"            "$(bash_ 'pnpm exec drizzle-kit push')"
ro deny  "docker compose down"         "$(bash_ 'docker compose down -v')"

# ================================================================ fail safe
run_case ""          ask  "missing profile"         "$(edit Edit "$ROOT/server/test/a.test.ts")"
run_case implementer ask  "unknown profile"         "$(edit Edit "$ROOT/server/test/a.test.ts")"
tw ask   "empty input"                 ''
tw ask   "Edit without file_path"      '{"tool_name":"Edit","tool_input":{}}'
ro ask   "Bash without command"        '{"tool_name":"Bash","tool_input":{}}'
ro allow "unknown tool"                '{"tool_name":"Read","tool_input":{"file_path":"/repo/server/pnpm-lock.yaml"}}'
ro deny  "escaped quotes in command"   '{"tool_name":"Bash","tool_input":{"command":"git commit -m \"wip: x\"","description":"x"}}'
dw deny  "pretty-printed json"         $'{\n  "tool_name": "Edit",\n  "tool_input": {\n    "file_path": "/repo/INSIGHTS.md"\n  }\n}'

# Without CLAUDE_PROJECT_DIR an absolute path cannot be placed: ask, not allow.
out=$(printf '%s' "$(edit Write "$ROOT/server/test/a.test.ts")" | env -u CLAUDE_PROJECT_DIR "$GUARD" test-writer); rc=$?
if [ "$rc" -eq 0 ] && [ "$(decision_of "$out")" = ask ]; then PASS=$((PASS + 1)); else
  FAIL=$((FAIL + 1)); printf 'FAIL [no project dir] test write: got %s (exit %s)\n' "$(decision_of "$out")" "$rc"; fi

# ---- Stripped environment: no PATH, no HOME — the hook must still decide.
out=$(printf '%s' "$(edit Edit "$ROOT/server/pnpm-lock.yaml")" | env -i CLAUDE_PROJECT_DIR="$ROOT" /bin/sh "$GUARD" test-writer); rc=$?
if [ "$rc" -eq 0 ] && [ "$(decision_of "$out")" = deny ]; then PASS=$((PASS + 1)); else
  FAIL=$((FAIL + 1)); printf 'FAIL [env -i] lock file edit: got %s (exit %s)\n' "$(decision_of "$out")" "$rc"; fi
out=$(printf '%s' "$(bash_ 'git push')" | env -i GUARD_NO_JQ=1 /bin/sh "$GUARD" read-only); rc=$?
if [ "$rc" -eq 0 ] && [ "$(decision_of "$out")" = deny ]; then PASS=$((PASS + 1)); else
  FAIL=$((FAIL + 1)); printf 'FAIL [env -i, sed] git push: got %s (exit %s)\n' "$(decision_of "$out")" "$rc"; fi
out=$(printf '%s' "$(bash_ 'echo x > docs/a.md')" | env -i /bin/sh "$GUARD" doc-writer); rc=$?
if [ "$rc" -eq 0 ] && [ "$(decision_of "$out")" = deny ]; then PASS=$((PASS + 1)); else
  FAIL=$((FAIL + 1)); printf 'FAIL [env -i] doc-writer redirect: got %s (exit %s)\n' "$(decision_of "$out")" "$rc"; fi

printf '%s passed, %s failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
