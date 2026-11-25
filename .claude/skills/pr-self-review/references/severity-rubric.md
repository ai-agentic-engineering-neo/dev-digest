# Severity rubric — pr-self-review

All findings use the product enum `CRITICAL / WARNING / SUGGESTION`
(`server/src/vendor/shared/contracts/findings.ts`). Only **CRITICAL** blocks a PR, and only when
it is **introduced or made worse by this diff**. WARNING and SUGGESTION never block, whatever
their count.

## CRITICAL — the PR must not be opened

Report CRITICAL only when ALL hold:
1. the problem is in lines this diff adds or changes (or a changed line makes an existing problem
   reachable/worse);
2. a concrete rule in the reviewing skill (or root/package CLAUDE.md) says so — cite it;
3. it falls in one of these classes:

| Class | Examples in this repo |
|---|---|
| Broken build/test gate | lint, typecheck, unit tests, depcruise architecture test fail (found by checks.mjs, not by reviewers) |
| Dependency-direction violation | onion: an inner ring (domain/application) imports Fastify, Drizzle, an adapter, `platform/container`, or receives an outer-ring type; frontend: `lib → components → app` direction broken, `components/` importing from `app/`, a runtime (non-type) import from `@devdigest/shared` in client code |
| Security, exploitable | secret in code/logs, SQL built by string concatenation, missing host/origin guard or validation on a new route that reads/writes data, command/path injection in git/clone adapters, `dangerouslySetInnerHTML` with untrusted data |
| Correctness bug the skill tags CRITICAL | react-best-practices CRITICAL rules (conditional hooks, state mutation, broken keys/reconciliation, effects with missing cleanup that leak); a floating (un-awaited, un-caught) promise in long-lived server code (server/INSIGHTS.md: it crashes the API) |
| Data-integrity | migration that drops/rewrites data without a down path, schema change without the matching migration, contract changed in only one `vendor/shared` copy |

When unsure between CRITICAL and WARNING → choose **WARNING**. A false CRITICAL stops a
teammate's work; a WARNING is still shown.

## WARNING — should be fixed, does not block

A "should" rule of the skill: file in the wrong folder/ring for new code, oversized component,
business logic inside a component, fetch from a component instead of `lib/hooks`, missing Zod
validation at an internal boundary, missing test for new logic, non-English docs/comments,
dependency change without lockfile.

## SUGGESTION — optional

Naming, style, small refactors, nicer types, documentation polish.

## Mapping from skills' own scales

| Source scale | → |
|---|---|
| react-best-practices CRITICAL | CRITICAL |
| react-best-practices HIGH / MEDIUM | WARNING |
| security CRITICAL | CRITICAL |
| security HIGH | WARNING (the reviewer may raise it to CRITICAL only if remotely exploitable in our stack; the verifier decides) |
| security MEDIUM / LOW | SUGGESTION |
| anything unlabelled | judge by the classes above |

Per-skill caps from `skill-map.json` (`maxSeverity`) are applied by the scripts:
`react-testing-library` findings are at most WARNING.

## Not a finding (put it nowhere)

- problems in code the diff does not touch (report them with `"introducedByDiff": false` if
  they matter; they are listed as out of scope and never block);
- rules that do not fit our stack (the vendored `security` skill speaks Express/MongoDB/JWT —
  translate to Fastify/Drizzle/Postgres or skip);
- legacy violations already in `server/.dependency-cruiser-known-violations.json`;
- anything the deterministic checks already cover (lint/type errors, lockfiles, contract drift,
  secrets regexes) — do not duplicate them.
