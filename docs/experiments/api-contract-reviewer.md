# Experiment — API Contract Reviewer

**The orchestrator/agent prepares the skill files and this document; the user
creates the agent and imports the skill through the UI, opens the PR, and runs
the comparison manually.** Nothing here is applied, pushed, or run by an
agent — this document and the skill files it points at are fixture prep only.

Goal: demonstrate that a specialist agent with no dedicated API-contract
skills misses a silent breaking change in a route's response shape, and that
attaching four API-contract skills makes the same agent, on the same diff,
catch it — with the trace showing exactly which skills fired.

## The agent

Created by the user through the UI (Agents → New agent), not seeded:

| Field | Value |
|---|---|
| Name | **API Contract Reviewer** |
| Description | Reviews route handlers for request/response shape drift against their declared contracts. |
| System prompt | [`../agent-prompts/api-contract-reviewer.md`](../agent-prompts/api-contract-reviewer.md) — paste verbatim into `system_prompt`. |
| Provider / model | pick anything already configured in Settings → API Keys; the experiment doesn't depend on which one. |
| Strategy | `single-pass` (default) — the fixture diff is one file, no need for map-reduce. |
| CI fail-on | `critical` (default) is fine; the point of the experiment is the findings/trace, not the gate. |

## The 4 skills

Three are seeded skill text, one is imported through the UI to also exercise
that path (S6):

| Skill | Source | File |
|---|---|---|
| `breaking-change` | create manually from this file's body (Skills → New) | [`../../server/docs/skills/api-contract/breaking-change.md`](../../server/docs/skills/api-contract/breaking-change.md) |
| `response-schema` | create manually | [`../../server/docs/skills/api-contract/response-schema.md`](../../server/docs/skills/api-contract/response-schema.md) |
| `semver-discipline` | create manually | [`../../server/docs/skills/api-contract/semver-discipline.md`](../../server/docs/skills/api-contract/semver-discipline.md) |
| `deprecation-policy` | **imported as a zip** — see below | [`../../server/docs/skills/api-contract/deprecation-policy.md`](../../server/docs/skills/api-contract/deprecation-policy.md) (canonical copy, same body as the zip) |

To build the importable zip:

```sh
cd server/docs/skills/import-demo/deprecation-policy && zip -r ../deprecation-policy.zip SKILL.md run.sh
```

Import `deprecation-policy.zip` through the Skills UI's Import flow (preview
→ confirm → save — S6, writes nothing until confirmed). The import parser
must read only `SKILL.md` and list `run.sh` under the preview's
`ignored_files`, never execute it (see
[`../../server/docs/skills/import-demo/deprecation-policy/README.md`](../../server/docs/skills/import-demo/deprecation-policy/README.md)).

Attach all four to **API Contract Reviewer** through `/agents/:id` → Skills
(`PUT /agents/:id/skills`) — the same attachment path every other skill uses,
regardless of whether it was seeded or imported.

## The patch

Reuses the existing fixture: [`api-contract-breaking.patch`](./api-contract-breaking.patch)
— changes `GET /settings/secrets-status` in
`server/src/modules/settings/routes.ts` from `{ [provider]: boolean }` to
`{ [provider]: { configured: boolean } }` without updating `SecretsStatus` in
`server/src/vendor/shared/contracts/platform.ts`, and drops the handler's
`Promise<SecretsStatus>` return-type annotation in the same hunk. This is
exactly the pattern all four skills describe: a breaking shape change, no
contract update, no version marker, no deprecation window.

To apply it: `git apply docs/experiments/api-contract-breaking.patch` from
the repo root, then open a PR from the resulting branch against `main` (or
run the review locally against the working tree). Revert with
`git checkout -- server/src/modules/settings/routes.ts` or
`git apply -R docs/experiments/api-contract-breaking.patch` when done.

## Checklist

1. **Create** API Contract Reviewer with no skills attached. **Run** it
   against the patched diff. **Record** the result: verdict, findings — the
   expectation, without the skills, is that it either misses the contract
   drift entirely or reports something vague ("response shape may have
   changed") without citing the missing `SecretsStatus` update.
2. **Attach** the four skills (three seeded, one imported, as above).
3. **Run** again on the same diff.
4. **Compare**:
   - The **findings list** now names the exact handler
     (`server/src/modules/settings/routes.ts`, the `/settings/secrets-status`
     handler) and the contract file that should have moved with it
     (`server/src/vendor/shared/contracts/platform.ts`, `SecretsStatus`) —
     something the off-run did not produce.
   - The run's **trace** shows a Skills block in the prompt (`### Skill:
     <name>` for each of the four) and `trace.prompt_assembly.skills_used`
     listing all four `{id, name, version, tokens}` (`server/specs/skills.md`
     S9).
   - The **verdict** moves to `request_changes` (a CRITICAL breaking-change
     finding), whereas the off-run was `approve` or a low-confidence
     `comment`.

A successful experiment shows the off-run missing or under-specifying the
contract drift, and the on-run's trace demonstrably carrying all four
skills' fingerprint through the prompt, the findings, and `skills_used` —
with the same diff, same model, same agent otherwise unchanged.
