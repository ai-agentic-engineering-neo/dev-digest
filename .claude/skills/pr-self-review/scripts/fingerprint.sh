#!/usr/bin/env bash
# sha256 of HEAD + full diff vs merge-base(main) (incl. working tree) + untracked contents.
# Any edit after a review changes it, invalidating the verdict.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
BASE=$(git merge-base main HEAD 2>/dev/null || git rev-parse HEAD)
{
  git rev-parse HEAD
  git diff "$BASE" -- . ':(exclude).claude/.pr-self-review'
  git ls-files --others --exclude-standard -z | grep -zv '^\.claude/\.pr-self-review/' | xargs -0 -I{} sh -c 'echo "{}"; cat "{}"' 2>/dev/null || true
} | shasum -a 256 | cut -d' ' -f1
