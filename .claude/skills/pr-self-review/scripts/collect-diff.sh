#!/usr/bin/env bash
# Collects every open change on the branch — commits since the merge-base with
# the base branch, staged, unstaged and untracked files — and classifies each
# file by package and kind. Prints one record per line:
#
#   BASE <sha>
#   HEAD <sha>
#   DIFF_HASH <sha256>        # changes whenever any reviewed byte changes
#   FILE <package> <kind> <status> <path> [<old path>]   # old path on renames
#
# package: server | client | reviewer-core | e2e | root
# kind:    code | test | config | doc | protected | lockfile | other
# status:  A | M | D | R | ?? (untracked)
#
# Usage: collect-diff.sh [base-branch]   (default: main, falls back to origin/main)
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

base_ref="${1:-main}"
if ! git rev-parse --verify --quiet "$base_ref" >/dev/null; then
  base_ref="origin/${base_ref#origin/}"
fi
base="$(git merge-base HEAD "$base_ref")"
head="$(git rev-parse HEAD)"

package_of() {
  case "$1" in
    server/*) echo server ;;
    client/*) echo client ;;
    reviewer-core/*) echo reviewer-core ;;
    e2e/*) echo e2e ;;
    *) echo root ;;
  esac
}

# Order matters: protected paths win over every other kind.
kind_of() {
  case "$1" in
    server/src/db/migrations/*|client/src/vendor/ui/*|server/clones/*|client/.next/*|e2e/test-results/*)
      echo protected ;;
    */pnpm-lock.yaml|*/package-lock.json|pnpm-lock.yaml|package-lock.json)
      echo lockfile ;;
    *.test.ts|*.test.tsx|server/test/*|client/src/test/*)
      echo test ;;
    *.md|docs/*|*/docs/*|*/specs/*)
      echo doc ;;
    */package.json|*/tsconfig*.json|*.config.ts|*.config.mjs|*.config.js|*.config.cjs|*/.dependency-cruiser*|.claude/*|scripts/*|*.yml|*.yaml)
      echo config ;;
    *.ts|*.tsx|*.js|*.mjs|*.cjs|*.css|*.json)
      echo code ;;
    *)
      echo other ;;
  esac
}

tracked="$(git diff --name-status --find-renames "$base" --)"
untracked="$(git ls-files --others --exclude-standard)"

echo "BASE $base"
echo "HEAD $head"
{
  git diff --binary "$base" --
  if [ -n "$untracked" ]; then
    while IFS= read -r f; do
      printf '\n@@untracked %s\n' "$f"
      cat -- "$f" 2>/dev/null || true
    done <<<"$untracked"
  fi
} | shasum -a 256 | awk '{print "DIFF_HASH " $1}'

if [ -n "$tracked" ]; then
  while IFS=$'\t' read -r status path renamed; do
    # Renames print "R100<TAB>old<TAB>new"; review the new path, keep the old
    # one so the diff is taken across the rename instead of as a new file.
    old=""
    if [ -n "${renamed:-}" ]; then
      old=" $path"
      path="$renamed"
    fi
    echo "FILE $(package_of "$path") $(kind_of "$path") ${status:0:1} $path$old"
  done <<<"$tracked"
fi
if [ -n "$untracked" ]; then
  while IFS= read -r path; do
    echo "FILE $(package_of "$path") $(kind_of "$path") ?? $path"
  done <<<"$untracked"
fi
