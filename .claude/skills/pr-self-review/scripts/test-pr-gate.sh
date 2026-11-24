#!/bin/sh
# Exit-code tests for .claude/hooks/pr-gate.sh. Uses a temp CLAUDE_PROJECT_DIR copy
# of the result file location, so the real .claude/pr-self-review/ is untouched.
set -u
repo="$(git rev-parse --show-toplevel)"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/.claude/skills/pr-self-review/scripts" "$tmp/.claude/pr-self-review"
# the hook shells out to diff-hash.sh, which cd's to the REAL repo (same hash as prod)
cp "$repo/.claude/skills/pr-self-review/scripts/diff-hash.sh" "$tmp/.claude/skills/pr-self-review/scripts/"
hash="$("$repo/.claude/skills/pr-self-review/scripts/diff-hash.sh")"
fail=0
run() { # name, expected, command, verdict|"" , hash
  name="$1"; want="$2"; cmd="$3"; verdict="$4"; h="$5"
  rm -f "$tmp/.claude/pr-self-review/last.json"
  [ -n "$verdict" ] && printf '{"verdict":"%s","critical":%s,"diff_hash":"%s"}' "$verdict" "$([ "$verdict" = BLOCK ] && echo 2 || echo 0)" "$h" > "$tmp/.claude/pr-self-review/last.json"
  jq -n --arg c "$cmd" '{tool_input:{command:$c}}' | CLAUDE_PROJECT_DIR="$tmp" sh "$repo/.claude/hooks/pr-gate.sh" 2>/dev/null
  got=$?
  if [ "$got" = "$want" ]; then echo "ok   $name"; else echo "FAIL $name (want $want, got $got)"; fail=1; fi
}
run "unrelated command passes"          0 "ls -la"                         ""      ""
run "commit message mentioning it ok"   0 "git commit -m 'gh pr create'"   ""      ""
run "pr create, no result"              2 "gh pr create --fill"            ""      ""
run "pr create, stale hash"             2 "gh pr create --fill"            PASS    "deadbeef"
run "pr create, BLOCK"                  2 "gh pr create --fill"            BLOCK   "$hash"
run "pr create, PASS + fresh"           0 "gh pr create --fill"            PASS    "$hash"
run "pr merge, no result"               2 "gh pr merge 12"                 ""      ""
run "pr merge, BLOCK"                   2 "gh pr merge 12 --squash"        BLOCK   "$hash"
run "pr merge, PASS + fresh"            0 "gh pr merge 12"                 PASS    "$hash"
run "chained after &&, BLOCK"           2 "git push && gh pr create"       BLOCK   "$hash"
run "gh pr view is not gated"           0 "gh pr view 12"                  ""      ""
exit $fail
