# Built-in skills (L02)

Readable originals of the skills seeded by `server/src/db/seed-skills.ts`.
Frontmatter here = the skill's name / description / type; the body is what goes
into the prompt. Keep both copies in sync (the DB is the source of truth at run
time — edit in the UI to version a change).

| Skill | Type | Linked to |
|---|---|---|
| [uncovered-branches](uncovered-branches.md) | rubric | Test Quality Reviewer |
| [corner-cases](corner-cases.md) | rubric | Test Quality Reviewer |
| [over-mocking](over-mocking.md) | convention | Test Quality Reviewer |
| [api-contract-breaking-change](api-contract-breaking-change.md) | rubric | General Reviewer |
| flaky-tests (`import-samples/`) | rubric | Test Quality Reviewer — **imported via the UI**, not seeded |
| [breaking-change](breaking-change.md) | rubric | API Contract Reviewer — not seeded yet |
| [response-schema](response-schema.md) | rubric | API Contract Reviewer — not seeded yet |
| [semver-discipline](semver-discipline.md) | rubric | API Contract Reviewer — not seeded yet |
| [deprecation-policy](deprecation-policy.md) | convention | API Contract Reviewer — not seeded yet |

## Import sample

`import-samples/flaky-tests/` is a skill in the common `SKILL.md` folder layout,
with an extra README and an executable `scripts/detect-flaky.sh`. Zip it and
import it on the Skills page (Add Skill → Import):

```bash
cd docs/skills/import-samples && zip -r /tmp/flaky-tests.zip flaky-tests
```

The preview shows the core taken from `flaky-tests/SKILL.md`, lists the script as
"executable — not processed" (it is never read or run) and warns that the
`allowed-tools` frontmatter is ignored. The skill is saved **disabled**; enable it
after reading it, then link it on the Test Quality Reviewer's Skills tab.
