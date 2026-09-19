# Examples

Real shapes from this repo. Each pair is a decision the reviewer has to make.

## Severity: a closed CRITICAL list

❌ **Over-blocking.** A reviewer reports `severity: "CRITICAL"` because a new
component folder is `findingsTab/` instead of `FindingsTab/`.

Naming is a WARNING. It compiles, it runs, and it is fixed in ten seconds. Make
it CRITICAL and the next person learns that the gate cries wolf, and starts
reaching for `# psr-skip` by reflex.

✅ **Blocking on what actually ships broken.**

```
CRITICAL  server/src/vendor/shared/contracts/findings.ts:11
          Contract changed in one copy only
```

`@devdigest/shared` exists twice — `server/src/vendor/shared/` and
`client/src/vendor/shared/` — and they have already drifted. Both typecheck
green; the break shows up at runtime, in the browser, on a field the server
started sending.

## Grounding: cite a changed line or say nothing

❌ A finding on `client/src/lib/api.ts:210` when the diff only touches lines
40–52 of that file. It may well be true, and it is still dropped: an unbounded
review of untouched code turns every PR into a refactor argument.

✅ The same observation anchored to a line the change actually adds, or not
raised at all.

## The rule-tag cap

`onion-architecture` tags each rule. The tag decides the ceiling:

```
[House]      All persistence lives in repository.ts   → may be CRITICAL
[Framework]  A service importing fastify cannot be
             called from a job or a test               → may be CRITICAL
[Convention] Dependencies point inward                 → WARNING at most
```

Onion Architecture is an industry convention, not a vendor mandate. Reporting a
`[Convention]` violation as a hard stop overrules a decision the team is
entitled to make differently.

## Gate failure vs gate skipped

❌ Treating a missing prerequisite as a failure:

```
CRITICAL  yaml:parse failed
```

when the actual cause was `ModuleNotFoundError: No module named 'yaml'`. Nothing
about the workflow file was proven wrong. Encoded in `run-gates.sh`: probe for
the tool first, and skip rather than fail.

✅

```
WARNING  Gate `server:test-it` did not run
         Docker is not running — the DB-backed lane could not be proven locally
         (it still runs in server-integration.yml).
```

## The allowlist that defeats its own gate

`server/.dependency-cruiser.cjs` hoists known debt into named constants:

```js
/** Files that query the DB outside a repository (known debt, 2026-09-18). */
const ORM_DEBT =
  '^src/modules/(pulls/routes|polling/routes|…)\\.ts$';
```

❌ Adding `|settings/service` to that alternation. `pnpm arch` goes green, CI
goes green, and the layering rule quietly got weaker. The config says *"do not
add to them"* precisely because the gate cannot notice.

✅ Move the query into `repository.ts`. If the debt genuinely has to grow, that
is a conversation for the PR body, not a regex edit — and `arch-allowlist-growth`
will make sure it is had.

## What a deterministic rule should not try to be

`missing-tenancy` is CRITICAL, and it is **not** in `hard-rules.sh`. A grep for
`db.select(` with no `workspaceId` nearby produces a false block the first time
someone writes a helper that takes the scope as an argument. It belongs to the
`backend` reviewer, which can read the call site.

The dividing line: a script owns rules that are true by inspection of the diff
alone. Everything that needs the surrounding code belongs to an agent.
