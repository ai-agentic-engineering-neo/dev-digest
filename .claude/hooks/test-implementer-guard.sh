#!/usr/bin/env bash
# Offline test for the implementer guard hook. No model, no network, no API key.
#
#   .claude/hooks/test-implementer-guard.sh
#
# Every case asserts on the decision the hook prints (deny | ask | allow = nothing)
# and on exit 0, which together are the whole contract Claude Code sees. Each case
# runs twice: with jq, and with GUARD_NO_JQ=1 to exercise the sed fallback.

set -u

HOOK_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
GUARD="$HOOK_DIR/implementer-guard.sh"
ROOT="/repo"
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

run_case() { # expected, name, json
  local expected=$1 name=$2 json=$3 mode out rc got
  for mode in jq sed; do
    if [ "$mode" = sed ]; then
      out=$(printf '%s' "$json" | GUARD_NO_JQ=1 "$GUARD"); rc=$?
    else
      out=$(printf '%s' "$json" | "$GUARD"); rc=$?
    fi
    got=$(decision_of "$out")
    if [ "$rc" -eq 0 ] && [ "$got" = "$expected" ]; then
      PASS=$((PASS + 1))
    else
      FAIL=$((FAIL + 1))
      printf 'FAIL [%s] %s: expected %s, got %s (exit %s)\n' "$mode" "$name" "$expected" "$got" "$rc"
    fi
  done
}

edit()  { printf '{"tool_name":"%s","tool_input":{"file_path":"%s","old_string":"a","new_string":"b"}}' "$1" "$2"; }
bash_() { printf '{"tool_name":"Bash","tool_input":{"command":"%s","description":"x"}}' "$1"; }

# ---- Edit / Write: denied paths
run_case deny  "edit migration sql"        "$(edit Edit  "$ROOT/server/src/db/migrations/0013_x.sql")"
run_case deny  "write migration journal"   "$(edit Write "$ROOT/server/src/db/migrations/meta/_journal.json")"
run_case deny  "edit server lock file"     "$(edit Edit  "$ROOT/server/pnpm-lock.yaml")"
run_case deny  "edit reviewer-core lock"   "$(edit Edit  "$ROOT/reviewer-core/package-lock.json")"
run_case deny  "edit skills-lock"          "$(edit Write "$ROOT/skills-lock.json")"
run_case deny  "edit own hook"             "$(edit Edit  "$ROOT/.claude/hooks/implementer-guard.sh")"
run_case deny  "edit agent definition"     "$(edit Edit  "$ROOT/.claude/agents/implementer.md")"
run_case deny  "edit settings"             "$(edit Edit  "$ROOT/.claude/settings.json")"
run_case deny  "edit a skill"              "$(edit Edit  "$ROOT/.claude/skills/zod/SKILL.md")"
run_case deny  "create CLAUDE.md"          "$(edit Write "$ROOT/CLAUDE.md")"
run_case deny  "create CLAUDE.local.md"    "$(edit Write "$ROOT/server/CLAUDE.local.md")"
run_case deny  "write server test"         "$(edit Write "$ROOT/server/test/reviews-helpers.test.ts")"
run_case deny  "edit server it test"       "$(edit Edit  "$ROOT/server/test/reviews.it.test.ts")"
run_case deny  "edit pg helper"            "$(edit Edit  "$ROOT/server/test/helpers/pg.ts")"
run_case deny  "write client test"         "$(edit Write "$ROOT/client/src/app/agents/_components/Foo/Foo.test.tsx")"
run_case deny  "edit client lib test"      "$(edit Edit  "$ROOT/client/src/lib/format.test.ts")"
run_case deny  "edit client test setup"    "$(edit Edit  "$ROOT/client/src/test/setup.ts")"
run_case deny  "write reviewer-core test"  "$(edit Write "$ROOT/reviewer-core/test/run.test.ts")"
run_case deny  "write e2e flow"            "$(edit Write "$ROOT/e2e/specs/09-x.flow.json")"
# ---- Edit / Write: ask
run_case ask   "edit schema.ts"            "$(edit Edit  "$ROOT/server/src/db/schema.ts")"
run_case ask   "edit schema/ file"         "$(edit Edit  "$ROOT/server/src/db/schema/runs.ts")"
run_case ask   "edit client package.json"  "$(edit Edit  "$ROOT/client/package.json")"
# ---- Edit / Write: allowed
run_case allow "edit service"              "$(edit Edit  "$ROOT/server/src/modules/reviews/service.ts")"
run_case allow "write new component"       "$(edit Write "$ROOT/client/src/app/agents/_components/Foo/Foo.tsx")"
run_case allow "write spec"                "$(edit Write "$ROOT/server/specs/L03-x.md")"
run_case allow "edit vendored contract"    "$(edit Edit  "$ROOT/client/src/vendor/shared/contracts/runs.ts")"
run_case allow "edit README"               "$(edit Edit  "$ROOT/README.md")"
run_case allow "edit mocks.ts"             "$(edit Edit  "$ROOT/server/src/adapters/mocks.ts")"
run_case allow "edit e2e runner"           "$(edit Edit  "$ROOT/e2e/run.ts")"

# ---- Bash: denied
run_case deny  "git commit"                "$(bash_ 'git commit -m wip')"
run_case deny  "git push after tests"      "$(bash_ 'pnpm test && git push origin HEAD')"
run_case deny  "git -C commit"             "$(bash_ 'git -C server commit -am x')"
run_case deny  "git checkout file"         "$(bash_ 'git checkout -- src/a.ts')"
run_case deny  "git stash"                 "$(bash_ 'git stash')"
run_case deny  "git reset hard"            "$(bash_ 'git reset --hard HEAD')"
run_case deny  "gh pr create"              "$(bash_ 'gh pr create --fill')"
run_case deny  "pnpm add"                  "$(bash_ 'cd client && pnpm add zod')"
run_case deny  "pnpm filter add"           "$(bash_ 'pnpm --filter server add -D vitest')"
run_case deny  "pnpm remove"               "$(bash_ 'pnpm remove lodash')"
run_case deny  "npm install pkg"           "$(bash_ 'npm install left-pad')"
run_case deny  "npm i -g"                  "$(bash_ 'npm i -g agent-browser')"
run_case deny  "plain pnpm install"        "$(bash_ 'pnpm install')"
run_case deny  "npm update"                "$(bash_ 'npm update')"
run_case deny  "yarn"                      "$(bash_ 'yarn')"
run_case deny  "db:generate"               "$(bash_ 'pnpm db:generate')"
run_case deny  "drizzle-kit generate"      "$(bash_ 'npx drizzle-kit generate')"
run_case deny  "redirect into migrations"  "$(bash_ 'echo x > server/src/db/migrations/0013.sql')"
run_case deny  "sed -i lock file"          "$(bash_ 'sed -i s/a/b/ client/pnpm-lock.yaml')"
run_case deny  "rm a hook"                 "$(bash_ 'rm .claude/hooks/implementer-guard.sh')"
run_case deny  "tee into settings"         "$(bash_ 'echo {} | tee .claude/settings.json')"
# ---- Bash: allowed
run_case allow "server unit tests"         "$(bash_ "cd server && pnpm exec vitest run --exclude '**/*.it.test.ts'")"
run_case allow "server integration"        "$(bash_ 'cd server && pnpm exec vitest run .it.test')"
run_case allow "client typecheck"          "$(bash_ 'cd client && pnpm typecheck 2>&1 | tail -20')"
run_case allow "reviewer-core tests"       "$(bash_ 'cd reviewer-core && npm test')"
run_case allow "frozen install"            "$(bash_ 'cd server && pnpm install --frozen-lockfile')"
run_case allow "npm ci"                    "$(bash_ 'cd e2e && npm ci')"
run_case allow "git status/diff/log"       "$(bash_ 'git status --short && git diff --stat && git log -3 --oneline')"
run_case allow "read lock file"            "$(bash_ 'grep -c zod client/pnpm-lock.yaml 2>&1')"
run_case allow "read migrations"           "$(bash_ 'ls server/src/db/migrations && cat server/src/db/migrations/meta/_journal.json')"
run_case allow "diff vendored contracts"   "$(bash_ 'diff -r server/src/vendor/shared client/src/vendor/shared')"
run_case allow "docker check"              "$(bash_ 'docker info >/dev/null 2>&1 && echo up')"
run_case allow "vitest update flag"        "$(bash_ 'pnpm exec vitest run --update')"
run_case allow "quoted test name with up"  "$(bash_ "pnpm exec vitest run -t 'rolls up costs'")"
run_case allow "git grep for db:generate"  "$(bash_ "git grep -n 'db:generate' -- docs")"
run_case deny  "unquoted pnpm up still"    "$(bash_ 'pnpm up zod')"
# An apostrophe inside double quotes must not hide a later dependency change.
APOS_ADD=$(cat <<'JSON'
{"tool_name":"Bash","tool_input":{"command":"grep -n \"isn't\" a.md && pnpm add zod && echo 'x'","description":"x"}}
JSON
)
run_case deny  "apostrophe then pnpm add"  "$APOS_ADD"
run_case allow "unknown tool"              '{"tool_name":"Read","tool_input":{"file_path":"/repo/server/pnpm-lock.yaml"}}'

# ---- Fail safe
run_case ask   "empty input"               ''
run_case ask   "Edit without file_path"    '{"tool_name":"Edit","tool_input":{}}'
run_case ask   "Bash without command"      '{"tool_name":"Bash","tool_input":{}}'
run_case deny  "escaped quotes in command" '{"tool_name":"Bash","tool_input":{"command":"git commit -m \"wip: x\"","description":"x"}}'
run_case deny  "pretty-printed json"       $'{\n  "tool_name": "Edit",\n  "tool_input": {\n    "file_path": "/repo/server/pnpm-lock.yaml"\n  }\n}'

# ---- Stripped environment: no PATH, no HOME — the hook must still decide.
out=$(printf '%s' "$(edit Edit "$ROOT/server/pnpm-lock.yaml")" | env -i /bin/sh "$GUARD"); rc=$?
if [ "$rc" -eq 0 ] && [ "$(decision_of "$out")" = deny ]; then PASS=$((PASS + 1)); else
  FAIL=$((FAIL + 1)); printf 'FAIL [env -i] lock file edit: got %s (exit %s)\n' "$(decision_of "$out")" "$rc"; fi
out=$(printf '%s' "$(bash_ 'git push')" | env -i GUARD_NO_JQ=1 /bin/sh "$GUARD"); rc=$?
if [ "$rc" -eq 0 ] && [ "$(decision_of "$out")" = deny ]; then PASS=$((PASS + 1)); else
  FAIL=$((FAIL + 1)); printf 'FAIL [env -i, sed] git push: got %s (exit %s)\n' "$(decision_of "$out")" "$rc"; fi

printf '%s passed, %s failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
