# Project Context Folder — Implementation Plan

## Source requirements

[`specs/09-project-context-folder.md`](../specs/09-project-context-folder.md)
(SPEC-09, status **approved**) — feature 1 of the "Project Context" epic (L05).
This plan covers **every** acceptance criterion in that spec:

| Area | AC-IDs |
|---|---|
| Discovery & browsing | AC-1, AC-2, AC-3, AC-4, AC-5, AC-20, AC-22, AC-23, AC-28, AC-29, AC-35, AC-38, AC-39 |
| Token visibility | AC-6, AC-7, AC-38 |
| Attachment | AC-8, AC-9, AC-10, AC-11, AC-12, AC-13, AC-26, AC-37 |
| Run-time injection | AC-14, AC-15, AC-16, AC-17, AC-24, AC-25, AC-27, AC-30, AC-33 |
| Transparency & failure | AC-18, AC-19, AC-21, AC-31, AC-32, AC-34, AC-36 |

Decisions D1–D10 and non-goals N1–N10 are treated as settled; nothing below
reopens them. In particular the page is **view-only** (D2/D7/N2/AC-35), there is
**one** `## Project context` block (D1), and no chunking/indexing/coverage ring
(N3/N4/AC-39).

## Clarifications & recommendations

The spec left seven `[NEEDS CLARIFICATION]` items. Item 3 was explicitly
delegated to planning; the other six are answered below as **planner
recommendations** so the implementer is never blocked. Each is marked with
whether it is a *decision this plan makes* or a *recommendation the product
owner can still overturn cheaply*.

### Q3 — token budget and per-document ceiling (delegated to planning; DECIDED)

New constants in `server/src/modules/project-context/constants.ts`:

| Constant | Value | Why |
|---|---|---|
| `PROJECT_CONTEXT_TOKEN_BUDGET` | `8000` tokens | Absolute, not a share of the model window. There is **no per-model context-window table anywhere in this codebase** — `server/src/platform/price-book.ts` carries prices only (verified: no `context`/`window` key), and `agents.model` is free text (`server/src/db/schema/agents.ts:16`). A share-based budget would need a new lookup table and would silently differ per agent, which contradicts G3's "no two numbers in the product disagree". 8000 tokens ≈ 32 KB of markdown ≈ 3–5 typical spec documents; for scale, the repo-map slot budget is 1500 (`server/src/modules/repo-intel/constants.ts:51`). |
| `MAX_DOC_BYTES` | `256 * 1024` (256 KB) | AC-28's per-document ceiling. Between the skill-body cap (64 KB, `server/src/modules/skills/constants.ts:4`) and the indexer's source-file cap (400 KB, `server/src/modules/repo-intel/constants.ts:43`) — documents are bigger than skills, smaller than generated source. Applied at **discovery** (excluded from the listing entirely, AC-28) and re-checked at **read** time. |
| `MAX_DISCOVERED_DOCS` | `500` | Bounds the listing + the per-document token counting loop (the performance requirement). Documents beyond the cap are excluded and the count is reported in the discovery summary, mirroring `walkClone`'s `stats.bounded` (`server/src/modules/repo-intel/pipeline/walk.ts:66-70`). |

Reduction rule (D6/AC-21) is implemented as **"longest prefix of the resolved
order whose summed tokens ≤ budget"**, which is exactly repeated
drop-the-last-document, and matches AC-21's verify sentence ("a budget that fits
only the first of three… contains document 1 only"). Every dropped document is
recorded (AC-32); all-dropped omits the section (AC-34).

### Q1 + Q2 — default search roots and their scope (RECOMMENDATION)

- **Roots are repository-relative directory paths, not globs.** The written
  requirement's `**/{specs,docs,insights}/**/*.md` needs a glob matcher and makes
  AC-27/AC-28 containment harder to prove; a directory prefix is trivially
  containable and is what the mockup (`.devdigest/specs/`) actually shows.
- **Default:** `['specs', 'docs', '.devdigest/specs']` — the union of both
  design sources minus `insights` (this repo has no `insights/` convention, and
  a fourth root is one config edit away). Documented in `constants.ts` and in
  `server/README.md`'s config notes.
- **Scope: per repo**, stored as a new nullable `repos.doc_roots` jsonb column
  (`NULL` = "use the documented default", so no backfill and no migration data
  step). Rationale: documents are repo-level (D3), agents/skills are
  workspace-level; a workspace-level root list would be wrong the moment a
  second repo is imported. No restriction on who may change it — this product
  has no roles today (`getContext` yields one `workspaceId`/`userId`,
  `server/src/modules/_shared/context.ts`).
- **Editing:** `PUT /repos/:id/context/config { doc_roots: string[] }` plus a
  compact roots control in the Project Context page header. That is the minimum
  that satisfies US-8/AC-29; a Settings section for it would be scope creep.
- Root values are validated as **relative, `..`-free, non-absolute** paths before
  they are stored (AC-27's last bullet: search-root config must not be able to
  select paths outside the checkout).

### Q4 — doc-type label (RECOMMENDATION)

The label is the **last path segment of the matched root**, lowercased
(`specs` → `specs`, `.devdigest/specs` → `specs`, `docs` → `docs`). A document is
attributed to the **first** root in configured order that contains it, so the
label is deterministic even when roots nest. `specs` / `docs` / `insights` keep
the mockup's three colors; any other label renders with the neutral default
color. No new type taxonomy, no per-repo color config.

### Q5 — must the reviewer be *instructed* to cite the document? (RECOMMENDATION)

**No.** Implement AC-25 literally: the document's repository-relative path
travels with its content in the untrusted wrapper (AC-15), so the model *can*
name it. Do **not** add a citation gate for documents — `groundFindings` is a
diff-line gate and is do-not-touch (`reviewer-core/CLAUDE.md:25-30`); a document
citation requirement would be a new, stronger criterion the spec does not state.
If the product owner wants a guaranteed citation, that is a follow-up spec.

### Q6 — is an e2e browser flow expected? (RECOMMENDATION)

**Not in this slice.** `e2e` flows `02`/`04`/`05` assume the DB holds only the
seeded demo repo (`e2e/CLAUDE.md:24-30`), and that seeded repo has no clone on
disk, so a flow could only ever assert the empty state (AC-20). If the owner
wants one anyway, the cheap version is a new `e2e/specs/NN-project-context.flow.json`
that navigates to `/repos/:repoId/context` and waits on the empty-state text —
say so and it gets added; otherwise `e2e` is **not** in this plan's module list.

### Q7 — latency target (RECOMMENDATION)

No numeric target. Bound the work instead (`MAX_DISCOVERED_DOCS`,
`MAX_DOC_BYTES`) and scan on request with **no cache**, so AC-3's refresh is
"call the endpoint again" and N3 stays closed. If the listing turns out slow on a
real repo, the follow-up is an in-process token-count cache keyed by
`(clonePath, relPath, mtimeMs, size)` — noted here so the next session does not
redesign it.

### Additional planner findings (not in the spec — read these before coding)

1. **`wrapUntrusted`'s label is interpolated into an attribute unescaped.**
   `reviewer-core/src/prompt.ts:30-34` escapes `</untrusted>` in the *content*
   but does `source="${label}"` verbatim. Until now every label was a hardcoded
   constant (`'diff'`, `'repo-map'`, …). This feature makes the label a
   **repository-controlled path**, which the spec's "Untrusted inputs" section
   explicitly says must not be able to break out of the wrapper. `wrapUntrusted`
   must sanitize the label (strip `"`, `<`, `>`, newlines) as part of this
   change. This is a genuine, currently-latent hole that only opens when this
   feature lands.
2. **`GitClient.readFile` joins without containment**
   (`server/src/adapters/git/simple-git.ts:129-131`), and so does the
   conventions sample reader (`server/src/modules/conventions/samples.ts:30`).
   This plan does **not** change either (other callers, shared adapter, out of
   scope); it establishes containment inside this feature, exactly as the spec's
   non-functional section demands. *Recommendation for a separate change:* harden
   `SimpleGitClient.readFile` too — flagged, not done here.
3. **`client/messages/en/context.json` already exists and is referenced by
   nothing** (verified by repo-wide grep). It describes the pre-decision design:
   `chunks`, a `mode.edit` toggle, and an `editor.save` action — all three now
   forbidden by AC-39/AC-35. It must be **rewritten**, not extended.
4. **`activeKeyFor` already routes `/context` to the `"context"` nav key**
   (`client/src/components/app-shell/helpers.ts:30`) — one of the four wirings a
   new route needs is already done. The other three (route, `NAV` entry in
   `src/vendor/ui/nav.ts:21-46`, label) are not; see `client/LEARNINGS.md:270-294`.
5. **The CLI path has no repo binding**, so AC-33's "run against a different
   repo → skip" cannot be evaluated there. `POST /reviews/adhoc` takes
   `{agent_id, diff}` only (`mcp-server/src/cli/run.ts:129-133`). **Decision:**
   on the CLI path resolve attachments from **all** pinned repos with no repo
   filter, and print each document's repo in the CLI report. Under D3's
   single-repo-per-workspace model this is byte-identical to the PR path, which
   is what AC-30 actually requires. The alternative (add an optional `repo_id` to
   the adhoc body, derived from `git remote get-url origin`) is noted as future
   work, not built.

## Execution mode

**Recommendation: multi-agent, in two implementation phases.**

This touches four packages, adds a DB migration, changes a shared prompt
contract consumed by every existing prompt test, and edits **both** drifted
`vendor/shared` copies — every trigger this repo has for splitting a pass. A
single `implementer` run would have to hold the server engine, the migration,
the React editors and the CLI renderer in one context.

Proposed order:

1. `/implement-plan` **Phase A — engine + contracts**: `reviewer-core`,
   `server`, both `vendor/shared` copies, migration, `mcp-server` CLI report.
   (This is `implementer` → `plan-verifier` gate → `architecture-reviewer` fix
   loop, which is what that skill runs.)
2. `/implement-plan` **Phase B — client**: Project Context page, agent/skill
   Context tabs, trace drawer, hooks, i18n, nav.
3. `test-writer` once, after B, for the test matrix in **Verification** that the
   two implementer passes did not already produce.
4. `/pr-self-review` immediately before push (it re-runs the full suite anyway).

Phase A must land first: Phase B consumes the widened `RunTrace.specs_read` and
`SkillPreview` contracts.

**User's confirmed choice: pending.** The planner has no interactive channel in
this run; treat the above as the recommendation, not a settled decision. A
single-agent pass is *possible* but is not advised for a change of this width.

## Modules affected

| Module | Why |
|---|---|
| **server** | The whole feature's substance: new `project-context` module (discovery, containment, token counting, attachment persistence, run-time resolution + budget), two new tables + one new column, run-executor and adhoc wiring, trace widening, skill-preview extension, container getter. |
| **reviewer-core** | The `specs` prompt slot — reserved for exactly this lesson (`reviewer-core/CLAUDE.md:17-20`, `:53-54`) — becomes real: per-document label + content, and `wrapUntrusted` label sanitization (finding 1 above). |
| **client** | New `/repos/[repoId]/context` page (view-only), `Context` tab on the agent editor and on the skill editor, run-trace rendering of the documents-read list, hooks, i18n, nav wiring. |
| **mcp-server** | D5/AC-30/AC-31: the pre-push CLI must print what was injected/omitted/dropped, because that path persists no trace. Response-shape + `render.ts` change only — no new tool, no new `fetch()` caller. |
| **e2e** | **Not affected** — see Q6 above. |

## Architectural constraints

Cited, not paraphrased. Read the linked lines before writing the corresponding
code.

### Root

- `CLAUDE.md` "Do-not-touch / edit-with-care" — `server/src/vendor/shared` and
  `client/src/vendor/shared` are **independent copies**; `reviewer-core`'s alias
  points at server's. Every contract change in this plan (`RunTrace.specs_read`,
  `SkillPreview`, the new document contracts) must be applied to **both** copies
  by hand. `pr-self-review` Phase 4 flags a one-sided change as HIGH.
- `CLAUDE.md` "Conventions (non-default)" — migrations are **not** applied on
  boot; `cd server && pnpm db:migrate` after generating.

### server

- `server/CLAUDE.md:12-16` — routes are schema-first: zod `params`/`body` via
  `fastify-type-provider-zod`; handlers never `Schema.parse(req.body)`.
- `server/CLAUDE.md:17-18` — a new module must be added to
  `src/modules/index.ts` (one import + one entry) or it is dead code.
- `server/CLAUDE.md:19-21` — adapters sit behind `platform/container.ts` DI;
  tests swap `src/adapters/mocks.ts`, never module-level mocks.
- `server/CLAUDE.md:29-31` — never hand-edit an applied migration.
- `server/CLAUDE.md:41-43` — prompt-injection defense is the one shared
  `INJECTION_GUARD`; **do not** add per-document scanning or denylists.
- `server/CLAUDE.md:47-50` — `*.it.test.ts` = DB-backed (testcontainers,
  self-skipping); everything else hermetic.
- `server/LEARNINGS.md:161-245` — `no-cross-module` fires on **any** file in a
  module folder, including `import type`. A new module needing another module's
  repo/service declares a **narrow local interface** and is wired at
  `routes.ts`; cross-cutting instances get a `platform/container.ts` getter.
  The 2026-08-11 addendum specifically: for a brand-new file needing a few
  fields of a DB row, a fully local interface beats both a `db/rows.ts` alias
  and a new baseline entry.
- `server/LEARNINGS.md:64-82` — `drizzle-kit generate` hangs on a non-TTY when a
  schema pass both drops and adds. This plan only **adds** (two tables, one
  column), so one pass is unambiguous; still run `pnpm db:generate < /dev/null`.
- `server/LEARNINGS.md:543-557` — `.dependency-cruiser-known-violations.json`
  baselines exact from→to **edges**. If `pnpm arch` fails on a new edge, run
  `pnpm arch:baseline` and `git diff` it to confirm exactly one new entry.
- `server/LEARNINGS.md:320-333` — `.nullable()` on a shared contract makes the
  key **required**; every fixture building that type stops compiling. Directly
  relevant to widening `RunTrace.specs_read`.
- `server/LEARNINGS.md:559-575` — tests build partial `as unknown as Container`
  mocks; any new `container.<x>` read in shared executor code must tolerate a
  mock that lacks it (optional-chain, or update the mocks).
- `server/LEARNINGS.md:38-54` — grep for the likely table/contract name before
  assuming new schema is needed; this repo lays groundwork lessons ahead.
  (Done: `specs_read`, the `specs` prompt slot and `messages/en/context.json`
  are exactly such groundwork; `code_chunks.source = 'spec'`
  (`server/src/db/schema/context.ts:44`) is **not** — it belongs to the deferred
  chunking feature, N3, and must stay untouched.)
- `server/src/platform/container.ts:122-125` (`skillsService`) and `:187-190`
  (`tokenizer`) — the shape a new `projectContextService` getter must copy.

### reviewer-core

- `reviewer-core/CLAUDE.md:12-14` — **pure engine: no DB, GitHub, or filesystem
  access.** All document *reading* happens in the server; `reviewer-core`
  receives already-resolved `{path, content}` pairs. This is the single most
  important constraint in the plan.
- `reviewer-core/CLAUDE.md:15-20` — the package emits no JS; optional prompt
  slots must keep working when omitted (`specs` is named as the L05 slot).
- `reviewer-core/CLAUDE.md:25-30` — `groundFindings` and `INJECTION_GUARD` are
  do-not-touch. Sanitizing `wrapUntrusted`'s *label* is not a change to the
  guard's text or premise; keep the guard string byte-identical.
- `reviewer-core/CLAUDE.md:34-37` — `@devdigest/shared` here resolves to
  **server's** vendor copy; a contract edit here does not reach the client.
- `reviewer-core/LEARNINGS.md` is empty — nothing to inherit, and a substantive
  entry is expected at the end of this work.

### client

- `client/CLAUDE.md:13-15` — all data access goes through
  `src/lib/hooks/*` → `src/lib/api.ts`; never `fetch` in a component.
- `client/CLAUDE.md:16-17` — pages stay thin; feature logic lives in colocated
  `_components/<Name>/` folders each with its own `*.test.tsx`.
- `client/CLAUDE.md:18-19` — new UI strings need a `messages/en/*.json` entry.
- `client/CLAUDE.md:22-27` — `src/vendor/shared` and `src/vendor/ui` are owned
  copies, already drifted from server's.
- `client/LEARNINGS.md:148-168` — `TraceBody.tsx` does **not** render
  `PromptAssembly` generically: each field needs three additions (the JSX block,
  a `PROMPT_COLORS` entry, an i18n key). Do not trust "it renders generically".
- `client/LEARNINGS.md:270-294` — a new route needs **four** wirings; the
  `NAV` array in `src/vendor/ui/nav.ts` is the one nothing errors on if skipped.
  (Here, the `activeKeyFor` piece already exists — finding 4.)
- `client/LEARNINGS.md:296-307` — repo-scoped routes follow
  `repos/[repoId]/pulls`: `useParams`, `useActiveRepo`, `useRepoNotFound` gate.
  Do **not** copy `pulls/page.tsx` as a route template
  (`client/LEARNINGS.md:81-104`).
- `client/LEARNINGS.md:309-330` — a mutation hook that writes `setQueryData` in
  `onSuccess` needs `qc.cancelQueries` in `onMutate`.
- `client/LEARNINGS.md:224-256` — importing a **runtime value** from the bare
  `@devdigest/shared` barrel breaks the webpack build with a misleading error;
  import from the narrow `@devdigest/shared/contracts/<module>` path. Also: a
  passing `typecheck` + `vitest` is **not** evidence a new route boots.
- `client/LEARNINGS.md:207-222` — compute the `../` depth to `messages/en/*.json`
  in a test file, don't count by eye.

### mcp-server

- `mcp-server/CLAUDE.md:14-19` — **no `@devdigest/shared` alias**; every contract
  is redefined locally as a minimal subset interface. The new project-context
  fields get a local `RawProjectContextDoc`, next to `RawAdhocReviewResponse`
  (`mcp-server/src/cli/run.ts:39-52`).
- `mcp-server/CLAUDE.md:20-23` — `src/http/client.ts` is the only module allowed
  to call `fetch()`. This change adds no new call site.
- `mcp-server/CLAUDE.md:24-31` — tool descriptions and registration order must
  stay byte-identical; **this change must not touch `src/tools/` at all**.
- `mcp-server/CLAUDE.md:36-47` — the CLI is a second, independent entry point;
  `render.ts` is pure string-in/string-out with no I/O and no exit-code
  knowledge (`mcp-server/src/cli/render.ts:1-8`). Keep it that way.

## Approach

### 1. reviewer-core — the `## Project context` slot becomes real

`reviewer-core/src/prompt.ts`

- Change `PromptParts.specs?: string[]` (`:47`) to
  `specs?: { path: string; content: string }[]`. Safe: **zero producers exist
  today** (grep confirms the only mentions are the type, the renderer at
  `:117-120`, and `run-executor.ts`'s `specs: null` trace field).
- Render as `parts.specs.map(d => wrapUntrusted(d.path, d.content)).join('\n\n')`,
  still under `## Project context` at `:161`, still omitted when the array is
  empty (AC-16, AC-34). `PromptAssembly.specs` stays a single rendered string
  (`:180`) so the trace's expandable prompt-assembly row (AC-18) needs no new
  field.
- Harden `wrapUntrusted` (`:30-34`): sanitize `label` — drop `"`, `<`, `>`, CR/LF
  — before interpolating (finding 1). Content escaping is unchanged.
- `reviewer-core/src/review/run.ts:60` and `:149` — widen the pass-through type
  only; no logic change.
- **Do not** add fs, path, or budget logic here (`reviewer-core/CLAUDE.md:12-14`);
  budgeting and reading are the server's job.

New/extended tests: `reviewer-core/test/prompt.test.ts` — one document renders
with its path as the wrapper label; two render in order; zero produces a prompt
**byte-identical** to the pre-change baseline (AC-16); a label containing `"`
and `>` cannot escape the wrapper; a document body containing `</untrusted>` is
still neutralized.

### 2. server — new `project-context` module

New folder `server/src/modules/project-context/`:

| File | Contents |
|---|---|
| `constants.ts` | `DEFAULT_DOC_ROOTS`, `PROJECT_CONTEXT_TOKEN_BUDGET`, `MAX_DOC_BYTES`, `MAX_DISCOVERED_DOCS`, doc-type label derivation. |
| `paths.ts` | **Pure** containment + validation: reject absolute paths, `..` segments and root patterns that escape; `resolve(cloneRoot, rel)` must equal `cloneRoot` or start with `cloneRoot + sep`; then `realpath` both and re-check (catches symlinks). Unit-testable with a tmpdir, no DB. Serves AC-27/AC-28 and the spec's "Security — path containment". |
| `discovery.ts` | Walk the configured roots of a clone for `.md` files. Model it on `server/src/modules/repo-intel/pipeline/walk.ts` — skip symlinked entries (`walk.ts:85-90`), skip unreadable dirs, `stat`-gate on `MAX_DOC_BYTES`, stable alphabetical order, bound at `MAX_DISCOVERED_DOCS` with a `bounded` stat. Regular files only (AC-28). |
| `render.ts` | The **one** renderer for the resolved document set → the `{path, content}[]` handed to `assemblePrompt`, plus the human-facing block used by the skill preview (AC-13/D1). Same "one renderer, never a second copy" discipline as `server/src/modules/_shared/skill-render.ts:1-15`. Place it in `src/modules/_shared/project-context-render.ts` if the skills module needs it directly — `_shared` is the module-composition escape hatch that file documents. |
| `repository.ts` | CRUD over the two new tables + the "used by N agents" aggregate (AC-22). |
| `service.ts` | `listDocuments`, `getDocument`, `setDocRoots`, agent/skill attach-detach-reorder, and `resolveForRun` (merge → dedupe → budget → read). Declares its ports (`AgentSkillLookup`, `RepoLookup`, `Tokenizer`) locally per `server/LEARNINGS.md:161-245`; **no `Container` import** (`no-container-in-services`). |
| `routes.ts` | The HTTP surface below; wired in `src/modules/index.ts`. |

**Schema** (`server/src/db/schema/context.ts`, alongside the existing tables —
do **not** touch `code_chunks`):

```
agent_context_docs(agent_id → agents.id cascade, repo_id → repos.id cascade,
                   path text, order int default 0, attached bool default true,
                   PK(agent_id, repo_id, path), index(repo_id, path))
skill_context_docs(skill_id → skills.id cascade, repo_id, path, order, attached,
                   PK(skill_id, repo_id, path), index(repo_id, path))
```

The `order` + `attached` pair is deliberately the **same shape as
`agent_skills`** (`server/src/db/schema/agents.ts:51-68`): detaching keeps the
row so `order` survives an off/on cycle — that is precisely AC-10, and the
comment there explains why deleting the row is wrong. Only `(repo_id, path)` is
stored, never content (AC-8).

Plus `repos.doc_roots jsonb null` (`server/src/db/schema/repos.ts`), `NULL` =
default roots (Q1/Q2).

Migration: `pnpm db:generate < /dev/null` then `pnpm db:migrate`. Additive only —
no drop, so no rename ambiguity (`server/LEARNINGS.md:64-82`).

**Routes** (all workspace-scoped through `getContext`; all zod-schema'd per
`server/CLAUDE.md:12-16`; agent/skill/repo ownership verified against
`workspaceId` before any write, so an attachment can never point at another
workspace's repo):

```
GET  /repos/:id/context/documents      → { roots, documents[], summary{count, tokens, bounded} }   AC-1,2,6,20,22,28,38,39
GET  /repos/:id/context/documents/one?path=…  → { path, content }  (read-only preview)             AC-4,5,27,35
PUT  /repos/:id/context/config         → { doc_roots }                                             AC-2,29
GET  /agents/:id/documents             → attachments + status(present|missing) + tokens            AC-7,26
POST /agents/:id/documents             → set/reorder the whole ordered set                         AC-9,37
PUT  /agents/:id/documents             → attach/detach ONE ({repo_id, path, attached}) keeping order AC-8,10
GET|POST|PUT /skills/:id/documents     → the same three, for a skill                               AC-11,12,13
```

`documents` (not `context-docs`) keeps the paths readable and cannot collide
with the agents module's own `/agents/:id/skills` routes — two plugins
registering different paths under the same prefix is fine.

**Run-time resolution** (`service.resolveForRun`), the heart of the feature:

1. Agent-direct attachments (`attached = true`, `order` asc).
2. Then, for each **enabled** skill in link order — reuse
   `AgentsRepository.enabledSkills` (`server/src/modules/agents/repository.ts:230-249`),
   which already ANDs `skills.enabled` **and** `agent_skills.enabled`; that is
   AC-12 for free, with no second gating implementation.
3. Dedupe by `(repo_id, path)`, keeping the **earliest** position (AC-11).
4. Drop documents pinned to a different repo than the run's, recording
   `repo_mismatch` (AC-33) — **skipped on the CLI path**, see finding 5.
5. Read each remaining document: containment check → `stat` (regular file,
   ≤ `MAX_DOC_BYTES`) → read. Failures are recorded and skipped, never thrown:
   `missing` (AC-36), `unreadable` / `not_a_file` / `no_checkout` (AC-19),
   `refused_containment` (AC-27) — distinct reasons, as AC-36 requires.
6. Token-count each with **`container.tokenizer`** — the same
   `TiktokenTokenizer` the skill editor and `run_skills` use
   (`server/src/adapters/tokenizer/index.ts:16-40`,
   `server/src/modules/skills/service.ts:218-226`,
   `server/src/modules/reviews/run-executor.ts:349-360`). AC-6's "never a
   separate estimate" is satisfied by injecting the same port, not by copying the
   formula.
7. Apply the budget: longest prefix that fits; the rest recorded as
   `budget_drop` (AC-21, AC-32); empty result ⇒ omit the slot entirely (AC-34).
8. Return `{ documents: {path, content, tokens, origin}[], skipped: {...}[] }`.

Zero LLM calls anywhere on this path (AC-17, G6).

**Wiring:**

- `platform/container.ts` — new lazy `projectContextService` getter, same shape
  as `skillsService` (`:122-125`).
- `modules/reviews/run-executor.ts` — resolve right after the skills load
  (`:264-277`), pass `...(docs.length > 0 ? { specs: docs } : {})` into
  `reviewPullRequest` (`:283-318`) preserving the omit-when-empty idiom used by
  every other slot there, and write the resolved + skipped list into the trace's
  `specs_read` (`:429`). Log one Live Log line ("Project context: N document(s),
  M token(s); K omitted") through `runLog`, matching how repo-map/callers report
  (`:521`). `traceFromBuffer` (`:558-590`) keeps `specs_read: []`.
- `modules/reviews/adhoc.ts` — one new injected port
  (`ProjectContextResolver`, declared locally exactly like `AgentLookup`/
  `SkillLookup` at `:39-53`), composed in `modules/reviews/routes.ts:61`; the
  resolved documents go into the same `reviewPullRequest` call (`:129-137`) and
  the skipped/dropped list is returned in the response for the CLI (AC-30,
  AC-31). No DB writes here — the adhoc path stays non-persisting.
- `modules/reviews/helpers.ts:104-113` — update the `specs` row's `source` label
  from `project_specs` to `project_context.documents`; still metadata-only.
- `modules/skills/service.ts:195-200` (`preview`) — extend `SkillPreview` with
  the skill's rendered project-context block + tokens, produced by the **same**
  renderer the run uses (AC-13/D1, the "a preview must not lie" rule stated in
  `_shared/skill-render.ts:8-10`). Its constructor gains one narrow local port;
  `container.skillsService` (`:122-125`) wires it.

**Contracts** — edit **both** `server/src/vendor/shared` and
`client/src/vendor/shared`:

- `contracts/trace.ts:94` — `specs_read: z.array(z.string())` becomes
  `z.array(SpecRead)` with
  `{ path, tokens, origin: 'agent'|'skill', skill: nullish, status: 'included'|'omitted'|'dropped'|'refused', reason: nullish }`.
  Old persisted traces hold `[]`, and `getRunTrace` casts rather than parses
  (`server/src/modules/reviews/repository/run.repo.ts:213-216`), so no
  migration or back-compat shim is needed — but every `RunTrace` fixture in
  both packages must still compile (`server/LEARNINGS.md:320-333`).
- `contracts/knowledge.ts:172-176` — `SkillPreview` gains the project-context
  block.
- New `ProjectDocument` / `AttachedDocument` / `DocumentList` contracts for the
  routes above.

### 3. client

| Path | Change |
|---|---|
| `src/app/repos/[repoId]/context/page.tsx` | Thin route returning `<ProjectContextView />` — `AgentsListView`-shaped, **not** `pulls/page.tsx`-shaped (`client/LEARNINGS.md:81-104`). |
| `…/context/_components/ProjectContextView/` | `"use client"`; `useParams` + `useActiveRepo` + `useRepoNotFound` gate (`client/LEARNINGS.md:296-307`). Document list (path, doc-type chip, tokens, "used by N agents"), a **Preview-only** pane (AC-4/AC-35 — no edit toggle, no upload, no create, no delete anywhere in the tree), refresh button (AC-3), roots control (AC-29), discovery summary "N documents · ~X tokens" (AC-38), empty state naming the searched roots (AC-20). No chunk count, no coverage ring (AC-39). |
| `src/app/agents/[id]/_components/AgentEditor/_components/ContextTab/` | Copy `SkillsTab`'s proven shape (checkbox = attach/detach via `PUT`, drag = ordered `POST`, filter box, count computed over the **visible** rows). Adds: running token total (AC-7), `missing` badge (AC-26), and a keyboard-operable reorder control that announces each document's **position** (the spec's accessibility clause — order is drop priority). Register the tab in `AgentEditor/constants.ts:11-14`. |
| `src/app/skills/…/SkillEditor/_components/ContextTab/` | Same tab for skills; the Preview tab renders the server's `## Project context` block verbatim (AC-13). Register in that editor's `constants.ts:11-17`. |
| `…/RunTraceDrawer/_components/TraceBody/TraceBody.tsx:39-50` | `specs_read` entries are now objects: path · tokens · direct/inherited · status+reason (AC-18, AC-32, AC-36). The existing `prompt_assembly.specs` block at `:85-87` already covers the assembled-block row. Remember the three-additions rule (`client/LEARNINGS.md:148-168`) and that an **empty** list must still render (the spec's "traces persisted before this feature" edge case). |
| `src/lib/hooks/project-context.ts` | `useRepoDocuments`, `useDocument`, `useSetDocRoots`, `useAgentDocuments`, `useSetAgentDocuments`, `useSetAgentDocumentAttached`, and the skill equivalents. Every `setQueryData` mutation needs `qc.cancelQueries` in `onMutate` (`client/LEARNINGS.md:309-330`). Import runtime values from `@devdigest/shared/contracts/<module>`, never the barrel (`client/LEARNINGS.md:224-256`). |
| `src/vendor/ui/nav.ts` | Add `{ key: "context", label: "Project Context", icon: …, href: "/repos/:repoId/context", gKey: "x" }` to the WORKSPACE or SKILLS LAB group (`:21-46`) **and** a matching `SHORTCUTS` row (`:68-78`). `activeKeyFor` already handles it (finding 4). |
| `messages/en/context.json` | **Rewrite** (finding 3): drop `chunks`, `mode.edit`, `editor.*`; add listing, summary, roots, used-by, empty-state and missing-state strings. New trace strings go in `messages/en/runs.json`; new tab labels in `agents.json` / `skills.json`. |

### 4. mcp-server

- `src/cli/run.ts:39-52` — add `project_context?: { injected: RawProjectContextDoc[]; skipped: RawProjectContextDoc[] }` to the local `RawAdhocReviewResponse` interface (locally declared, no shared alias —
  `mcp-server/CLAUDE.md:14-19`), and thread it into `renderReview` (`:139-148`).
- `src/cli/render.ts` — a "Project context" section listing each injected
  document (path · tokens · direct|via skill *name*) and each skipped one with
  its reason (AC-31). Update the trailing note at `:96` — it currently claims the
  pre-push pass has no project context, which this feature makes false. Keep the
  module pure (`:1-8`).
- **No change under `src/tools/`** — `mcp-server/CLAUDE.md:24-31`.
- Tests extend `mcp-server/test/cli/render.test.ts` and `run.test.ts` against the
  hand-written fake `fetchImpl`, per this package's DI rule.

### Explicitly not built

Auto-selection (N1), any write path to the checkout or GitHub (N2/AC-5 — the
unwired `commitFiles`/`openPullRequest` at
`server/src/adapters/github/octokit.ts:235-320` stays unwired), chunking or
embeddings (N3 — `code_chunks` untouched), the coverage ring (N4), non-markdown
sources (N5), per-run overrides (N6), cross-repo attachments (N7), PR-branch
reads (N8), truncation (N9), attachment versioning (N10 — nothing is written to
`agent_versions`).

## Skills for implementer

Derived from `.claude/skills/pr-self-review/SKILL.md` Phase 3 (lines 129-141) and
the catalog in `.claude/skills/README.md:9-23`. Load per file group, not all at
once; respect each skill's declared scope.

| Path glob in this plan | Skills to load | Why |
|---|---|---|
| `server/src/modules/project-context/**`, `server/src/modules/reviews/**`, `server/src/modules/skills/service.ts`, `server/src/platform/container.ts` | `onion-architecture`, `fastify-best-practices` | Phase 3 row for `server/src/modules/**`, `platform/**`. The ring rules and the local-port/DI pattern are the difference between this module passing `pnpm arch` and eating baseline entries. |
| `server/src/db/schema/context.ts`, `server/src/db/schema/repos.ts`, `server/src/db/migrations/**` | `drizzle-orm-patterns`, `postgresql-table-design` | Phase 3 row for `server/src/db/**`. Two new tables, composite PKs, cascade FKs, one lookup index. |
| `server/src/vendor/shared/contracts/**`, `client/src/vendor/shared/contracts/**`, every zod route schema in `project-context/routes.ts` | `zod` | Phase 3 row for `**/contracts/**`. Also the `.nullable()` vs `.nullish()` trap (`server/LEARNINGS.md:320-333`). |
| `reviewer-core/src/prompt.ts`, `reviewer-core/src/review/run.ts` | `typescript-expert` **only** | Phase 3 line 137 excludes `onion-architecture` from `reviewer-core`. |
| `client/src/app/**` (the page, both Context tabs, TraceBody) | `frontend-ui-architecture`, `next-best-practices`, `react-best-practices` | Phase 3 row for `client/src/app/**`. `frontend-ui-architecture`'s README also lists this repo's known route-shape deviations. |
| `client/src/lib/hooks/**` | `frontend-ui-architecture`, `react-best-practices` | Phase 3 row for `client/src/lib/**`. |
| `client/**/*.test.tsx` | `react-testing-library` | Phase 3 row. |
| `server/src/modules/project-context/paths.ts`, `discovery.ts`, `routes.ts`, and any file handling a user-supplied path | `security` | Phase 3's "any `.ts`/`.tsx`" row, and the sharpest need in this feature: user-supplied path → filesystem read (AC-27), plus the untrusted-label escape (finding 1). |
| `mcp-server/src/cli/**` | **Routing gap — no row exists.** | Phase 3's table (lines 129-138) has no `mcp-server/**` entry; the only row that reaches it is "any `.ts`/`.tsx` → `security`". Planner judgment: load `security` plus `typescript-expert`, and treat `mcp-server/CLAUDE.md`'s own convention list (the `fetch()`, no-shared-alias, byte-identical-tool-description, `render.ts`-is-pure rules) as the governing document. Do not substitute `onion-architecture` — its declared scope is `server/src` only. |

Phase 3's "cap at 4" is a *review-pass* budget; for implementation, load the row
matching the files you are currently editing.

Root `CLAUDE.md` "Before you finish": append an `engineering-insights` entry to
each touched module's `LEARNINGS.md`. At minimum `reviewer-core/LEARNINGS.md`
(currently empty — the `specs` slot activation and the label-escaping hole belong
there) and `server/LEARNINGS.md` (the containment helper, and whatever the
migration/`pnpm arch` pass actually cost).

## Verification

Scoped commands, per module. `pr-self-review` re-runs the full suites before
push regardless.

### reviewer-core

```
cd reviewer-core && pnpm typecheck && pnpm test
```
The suite is small and entirely hermetic (`reviewer-core/CLAUDE.md:43-46`), and
this change touches its central file — run it whole, not scoped.
**Pass:** all green, including a new assertion that a zero-document prompt is
byte-identical to the pre-change baseline (AC-16).

### server

```
cd server && pnpm typecheck
cd server && pnpm db:generate < /dev/null && pnpm db:migrate
cd server && pnpm exec vitest run \
  test/project-context-paths.test.ts \
  test/project-context-discovery.test.ts \
  test/project-context-resolve.test.ts \
  test/project-context.it.test.ts \
  test/prompt-project-context.test.ts \
  test/skills-preview.test.ts \
  test/reviews-helpers.test.ts \
  test/contracts.test.ts
cd server && pnpm test          # full suite — justified below
cd server && pnpm arch
```

The **full** server suite is named deliberately: `RunTrace.specs_read` is a
shared contract and `assemblePrompt`'s signature changed, so every existing
prompt/trace test is a potential regression (`server/LEARNINGS.md:320-333`), and
partial `as unknown as Container` mocks may not carry the new container getter
(`server/LEARNINGS.md:559-575`). `pnpm arch` must report **zero new** violations;
if it fails, `pnpm arch:baseline` + `git diff` the baseline file and confirm
exactly the expected edges (`server/LEARNINGS.md:543-557`).

Test matrix the scoped files must cover:

| Test | ACs |
|---|---|
| Containment: `../`, absolute path, symlink out of the checkout → refused, no read | AC-27 |
| Discovery: only `.md` regular files under the configured roots; oversize excluded; changed roots ⇒ different listing | AC-1, AC-2, AC-28, AC-29 |
| Token parity: a document and a skill body of identical text report identical counts | AC-6 |
| Merge/dedupe: agent-direct first, then enabled-skill docs; duplicate emitted once at earliest position | AC-11 |
| Skill gating: workspace-off or agent-off ⇒ document absent | AC-12 |
| Budget: 3 docs, budget fits 1 ⇒ block holds doc 1 whole; all-dropped ⇒ section omitted; drops recorded | AC-21, AC-32, AC-34 |
| Failure paths: deleted / unreadable / no-checkout / wrong-repo ⇒ run completes, each recorded with its own reason | AC-19, AC-33, AC-36 |
| Zero attached ⇒ prompt byte-identical, `specs_read: []`, no section in the trace | AC-16 |
| Stubbed provider: same number of provider calls with and without documents | AC-17 |
| Injection fixture ("ignore all security findings") reaches the prompt wrapped, guard intact | AC-24 |
| Attach/detach/re-attach without reorder restores position; reorder persists | AC-9, AC-10, AC-37 |
| "Used by N agents" counts direct attachments only | AC-22 |
| Paths with spaces / non-ASCII / `#` round-trip unchanged | edge case |

`*.it.test.ts` for anything DB-backed (attachment persistence, used-by count);
everything else hermetic against a tmpdir fixture checkout
(`server/CLAUDE.md:47-50`).

### client

```
cd client && pnpm typecheck
cd client && pnpm exec vitest run \
  "src/app/repos/[repoId]/context/**" \
  "src/app/agents/[id]/_components/AgentEditor/_components/ContextTab/**" \
  "src/app/skills/**/ContextTab/**" \
  "src/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer/**"
cd client && pnpm build     # or `pnpm dev` + curl /repos/<id>/context
```

The build/boot step is **not optional**: typecheck + vitest do not prove a new
route boots, and this change adds new `@devdigest/shared` consumers — the exact
trap in `client/LEARNINGS.md:224-256`. **Pass:** the route renders, the page
offers no control that could modify a document (AC-35), and the page contains no
"chunks"/coverage string (AC-39).

### mcp-server

```
cd mcp-server && pnpm typecheck
cd mcp-server && pnpm exec vitest run test/cli/render.test.ts test/cli/run.test.ts
```
**Pass:** the report names one injected and one missing document, the missing one
marked with its reason (AC-31), and the trailing note no longer claims the
pre-push pass lacks project context.

### Cross-cutting

- `git diff --stat server/src/vendor/shared client/src/vendor/shared` — both
  copies changed, with matching contract edits (root `CLAUDE.md`;
  `pr-self-review` Phase 4 rates a one-sided change HIGH).
- `git status --porcelain server/src/db/migrations` — exactly one new migration
  file, no edit to an existing one (`server/CLAUDE.md:29-31`).
- Manual acceptance beyond an automated run (US-7/AC-25): attach a document
  stating "`api/` must not import `db/` directly", review a PR that violates it,
  and confirm the finding names the document. That needs a real model call and is
  a human step after this plan lands.
