# Skills

A skill is a reusable block of markdown instructions that can be attached to any
review agent. It is **text only**: nothing in a skill is ever executed.

Format: a name, a one-line `description`, a `type` (`rubric`, `convention`,
`security`, `custom`) and a markdown `body`. The `.md` files here are the
human-readable originals of the seeded skills (`server/src/db/seed-skills.ts` mirrors
them; keep both in sync).

## Writing the description
The description is the skill's interface. Write it as a directive: when to apply it
and what to check.

> Apply when <situation>; check <what>.

Good: "Apply when a diff changes an HTTP route or zod schema; check for changes that
break existing clients." Bad: "Some notes about APIs."

## Ordering and enabling
- A link between an agent and a skill means the skill is on for that agent. There is
  no separate enabled flag per link; a skill disabled globally is skipped.
- Skills are injected in link order (the order set in the agent's Skills tab), as
  one block each under `## Skills / rules`. Put the most important skill first.
- Only enabled skills are injected. The run trace shows the Skills block and its
  token count.

## Trust
An imported skill is foreign instructions that go straight into the agent's prompt.
Skills are not wrapped as untrusted data, by design. Read the body in the import
preview and review it before saving. Import only takes `SKILL.md` (or one `.md`
file); every other file in an archive, scripts included, is listed as ignored and is
never extracted or run.

## Seeded skills
| Skill | Type | Agent |
|---|---|---|
| `untested-branches` | rubric | Test Quality Reviewer |
| `missing-corner-cases` | rubric | Test Quality Reviewer |
| `over-mocking` | convention | Test Quality Reviewer |
| `api-contract-breaking-changes` | rubric | General Reviewer |
| `breaking-change` | rubric | API Contract Reviewer |
| `response-schema` | rubric | API Contract Reviewer |
| `semver-discipline` | rubric | API Contract Reviewer |

## Import demo (not seeded)
`import/flaky-test-patterns.zip` (contains `SKILL.md` and `scripts/detect.sh`) and
`import/flaky-test-patterns.md` (single-file variant). `import/flaky-test-patterns/`
is the unpacked source. Importing the zip shows `scripts/detect.sh` under "ignored
files (not executed)".

`import/deprecation-policy.zip` (and `deprecation-policy.md`, unpacked in
`import/deprecation-policy/`) is the fourth API Contract Reviewer skill. It is not
seeded on purpose: import it on the Skills page, then link it to the agent in its
Skills tab.

## Extracted skills
The Conventions page (`/repos/:id/conventions`) builds one `convention` skill with
`source: extracted` from the accepted candidates; see `server/specs/03-conventions.md`.
