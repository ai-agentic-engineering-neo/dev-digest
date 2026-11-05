# Severity rubric (one scale for every skill)

Skills grade differently: `react-best-practices` tags rules CRITICAL/HIGH/MEDIUM; `security` grades
**confidence** and **severity** separately; in `zod` "CRITICAL" is the *impact of a rule category*, not
of a concrete finding. Every reviewer maps its findings onto this scale. When in doubt, pick the lower
level — a false `critical` blocks the user's PR.

## critical — blocks the PR

Only when the problem is real, on a changed line, and one of:

| Source | Counts as critical when |
|---|---|
| `react-best-practices` | the violated rule sits in a section tagged **CRITICAL** (component design, derive-don't-store, render factories, over-engineering, key props) **and** it will cause a bug, broken reconciliation or a stale/duplicated state — not a style nit |
| `security` | **high confidence AND severity CRITICAL**: direct exploit without auth, hardcoded secret/token/key, RCE, auth bypass, SQL/command injection with attacker-controlled input. High confidence + HIGH severity (e.g. stored XSS, IDOR) → `high` |
| `onion-architecture` | a **new** dependency that points outward and is an `error`-level rule in `server/.dependency-cruiser.cjs` (domain → infra/drizzle, routes → db/adapters, application → drizzle/adapters, cross-module import, adapter → module). Usually reported by the deterministic check; an agent reports it only for a case the checker cannot see |
| any skill | a broken `@devdigest/shared` contract: a removed/renamed export, a changed field type or enum that `client/` or `reviewer-core/` uses |
| any skill | code that **will** break the build or runtime: wrong/missing import, missing `.js` extension in an ESM relative import in `server/` or `reviewer-core/`, calling a function with the wrong arity/shape, an `await` lost on a promise whose result is used |
| any skill | data loss or corruption: destructive migration without a guard, a write that drops a workspace scope (`eq(t.x.workspaceId, workspaceId)`) |
| deterministic | policy ("Do not touch"), new layer violation, type error in a changed file, failing server unit tests after a `reviewer-core` change |

## high

Real defect or rule violation that will hurt, but does not break the build or open an exploit: wrong
layer for new code that the checker cannot see, performance trap in a hot path, missing error handling
on an external call, stored XSS / IDOR (security HIGH), missing loading/error states, a violated entry
from the package's `INSIGHTS.md` (**an `INSIGHTS.md` violation is never lower than `high`**).

## medium

Maintainability / convention issue the skill clearly calls out: file in the wrong folder, component
that should be split, naming convention, missing test for new logic, weak typing (`any`) at a boundary.

## low

Nit or optional improvement. Report sparingly — at most 3 `low` per review slice.

## Not a finding

- Anything on a line the diff did not change, **unless** the change makes it wrong (then report it on
  the changed line that causes it). Old problems may be reported with `"onChangedLine": false` — they
  are shown as pre-existing and never block.
- Rules from a skill that does not apply to this stack (e.g. Express/MongoDB examples in `security`).
- Preferences that contradict the package's `CLAUDE.md` / `AGENTS.md` — the repo conventions win.
