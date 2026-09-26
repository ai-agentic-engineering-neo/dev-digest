# Experiment — skills control

**The orchestrator/agent prepares these patches; the user opens the PRs and
runs the comparison manually.** Nothing here is applied, pushed, or run by an
agent — this document and its two `.patch` files are fixture prep only.

Goal: demonstrate that turning a skill on or off for an agent visibly changes
that agent's prompt, its run log, and its trace — and nothing else silently
changes.

## Setup

Two patches live alongside this file:

- [`test-quality-happy-path.patch`](./test-quality-happy-path.patch) — adds a
  small early-return branch (empty-array input) to
  `server/src/modules/pulls/status.ts` (`latestOf`) plus a test that only
  covers the happy path, leaving the new branch untested. Exercises **Test
  Quality Reviewer** and its four seeded skills (`branch-coverage-gate`,
  `corner-case-checklist`, `mock-discipline`, `flaky-test-patterns`).
- [`api-contract-breaking.patch`](./api-contract-breaking.patch) — changes the
  response shape of `GET /settings/secrets-status` in
  `server/src/modules/settings/routes.ts` (booleans → `{ configured: boolean
  }` objects) without a matching change to `SecretsStatus` in
  `server/src/vendor/shared/contracts/platform.ts`. Exercises **General
  Reviewer** with the imported `api-contract-gate` skill (see
  [`server/docs/skills/import-demo/api-contract-gate/`](../../server/docs/skills/import-demo/api-contract-gate/README.md)
  for how to zip and import it — it is attached to General Reviewer through
  the UI's import flow, not seeded).

To apply a patch by hand: `git apply <patch>` from the repo root, then open a
PR from the resulting branch against `main` (or run the review locally
against the working tree, whichever the comparison calls for). Revert with
`git checkout -- <files>` or `git apply -R <patch>` when done.

## Checklist

For each patch, against the agent it exercises:

1. **Run** the review with the relevant skills OFF (Test Quality Reviewer's
   four skills, or General Reviewer without `api-contract-gate` attached).
2. **Record** the result: verdict, findings, and whether the gap the patch
   introduces (the untested branch / the contract drift) was caught.
3. **Turn skills on** — enable the relevant skill(s) on the agent
   (`agent_skills.enabled = true`, or attach the imported skill to General
   Reviewer).
4. **Run** again on the same diff.
5. **Trace**: open the run's trace and confirm:
   - The prompt gained a **Skills block** — `### Skill: <name>` sections, one
     per enabled skill, in `agent_skills.order`.
   - The trace shows the skill **names** and a **`+N tokens`** cost for the
     block.
   - `trace.prompt_assembly.skills_used` lists `{id, name, version, tokens}`
     for each skill that was actually in the prompt.
6. **Turn a skill off** and run once more — confirm it disappears from all
   three places at once: the **prompt** (no `### Skill:` section for it), the
   **log**, and **`skills_used`** in the trace. A disabled skill must not
   appear anywhere (per `server/specs/skills.md` S9).

A successful experiment shows the off-run either missing the finding
entirely or reporting it with less precision, and the on-run's trace
demonstrably carrying the skill's fingerprint through prompt, log, and
`skills_used` — with no other part of the run's behaviour changing.
