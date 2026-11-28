# Homework L02 — Conventions Extractor + API Contract Reviewer

Texts to paste into the DevDigest UI, and the protocol of the "without skills /
with skills" experiment. The feature specs are
[server/specs/M2-conventions.md](../../server/specs/M2-conventions.md) and
[client/specs/M2-conventions.md](../../client/specs/M2-conventions.md).

## Files

| File | What |
|------|------|
| [agent-prompt.md](agent-prompt.md) | System prompt of the **API Contract Reviewer** agent |
| [skills/breaking-change.md](skills/breaking-change.md) | Skill, added via **Import** (frontmatter `name`/`description`/`type`) |
| [skills/response-schema.md](skills/response-schema.md) | Skill |
| [skills/semver-discipline.md](skills/semver-discipline.md) | Skill |
| [skills/deprecation-policy.md](skills/deprecation-policy.md) | Skill |
| [experiment.md](experiment.md) | Results of the experiment |

Each skill file is in the import format the Skills page accepts: a YAML
frontmatter block with `name`, `description` and `type`, then the Markdown body.
For the skills created by hand, copy the frontmatter values into the form and
the body below `---` into **Skill body**.

## Create the agent

1. `./scripts/dev.sh`, open http://localhost:3000.
2. **Agents → Create from scratch**:
   - Name `API Contract Reviewer`
   - Description `Finds breaking API contract changes in a PR: routes, request and response shapes, deprecation and semver.`
   - Provider / model: the same as the Security Reviewer, so the runs compare.
   - System prompt: the body of `agent-prompt.md`.
3. **Skills → Import** `skills/breaking-change.md` → check the preview → save.
   **Skills → New skill** for the other three.
4. Do not link the skills yet.

## Experiment

1. Test PR: branch `experiment/api-contract-break` renames the `deleted` field
   of the `DELETE /repos/:id` response to `removedId` and moves
   `POST /repos/:id/poll` to `POST /repos/:id/sync`, server side only. The
   client still reads `deleted` and calls `/poll`.
2. Open that PR in DevDigest, **Run review → API Contract Reviewer** (no skills).
3. Agent → **Skills** tab: attach the four skills in the order above, enabled.
4. Run the review again on the same PR. In the run trace, **Prompt assembly**
   shows the **Skills (dynamic)** block and its tokens.
5. Fill in [experiment.md](experiment.md).
