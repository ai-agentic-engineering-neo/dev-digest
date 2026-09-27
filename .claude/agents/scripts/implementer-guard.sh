#!/usr/bin/env bash
# PreToolUse(Bash|Edit|MultiEdit|Write) gate for the `implementer` agent: refuses the actions
# that lie outside implementing a plan — git history, PRs, dev-DB writes, the Docker volume,
# generated or protected files, the guards themselves.
#
#   implementer-guard.sh                      # hook mode: reads the hook payload on stdin
#   implementer-guard.sh --check "<cmd>"      # Bash rules, command passed as an argument
#   implementer-guard.sh --check-path "<p>"   # Edit/Write rules, path passed as an argument
#
# exit 0 = allow, exit 2 = block (stderr is fed back to the agent).
set -uo pipefail
trap 'rc=$?; [[ $rc == 0 || $rc == 2 ]] || { echo "BLOCKED: ${0##*/} failed (exit $rc), so it fails closed." >&2; exit 2; }' EXIT

GUARD_NAME=implementer-guard
GUARD_HINT='Record it under "Not done / blockers" in the implementation report.'
# shellcheck source=guard-lib.sh
source "${BASH_SOURCE[0]%/*}/guard-lib.sh" || exit 2

check_command() {
  local cmd="$1" seg s
  lib_check_psql "$cmd"
  while IFS= read -r seg; do
    s="$(normalize "$seg")"
    [[ -z "$s" ]] && continue
    lib_check_git_segment "$s"
    lib_check_db_segment "$s"
  done < <(segments "$cmd")
}

check_path() {
  local p="$1" rel
  [[ -z "$p" ]] && return 0
  rel="$(lib_repo_rel "$p")" || exit 2
  lib_check_protected_path "$rel"
}

check_tool() { :; }

lib_main "$@"
