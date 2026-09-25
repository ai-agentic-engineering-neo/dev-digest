#!/usr/bin/env bash
#
# insight.sh — append-only writer for the per-package INSIGHTS.md files.
# Deterministic: the agent calls this instead of hand-editing the file, so the
# section layout stays fixed and duplicates are caught before they land.
#
#   insight.sh module <path>                          → which INSIGHTS.md a path belongs to
#   insight.sh add <module> <section> "<text>" [--evidence <file:line>] [--force]
#   insight.sh check <module> "<text>"                → exit 2 if a similar entry exists
#   insight.sh list <module> [section]
#   insight.sh sections
#
# modules:  server | client | reviewer-core | e2e
# sections: works | doesnt | patterns | tools | errors | session | questions

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
MODULES="server client reviewer-core e2e"
PLACEHOLDER="_None yet._"

heading_for() {
  case "$1" in
    works)     echo "## What Works" ;;
    doesnt)    echo "## What Doesn't Work" ;;
    patterns)  echo "## Codebase Patterns" ;;
    tools)     echo "## Tool & Library Notes" ;;
    errors)    echo "## Recurring Errors & Fixes" ;;
    session)   echo "## Session Notes" ;;
    questions) echo "## Open Questions" ;;
    *) echo "unknown section: $1 (use: works doesnt patterns tools errors session questions)" >&2; exit 2 ;;
  esac
}

file_for() {
  case " $MODULES " in
    *" $1 "*) echo "$ROOT/$1/INSIGHTS.md" ;;
    *) echo "unknown module: $1 (use: $MODULES)" >&2; exit 2 ;;
  esac
}

cmd_module() {
  local p="$1"
  [[ "$p" = /* ]] || p="$ROOT/$p"
  p="${p#"$ROOT"/}"
  local first="${p%%/*}"
  case " $MODULES " in
    *" $first "*) echo "$first" ;;
    *) echo "none" ;;
  esac
}

# Similarity: words of 5+ chars from the new text; a line is a near-duplicate
# when it contains at least half of them (never fewer than 3, unless the text
# has fewer than 3 such words).
cmd_check() {
  local file; file="$(file_for "$1")"
  local text="$2"
  local words
  words="$(printf '%s' "$text" | tr '[:upper:]' '[:lower:]' | tr -c '[:alnum:]' '\n' | awk 'length($0) >= 5' | sort -u | tr '\n' ' ')"
  local hit
  hit="$(awk -v words="$words" '
    BEGIN {
      n = split(words, w, " ")
      need = int((n + 1) / 2); if (need < 3) need = 3; if (need > n) need = n
    }
    /^- / {
      line = tolower($0); c = 0
      for (i = 1; i <= n; i++) if (w[i] != "" && index(line, w[i])) c++
      if (need > 0 && c >= need) { print; exit }
    }' "$file")"
  if [ -n "$hit" ]; then
    echo "possible duplicate in $file:" >&2
    echo "  $hit" >&2
    return 2
  fi
  return 0
}

cmd_add() {
  local module="$1" section="$2" text="$3"; shift 3
  local evidence="" force=0
  while [ $# -gt 0 ]; do
    case "$1" in
      --evidence) evidence="$2"; shift 2 ;;
      --force) force=1; shift ;;
      *) echo "unknown flag: $1" >&2; exit 2 ;;
    esac
  done
  local file heading entry
  file="$(file_for "$module")"
  heading="$(heading_for "$section")"
  [ -f "$file" ] || { echo "missing $file" >&2; exit 1; }

  if [ "$force" -eq 0 ]; then
    cmd_check "$module" "$text" || { echo "use --force to add anyway" >&2; exit 2; }
  fi

  entry="- [$(date +%F)] $text"
  [ -n "$evidence" ] && entry="$entry Evidence: \`$evidence\`."

  local tmp; tmp="$(mktemp)"
  awk -v h="$heading" -v e="$entry" -v ph="$PLACEHOLDER" '
    { lines[NR] = $0 }
    END {
      start = 0
      for (i = 1; i <= NR; i++) if (lines[i] == h) { start = i; break }
      if (!start) { print "section heading not found: " h > "/dev/stderr"; exit 3 }
      end = NR
      for (i = start + 1; i <= NR; i++) if (lines[i] ~ /^## /) { end = i - 1; break }
      last = start
      for (i = start; i <= end; i++)
        if (lines[i] !~ /^[[:space:]]*$/ && lines[i] != ph) last = i
      for (i = 1; i <= NR; i++) {
        if (i > start && i <= end && lines[i] == ph) continue
        print lines[i]
        if (i == last) { if (last == start) print ""; print e }
      }
    }' "$file" > "$tmp"
  mv "$tmp" "$file"
  echo "added to $file under $heading"
}

cmd_list() {
  local file; file="$(file_for "$1")"
  if [ $# -ge 2 ]; then
    local heading; heading="$(heading_for "$2")"
    awk -v h="$heading" '$0 == h { on = 1; next } /^## / { on = 0 } on && /^- /' "$file"
  else
    grep -E '^(## |- )' "$file"
  fi
}

case "${1:-}" in
  module)   [ $# -eq 2 ] || { echo "usage: insight.sh module <path>" >&2; exit 2; }; cmd_module "$2" ;;
  add)      [ $# -ge 4 ] || { echo "usage: insight.sh add <module> <section> \"<text>\" [--evidence <file:line>] [--force]" >&2; exit 2; }; shift; cmd_add "$@" ;;
  check)    [ $# -eq 3 ] || { echo "usage: insight.sh check <module> \"<text>\"" >&2; exit 2; }; cmd_check "$2" "$3" ;;
  list)     [ $# -ge 2 ] || { echo "usage: insight.sh list <module> [section]" >&2; exit 2; }; shift; cmd_list "$@" ;;
  sections) printf '%s\n' works doesnt patterns tools errors session questions ;;
  *) sed -n '3,16p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 2 ;;
esac
