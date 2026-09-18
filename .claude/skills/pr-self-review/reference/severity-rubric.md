# Severity rubric

The only authority on severity for this skill. Do not invent a scale.

The gate is only useful if people trust it, and trust dies the first time a
CRITICAL is wrong. So **CRITICAL is a closed list**. If a violation is not on it,
it is at most a WARNING — however strongly you feel about it.

## CRITICAL — blocks the PR

Deterministic, already checked by `hard-rules.sh` / `run-gates.sh` (listed so you
do not re-report them):

| Rule | Why it blocks |
|---|---|
| a gate exited non-zero | typecheck, eslint, dependency-cruiser or a unit test is failing |
| `contracts-parity` | `@devdigest/shared` has two physical copies; changing one is how they drift |
| `vendor-edit` | `*/src/vendor/**` is vendored, edited only on an explicit request |
| `applied-migration-edit`, `journal-not-append-only` | an applied migration is history; rewriting it breaks every other checkout |
| `migration-without-snapshot`, `schema-without-migration` | migrations never run on boot — a schema-only change ships as `relation … does not exist` |
| `lockfile-hand-edit`, `wrong-package-manager`, `root-package-json` | this is not a workspace; each directory owns its manager |
| `skills-lock-*` | the lock stores content hashes — an edit breaks verification |
| `arch-allowlist-growth` | `pnpm arch` still passes when you widen the regex; this is the violation the gate cannot catch |
| `reviewer-core-io` | ZERO I/O is the package's whole contract |
| `secret-literal`, `process-env-read` | secrets live in `~/.devdigest/secrets.json`; `container.secrets` is the only read chokepoint |
| `client-fetch` | banned by `client/CLAUDE.md`; a component must go through a hook |
| `it-test-suffix`, `raw-sql-untested` | both ship a green local run and a red CI |
| `e2e-fixture-drift` | the browser flows assert on seeded text; changing it breaks them silently |
| `homework-to-main` | homework lives in forks |
| `insights-section-drift` | the eight sections are fixed and the file is append-only |
| `private-underscore-import` | `_` means private to its parent |

A reviewer subagent may add a CRITICAL **only** for these, none of which a
script can judge:

- **Missing tenancy.** A new query that does not scope through `getContext()` /
  `workspaceId`. Every table carries `workspace_id`; there is no auth layer
  behind it. Cite the file and the query.
- **A contract change that breaks an existing consumer** — the types still
  compile because the other copy lags.
- **An exploitable injection, SSRF or XSS** on a changed line, per the `security`
  skill. Not "this could be unsafe" — name the input and the sink.
- **Data loss**: a migration that drops or narrows a populated column, a delete
  without a `where`, a cascade that was not there before.

Everything else an agent finds is a WARNING at most.

## WARNING — reported, does not block

House conventions that still compile and still run:

- naming: kebab vs Pascal, a component folder missing its fixed file set, a test
  not sitting beside its subject
- a literal not lifted into `constants.ts`
- a hardcoded user-facing string instead of a `next-intl` key; a key missing from
  a non-default locale
- a `[Convention]`-tagged layering smell from `onion-architecture` or
  `frontend-ui-architecture` (see below)
- a gate that could not run
- a new exported function with no test in the change set
- anything pre-existing on `main` (`baseline.json`) that would otherwise be
  CRITICAL

## SUGGESTION

Worth saying once: a simpler expression, a better name, a test worth adding
later. Never blocks, never argued about.

## Two rules that keep CRITICAL honest

**1. The rule-tag cap.** `onion-architecture` and `frontend-ui-architecture` tag
every rule `[Framework]`, `[Convention]` or `[House]`. Only `[Framework]` and
`[House]` violations may be CRITICAL. A `[Convention]` violation caps at WARNING
— that is an industry practice the team is entitled to apply differently, and
presenting it as a hard stop shuts down a decision that is theirs to make.

**2. The confidence bar.** A CRITICAL you are under 0.85 confident of is
automatically downgraded to WARNING by `build-report.sh`, with a note. Do not
inflate confidence to force a block; do not report below 0.6 at all.

## Grounding

Every finding must name a file in your list and a line inside a diff hunk. A
finding that cites an unchanged line is dropped before it reaches the report —
this is the same citation-grounding gate the product applies to its own model
output (`reviewer-core/src/review/grounding.ts`). Read the file before
asserting; a finding derived from the patch alone, with no `Read`, is not
acceptable.
