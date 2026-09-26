#!/usr/bin/env bash
# Offline test for the PR Self Review hook. No model, no network, no API key.
#
# Runs against a throwaway git repo in $TMPDIR, so it can never touch the real
# report in this repo's .git/. Run it after any change to the hook:
#
#   .claude/hooks/test-gate.sh
#
# Every case asserts on the hook's stdout + exit code, which together are the whole
# contract Claude Code sees.

set -u

HOOK_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
GATE="$HOOK_DIR/pr-self-review-gate.sh"

PASS=0
FAIL=0
CURRENT=""

# ---------------------------------------------------------------- fixture repo

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

git init -q -b main "$TMP"
git -C "$TMP" config user.email test@example.com
git -C "$TMP" config user.name  "Gate Test"
echo base > "$TMP/base.txt"
git -C "$TMP" add -A && git -C "$TMP" commit -qm base
git -C "$TMP" checkout -qb feat
echo work > "$TMP/work.txt"
git -C "$TMP" add -A && git -C "$TMP" commit -qm work

HEAD_SHA=$(git -C "$TMP" rev-parse HEAD)
MERGE_BASE=$(git -C "$TMP" merge-base main HEAD)
# The fixture repo has no .claude/skills, so the gate's digest of it is stable.
SKILLS_DIGEST=$("$GATE" --digest 2>/dev/null || echo "sha256:none")
SKILLS_DIGEST=$(cd "$TMP" && node "$HOOK_DIR/pr-self-review-gate.mjs" --digest)

CRIT_ONE='[{"id":"a-1","severity":"CRITICAL","title":"Service reaches into another module repository","file":"src/service.ts","start_line":41,"end_line":41,"source_skill":"onion-architecture","source_rule":"§4"}]'
CRIT_TWO='[{"id":"a-1","severity":"CRITICAL","title":"Service reaches into another module repository","file":"src/service.ts","start_line":41,"end_line":41,"source_skill":"onion-architecture","source_rule":"§4"},{"id":"a-2","severity":"CRITICAL","title":"Route parses body by hand","file":"src/routes.ts","start_line":88,"end_line":88,"source_skill":"onion-architecture","source_rule":"§6"}]'
CLEAN='[{"id":"a-3","severity":"WARNING","title":"Helper does IO","file":"src/helpers.ts","start_line":5,"end_line":5}]'

mk_report() { # findings, gate, mode, head_sha, skills_digest, branch
  mkdir -p "$TMP/.git/devdigest"
  cat > "$TMP/.git/devdigest/pr-self-review.json" <<EOF
{ "schema_version": 1,
  "mode": "${3:-full}",
  "branch": "${6:-feat}",
  "base_ref": "main",
  "merge_base": "$MERGE_BASE",
  "head_sha": "${4:-$HEAD_SHA}",
  "diff_digest": "sha256:unchanged",
  "skills_digest": "${5:-$SKILLS_DIGEST}",
  "findings": ${1:-[]},
  "gate": "${2:-pass}" }
EOF
}
rm_report()   { rm -f "$TMP/.git/devdigest/pr-self-review.json"; }
rm_override() { rm -f "$TMP/.git/devdigest/pr-self-review.override.json"; }

mk_override() { # finding_id, reason, head_sha
  mkdir -p "$TMP/.git/devdigest"
  cat > "$TMP/.git/devdigest/pr-self-review.override.json" <<EOF
{ "head_sha": "${3:-$HEAD_SHA}",
  "waived": [ { "finding_id": "$1", "reason": "$2",
                "waived_by": "test@example.com", "waived_at": "2026-09-21T00:00:00Z" } ] }
EOF
}

run() { # command string -> hook stdout on fd1, exit code in $RC
  OUT=$(printf '{"hook_event_name":"PreToolUse","tool_name":"Bash","cwd":"%s","tool_input":{"command":"%s"}}' \
        "$TMP" "$1" | "$GATE")
  RC=$?
}

# ---------------------------------------------------------------- assertions

start()  { CURRENT="$1"; }
ok()     { PASS=$((PASS+1)); printf '  \033[32mok\033[0m   %s\n' "$CURRENT"; }
bad()    { FAIL=$((FAIL+1)); printf '  \033[31mFAIL\033[0m %s\n       %s\n' "$CURRENT" "$1"; }

expect_silent() {
  [ "$RC" -eq 0 ] || { bad "exit $RC, want 0"; return; }
  [ -z "$OUT" ] && ok || bad "want empty stdout, got: $OUT"
}
expect_decision() { # decision, needle
  [ "$RC" -eq 0 ] || { bad "exit $RC, want 0"; return; }
  case "$OUT" in
    *"\"permissionDecision\":\"$1\""*) ;;
    *) bad "want decision '$1', got: ${OUT:-<empty>}"; return ;;
  esac
  case "$OUT" in
    *"$2"*) ok ;;
    *) bad "decision '$1' ok but reason lacks '$2'; got: $OUT" ;;
  esac
}
expect_message() { # needle in systemMessage
  [ "$RC" -eq 0 ] || { bad "exit $RC, want 0"; return; }
  case "$OUT" in
    *'"systemMessage"'*"$1"*) ok ;;
    *) bad "want systemMessage containing '$1', got: ${OUT:-<empty>}" ;;
  esac
}

# ---------------------------------------------------------------- cases

printf '\nPR Self Review — hook contract\n\n'

mk_report "$CLEAN" pass
rm_override

start "1  ungated command is ignored";              run 'ls -la';                    expect_silent
start "2  git status is not a push";                run 'git status';                expect_silent
start "3  --dry-run is exempt";                     run 'git push --dry-run';        expect_silent
start "4  git push --tags is exempt";               run 'git push origin --tags';    expect_silent

start "5  no report at all -> deny"
rm_report; run 'git push'; expect_decision deny 'no report found'

start "6  stale head_sha -> deny naming the reason"
mk_report "$CLEAN" pass full 0000000000000000000000000000000000000000
run 'git push'; expect_decision deny 'HEAD moved'

start "7  stale skills_digest -> deny"
mk_report "$CLEAN" pass full "$HEAD_SHA" 'sha256:stale'
run 'git push'; expect_decision deny 'a skill changed'

start "8  report from another branch -> deny"
mk_report "$CLEAN" pass full "$HEAD_SHA" "$SKILLS_DIGEST" other-branch
run 'git push'; expect_decision deny 'branch'

start "9  --fast report can never satisfy the gate"
mk_report "$CLEAN" pass fast
run 'git push'; expect_decision deny 'fast'

start "10 fresh + zero CRITICAL -> silent, NOT allow"
mk_report "$CLEAN" pass; run 'git push'; expect_silent

start "11 two CRITICALs -> deny listing both"
mk_report "$CRIT_TWO" fail
run 'git push'
if [ "$RC" -eq 0 ] && [ "${OUT#*Service reaches}" != "$OUT" ] && [ "${OUT#*Route parses}" != "$OUT" ]; then ok
else bad "want both finding titles in the reason; got: ${OUT:-<empty>}"; fi

start "12 gate:\"pass\" but a CRITICAL present -> deny (hook recomputes)"
mk_report "$CRIT_ONE" pass
run 'git push'; expect_decision deny 'BLOCKED'

start "13 gh pr create is gated too"
mk_report "$CRIT_ONE" fail
run 'gh pr create --fill'; expect_decision deny 'BLOCKED'

start "14 compound command is caught"
run 'git add . && git commit -m wip && git push'; expect_decision deny 'BLOCKED'

# Bypasses found by the 2026-09-26 self-review (findings security-1/-2).
start "14a git -C <dir> push is gated";            run 'git -C /abs/project push origin HEAD';  expect_decision deny 'BLOCKED'
start "14b git -c k=v push is gated";              run 'git -c core.x=y push origin HEAD';     expect_decision deny 'BLOCKED'
start "14c --tags WITH a refspec is gated";        run 'git push origin HEAD --tags';          expect_decision deny 'BLOCKED'
start "14d --dry-run in another command is gated"; run 'git push origin main && echo --dry-run'; expect_decision deny 'BLOCKED'
start "14e -n is a dry run, exempt";               run 'git push -n origin main';              expect_silent
start "14f --delete is exempt";                    run 'git push origin --delete old-branch';  expect_silent
start "14g git commit mentioning push is ignored"; run 'git commit -m "fix push gate"';        expect_silent

start "15 valid waiver -> pass, announced"
mk_report "$CRIT_ONE" fail
mk_override a-1 'container.ts is the composition root and onion section 11 already permits importing upward here'
run 'git push'; expect_message 'waived'

start "16 waiver reason too short -> still denied"
mk_override a-1 'false positive'
run 'git push'; expect_decision deny 'too short'

start "17 waiver from another commit -> still denied"
mk_override a-1 'container.ts is the composition root and onion section 11 already permits importing upward here' 1111111111111111111111111111111111111111
run 'git push'; expect_decision deny 'different commit'
rm_override

start "18 malformed report -> ask, never a silent pass"
echo '{ this is not json' > "$TMP/.git/devdigest/pr-self-review.json"
run 'git push'; expect_decision ask 'could not run'

start "19 dirty worktree on a passing gate -> pass with a coverage warning"
mk_report "$CLEAN" pass
echo dirty > "$TMP/uncommitted.txt"
run 'git push'; expect_message 'uncommitted'
rm -f "$TMP/uncommitted.txt"

start "20 bypass is honoured and announced"
mk_report "$CRIT_TWO" fail
run 'PR_SELF_REVIEW_BYPASS=1 git push'; expect_message 'BYPASSED'

start "21 non-Bash tool is ignored"
OUT=$(printf '{"hook_event_name":"PreToolUse","tool_name":"Read","cwd":"%s","tool_input":{"file_path":"/x"}}' "$TMP" | "$GATE"); RC=$?
expect_silent

start "22 unparseable stdin never breaks the session"
OUT=$(printf 'not json at all' | "$GATE"); RC=$?
expect_silent

# ---------------------------------------------------------------- environment

printf '\nEnvironment\n\n'
start "23 node resolves in a stripped environment via the wrapper fallback chain"
if env -i HOME="$HOME" /bin/sh "$GATE" --digest >/dev/null 2>&1; then ok
else bad "the wrapper could not find node with an empty PATH - it would fail safe to 'ask' on every push"; fi

printf '\n%s passed, %s failed\n\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
