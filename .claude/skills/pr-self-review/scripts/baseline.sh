#!/usr/bin/env bash
#
# baseline.sh — record the violations that ALREADY exist, so a newly added gate
# does not block a PR on debt it did not introduce.
#
# Run it on a clean checkout of the base branch. The result is COMMITTED (it is
# the one file under .claude/pr-self-review/ that is not gitignored), and
# regenerating it must be its own reviewable commit — that is what stops it
# quietly absorbing new debt.
set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$SCRIPT_DIR/_lib.sh"
ROOT="$(psr_repo_root)" || psr_die "not a git repository"; cd "$ROOT" || exit 1
psr_need jq

DIRTY="$(git status --porcelain | grep -v '^?? \.claude/pr-self-review/' | head -1)"
[ -n "$DIRTY" ] && [ "${PSR_FORCE:-}" != "1" ] && psr_die \
"pr-self-review: the working tree is dirty. A baseline recorded over uncommitted
work would bake that work in as 'pre-existing'. Stash first, or re-run with
PSR_FORCE=1 if you know what you are doing."

mkdir -p "$PSR_DIR"
TMP="$(mktemp)"; : > "$TMP"

for pkg in server client; do
  [ -f "$pkg/eslint.config.mjs" ] || continue
  pnpm --dir "$pkg" exec eslint . --format json 2>/dev/null \
    | jq -r --arg p "$pkg" --arg root "$ROOT/" '
        .[] | .filePath as $f | .messages[] | select(.severity==2)
        | "lint:" + (.ruleId // "error") + "|" + ($f | ltrimstr($root)) + "|"
          + ("eslint: " + (.ruleId // "error") | ascii_downcase)' >> "$TMP"
done

jq -R -s --arg now "$(psr_now)" --arg sha "$(git rev-parse HEAD)" '
  { schema_version: 1,
    recorded_at: $now,
    recorded_at_sha: $sha,
    note: "Violations already present at recorded_at_sha. A finding whose fingerprint is listed here is reported but never blocks. Regenerate with /pr-self-review --update-baseline, in its own commit.",
    fingerprints: ([ split("\n")[] | select(length>0) ] | unique) }' "$TMP" > "$PSR_DIR/baseline.json"
rm -f "$TMP"
printf 'baseline: %s fingerprints at %s\n' \
  "$(jq '.fingerprints|length' "$PSR_DIR/baseline.json")" "$(git rev-parse --short HEAD)"
