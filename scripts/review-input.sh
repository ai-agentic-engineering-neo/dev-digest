#!/usr/bin/env bash
# Write the review input ONCE so reviewer agents can read files by path instead of
# receiving the diff pasted into every prompt.
#
#   scripts/review-input.sh <out-dir>
#
# Produces in <out-dir>:
#   review.patch     git diff HEAD for tracked files (server/clones excluded)
#   manifest.txt     one line per changed file: status, +/- line counts; untracked files listed as "??"
#   tree-hash.txt    same hash scripts/check-all.sh uses, so a reviewer can tell if the tree moved
# Untracked files are not in the patch — reviewers must Read them by path from the manifest.
set -eu
root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"
out="${1:?usage: scripts/review-input.sh <out-dir>}"
mkdir -p "$out"

git diff HEAD -- . ':(exclude)server/clones' > "$out/review.patch"

{
  git diff HEAD --numstat -- . ':(exclude)server/clones' | awk '{printf "M  +%s -%s  %s\n", $1, $2, $3}'
  git ls-files -o --exclude-standard | grep -v '^server/clones/' | sed 's/^/??  new  /'
} > "$out/manifest.txt"

{
  git rev-parse HEAD
  git diff HEAD --
  git ls-files -o --exclude-standard -z | xargs -0 shasum 2>/dev/null
} | shasum | cut -d' ' -f1 > "$out/tree-hash.txt"

echo "wrote $out/review.patch ($(wc -l < "$out/review.patch") lines), manifest.txt ($(wc -l < "$out/manifest.txt") files), tree-hash.txt"
