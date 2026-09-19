#!/usr/bin/env bash
#
# collect-diff.sh — the single source of truth for "what is open".
#
# Emits, under $PSR_DIR (default .claude/pr-self-review/):
#   diff.patch      the exact bytes that get hashed and fed to the reviewers
#   changeset.json  base/head shas, the diff hash, per-file state + bucket,
#                   the merged agent set, and the gate set those buckets need
#
#   --hash-only     print "<head_sha> <diff_hash>" and nothing else (~200ms).
#                   The PreToolUse hook uses this; it must stay cheap.
#
# NOTE: no `set -e`. `git diff` and `git diff --no-index` exit 1 on difference.
# NOTE: never `git add -N` here — it mutates the index and would change what the
#       user then commits.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$SCRIPT_DIR/_lib.sh"

ROOT="$(psr_repo_root)" || psr_die "pr-self-review: not a git repository."
cd "$ROOT" || exit 1
psr_need git; psr_need jq; psr_need shasum

ROUTING="$SCRIPT_DIR/../reference/routing.json"
[ -f "$ROUTING" ] || psr_die "pr-self-review: missing $ROUTING"

HASH_ONLY=0
[ "${1:-}" = "--hash-only" ] && HASH_ONLY=1

IFS=$'\t' read -r BASE_REF BASE_SHA BASE_MODE < <(psr_base)
HEAD_SHA="$(git rev-parse HEAD)"

mkdir -p "$PSR_DIR"
PATCH="$PSR_DIR/diff.patch"

# ---- the patch, in a fixed byte order so the hash is stable -----------------
{
  [ "$BASE_MODE" = "merge-base" ] && git diff --no-color "$BASE_SHA"...HEAD
  git diff --no-color HEAD
  git ls-files --others --exclude-standard -z | sort -z |
    while IFS= read -r -d '' f; do
      git diff --no-color --no-index -- /dev/null "$f"
    done
} > "$PATCH" 2>/dev/null

DIFF_HASH="$(shasum -a 256 < "$PATCH" | cut -d' ' -f1)"

if [ "$HASH_ONLY" = "1" ]; then
  printf '%s %s\n' "$HEAD_SHA" "$DIFF_HASH"
  exit 0
fi

# ---- file list, one "path<TAB>state" line per source ------------------------
collect_states() {
  if [ "$BASE_MODE" = "merge-base" ]; then
    git diff --name-only "$BASE_SHA"...HEAD | sed 's/$/\tcommitted/'
  fi
  git diff --name-only --cached            | sed 's/$/\tstaged/'
  git diff --name-only                     | sed 's/$/\tunstaged/'
  git ls-files --others --exclude-standard | sed 's/$/\tuntracked/'
}

DIFF_LINES="$(wc -l < "$PATCH" | tr -d ' ')"

# Lockfile churn is never read by a reviewer, so it must not push the change set
# into degraded mode. It still belongs in the patch — a lockfile change has to
# invalidate the report — so subtract it only from the review budget.
LOCK_LINES="$(
  {
    [ "$BASE_MODE" = "merge-base" ] && git diff --no-color "$BASE_SHA"...HEAD -- '*pnpm-lock.yaml' '*package-lock.json'
    git diff --no-color HEAD -- '*pnpm-lock.yaml' '*package-lock.json'
  } 2>/dev/null | wc -l | tr -d ' '
)"
REVIEW_LINES=$(( ${DIFF_LINES:-0} - ${LOCK_LINES:-0} ))
[ "$REVIEW_LINES" -lt 0 ] && REVIEW_LINES=0

collect_states | grep -v '^[[:space:]]*$' | jq -R -s \
  --arg base_ref "$BASE_REF" --arg base_sha "$BASE_SHA" --arg base_mode "$BASE_MODE" \
  --arg head_sha "$HEAD_SHA" --arg diff_hash "$DIFF_HASH" --arg now "$(psr_now)" \
  --argjson diff_lines "${DIFF_LINES:-0}" --argjson review_lines "${REVIEW_LINES:-0}" \
  --slurpfile routing "$ROUTING" '
  ($routing[0]) as $R
  | ($R.limits) as $L
  | [ split("\n")[] | select(length > 0) | split("\t") | {path: .[0], state: .[1]} ]
  | group_by(.path)
  | [ .[] | { path: .[0].path, states: (map(.state) | unique) } ]
  # --- route: first matching rule wins ---
  | map(. + { bucket: ( .path as $p | ($R.rules | map(select(. as $r | $p | test($r.re))) | .[0].bucket) ) })
  | map(. + { agent: ($R.buckets[.bucket].agent) })
  | . as $files
  | ($files | map(.bucket) | unique) as $bucketNames
  # --- skills per bucket, plus conditional additions ---
  | ( $bucketNames | map(. as $b | {
        key: $b,
        value: {
          agent:  $R.buckets[$b].agent,
          files:  ($files | map(select(.bucket == $b) | .path)),
          skills: ( ($R.buckets[$b].skills)
                    + ( $R.conditional_skills
                        | map(select(.bucket == $b))
                        | map( . as $c
                               | if ($files | map(select(.bucket == $b) | .path)
                                      | map(select(test($c.when_re))) | length) > 0
                                 then $c.add else [] end )
                        | add // [] ) ) | unique,
          gates:  ($R.buckets[$b].gates)
        }
      }) | from_entries ) as $buckets
  # --- gate set: union of the touched buckets, plus conditional gates ---
  | ( ( $bucketNames | map($R.buckets[.].gates) | add // [] )
      + ( $R.conditional_gates
          | map( . as $c
                 | if ($files | map(.path) | map(select(test($c.when_re))) | length) > 0
                   then $c.add else [] end )
          | add // [] ) | unique ) as $gates
  # --- merge buckets into agents (the fan-out unit) ---
  | ( $files | map(select(.agent != null) | .agent) | unique ) as $agentNames
  | ( $agentNames | map(. as $a | {
        key: $a,
        value: {
          buckets: ($files | map(select(.agent == $a) | .bucket) | unique),
          files:   ($files | map(select(.agent == $a) | .path)),
          skills:  ($files | map(select(.agent == $a) | .bucket) | unique
                    | map($buckets[.].skills) | add // [] | unique)
        }
      }) | from_entries ) as $agents
  | {
      schema_version: 1,
      generated_at: $now,
      base_ref: $base_ref, base_sha: $base_sha, base_mode: $base_mode,
      head_sha: $head_sha, diff_hash: $diff_hash,
      files: $files,
      buckets: $buckets,
      agents: $agents,
      gates: $gates,
      unrouted: ($files | map(select(.bucket == "unrouted") | .path)),
      stats: {
        file_count: ($files | length),
        diff_lines: $diff_lines,
        review_lines: $review_lines,
        degraded: (($files | length) > $L.degraded_files or $review_lines > $L.degraded_diff_lines),
        over_agent_cap: (($agents | length) > $L.max_agents)
      }
    }
  ' > "$PSR_DIR/changeset.json"

rc=$?
[ $rc -eq 0 ] || psr_die "pr-self-review: failed to build changeset.json"

printf 'changeset: %s files, %s diff lines, buckets: %s, agents: %s\n' \
  "$(jq -r '.stats.file_count' "$PSR_DIR/changeset.json")" \
  "$(jq -r '.stats.diff_lines' "$PSR_DIR/changeset.json")" \
  "$(jq -r '.buckets | keys | join(",")' "$PSR_DIR/changeset.json")" \
  "$(jq -r '.agents  | keys | join(",")' "$PSR_DIR/changeset.json")"
