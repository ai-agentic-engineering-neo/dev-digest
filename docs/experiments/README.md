# Experiment: API Contract Reviewer, without skills vs with skills

Goal: show that the **skills** (not the agent prompt) are what make the API Contract Reviewer
catch a breaking change. The agent's own prompt is deliberately lean (role + output rules); the
API rules live in its skills.

## The change under review

[`api-contract-breaking-change.patch`](api-contract-breaking-change.patch) touches one file,
`server/src/modules/skills/routes.ts`, and makes three breaking changes. Nothing in the PR says so:
no version bump and no deprecation.

| Change | Breaks | Skill that should catch it |
| --- | --- | --- |
| `GET /skills/usage` → `GET /skills/link-counts` (route renamed, old one removed) | every caller of `/skills/usage` gets 404 | `breaking-change`, `deprecation-policy` |
| `/skills/link-counts` returns `[{ skillId, agents }]` instead of `{ [skillId]: count }` | response shape and type; camelCase keys | `response-schema` |
| `GET /skills/:id/versions` returns `{ items: [...] }` instead of an array; `created_at` → `createdAt`, `skill_id` dropped | response shape and field rename | `response-schema` |
| No `package.json` / API version bump for a breaking change | a breaking change shipped without a major bump | `semver-discipline` |

## Steps

1. **Create the PR.** From an up-to-date `main`:
   ```powershell
   git checkout -b demo/api-breaking-change
   git apply docs/experiments/api-contract-breaking-change.patch
   git commit -am "refactor(skills): tidy usage + versions endpoints"
   git push -u origin demo/api-breaking-change
   ```
   Open the PR on GitHub, then **Refresh** the repo in DevDigest so the PR shows up.
2. **Run without skills.** Agents → **API Contract Reviewer** → Skills tab → uncheck every skill
   ("0 of N enabled"). Open the PR → run API Contract Reviewer.
   - Expected: no or only vague findings. The lean prompt has no rule that a route rename is breaking.
   - Run trace → Prompt assembly: there is **no** Skills block, and the Live Log has **no**
     `Skills:` line.
3. **Run with skills.** Check `breaking-change`, `response-schema`, `semver-discipline`, and the
   imported `deprecation-policy` (import it first, see `docs/skill-samples/README.md`). Re-run on the
   same PR.
   - Expected: CRITICAL findings on the removed `/skills/usage` route and on the `versions` response
     shape and field rename, with the old and new contract named. Also a WARNING or CRITICAL for
     the missing deprecation and the missing major bump.
   - Run trace → the **Skills** block shows `~N tokens`, with `deprecation-policy` wrapped as
     `<untrusted source="skill:deprecation-policy">`. The Live Log shows
     `Skills: 4 attached — … (~T tokens)`.
4. **Record** both runs (findings + traces) for the write-up. Then close the PR without merging.

The same flow works for the Test Quality Reviewer: see the "Control experiment" section in
[`server/specs/skills.md`](../../server/specs/skills.md).
