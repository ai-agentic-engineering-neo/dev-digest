#!/usr/bin/env bash
#
# hard-rules.sh — the deterministic half. No model, no judgement.
#
# Every rule here is written down somewhere in the repo (root CLAUDE.md
# "Do not touch"/"Gotchas", a module CLAUDE.md, or a dependency-cruiser config).
# If a rule needs judgement to apply, it does NOT belong here — it belongs in
# reference/severity-rubric.md for the subagents.
#
# Writes $PSR_DIR/hard-rules.json: a JSON array of findings.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$SCRIPT_DIR/_lib.sh"
ROOT="$(psr_repo_root)" || psr_die "not a git repository"; cd "$ROOT" || exit 1
psr_need jq

CHANGESET="$PSR_DIR/changeset.json"
PATCH="$PSR_DIR/diff.patch"
[ -f "$CHANGESET" ] || psr_die "run collect-diff.sh first"

BASE_SHA="$(jq -r .base_sha "$CHANGESET")"
FILES="$(jq -r '.files[].path' "$CHANGESET")"
ADDED="$(awk -f "$SCRIPT_DIR/added-lines.awk" "$PATCH")"

OUT="$(mktemp)"; : > "$OUT"
n=0

# emit <rule> <severity> <category> <file> <line> <title> <rationale> [suggestion]
emit() {
  n=$((n + 1))
  jq -n -c \
    --arg id "psr-hr-$(printf '%04d' "$n")" --arg rule "$1" --arg sev "$2" \
    --arg cat "$3" --arg file "$4" --argjson line "${5:-1}" --arg title "$6" \
    --arg rat "$7" --arg sug "${8:-}" '
    { id: $id, severity: $sev, category: $cat, title: $title, file: $file,
      start_line: $line, end_line: $line, rationale: $rat,
      suggestion: (if $sug == "" then null else $sug end),
      confidence: 1.0, kind: "hook",
      psr_bucket: null, psr_source: "hard-rule", psr_rule: $rule, psr_skill: null }' >> "$OUT"
}

has()  { printf '%s\n' "$FILES" | grep -qx "$1"; }
match(){ printf '%s\n' "$FILES" | grep -E "$1"; }
# added lines matching a content regex, restricted to files matching a path regex
# awk -v processes escape sequences in the value, which silently corrupts a
# regex like `sql\.raw\(`. ENVIRON does not, so the pattern arrives verbatim.
added(){ PSR_P="$1" PSR_C="$2" awk -F'\t' \
  'BEGIN{p=ENVIRON["PSR_P"]; c=ENVIRON["PSR_C"]} $1 ~ p && $3 ~ c' <<< "$ADDED"; }

# ---------------------------------------------------------------- vendor -----
while read -r f; do
  [ -z "$f" ] && continue
  emit vendor-edit CRITICAL bug "$f" 1 \
    "Edit under src/vendor/** (vendored code)" \
    "Root \`CLAUDE.md\` → Do not touch: \`*/src/vendor/**\` is vendored code, edited only on an explicit request. \`$f\` is in the change set." \
    "Revert it, or state in the PR body that the edit was explicitly requested."
done < <(match '^(server|client)/src/vendor/' | grep -v '/vendor/shared/contracts/')

# ------------------------------------------------------ contracts parity -----
while read -r f; do
  [ -z "$f" ] && continue
  base="${f##*/}"
  case "$f" in
    server/*) twin="client/src/vendor/shared/contracts/$base" ;;
    *)        twin="server/src/vendor/shared/contracts/$base" ;;
  esac
  if [ ! -f "$twin" ]; then
    emit contracts-parity WARNING bug "$f" 1 \
      "Contract has no twin in the other copy" \
      "\`$twin\` does not exist. The client copy is a documented lagging copy, so this may be deliberate — confirm it is." \
      "If the contract is shared, create \`$twin\`."
  elif ! has "$twin"; then
    emit contracts-parity CRITICAL bug "$f" 1 \
      "Contract changed in one copy only" \
      "Root \`CLAUDE.md\` → Gotchas: \`@devdigest/shared\` exists in TWO physical copies and they have already drifted. Change a contract → change both in the same commit. \`$twin\` is not in the change set." \
      "Apply the same change to \`$twin\`."
  fi
done < <(match '^(server|client)/src/vendor/shared/contracts/')

# --------------------------------------------------------- migrations -------
while read -r f; do
  [ -z "$f" ] && continue
  case "$f" in */meta/_journal.json) continue ;; esac
  if git cat-file -e "$BASE_SHA:$f" 2>/dev/null; then
    emit applied-migration-edit CRITICAL bug "$f" 1 \
      "Applied migration edited" \
      "Root \`CLAUDE.md\` → Do not touch: never edit applied migrations; use \`pnpm db:generate\`. \`$f\` already existed at \`$BASE_SHA\`." \
      "Revert \`$f\` and generate a new migration instead."
  fi
done < <(match '^server/src/db/migrations/')

JOURNAL="server/src/db/migrations/meta/_journal.json"
if has "$JOURNAL" && git cat-file -e "$BASE_SHA:$JOURNAL" 2>/dev/null; then
  old="$(git show "$BASE_SHA:$JOURNAL" 2>/dev/null | jq -c '.entries' 2>/dev/null)"
  cnt="$(printf '%s' "$old" | jq 'length' 2>/dev/null)"
  new="$(jq -c ".entries[:${cnt:-0}]" "$JOURNAL" 2>/dev/null)"
  if [ -n "$old" ] && [ "$old" != "$new" ]; then
    emit journal-not-append-only CRITICAL bug "$JOURNAL" 1 \
      "Migration journal is not append-only" \
      "The \`entries\` array at \`$BASE_SHA\` is no longer a prefix of the current one — an existing entry was changed or removed, not appended." \
      "Restore the original entries and append the new one at the end."
  fi
fi

while read -r sql; do
  [ -z "$sql" ] && continue
  git cat-file -e "$BASE_SHA:$sql" 2>/dev/null && continue   # not new
  num="$(basename "$sql" | cut -d_ -f1)"
  snap="server/src/db/migrations/meta/${num}_snapshot.json"
  has "$snap" || emit migration-without-snapshot CRITICAL bug "$sql" 1 \
    "New migration without its snapshot" \
    "\`$snap\` is not in the change set. \`pnpm db:generate\` writes the \`.sql\`, the snapshot and the \`_journal.json\` entry together; shipping one without the others breaks the next generate." \
    "Run \`cd server && pnpm db:generate\` and commit all three files."
  has "$JOURNAL" || emit migration-without-snapshot CRITICAL bug "$sql" 1 \
    "New migration without a journal entry" \
    "\`$JOURNAL\` is not in the change set, so this migration will never be applied by \`pnpm db:migrate\`." \
    "Run \`cd server && pnpm db:generate\`."
done < <(match '^server/src/db/migrations/[0-9]+_.*\.sql$')

if match '^server/src/db/schema/' >/dev/null; then
  if ! match '^server/src/db/migrations/[0-9]+_.*\.sql$' >/dev/null; then
    f="$(match '^server/src/db/schema/' | head -1)"
    emit schema-without-migration CRITICAL bug "$f" 1 \
      "Schema changed with no migration" \
      "Drizzle schema files changed but no new \`server/src/db/migrations/*.sql\` is in the change set. Root \`CLAUDE.md\`: migrations never run on boot, so a schema-only change reaches the API as \`relation ... does not exist\`." \
      "Run \`cd server && pnpm db:generate\`."
  fi
fi

# ------------------------------------------------------------ lockfiles -----
while read -r lf; do
  [ -z "$lf" ] && continue
  dir="$(dirname "$lf")"
  has "$dir/package.json" || emit lockfile-hand-edit CRITICAL bug "$lf" 1 \
    "Lockfile changed without its package.json" \
    "Root \`CLAUDE.md\` → Do not touch: never hand-edit a lockfile. \`$dir/package.json\` is not in the change set, so this lockfile was not produced by a dependency change." \
    "Revert \`$lf\` and change the dependency with that directory's own package manager."
done < <(match '(^|/)(pnpm-lock\.yaml|package-lock\.json)$')

for d in server client; do
  has "$d/package-lock.json" && emit wrong-package-manager CRITICAL bug "$d/package-lock.json" 1 \
    "npm lockfile in a pnpm package" \
    "Root \`CLAUDE.md\`: \`server/\` and \`client/\` use pnpm. A \`package-lock.json\` here means npm was run in the wrong directory." \
    "Delete it and run \`pnpm install\` in \`$d/\`."
done
for d in e2e reviewer-core; do
  has "$d/pnpm-lock.yaml" && emit wrong-package-manager CRITICAL bug "$d/pnpm-lock.yaml" 1 \
    "pnpm lockfile in an npm package" \
    "Root \`CLAUDE.md\`: \`e2e/\` and \`reviewer-core/\` use npm." \
    "Delete it and run \`npm install\` in \`$d/\`."
done

for f in package.json pnpm-lock.yaml package-lock.json pnpm-workspace.yaml; do
  has "$f" && emit root-package-json CRITICAL bug "$f" 1 \
    "Root $f created" \
    "Root \`CLAUDE.md\` → Do not touch: there is no root \`package.json\` and no root lockfile — this is NOT a workspace. Never create one." \
    "Delete \`$f\`."
done

if has skills-lock.json; then
  while read -r name; do
    [ -z "$name" ] && continue
    sk=".claude/skills/$name/SKILL.md"
    [ -f "$sk" ] && grep -q 'authored: local' "$sk" && emit skills-lock-local-entry CRITICAL bug skills-lock.json 1 \
      "Locally authored skill added to skills-lock.json" \
      "\`$name\` has \`metadata.authored: local\` in \`$sk\`. The lock tracks vendored skills only; a local skill has no upstream \`computedHash\` to verify against." \
      "Remove the \`$name\` entry from \`skills-lock.json\`."
  done < <(jq -r '.skills | keys[]' skills-lock.json 2>/dev/null)
  match '^\.claude/skills/' >/dev/null || emit skills-lock-edit CRITICAL bug skills-lock.json 1 \
    "skills-lock.json edited with no skill change" \
    "Root \`CLAUDE.md\` → Do not touch: \`skills-lock.json\` stores content hashes — an edit breaks verification. No file under \`.claude/skills/\` changed alongside it." \
    "Revert \`skills-lock.json\`."
fi

# ------------------------------------------- dependency-cruiser allowlists ---
while IFS=$'\t' read -r f ln txt; do
  [ -z "$f" ] && continue
  emit arch-allowlist-growth CRITICAL bug "$f" "$ln" \
    "dependency-cruiser debt allowlist grew" \
    "\`$f\` hoists today's known debt into named consts with the comment \"do not add to them\". \`pnpm arch\` still passes when a regex is widened, so this is the one layering violation the gate itself cannot catch. Added line: \`$(printf '%s' "$txt" | cut -c1-120)\`" \
    "Move the offending code into the ring it belongs to instead of widening the allowlist."
done < <(printf '%s\n' "$ADDED" \
  | awk -F'\t' '$1 ~ /\.dependency-cruiser\.cjs$/ && $3 ~ /\^src\// && $3 ~ /\|/' \
  | while IFS=$'\t' read -r af al at; do
      # A brand-new config is not "growth" — it is the allowlist's starting point.
      git cat-file -e "$BASE_SHA:$af" 2>/dev/null && printf '%s\t%s\t%s\n' "$af" "$al" "$at"
    done)

# --------------------------------------------------- reviewer-core purity ----
while IFS=$'\t' read -r f ln txt; do
  [ -z "$f" ] && continue
  emit reviewer-core-io CRITICAL bug "$f" "$ln" \
    "I/O reaches @devdigest/reviewer-core" \
    "\`reviewer-core/CLAUDE.md\`: ZERO I/O — no database, no GitHub, no filesystem, no \`process.env\`. The only side effect is the injected \`LLMProvider\`. Added line: \`$(printf '%s' "$txt" | cut -c1-120)\`" \
    "Add a field to \`ReviewInput\` and pass the data in, rather than importing it."
done < <(added '^reviewer-core/src/' "(from '(node:)?(fs|path|child_process)'|require\('(node:)?(fs|child_process)'\)|process\.env|\bfetch\(|@devdigest/api|drizzle|from 'pg')")

# ------------------------------------------------------------- secrets -------
while IFS=$'\t' read -r f ln txt; do
  [ -z "$f" ] && continue
  case "$f" in *.test.ts|*.test.tsx|*mocks.ts|*/seed.ts) continue ;; esac
  emit secret-literal CRITICAL security "$f" "$ln" \
    "Possible secret literal in the diff" \
    "Root \`CLAUDE.md\`: secrets live in \`~/.devdigest/secrets.json\` (mode 0600), not in the repo and not in the DB. \`LocalSecretsProvider\` is the only read chokepoint. Added line matches a credential pattern." \
    "Remove the literal and read it through \`container.secrets\`."
done < <(added '.' '(sk-[A-Za-z0-9]{16}|ghp_[A-Za-z0-9]{20}|github_pat_[A-Za-z0-9]{20}|AKIA[A-Z0-9]{12}|BEGIN [A-Z ]*PRIVATE KEY)')

# --------------------------------------------------------- process.env -------
ENV_OK='^(server/src/platform/config\.ts|server/src/adapters/secrets/local\.ts|server/src/adapters/git/simple-git\.ts|server/src/db/(migrate|seed)\.ts|server/eslint\.config\.mjs|server/drizzle\.config\.ts|.*\.test\.ts)$'
while IFS=$'\t' read -r f ln txt; do
  [ -z "$f" ] && continue
  printf '%s' "$f" | grep -qE "$ENV_OK" && continue
  emit process-env-read CRITICAL bug "$f" "$ln" \
    "process.env read outside the allowed files" \
    "\`server/CLAUDE.md\`: reading \`process.env\` for a key is banned — configuration comes from \`platform/config.ts\`, secrets from \`container.secrets\`. The same rule is encoded in \`server/eslint.config.mjs\`." \
    "Read it from \`AppConfig\`, or from \`container.secrets\` if it is a secret."
done < <(added '^server/src/' 'process\.env')

# ------------------------------------------------------------ client fetch ---
while IFS=$'\t' read -r f ln txt; do
  [ -z "$f" ] && continue
  emit client-fetch CRITICAL bug "$f" "$ln" \
    "fetch() inside a component" \
    "\`client/CLAUDE.md\`: \`fetch\` inside a component is banned. Go through a hook in \`src/lib/hooks/*\`, which goes through \`lib/api.ts\`. This is the backstop for when \`pnpm lint\` could not run." \
    "Add or reuse a hook in \`client/src/lib/hooks/\`."
done < <(added '^client/src/(app|components)/' '(^|[^.\w])fetch\(')

# ---------------------------------------------------------- test placement ---
while read -r f; do
  [ -z "$f" ] && continue
  case "$f" in *.it.test.ts) continue ;; esac
  grep -q "test/helpers/pg" "$f" 2>/dev/null && emit it-test-suffix CRITICAL test "$f" 1 \
    "DB-backed test without the .it.test.ts suffix" \
    "\`TESTING.md\`: a test importing \`test/helpers/pg.ts\` must use the \`.it.test.ts\` suffix. Without it the hermetic unit lane picks it up and CI fails for want of Docker." \
    "Rename it to \`${f%.test.ts}.it.test.ts\`."
done < <(match '^server/.*\.test\.ts$')

if added '^server/src/' 'sql\.raw\(' | grep -q .; then
  if ! match '\.it\.test\.ts$' >/dev/null; then
    f="$(added '^server/src/' 'sql\.raw\(' | head -1 | cut -f1)"
    l="$(added '^server/src/' 'sql\.raw\(' | head -1 | cut -f2)"
    emit raw-sql-untested CRITICAL test "$f" "$l" \
      "Raw SQL added with no integration test" \
      "\`onion-architecture\` SKILL.md: \`typecheck\` cannot see inside \`sql.raw(...)\`, so a wrong column name reaches production as a runtime \`42703\`. A new raw query needs an \`.it.test.ts\` proving its columns exist." \
      "Add an \`.it.test.ts\` that runs the query against a real schema."
  fi
fi

# ------------------------------------------------------------ e2e fixtures ---
if has server/src/db/seed.ts; then
  if added '^server/src/db/seed\.ts$' '(acme|payments-api|482)' | grep -q .; then
    emit e2e-fixture-drift CRITICAL test server/src/db/seed.ts 1 \
      "Seed change touches the e2e fixtures" \
      "\`e2e/CLAUDE.md\`: the browser flows run against read-only seeded data (\`acme/payments-api\`, PR #482) and flow 02 assumes the seeded demo repo is the only one. Changing those rows breaks e2e silently — the flows assert on text, not ids." \
      "Re-run \`./scripts/e2e.sh\` before opening the PR, or keep the fixture rows unchanged."
  fi
fi

# ----------------------------------------------------------------- INSIGHTS --
while read -r f; do
  [ -z "$f" ] && continue
  missing=""
  for h in "## Decisions" "## What Works" "## What Doesn't Work" "## Codebase Patterns" \
           "## Tool & Library Notes" "## Recurring Errors & Fixes" "## Session Notes" "## Open Questions"; do
    grep -qF "$h" "$f" 2>/dev/null || missing="$missing\"$h\" "
  done
  [ -n "$missing" ] && emit insights-section-drift CRITICAL style "$f" 1 \
    "INSIGHTS.md lost a fixed section" \
    "The eight sections are fixed — add to the one that fits, never invent or drop a heading. Missing: $missing" \
    "Restore the missing heading(s)."
  if git cat-file -e "$BASE_SHA:$f" 2>/dev/null; then
    removed="$(git diff "$BASE_SHA" -- "$f" | grep -c '^-[^-]')"
    [ "${removed:-0}" -gt 0 ] && emit insights-section-drift CRITICAL style "$f" 1 \
      "INSIGHTS.md is append-only but lines were removed" \
      "$removed line(s) were deleted from \`$f\`. Correct a stale entry with a dated note beneath it, never edit it away." \
      "Restore the deleted lines and add a dated correction below them."
  fi
done < <(match '(^|/)INSIGHTS\.md$')

# --------------------------------------------------------- branch / commits --
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
case "$BRANCH" in
  *-homework)
    emit homework-to-main CRITICAL bug CLAUDE.md 1 \
      "Homework branch about to target main" \
      "Root \`CLAUDE.md\`: homework lives in forks — never commit it to \`main\`. Current branch is \`$BRANCH\`." \
      "Open the PR against your fork, not this repo's \`main\`." ;;
esac
printf '%s\n' "$BRANCH" | grep -qE '^(main|L[0-9]{2}-(lab|homework))$' || \
  emit commit-convention WARNING style CLAUDE.md 1 \
    "Branch name does not match the convention" \
    "Root \`CLAUDE.md\` → Naming: branches are \`L0x-lab\` / \`L0x-homework\`. Current branch is \`$BRANCH\`." \
    "Rename the branch, or note why it differs in the PR body."

if [ "$(jq -r .base_mode "$CHANGESET")" = "merge-base" ]; then
  while read -r subj; do
    [ -z "$subj" ] && continue
    printf '%s\n' "$subj" | grep -qE '^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\([a-z0-9._/-]+\))?!?: .' || \
      emit commit-convention WARNING style CLAUDE.md 1 \
        "Commit subject is not a Conventional Commit" \
        "Root \`CLAUDE.md\` → Naming: commits are Conventional Commits (\`feat(reviews): …\`, \`docs: …\`). Offending subject: \`$subj\`" \
        "Reword it with \`git rebase -i\` before opening the PR."
  done < <(git log --format=%s "$BASE_SHA..HEAD" 2>/dev/null)
fi

# ------------------------------------------------------------ naming ---------
while read -r f; do
  [ -z "$f" ] && continue
  git cat-file -e "$BASE_SHA:$f" 2>/dev/null && continue   # only new files
  b="$(basename "$f")"
  case "$f" in
    */_components/*)
      d="$(basename "$(dirname "$f")")"
      printf '%s' "$d" | grep -qE '^[A-Z][A-Za-z0-9]*$' || \
        emit naming-convention WARNING style "$f" 1 "Feature component folder is not PascalCase" \
          "Root \`CLAUDE.md\` → Naming: React component folders under \`app/**/_components/\` are PascalCase, named exactly after the component. Folder: \`$d\`" \
          "Rename the folder to PascalCase." ;;
    client/src/components/*)
      d="$(basename "$(dirname "$f")")"
      printf '%s' "$d" | grep -qE '^[a-z0-9]+(-[a-z0-9]+)*$' || \
        emit naming-convention WARNING style "$f" 1 "Shared component folder is not kebab-case" \
          "Root \`CLAUDE.md\` → Naming: shared component folders under \`src/components/\` are kebab-case (\`severity-counts/\`). Folder: \`$d\`" \
          "Rename the folder to kebab-case." ;;
  esac
  case "$b" in
    *.ts)
      printf '%s' "$b" | grep -qE '^[a-z0-9]+(-[a-z0-9]+)*(\.[a-z]+)*\.ts$' || \
        emit naming-convention WARNING style "$f" 1 "Non-component TS file is not kebab-case" \
          "Root \`CLAUDE.md\` → Naming: non-component TS and its directories are kebab-case (\`diff-loader.ts\`, \`model-router.ts\`). File: \`$b\`" \
          "Rename it to kebab-case." ;;
  esac
done < <(match '^(server|client|reviewer-core)/src/.*\.(ts|tsx)$')

# ------------------------------------------------------------ private dirs ---
while IFS=$'\t' read -r f ln txt; do
  [ -z "$f" ] && continue
  case "$f" in */_components/*|*/_shared/*|*/db/schema/*) continue ;; esac
  emit private-underscore-import CRITICAL bug "$f" "$ln" \
    "Import reaches into a _-prefixed private directory" \
    "Root \`CLAUDE.md\` → Naming: a \`_\` prefix means private to its parent — never import one from outside it. Added line: \`$(printf '%s' "$txt" | cut -c1-120)\`" \
    "Lift the shared part out of the private directory, or pass it in."
done < <(added '^(server|client)/src/' "from '[^']*/_(components|shared)/")

# ---------------------------------------------------- routing self-check ----
# A skill nobody routes to is a skill nobody runs. Without this the table drifts
# exactly as skills-lock.json already has.
ROUTING_JSON="$SCRIPT_DIR/../reference/routing.json"
if [ -f "$ROUTING_JSON" ] && [ -f .claude/skills/README.md ]; then
  routed="$(jq -r '[.buckets[].skills[], .conditional_skills[].add[]] | unique[]' "$ROUTING_JSON" 2>/dev/null)"
  while read -r sk; do
    [ -z "$sk" ] && continue
    case "$sk" in pr-self-review) continue ;; esac   # it does not route to itself
    printf '%s\n' "$routed" | grep -qx "$sk" || \
      emit routing-coverage WARNING style .claude/skills/pr-self-review/reference/routing.json 1 \
        "Skill \`$sk\` is in the catalog but no bucket routes to it" \
        "\`.claude/skills/README.md\` lists \`$sk\`, but no bucket in \`routing.json\` loads it, so it never runs during a self-review." \
        "Add it to the bucket that owns those files, or drop it from the catalog."
  done < <(ls -1 .claude/skills 2>/dev/null | grep -v '^README.md$')
fi

jq -s '.' "$OUT" > "$PSR_DIR/hard-rules.json"
rm -f "$OUT"
printf 'hard rules: %s findings (%s critical)\n' \
  "$(jq 'length' "$PSR_DIR/hard-rules.json")" \
  "$(jq '[.[]|select(.severity=="CRITICAL")]|length' "$PSR_DIR/hard-rules.json")"
