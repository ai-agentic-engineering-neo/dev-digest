# Severity scale (shared by every reviewer)

The skills we route to grade things differently. `react-best-practices` uses
CRITICAL/HIGH/MEDIUM, `security` grades confidence, and the architecture skills
only have checklists. Map everything onto this one scale. **Critical blocks the
PR**, so a wrong critical costs a person real time and a missed one ships a
defect. Be calibrated, not dramatic.

| Severity | Meaning | Blocks PR |
|---|---|---|
| **critical** | Introduced by this diff, and one of: (a) a demonstrable bug — wrong result, crash, data loss, broken contract at runtime; (b) a vulnerability with an attacker-reachable input you traced; (c) a breach of a project rule from root `CLAUDE.md` "Do not touch" / "Cross-package rules"; (d) a new dependency-direction violation (onion rules 1/2/4/5/6/10/11; frontend "imports never point up or sideways"). | yes |
| **major** | A clear violation of a rule in the skill that will make the code harder to change, test or reason about, but nothing is broken today. | no |
| **minor** | Worth fixing in this PR if cheap; a weaker version of a skill rule, naming, small duplication. | no |
| **nit** | Taste. Only report if the skill states it explicitly. | no |
| **info** | Set by the scripts, not by you: an issue on a line this diff did not change. | no |

## Mapping each skill's own scale

| Skill | Its label | Our severity |
|---|---|---|
| react-best-practices | CRITICAL (reconciliation bugs, broken hooks rules) | critical only if it causes a real bug in this code path, else major |
| react-best-practices | HIGH / MEDIUM | major / minor |
| security | HIGH confidence (pattern + attacker-controlled input confirmed) | critical |
| security | MEDIUM confidence (input source unclear) | major — say what to verify |
| security | LOW | do not report |
| onion-architecture | checklist item breaking import direction, framework/ORM leak into domain or service, cross-module internals import | critical |
| onion-architecture | other checklist items (missing UoW, error without `code`, mapping in wrong file, missing test) | major |
| frontend-ui-architecture | import pointing up/sideways, `fetch` outside the gateway | critical |
| frontend-ui-architecture | other checklist items (placement, thin routes, barrels, state copies) | major |
| next-best-practices, fastify, drizzle, postgres, zod, typescript-expert, react-testing-library | rule that causes a runtime/type-safety bug in this diff | critical |
| same | other rule violations | major / minor by impact |
| @guard-integrity | any weakening of INJECTION_GUARD or the grounding gate | critical |

## Rules of thumb

- "Could be a problem if…" is not critical. Critical needs the concrete failing
  scenario: input/state → wrong output.
- Style, size, and "I would have done it differently" are never critical.
- When two rules from different skills disagree (e.g. `react-best-practices`
  size rules vs `frontend-ui-architecture`), the skill earlier in
  `routing.json → precedence` wins; report the conflict as minor at most.
