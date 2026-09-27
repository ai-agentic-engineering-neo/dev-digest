#!/usr/bin/env bash
# Shared helpers for the pr-self-review scripts. Source, do not execute.

psr_repo_root() {
  git rev-parse --show-toplevel 2>/dev/null
}

psr_resolve_base() {
  local explicit="${1:-}"
  if [[ -n "$explicit" ]]; then
    git rev-parse --verify --quiet "$explicit^{commit}" >/dev/null || return 1
    printf '%s\n' "$explicit"
    return 0
  fi
  local upstream
  if upstream=$(git rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>/dev/null); then
    printf '%s\n' "$upstream"
    return 0
  fi
  local candidate
  for candidate in origin/main origin/master main master; do
    if git rev-parse --verify --quiet "$candidate^{commit}" >/dev/null; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done
  return 1
}

psr_merge_base() {
  git merge-base "$1" HEAD 2>/dev/null
}

# Fingerprint of everything not yet committed, untracked file contents included.
psr_dirty_hash() {
  {
    git status --porcelain
    git diff
    git diff --cached
    git ls-files --others --exclude-standard -z | xargs -0 -r sha1sum 2>/dev/null
  } | sha1sum | cut -c1-16
}

psr_is_excluded() {
  case "$1" in
    pnpm-lock.yaml|*/pnpm-lock.yaml|package-lock.json|*/package-lock.json) return 0 ;;
    server/clones/*|docs/design/*|.claude/pr-self-review/*|*/node_modules/*) return 0 ;;
    *.png|*.jpg|*.jpeg|*.gif|*.ico|*.pdf|*.zip|*.woff|*.woff2|*.ttf|*.webp|*.svg) return 0 ;;
    *.tsbuildinfo|*.log) return 0 ;;
  esac
  return 1
}
