# Conventions → Skill

Status: implemented
Packages: server, client, shared contracts

## Goal

Every repo has house rules that no agent knows about, such as "async/await, never
`.then()`" or "Redis goes through the `lib/redis.ts` singleton". The Conventions page
works in four steps:

1. Scan the repo.
2. Ask a model for **project-specific** candidate rules, each backed by evidence: a
   verbatim snippet from a cited file.
3. Let the user accept or reject each candidate. Many will be noise.
4. Merge the accepted ones into an editable `convention` skill in Skills Lab.

The result is that a rule goes from "noticed in code" to "enforced in every review"
without anyone writing the prose by hand.

Ported from `upstream/full-functionality` (`specs/03-conventions-extractor.md`), core
scope only.

## Scope

In:
- Redesign the unused `conventions` table, and add `convention_scans` (migrations
  `0011`/`0012`).
- Pick sample files with code only, no model call:
  - config files (`.editorconfig`, eslint, prettier, biome, `tsconfig.json`) that exist
    in the clone;
  - plus `repoIntel.getConventionSamples(repoId, 12)`, which falls back to an evenly
    spread walk of the clone when the repo has no rank yet.
- One structured LLM call (`ConventionExtraction`), using the `conventions` feature
  model from Settings → Feature Models.
- Verify evidence on the server. A candidate is dropped if its file is missing from the
  clone or its snippet isn't found there. Line numbers come from the match, never from
  the model.
- `/repos/:repoId/conventions` page, sidebar entry *Skills Lab → Conventions*, and the
  `g c` shortcut.
- "Create skill" modal, prefilled and fully editable. Saving creates v1 with
  `type: convention`, `source: extracted` and `evidence_files` set.

Out:
- Seeding an API Contract Reviewer agent.
- Importing a skill from a URL.
- Packaging a skill as a plugin.
- Diffing re-scans against earlier decisions: each scan is independent and the page
  shows only the latest one.
- Editing a candidate's evidence.

## Contracts

All in `contracts/knowledge.ts`, with server and client copies kept identical:
- `ConventionStatus` = `pending | accepted | rejected`
- `ConventionCandidate` = `{ id, category, rule, evidence_path, evidence_start_line, evidence_end_line, evidence_snippet, confidence, status }`
- `ConventionScan` = `{ id, repo_id, sample_file_count, source_sha, model, created_at }`
- `ConventionsList` = `{ scan | null, candidates }`
- `SetConventionStatus` = `{ status: ConventionStatus }`. `pending` is the "undo".
- `CreateSkillFromConventionsRequest` = `{ convention_ids (min 1), name, description, enabled = false, body? }`

## Behaviour

### Server: `modules/conventions/`

| Route | Result |
|---|---|
| `POST /repos/:id/conventions/extract` | `ConventionsList`. Returns 422 when the repo isn't cloned or has no source files. |
| `GET /repos/:id/conventions` | The latest scan with its candidates, sorted by confidence, highest first. |
| `PUT /repos/:id/conventions/:conventionId` | The updated candidate, or 404. |
| `POST /repos/:id/conventions/skill` | `Skill` (201). Returns 422 unless every id exists and is `accepted`. |

`createSkill` calls `container.skillsService.create(...)` in process. When the request
has no `body`, the server renders the default with `renderConventionsSkillBody`:

````
# <name>

House conventions for `<repo>`. Flag changes that violate any rule below and cite the offending `file:line`.

## <category>

<rule>

Detected in `<path>:<start>-<end>`:
```
<snippet>
```
````

The client's `renderConventionsSkillBodyPreview` must produce the same text. Both test
suites assert the same expected string.

### Client

**Header**
- Title: "Conventions in `<repo>`".
- Subtitle: "Detected from N sample files · last scan X ago".
- A Re-scan button.

**Toolbar**
- Bulk button: "Accept all" or "Deselect all".
- An "N of M accepted" counter.
- Create skill, disabled until something is accepted.

**Card**
- The rule.
- Evidence link to GitHub, pinned to `scan.source_sha` and the line range.
- The snippet, with a copy button.
- Confidence bar: green at 80% or above, amber below.
- Accept and Reject buttons. Clicking the active one resets the candidate to `pending`.

**Modal**
- Prefills name (`<repo>-conventions`), description, type `convention`, an Enabled
  toggle and the body.
- The body's heading follows the name until the user edits the body.
- On save: a toast, then navigation to `/skills/:id`.

## Acceptance criteria

- [x] A fabricated snippet, or a file that doesn't exist, never reaches the DB or the UI.
- [x] Pending or rejected candidates cannot be merged, even with a hand-crafted request.
- [x] The created skill is v1, `convention` / `extracted`, with `evidence_files` as
      `path:start-end` and the snippet in the body.
- [x] Evidence links open GitHub at the scanned commit and lines.
- [x] Tests:
  - server: `conventions-{evidence,helpers,samples}.test.ts` and `conventions.it.test.ts`;
  - client: card, modal and helper tests.

## Open questions

- The extraction call is synchronous. A slow model holds the request for its whole
  duration, so it may need to become a background job with SSE like review runs.
