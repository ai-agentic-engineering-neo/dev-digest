#!/usr/bin/env bash
# Turn a findings array (stdin, JSON) into the verdict artifact + markdown report.
#
#   ... | write-verdict.sh --base <ref> --scope <s> --files <n> --skills "a,b" [--override]
#
# Writes .claude/pr-self-review/last-run.json and last-run.md, prints the verdict line.
# Finding: {severity, file, line, skill, title, failure, fix}  (severity = CRITICAL|WARNING|SUGGESTION)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"

BASE=""; SCOPE=branch; FILES=0; SKILLS=""; OVERRIDE=false; NOTE=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --base) BASE="$2"; shift 2 ;;
    --scope) SCOPE="$2"; shift 2 ;;
    --files) FILES="$2"; shift 2 ;;
    --skills) SKILLS="$2"; shift 2 ;;
    --note) NOTE="$2"; shift 2 ;;
    --override) OVERRIDE=true; shift ;;
    *) echo "write-verdict.sh: unknown argument $1" >&2; exit 64 ;;
  esac
done

ROOT="$(psr_repo_root)" || { echo "write-verdict.sh: not a git repository" >&2; exit 3; }
cd "$ROOT"

FINDINGS="$(cat)"
[[ -z "${FINDINGS//[[:space:]]/}" ]] && FINDINGS='[]'

if ! jq -e 'type == "array" and all(.[]; has("severity") and has("file") and has("title")
            and (.severity | IN("CRITICAL","WARNING","SUGGESTION")))' >/dev/null <<<"$FINDINGS"; then
  echo "write-verdict.sh: findings must be a JSON array of {severity,file,title,...} with a valid severity" >&2
  exit 65
fi

OUT_DIR=".claude/pr-self-review"
mkdir -p "$OUT_DIR"

jq -n \
  --argjson findings "$FINDINGS" \
  --arg generated_at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --arg base "$BASE" --arg scope "$SCOPE" --arg note "$NOTE" \
  --arg branch "$(git rev-parse --abbrev-ref HEAD)" \
  --arg head_sha "$(git rev-parse HEAD)" \
  --arg dirty_hash "$(psr_dirty_hash)" \
  --argjson files "$FILES" \
  --argjson override "$OVERRIDE" \
  --argjson skills "$(printf '%s' "$SKILLS" | jq -Rc 'split(",") | map(select(length > 0))')" \
  '{generated_at:$generated_at, base:$base, branch:$branch, head_sha:$head_sha,
    dirty_hash:$dirty_hash, scope:$scope, files:$files, skills_run:$skills, note:$note,
    counts:{CRITICAL:  ($findings | map(select(.severity=="CRITICAL"))   | length),
            WARNING:   ($findings | map(select(.severity=="WARNING"))    | length),
            SUGGESTION:($findings | map(select(.severity=="SUGGESTION")) | length)},
    override:$override,
    blocked: (($findings | map(select(.severity=="CRITICAL")) | length) > 0 and ($override | not)),
    findings:$findings}' > "$OUT_DIR/last-run.json"

jq -r '
  def block(sev; heading):
    (.findings | map(select(.severity == sev))) as $f
    | if ($f | length) == 0 then empty
      else "## " + heading + " (" + ($f | length | tostring) + ")", "",
           ($f[] | "- **" + .title + "** — `" + .file + (if .line then ":" + (.line|tostring) else "" end) + "`"
                 + (if .skill then " · _" + .skill + "_" else "" end)
                 + (if .failure then "\n  Сценарій: " + .failure else "" end)
                 + (if .fix then "\n  Фікс: " + .fix else "" end)),
           ""
      end;
  "# PR self-review — " + (if .blocked then "BLOCKED" else "OK" end),
  "",
  "`" + .branch + "` проти `" + .base + "` · " + (.files|tostring) + " файлів · scope `" + .scope + "` · " + .generated_at,
  "CRITICAL " + (.counts.CRITICAL|tostring) + " · WARNING " + (.counts.WARNING|tostring) + " · SUGGESTION " + (.counts.SUGGESTION|tostring)
    + (if .override then " · **OVERRIDE**" else "" end),
  "",
  "Скіли: " + (if (.skills_run|length) == 0 then "—" else (.skills_run | join(", ")) end),
  "",
  (if .note != "" then .note + "\n" else empty end),
  block("CRITICAL"; "CRITICAL — мерджити не можна"),
  block("WARNING"; "WARNING"),
  block("SUGGESTION"; "SUGGESTION")
' "$OUT_DIR/last-run.json" > "$OUT_DIR/last-run.md"

jq -r 'if .blocked then "BLOCKED: \(.counts.CRITICAL) CRITICAL, \(.counts.WARNING) WARNING, \(.counts.SUGGESTION) SUGGESTION"
       else "OK: \(.counts.CRITICAL) CRITICAL, \(.counts.WARNING) WARNING, \(.counts.SUGGESTION) SUGGESTION"
         + (if .override then " (override)" else "" end) end' "$OUT_DIR/last-run.json"
