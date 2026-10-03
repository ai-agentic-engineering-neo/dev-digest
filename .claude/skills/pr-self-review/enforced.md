# Hard-rule checklist

Run every item here against the full diff scope (from `SKILL.md` step 1),
**regardless of which rows in [routing.md](routing.md) matched.** These
come straight from the root `CLAUDE.md` and aren't owned by any single
domain skill — this file is the only place they're enforced. Report each
hit as its own finding, tagged with the severity given here.

## 1. Do-not-touch paths — CRITICAL

```sh
git diff --name-only $base...HEAD -- server/clones/
git diff --name-only $base...HEAD -- server/pnpm-lock.yaml client/pnpm-lock.yaml \
  reviewer-core/package-lock.json e2e/package-lock.json
```

- Any output from the first command → `CRITICAL`: `server/clones/` is
  gitignored, regenerated on import, and must never be hand-edited or
  committed.
- A migration file is being **edited**, not just added — cross-check
  changed files under `server/src/db/migrations/*` against the entries
  already listed in `server/src/db/migrations/meta/_journal.json`. If a
  changed file's name matches an already-applied journal entry →
  `CRITICAL`. A brand-new migration file with no journal entry yet is
  fine.

## 2. Lockfiles never hand-edited — HIGH

If any of the four lockfiles above appears in the diff, confirm the
matching package's `package.json` also changed in the same scope:

```sh
git diff --name-only $base...HEAD -- server/package.json client/package.json \
  reviewer-core/package.json e2e/package.json
```

A lockfile diff with **no** corresponding manifest change in the same
package is a smell — `HIGH`, not `CRITICAL` (sometimes a legitimate
re-resolve, e.g. a transitive security bump), but call it out.

## 3. Vendor mirroring — CRITICAL

```sh
git diff --name-only $base...HEAD -- server/src/vendor/shared client/src/vendor/shared
```

If `server/src/vendor/shared/**` changed, the same logical contract change
must appear in `client/src/vendor/shared/**` in the same scope, and vice
versa. If only one side moved → `CRITICAL`: these two copies must stay
byte-identical per CLAUDE.md; no build step syncs them.

## 4. Test naming / unit-integration CI split — CRITICAL

For every new or changed `*.test.ts` file under `server/`:

- If it imports testcontainers, references a real Postgres connection, or
  calls into `container.db` outside an explicit mock → it **must** be
  named `*.it.test.ts`. A `*.test.ts` file with real DB usage is
  `CRITICAL` (silently breaks the unit/integration split and the CI path
  filters that depend on it, per CLAUDE.md).
- Conversely, a `*.it.test.ts` file with **no** DB usage at all is the
  inverse mistake — also worth flagging (`HIGH`): it'll run in the slower
  integration lane for no reason.

## 5. Secrets-provider convention — HIGH

```sh
git diff $base...HEAD -- server/ | grep -n '^\+.*process\.env\.'
```

Any newly-added `process.env.*` read for something secret-shaped (a key,
token, password, credential) that doesn't go through
`LocalSecretsProvider` first → `HIGH`. `process.env` is meant to be a
fallback only, per CLAUDE.md; `GITHUB_TOKEN` is canonical, `GITHUB_PAT` is
accepted only as a fallback — a new direct `GITHUB_PAT` read without
`GITHUB_TOKEN` present is the same category of miss.

## 6. Hardcoded secrets in the diff — CRITICAL

Grep every **added** line, across the whole diff scope, independent of
whether the file matched the `security` signal row in `routing.md`:

```sh
git diff $base...HEAD | grep -nE '^\+' | grep -inE \
  "sk-[a-zA-Z0-9]{20,}|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN[ A-Z]*PRIVATE KEY-----|api[_-]?key['\"]?\s*[:=]\s*['\"][A-Za-z0-9_\-]{16,}"
```

Any hit is `CRITICAL` unconditionally. This must not depend on routing
having correctly classified the file as security-relevant first — it's
the one check that runs on literally every added line.

## 7. Missing test coverage — MEDIUM

```sh
git diff --name-only $base...HEAD | grep -E '\.(ts|tsx)$' | grep -vE '\.(test|it\.test)\.(ts|tsx)$'
git diff --name-only $base...HEAD | grep -E '\.(test|it\.test)\.(ts|tsx)$'
```

If the first command returns non-test source files and the second returns
nothing at all in the same scope → `MEDIUM`: no test file was touched
anywhere in this diff. Not a hard block — plenty of legitimate changes
have no new test (a rename, a comment, a type-only edit) — but worth
surfacing since no domain skill in `routing.md` owns "did you test this."
