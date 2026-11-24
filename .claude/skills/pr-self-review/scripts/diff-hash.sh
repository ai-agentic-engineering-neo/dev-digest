#!/usr/bin/env bash
# Prints a sha256 fingerprint of ALL local changes vs main: commits on the branch,
# staged, unstaged, and untracked files (by content). Used by /pr-self-review (to
# stamp its result) and by .claude/hooks/pr-gate.sh (to check the result is fresh).
set -eu
cd "$(git rev-parse --show-toplevel)"

base=main
git rev-parse --verify -q "$base" >/dev/null || base=origin/main

{
  git diff "$base"...HEAD
  echo "--staged--";   git diff --cached
  echo "--unstaged--"; git diff
  echo "--untracked--"
  git ls-files --others --exclude-standard -z \
    | sort -z \
    | while IFS= read -r -d '' f; do
        case "$f" in .claude/pr-self-review/*) continue ;; esac
        printf '%s %s\n' "$f" "$(git hash-object -- "$f")"
      done
} | shasum -a 256 | cut -d' ' -f1
