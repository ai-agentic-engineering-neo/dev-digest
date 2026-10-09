# Conventions Extractor + API Contract Reviewer

**Status:** specified, not implemented.

## Context

A repo has house conventions no agent knows about — "always async/await",
"routes return `Result<T, ApiError>`", "Redis goes through the singleton in
`lib/redis.ts`". Today the only way to teach an agent one of these is to hand
-write a skill (`specs/02-review-agent-skills.md`) yourself, after noticing
the pattern by eye.

The **Conventions Extractor** scans a repo's config and top-ranked source
files, asks a cheap model to propose candidate rules with real-code evidence,
lets a human accept/reject each one, and turns the accepted set into a
`skills` row via the existing Skills Lab CRUD — so a convention goes from
"noticed in code" to "enforced in every review" without anyone typing prose
by hand.

Alongside it, this spec also covers seeding an **API Contract Reviewer**
agent with four hand-authored skills (`breaking-change`, `response-schema`,
`semver-discipline`, `deprecation-policy`), to demonstrate — with a real
before/after PR review — that the Skills Lab mechanism (spec 02) actually
changes what an agent catches, not just what it's told.

### What already exists

| Layer | Already there | File |
|---|---|---|
| Sampling | `repoIntel.getConventionSamples(repoId, n)` — top-ranked source files, junk-filtered | [repo-intel/service.ts:630](../server/src/modules/repo-intel/service.ts#L630) |
| Schema | `conventions` table (unused anywhere — free to redesign) | [db/schema/knowledge.ts](../server/src/db/schema/knowledge.ts) |
| Contract | `ConventionCandidate` (unused) | [vendor/shared/contracts/knowledge.ts](../server/src/vendor/shared/contracts/knowledge.ts) |
| Model selection | `resolveFeatureModel(container, workspaceId, 'conventions')` — wired into Settings, zero callers | [modules/settings/feature-models.ts](../server/src/modules/settings/feature-models.ts) |
| Reserved column | `skills.evidenceFiles` (jsonb, always `null`) — code comment says "stays null until the Conventions extractor" | [modules/skills/helpers.ts](../server/src/modules/skills/helpers.ts) |
| Mock plumbing | `structuredBySchema` anticipates a `ConventionExtraction` schema name | [adapters/mocks.ts](../server/src/adapters/mocks.ts) |
| Skills Lab | Full CRUD, agent linking (two independent enable gates), prompt injection, GitHub file:line client util | spec 02, fully implemented |

The gap: nothing calls `getConventionSamples`, no config-file sampling
exists (it's actively filtered *out* by the junk-path filter), the
`conventions` table has no reader or writer, and there is no `conventions`
server module, route, or UI.

## Scope

**In:**

1. Redesign the unused `conventions` table: tri-state `status`
   (`pending`/`accepted`/`rejected`) instead of a boolean, evidence line
   range, a `category`, and a `convention_scans` grouping table (sample
   count + source commit sha + model, for "detected from 84 files · last
   scan 1h ago" and for re-scanning).
2. Code-only sample selection: config files (`.eslintrc*`, `.prettierrc*`,
   `tsconfig.json`) read off the clone, plus `getConventionSamples(repoId, 12)`.
   No model call for this step.
3. One structured LLM call (`resolveFeatureModel(..., 'conventions')`) that
   proposes candidates: `{ category, rule, evidence_path, evidence_snippet, confidence }`.
4. Server-side evidence verification: a candidate whose file or snippet
   doesn't actually exist in the clone is dropped before it ever reaches the
   DB or the UI.
5. `conventions` server module: extract, list, accept/reject, and
   "create skill from accepted" routes.
6. `/conventions` client page: candidate cards with confidence, evidence
   linking to the real file:line on GitHub (pinned to the scan's commit
   sha), accept/reject, and a "Create skill" modal that pre-fills from
   accepted candidates and is fully editable before saving.
7. Four API-contract skills + one new seeded agent (**API Contract
   Reviewer**), one skill imported live rather than seeded (exercises the
   import path, mirrors spec 02's `api-contract-guard` pattern).
8. Bonus: skill import from URL (`POST /skills/import-url`), and packaging
   a skill as an installable Claude Code plugin (`plugin.json` +
   `marketplace.json`).

**Out of scope:**

- A file-selection LLM step. The task is explicit that sample selection is
  code, not a model call — the mock's `ConventionFileSelection` schema name
  is intentionally never used.
- Per-finding attribution of which skill caught what (same run-level
  attribution caveat as spec 02's `run_skills`).
- Re-scan diffing/merging against a prior scan's decisions. Each scan is
  independent; the UI shows the latest scan's candidates only. Accepting a
  candidate is permanent regardless of later re-scans.
- Editing a candidate's evidence. A candidate is accepted or rejected as
  extracted; editing happens on the skill body after "Create skill" opens
  the editor modal.

## Approach

### Schema — migration `0012_conventions_extractor.sql`

```sql
CREATE TABLE convention_scans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  repo_id uuid NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
  sample_file_count integer NOT NULL,
  source_sha text NOT NULL,
  model text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE conventions
  ADD COLUMN scan_id uuid REFERENCES convention_scans(id) ON DELETE CASCADE,
  ADD COLUMN category text NOT NULL DEFAULT 'other',
  ADD COLUMN evidence_start_line integer,
  ADD COLUMN evidence_end_line integer,
  DROP COLUMN accepted,
  ADD COLUMN status text NOT NULL DEFAULT 'pending';
```

Safe to redesign in place — `conventions` has no readers or writers in the
tree today. Mirror in `db/schema/knowledge.ts`, then extend
`ConventionCandidate` in `vendor/shared/contracts/knowledge.ts` and
hand-port to `client/src/vendor/shared/`.

### Sampling — `server/src/modules/conventions/samples.ts`

Pure, code-only, no model:

```ts
async function getConventionsSampleSet(container, repo) {
  const configFiles = await Promise.all(
    CONFIG_CANDIDATES.map((f) => readClone(repo.clonePath, f)),
  ); // .eslintrc*, .prettierrc*, tsconfig.json — first hit per pattern wins
  const sourceFiles = await container.repoIntel.getConventionSamples(repo.id, 12);
  const sourceSha = await container.git.currentHead({ owner: repo.owner, name: repo.name });
  return { configFiles, sourceFiles, sourceSha };
}
```

`readClone` is the same 2-line `readFile(join(clonePath, file)).catch(() => null)`
pattern already private to `repo-intel/service.ts` — duplicated locally
rather than exported across a module boundary for one helper.

### Extraction — one `completeStructured` call

`server/src/modules/conventions/prompts.ts` holds the system prompt (a new
pattern — `docs/agent-prompts/` only covers user-editable agent prompts, not
a feature's own; this follows `reviewer-core`'s inline-constant style
instead). The call:

```ts
const { provider, model } = await resolveFeatureModel(container, workspaceId, 'conventions');
const llm = container.llm(provider);
const { data } = await llm.completeStructured({
  model,
  schema: ConventionExtractionOutput, // { candidates: [{ category, rule, evidence_path, evidence_snippet, confidence }] }
  schemaName: 'ConventionExtraction',
  messages: buildConventionsPrompt(configFiles, sourceFiles),
});
```

The model never assigns `id`, `status`, or line numbers — those are
server-computed. Reuses `toJsonSchema`/`parseWithRepair` from
`reviewer-core/src/llm/structured.ts` rather than reimplementing schema
conversion.

### Evidence verification

For each raw candidate: read `evidence_path` from the clone; drop the
candidate if the file is missing. Search the file's lines for
`evidence_snippet` (whitespace-normalized match); drop if not found;
otherwise compute `evidence_start_line`/`evidence_end_line` from the match.
Only verified candidates are inserted, all `status='pending'`. This is what
makes "every candidate has evidence that's real code" true by construction,
not by model honesty.

### Server module

```
server/src/modules/conventions/
  routes.ts       Fastify plugin, Zod schemas, workspace+repo scoped
  service.ts      ConventionsService — extract, list, setStatus, createSkill
  repository.ts   ConventionsRepository — conventions, convention_scans
  samples.ts       code-only sample selection
  prompts.ts       extraction prompt
  schemas.ts       ConventionExtractionOutput (LLM-facing, narrower than the DB DTO)
```

Registered in `modules/index.ts`; `container.conventionsRepo` lazy getter
in `platform/container.ts`, same pattern as `skillsRepo`.

```
POST   /repos/:id/conventions/extract        run sampling → LLM → verify → persist scan+candidates
GET    /repos/:id/conventions                latest scan meta + its candidates
PUT    /repos/:id/conventions/:conventionId  { status: 'accepted' | 'rejected' }
POST   /repos/:id/conventions/skill          { convention_ids, name, description, enabled }
```

`POST .../skill` reads the given `convention_ids`, rejects the request if
any is not `status='accepted'` (server-enforced, not just UI-enforced),
merges `rule` + evidence citation per candidate into one markdown body, and
calls `SkillsService.create` in-process with `type: 'convention'`,
`source: 'extracted'`, `evidence_files: ["path:startLine-endLine", ...]`.

### Client — `/conventions`

Mirrors the Skills page's structure under
`app/conventions/_components/ConventionsView/`: candidate cards (rule,
category badge, evidence file:line + snippet, confidence bar, Accept/
Reject), a "Re-scan" button, an "N of M accepted" header, and a "Create
skill" modal (enabled once ≥1 accepted) that pre-fills name/description/body
from the accepted set and is editable before saving, calling
`POST /repos/:id/conventions/skill`.

Evidence links reuse `githubBlobUrl(repoFullName, sha, file, startLine, endLine)`
(`client/src/lib/github-urls.ts`) with `sha` = the scan's `source_sha` — no
new client util needed.

Route wiring: add a `conventions` entry to `client/src/vendor/ui/nav.ts`'s
`"SKILLS LAB"` section — the existing comment there already anticipates
this ("Conventions / Eval Dashboard join this section once their routes
ship"), and `app-shell/helpers.ts`'s `activeKeyFor` already matches
`/conventions`.

New hooks: `client/src/lib/hooks/conventions.ts` — `useConventions`,
`useExtractConventions`, `useSetConventionStatus`,
`useCreateSkillFromConventions`.

### API Contract Reviewer

Four skills, each with a directive `description` and a good/bad example in
the body (house style — see `SEED_SKILLS` in `db/seed-skills.ts`):
`breaking-change`, `response-schema`, `semver-discipline`,
`deprecation-policy`. Three seeded directly; `deprecation-policy` ships as a
standalone `.md` (frontmatter matching `parseSkillMarkdown`) meant to be
imported live through the existing **Import from file** UI — same reasoning
spec 02 used for `api-contract-guard`: exercise the import path on camera
instead of seeding everything.

New agent **API Contract Reviewer**: thin system prompt ("You review API
contracts in a pull request... cite exact file:line"), three skills linked
+ enabled at seed time; the fourth attached after the live import. A new,
separate agent rather than added to Test Quality Reviewer — a deliberate
choice for this assignment (spec 02 had assumed the opposite for a similar
control experiment).

### Bonus

- **URL import**: `POST /skills/import-url { url }` fetches the URL, reuses
  `parseSkillMarkdown`, returns a `SkillImportPreview` — same parse-only
  contract as file import. Rejects non-http(s) URLs, caps response size at
  `MAX_UPLOAD_BYTES`, timeouts the fetch. Client wires the already-written
  `drawer.tabs.url` copy in `AddSkillMenu`/`ImportSkillDrawer`.
- **Claude Code plugin packaging**: a `plugin.json` (`name`, `version:
  "1.0.0"`, `description`) + `marketplace.json` at the root of a small git
  repo, wrapping a skill's `SKILL.md` as an installable plugin. Packaging
  only — not application code.

## Verification

### Automated

- `cd server && pnpm test`
  - `conventions-samples.test.ts` (pure) — config file reading, missing
    files skipped, `getConventionSamples` called with the right args.
  - `conventions-evidence.test.ts` (pure) — snippet found → correct line
    range; snippet not found → candidate dropped; file missing → candidate
    dropped.
  - `conventions.it.test.ts` (testcontainers) — extract persists a scan +
    `status='pending'` candidates; accept/reject updates status; create-skill
    rejects a non-accepted id; create-skill populates `skills.evidence_files`
    and links nothing extra (agent linking stays the existing flow).
- `cd client && pnpm test` — candidate card states, accept/reject
  transitions, create-skill modal gating on ≥1 accepted, GitHub link built
  from the scan's `source_sha` not `defaultBranch`.
- `pnpm typecheck` both packages, then hand-diff the two `vendor/shared`
  copies — nothing else catches drift between them.

### Manual

1. `cd server && pnpm db:migrate` — not applied on boot.
2. Import/point the app at a real, already-cloned repo (the seeded
   `acme/payments-api` fixture has `clonePath: null` — no files to scan).
3. `/conventions` → Extract → candidates appear with real evidence; click a
   citation → opens the real file:line on GitHub at the scan's commit.
4. Accept some, reject others → Create skill → only accepted candidates are
   in the generated body; edit name/description before saving → skill
   appears in `/skills` with `type: convention`, `source: extracted`,
   non-null `evidence_files`.
5. Link the new skill to an agent via the existing Skills tab; run a
   review; confirm the skill's block appears in the trace.
6. API Contract Reviewer: import the fourth skill live, confirm `4 of 4`
   enabled. Create/find a PR that renames a response field or changes a
   route signature. Run with all four skills unchecked → no finding. Recheck
   all four → run again → the breaking change is flagged, citing file:line.

## Before you finish

Append to `server/LEARNINGS.md` and `client/LEARNINGS.md`: the tri-state
`status` redesign of the previously-unused `conventions` table, the
code-only-sampling decision (no `ConventionFileSelection` LLM call despite
the mock plumbing anticipating one), and pinning evidence links to the
clone's HEAD sha rather than `defaultBranch`.
