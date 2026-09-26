# Greps — run at two revisions, report the difference

The architecture skills ship zero-dependency grep rules (`onion-architecture` §13,
`frontend-ui-architecture` §15). Run against the worktree they are nearly useless
here: the repo has 56 pre-existing deep-relative imports, four grandfathered
Drizzle-in-handler modules, and seven wildcard barrels. Every run would drown in
hits that nobody is going to fix.

So run the **same pattern at `HEAD` and at the merge-base, and subtract**:

```bash
MB=$(git merge-base main HEAD)
git grep -nE '<pattern>' HEAD  -- <pathspec>   # hits_head
git grep -nE '<pattern>' "$MB" -- <pathspec>   # hits_base
# new_hits = hits_head − hits_base
```

**Compare by `(file, normalised match text)`, never by line number** — line numbers
shift when anything above them changes; the matched text does not.

Normalise **only the match text**, and keep the field delimiter out of it. The
obvious one-liner is wrong:

```bash
# WRONG — collapsing all whitespace eats the tab between path and match,
# so every later "is this file in the diff?" lookup silently misses.
sed -E 's/[[:space:]]+/ /g'
```

Collapse runs of whitespace inside the match only (`awk -F'\t'` on field 2). The
failure is silent: the subtraction still returns the right *count*, so it looks
like it worked, while every hit gets misclassified as non-blocking drift.

Three reasons this beats a hand-maintained baseline table:

- **Grandfathered hits cancel mechanically.** The four modules in
  `onion-architecture` §11 that query Drizzle from the handler appear in *both*
  revisions, so they can never become a finding. No table to keep in sync.
- **It works for rules that never had a baseline.** §15 has no expected-output
  table at all.
- **`git grep` uses git's own regex engine**, so patterns behave identically in a
  Bash tool call (where `grep` is ugrep here), in the hook's plain shell (BSD
  grep), and in CI (GNU grep). This sidesteps the ugrep backreference trap
  recorded in the root `INSIGHTS.md` entirely.

## Scoping a new hit

| Where the new hit is | What it is |
|---|---|
| In a file that is **in the diff**, status `A` | **WARNING** (see the severity ceiling below) |
| In a file that is **in the diff**, status `M` | **SUGGESTION** |
| In a **test file or fixture** (`*.test.*`, `test/**`, `fixtures/**`) | **SUGGESTION**, whatever its status |
| In a file **not in the diff** | `drift_hits` — recorded, **never blocks**. A rename or a base-branch move causes these, and they are not this branch's fault |
| Present in **both** revisions | Invisible. Grandfathered by construction |

### A grep hit is capped at WARNING — with one exception

A pattern match is evidence of a *convention* violation. Measured against this
repo's own rubric, CRITICAL means "a security breach, data loss/corruption,
incorrect results, a crash, or a broken contract". A deep-relative import is none
of those, so it must never block a push.

This was not theoretical. Run on this branch, `fe-15-deep-relatives` found three
genuinely new hits — all of them `import messages from "../../../../…"` inside two
**newly added test files**. Under a mechanical "new file ⇒ CRITICAL" rule that
would have blocked the push over an import path. A gate that does that once gets
bypassed forever after.

**The one exception is `onion-13-tenancy-guard`**, which may be CRITICAL on an
`A`-status file. `onion-architecture` §7 is explicit that workspace scoping is "a
tenancy guard, not a filter; a query without it is a security bug" — that clears
the CRITICAL bar on its own terms. Even then it is a *heuristic*: read the hit
before reporting it, the way §13 instructs.

Everything else tops out at WARNING. If a grep hit genuinely represents a
correctness defect, a reviewer agent will find it by reading the code and report it
with a mechanism — which is what earns a CRITICAL.

## The patterns

All ten were run at `HEAD` and at the merge-base of this repo on 2026-09-21. The
"both revs" column is the count that cancels out — it is diagnostic, not a
baseline to maintain, and it will drift as the repo changes. That is fine.

### From `onion-architecture` §13 — run when `server/src/**` is in the diff

| id | pattern | pathspec | both revs |
|---|---|---|---|
| `onion-13-db-in-boundary` | `drizzle-orm` | `:(glob)server/src/modules/*/routes.ts` | 4 |
| `onion-13-framework-in-service` | `from 'fastify` | `:(glob)server/src/modules/*/service.ts` | 0 |
| `onion-13-rowtype-leak` | `\$inferSelect` | `:(glob)server/src/modules/*/service.ts` | 0 |
| `onion-13-cross-module-reach` | `from '\.\./[a-z-]+/repository` | `server/src/modules` | 0 |
| `onion-13-config-bypass` | `process\.env` | `server/src` `:(exclude)server/src/platform/config.ts` `:(exclude)server/src/adapters/secrets` | 5 |
| `onion-13-tenancy-guard` | *(files-without-match)* `workspaceId` | `:(glob)server/src/modules/*/repository.ts` | 1 |

The tenancy check uses `git grep -L`, which works at a revision:

```bash
git grep -L 'workspaceId' "$MB" -- ':(glob)server/src/modules/*/repository.ts'
```

The last two are **heuristics, not rules** — §13 says so. `repo-intel/repository.ts`
scopes by `repoId`, which the caller already resolved inside a workspace;
`adapters/git/simple-git.ts` *sets* `GIT_TERMINAL_PROMPT` rather than reading
config. Read the hit before calling it a violation. Subtraction already hides all
of these, so they should only ever reach you as genuinely new.

### From `frontend-ui-architecture` §15 — run when `client/src/**` is in the diff

| id | pattern | pathspec | both revs |
|---|---|---|---|
| `fe-15-deep-relatives` | `\.\./\.\./\.\.` | `client/src` | 56 |
| `fe-15-fetch-in-ui` | `[^a-zA-Z.]fetch\(` | `:(glob)client/src/app/**/*.tsx` `:(glob)client/src/components/**/*.tsx` | 0 |
| `fe-15-wildcard-barrels` | *(files-with-match)* `export \*` | `client/src` | 7 |
| `fe-15-junk-drawer` | *(path check, see below)* | `client/src` | 0 |

The shipped §15 pattern for the second rule is `fetch(`, which matches
**`refetch()`** — four false positives in `client/` today, all of them TanStack
Query retry handlers. The leading `[^a-zA-Z.]` fixes it: 0 hits. §15 has been
corrected in place.

The junk-drawer check is a path check, not a content grep:

```bash
git ls-tree -r --name-only HEAD -- client/src | grep -E '(^|/)utils(\.ts)?$'
```

## Running them in one command

[`scripts/fitness-greps.sh`](../../../scripts/fitness-greps.sh) runs every
pattern above by this subtraction method — working tree vs `HEAD` with no
arguments, `<base> <head>` for a range — plus the vendored-twin check
(`routing.md`), module registration and the reviewer-core purity grep from
`architecture-reviewer.md`, and prints each new hit with its class from
§ Scoping a new hit. It is evidence, not a verdict: the hits still have to be
read. This file stays the source of truth — change a pattern here and there
together.

Expected output on the L03 intent-layer change (uncommitted vs `91817b4`,
2026-09-24) — the same numbers architecture-reviewer got by hand:

```
onion-13-db-in-boundary          pass          4 → 4    new 0
onion-13-framework-in-service    pass          0 → 0    new 0
onion-13-rowtype-leak            pass          0 → 0    new 0
onion-13-cross-module-reach      pass          1 → 1    new 0
onion-13-config-bypass           pass          5 → 5    new 0
onion-13-tenancy-guard           pass          1 → 1    new 0
fe-15-deep-relatives             pass         95 → 95   new 0
fe-15-fetch-in-ui                pass          0 → 0    new 0
fe-15-wildcard-barrels           regression    7 → 8    new 1   ← client/src/lib/hooks/intent.ts: "export *" in a comment (benign)
fe-15-junk-drawer                pass
reviewer-core-purity             pass          0 → 0    new 0
vendored-twin                    pass
module-registration              pass       intent
```

With a planted `import … from 'fastify'`, `$inferSelect` and `process.env` in
a new `server/src/modules/zztmp/service.ts` plus a one-sided
`client/src/vendor/shared/zztmp.ts`, it reports framework-in-service,
rowtype-leak and config-bypass as WARNING (A-file), vendored-twin as CRITICAL
and module-registration for `zztmp` — the negative case was run, not assumed.

## Reporting

Each group that ran greps returns them in its `greps` array:

```json
{ "id": "fe-15-deep-relatives",
  "status": "pass | regression",
  "baseline_hits": 56,
  "new_hits": ["client/src/app/x/_components/Y.tsx:12"],
  "drift_hits": [] }
```

`status` is `regression` iff `new_hits` is non-empty. A regression in a diffed file
becomes a finding with `source_skill` set to the owning skill and `source_rule` to
the section (`§13` or `§15`); `drift_hits` never becomes a finding.
