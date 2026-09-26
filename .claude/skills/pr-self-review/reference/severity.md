# Severity: what blocks and what does not

The gate blocks on **one critical finding**. That only works if "critical" is
a short, mechanical list that nobody argues with. Everything a skill dislikes
but that would not break the product is a warning, and warnings never block.
If you find yourself wanting to promote a warning to critical to make a point,
leave it a warning and say why in the report.

## Critical (blocks push, PR creation and the CI check)

| Source | Finding | Dismissable? |
|---|---|---|
| precheck | `typecheck`, `lint`, or unit tests fail in a touched package | no |
| precheck | `lint:arch` reports a violation not in `server/.dependency-cruiser-known-violations.json` | no |
| precheck | contract copies differ (`server/src/vendor/shared` vs `client/src/vendor/shared`) | no |
| precheck | a committed migration was modified or deleted | no |
| precheck | a vendored skill (`skills-lock.json` key) was edited by hand | no |
| precheck | runtime data, `.env`, build output tracked in the change set | no |
| precheck | secret-looking string in an added line of a source file | yes, with the placeholder shown |
| security lane | a **high-confidence** OWASP finding: injection with a traced user input, missing authz on a route, secrets leaving `SecretsProvider` | no |
| any lane | a verified runtime crash on a reachable path: unhandled promise in a route, `undefined` dereference on a contract field, Zod parse of a shape the server never sends | no |
| any lane | a breaking change to a `@devdigest/shared` contract without every consumer updated | no |

"Verified" means the verification pass re-read the file and reproduced the
reasoning from the actual code, not from the hunk alone.

## Warning (reported, never blocks)

- Any rule from a routed skill: placement, layering, ring violations that the
  baseline already tolerates, hook misuse, Drizzle or Fastify anti-patterns,
  Zod schemas that should be stricter, test smells.
- Medium-confidence security findings.
- Lockfile changed without `package.json`, design-system file touched,
  `skills-lock.json` changed, e2e flow misnamed.
- Precheck secret hits in tests, mocks, or docs.

## Info (mentioned in one line each, no table row)

Style, naming nits, "consider" suggestions. Keep these to a handful; nobody
reads twenty.

## Dismissing a finding

A subagent's finding is dropped only by the verification pass, and only with
the evidence that disproves it written into the report's "Dismissed" section.
A precheck finding marked `dismissable: true` can be dropped the same way. All
other precheck findings stand, because a tool said so.
