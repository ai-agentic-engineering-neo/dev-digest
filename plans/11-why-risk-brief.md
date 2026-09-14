# PR Why + Risk Brief — Implementation Plan

## Source requirements

[`specs/11-why-risk-brief.md`](../specs/11-why-risk-brief.md) (SPEC-11, status
**approved**, no open `[NEEDS CLARIFICATION]`) — feature 3 of the "Project
Context" epic (L05), after `plans/09-project-context-folder.md` and
`plans/10-onboarding-generator.md`. This plan covers **every** acceptance
criterion in that spec:

| Area | AC-IDs |
|---|---|
| Deterministic input assembly | AC-1 … AC-9 |
| The one structured call | AC-10, AC-11, AC-12, AC-13, AC-14, AC-15 |
| Grounding | AC-16 … AC-22 |
| Caching, regeneration, freshness | AC-23 … AC-30 |
| Degraded, empty, failure states | AC-31 … AC-35 |
| Client surface | AC-36 … AC-44 |

Decisions D1–D15, non-goals N1–N11 and the six post-draft clarifications are
**settled**; nothing below reopens them. In particular, and load-bearing
throughout:

- No new `FeatureModelId` — `risk_brief` is already in both
  `vendor/shared/contracts/platform.ts` copies with a `FEATURE_MODELS` entry
  (`server/src/vendor/shared/contracts/platform.ts:17`, `:61-66`;
  `client/…:17`, `:61-66`; default `openai`/`gpt-4.1`). AC-12 is
  `container.resolveFeatureModel(workspaceId, 'risk_brief')` and nothing more.
- `PrBrief` and the `pr_brief` table are **redesigned in place** (D6/D8), not
  duplicated and not left as dead code.
- State key = **PR head SHA only** (D9). Index state and intent resolution
  time are recorded for staleness display, never part of the cache key.
- Grounding is a deterministic post-pass modelled on `groundTour`
  (`server/src/modules/onboarding/grounding.ts`), never `groundFindings`
  (D10/D14).
- "Relevant spec" = the spec parsed out of the PR title/body via
  `parseSpecRef` (`server/src/modules/_shared/linked-issue.ts:28-30`), **not**
  SPEC-09 attachments (D11).
- Input budget **8,000 tokens** (D12), counted with `container.tokenizer`.
- 2-hop-only blast impacts must reach the fact set (D15) — resolved in Q1.
- Generation is explicit-action only (D13/N5), including post-review-run
  (clarification 4).
- Risk `kind` vocabulary is normative (clarification 6).
- No e2e flow (clarification 5 / N8), no MCP tool (N7), no Why Timeline (N1).

## Clarifications & recommendations

Everything here is either a decision the spec explicitly delegated to
planning, or a **planner recommendation** — marked as such. Each is cheap to
overturn; none blocks the implementer.

### Q1 — D15: how the 2-hop-only impacts reach the fact set (DECIDED — no contract change)

**The brief's fact assembly calls the blast computation directly through a
narrow local `RepoIntelPort`, and consumes `BlastResult` — not the shared
`BlastRadius` contract, and not `blast/service.ts`.** The shared
`BlastRadius`/`DownstreamImpact` contract is **not** widened.

Why this is the right half of D15's fork, verified on disk:

- `repo-intel/service.ts:397-415` (`tryPersistentBlast`) already computes
  `factFiles = [...callerFiles, ...reverseImpact]` and derives both
  `impactedEndpoints` (a **flat union**) and `factsByFile` (keyed by every
  impacted file, including 2-hop-only ones) from it. The
  2026-08-06 fix recorded at `server/LEARNINGS.md:273-292` is exactly what
  made this true. So `BlastResult` **already carries** the impacts D15 is
  about.
- The loss happens one ring up, in `blast/service.ts:69-102`'s `toBlastRadius`
  mapper, which regroups facts per changed-symbol caller group — a file
  reached only by the reverse-import walk belongs to no group and is dropped.
  That is the "nowhere to sit" `server/LEARNINGS.md:294-309` describes.
- Therefore: reading `BlastResult` directly loses nothing, needs no schema
  change in two drifted `vendor/shared` copies, and keeps **N11** ("no change
  to how blast radius is computed, cached or displayed") literally true. The
  Blast Radius card renders byte-identically after this change.

`repo-intel/types.ts:88-101` is the shape being consumed
(`changedSymbols`, `callers`, `impactedEndpoints`, `factsByFile`, `degraded`,
`reason`). Crons come from the union of every `factsByFile[*].crons`, which is
the only place they exist. Per `server/LEARNINGS.md:236-250`, do **not** import
`repo-intel/types.ts` — declare the shapes locally in `brief/ports.ts`
(structurally satisfied by `RepoIntelService`), the way
`onboarding/ports.ts:15-53` already does. That adds **zero** new
`pnpm arch` baseline entries.

### Q2 — where diff stats and hunk ranges come from (DECIDED)

From the **persisted `pr_files` rows** (`server/src/db/schema/pulls.ts:44-54`:
`path`, `additions`, `deletions`, `patch`), read by the brief module's own
`repository.ts`. Hunk ranges come from a local pure scan of `patch` for
`@@ -a,b +c,d @@` headers only — **the header line, never a line of hunk body**
(AC-2 by construction).

Two deliberate choices:

- **Do not call `container.git.diff` or GitHub.** The spec's Non-functional
  "Performance" clause forbids re-fetching the diff from the host or
  reparsing the repository; `pr_files` is already persisted for every imported
  PR.
- **Do not route through `parseUnifiedDiff`** (`adapters/git/diff-parser.ts`).
  `server/LEARNINGS.md:112-129` records that it silently drops binary files,
  pure renames and deletions from `files[]` (the `files.filter(f => f.path)`
  at `diff-parser.ts:78`). For this feature the **changed-file set must be the
  `pr_files` rows**, not the parser's output — otherwise a PR that renames or
  deletes files would have review-focus entries for those files dropped by
  AC-19 for a reason that has nothing to do with grounding. The header scan is
  a five-line regex over each row's `patch`; a row whose `patch` is null or
  header-less contributes zero hunk ranges and still counts as a changed file.

**Consequence to expect in dev, not a bug:** the seeded `acme/payments-api`
PR #482 has `patch: null` on every `pr_files` row
(`server/LEARNINGS.md:148-163`). Against that PR every citation will correctly
degrade to file-only under AC-20, and the review-focus links will land on the
file card rather than a line. Do not "fix" this.

### Q3 — the token budget's scope (DECIDED — differs from SPEC-10's precedent)

**8,000 tokens applies to the full assembled model input** — system prompt +
`INJECTION_GUARD` + user payload, i.e. `messages.map(m => m.content).join()`
— not to the fact payload alone. AC-9 says "the assembled model input for one
generation", and D12 says "applied to the assembled model input".

This is a deliberate divergence from `plans/10`, whose
`ONBOARDING_FACTS_TOKEN_BUDGET = 6000` bounded only the facts payload
(`onboarding/prompts.ts:92-121`). The drop loop is otherwise the same shape:
render → count with `container.tokenizer` → if over, apply the next whole-item
drop step → re-render. Never truncate mid-item (AC-8). Not lowered below
8,000; D12 permits lowering with a documented reason and forbids raising.

### Q4 — `Risk.kind`'s type in the shared contract (RECOMMENDATION — read this one)

D5 constrains `kind` to a closed vocabulary "without changing its type";
clarification 6, which postdates it, makes that vocabulary **normative** and
says the client's icon/colour mapping is *total* over exactly this set plus
`other`.

**Recommendation — split the two schemas:**

| Schema | `kind` type | Why |
|---|---|---|
| `brief/schemas.ts` — the raw LLM-facing response schema | `z.string()` | AC-15 is explicit that an unrecognised kind must be **normalised**, never a reason to drop the risk. An enum here would make an invented kind a *schema-validation failure*, burning repair attempts (AC-11) or failing the whole generation (AC-33) over one bad word. |
| `vendor/shared/contracts/brief.ts` — the stored/rendered `Risk` | `RiskKind` enum | Normalisation already happened in grounding, so everything persisted is in the set. Making it an enum is **free** (the contract has zero consumers today) and makes AC-37's total client mapping type-enforced on both sides — the same call `plans/10` made for `OnboardingSection.kind`. |

This satisfies D5's actual intent (a bad kind never costs you a risk) and
clarification 6's normativity at the same time. If the product owner prefers
D5's letter, keeping `z.string()` in the shared contract is a one-line change
and the client mapping falls back to `other` at runtime instead of by type.

### Q5 — enforcing AC-14's bounds deterministically (RECOMMENDATION)

D10 established that an output property the spec asserts gets **enforced**,
not prompted for. AC-14's bounds are such a property. **Recommendation:**
enforce all four deterministically in `grounding.ts`, after the citation
rules: `risks.slice(0, 6)`, `review_focus.slice(0, 5)`, and a sentence clamp
keeping the first 2 sentences of `what` and of `why`. The prompt still asks
for the bounds (cheaper output), but the guarantee is code. Ordering matters:
**slice after dropping**, so a risk dropped by AC-17 frees a slot rather than
silently shortening the list.

### Q6 — `risk_level` after grounding (DECIDED BY SPEC — do not add a check)

Clarification 2 is explicit: `risk_level` is **not** forced to be ≥ the highest
surviving risk severity, and grounding may drop a risk without the level being
recomputed. Do not add a post-check. Recorded here because it is the kind of
"obvious" consistency rule an implementer or reviewer will reach for.

### Q7 — AC-39's in-app target (CONFIRMED with the coordinator — build it)

Build the in-app half, with the repository-host link as the documented
fallback. See Approach §7. `FileCard` already has an unused
`scrollTarget: { line, nonce } | null` prop with anchor ids
`diffline-{path}-{line}` (`client/src/components/diff-viewer/FileCard/FileCard.tsx:37`,
`:49`, `:61-69`) — `grep -rn "scrollTarget" client/src` returns **only** that
file. Nothing threads it. This plan wires it from `PrDetailView`, mirroring
the existing `findingTarget` pattern (`PrDetailView.tsx:84-93`).

Read `client/LEARNINGS.md:86-132` before touching this. Its closing line says
"revisit extraction only if a FOURTH case needs the exact `{ id }`+nonce shape
one of these three already has". This **is** the fourth case, and it needs
`FileCard`'s `{ path, line }`+nonce shape. **Recommendation: still do not
extract a shared hook.** We are not adding a fourth copy — we are supplying an
existing, already-written, currently-dead prop from a new owner. The only new
state is one `focusTarget` on `PrDetailView`, which is the same file and the
same shape as the `findingTarget` it already owns.

### Q8 — the brief section's placement (CONFIRMED with the coordinator)

**One full-width `<section>` above the Intent/Blast two-column grid**, with the
Description block staying last. Matches the mockup's top placement (which
`client/LEARNINGS.md:466-482` says overrides spec prose on placement
questions) and the spec's "first thirty seconds" framing. D1 stands: this
section gets its own label and **no label is added to the verdict/score
block**.

### Q9 — `messages/en/brief.json` is a dead placeholder describing the OLD contract (RECOMMENDATION)

`client/messages/en/brief.json` exists and is referenced by nothing —
`grep -rn "brief" client/src` finds no `useTranslations("brief")`; namespaces
are auto-loaded by filename in `client/src/i18n/request.ts:16-24`, so an
unused file loads silently. Its keys (`block.intent`, `block.blast`,
`block.risks`, `block.history`, `noHistory`, `overlap`) describe precisely the
composed four-part `PrBrief` that **D6 deletes**.

**Recommendation:** rewrite the composition keys; **leave the `why.*`
sub-object untouched** — it is a differently-scoped reserved block for a
git-blame/"git-why" feature (`why.blame`, `why.noCommits`) and has nothing to
do with this spec's *why* field. Namespace this feature's strings under new
top-level keys (`section.*`, `status.*`, `risk.*`, `focus.*`, `provenance.*`)
so the collision with the reserved `why` block can't happen. Same situation
`plans/10` hit with `onboarding.json`; same resolution.

### Additional planner findings (not in the spec — read before coding)

1. **`reviewer-core` needs no change at all.** `plans/10` had to export
   `INJECTION_GUARD`; that already shipped.
   `server/src/platform/prompt.ts` re-exports both `INJECTION_GUARD` and
   `wrapUntrusted`, and `onboarding/prompts.ts:2` imports them from there.
   D14 therefore holds with **zero** exceptions — `git diff reviewer-core/`
   must be empty at the end of this pass.
2. **`pr_brief` is a two-column, never-written table.**
   `server/src/db/schema/reviews.ts:57-62` — `pr_id` PK → `pull_requests`
   cascade, `json` jsonb. Repo-wide grep finds it only in `db/schema.ts:32,69`
   (the barrel): zero readers, zero writers, zero routes. Redesign-in-place is
   free (`server/LEARNINGS.md:38-54`), but re-confirm with
   `select count(*) from pr_brief;` **before** adding `NOT NULL` columns
   without defaults.
3. **`Intent` in `contracts/brief.ts` IS consumed** — by
   `vendor/shared/contracts/review-api.ts:3` (`import { Intent, SmartDiff }
   from './brief.js'`), in **both** copies. D7 already says leave it; this is
   the concrete reason. `PrBrief` itself is re-exported by
   `client/src/lib/types.ts:35` and consumed by nothing — that re-export line
   is the only client-side compile surface the redesign touches.
4. **The in-flight guard (AC-27) is testable, but not with `Promise.all`.**
   `server/LEARNINGS.md:84-109` documents this exact failure, discovered
   building SPEC-10's identical guard: the mutual-exclusion *guarantee* holds,
   but which of two concurrent calls reaches the guard first is not
   deterministic once the guarded method does real I/O first. Follow that
   entry's recipe verbatim — start call A, make the stubbed
   `completeStructured` slow via `setTimeout`, await ~10 ms, then start call B
   and assert it observes the in-flight state. The guard's position also
   matters: `OnboardingService.generate` (`onboarding/service.ts:128-150`)
   puts `has`+`add` **after** the workspace-scope and refusal checks, with a
   `finally` delete. Copy that ordering and that comment's reasoning.
5. **`readClone` does no containment check.**
   `server/src/modules/intent/clone.ts:7-9` is a bare
   `readFile(join(clonePath, file))`. `parseSpecRef`'s regex
   (`/\bspecs\/\d+-[\w-]+\.md\b/`, `_shared/linked-issue.ts:25`) cannot
   produce `..` or an absolute path, so intent is safe by construction — but
   this feature should still read the spec through
   `resolveContainedPath` (`server/src/modules/_shared/checkout-paths.ts:93`),
   matching SPEC-09/SPEC-10's precedent and `server/LEARNINGS.md:342-...`. It
   costs one call and removes the dependency on a regex staying narrow.
6. **`Markdown.tsx` constrains no link or image target.**
   `client/src/vendor/ui/primitives/Markdown.tsx` sets no `urlTransform` and
   overrides no `img` — its `a` override passes `href` straight through.
   `client/LEARNINGS.md:224-243` records this. AC-21 is therefore **not**
   closed by validating structured fields alone; it is enforced **server-side**
   in grounding, exactly as `onboarding/grounding.ts:202-227`'s
   `neutralizeBody` does. Do not add a plugin to the shared primitive.
   `Markdown.tsx` also has no `rehype-raw`, so AC-40's raw-HTML half is
   already satisfied — reuse the primitive as-is.
7. **`risk_brief` is already surfaced in the client's Settings model** —
   `client/src/lib/feature-models.ts:31`. No Settings work is needed for
   AC-12 on either side.

## Execution mode

**Planner recommendation: single-agent implementation pass.**

Reasoning, not assent: this is materially narrower than SPEC-10. There is **no
`repo-intel` pipeline change**, so none of the AC-11-class regression surface
that forced `plans/10` into three phases; **no `mcp-server` tool** (N7); **no
`reviewer-core` edit** (finding 1); **no e2e flow** (clarification 5). What
remains is one new server module, two mirrored `contracts/brief.ts` edits, one
add-only migration on a zero-row table, and one client card tree plus a small
prop-threading job — a single dependency chain (contracts → server → client)
that one implementer can hold in context.

**User's confirmed choice: single-agent**, run as:

1. `/implement-plan` — `implementer` → `plan-verifier` gate →
   `architecture-reviewer` fix loop. The coordinator explicitly elected to let
   the architecture-review loop cover the shared `diff-viewer` widening of Q7,
   rather than pre-splitting a client phase.
2. `test-writer` once, after, for any row of the **Verification** test matrix
   the implementation pass did not produce.
3. `/pr-self-review` immediately before push (it re-runs the full suites).

## Modules affected

| Module | Why |
|---|---|
| **server** | The whole feature's substance: a new `modules/brief/` (facts, prompt, one structured call, grounding, render, service, repository, routes, ports, constants), the `pr_brief` table redesign + one add-only migration, a lazy `container.briefService` getter, and one entry in `src/modules/index.ts`. |
| **client** | The new `PrBriefCard/` tree under the PR-detail `_components/`, a new `src/lib/hooks/brief.ts`, the `OverviewTab` section, the `PrDetailView` → `DiffTab` → `DiffViewer`/`SmartDiffViewer` → `FileCard` focus-target threading (Q7), and the `messages/en/brief.json` rewrite (Q9). |
| **both `vendor/shared`** | `contracts/brief.ts`, hand-edited in **both** unsynced copies (root `CLAUDE.md` "Do-not-touch"). |
| **reviewer-core** | **Not affected.** D14 + finding 1. `git diff reviewer-core/` must be empty. |
| **mcp-server** | **Not affected** — N7. |
| **e2e** | **Not affected** — N8 / clarification 5. |

## Architectural constraints

Cited, not paraphrased. Read the linked lines before writing the corresponding
code.

### Root

- `CLAUDE.md` "Do-not-touch / edit-with-care" — `server/src/vendor/shared` and
  `client/src/vendor/shared` are **independent, already-drifted copies**. The
  `contracts/brief.ts` change must be applied to **both** by hand;
  `pr-self-review` Phase 4 rates a one-sided change HIGH. (They are
  byte-identical today at 127 lines each — verify before and after.)
- `CLAUDE.md` "Conventions (non-default)" — migrations are **not** applied on
  boot: `cd server && pnpm db:migrate` after generating.
- `CLAUDE.md` "Gotchas" — `docker compose down -v` wipes every imported repo
  and review; don't destroy the dev data this feature reads from.

### server

- `server/CLAUDE.md:12-14` — routes are schema-first: zod `params`/`body` via
  `fastify-type-provider-zod`; handlers never hand-roll `Schema.parse`. The
  POST's `{ regenerate }` body needs a zod body schema, not a manual read.
- `server/CLAUDE.md:15-16` — a new module must be added to
  `src/modules/index.ts` (one import + one entry) or it is dead code.
- `server/CLAUDE.md:17-18` — adapters sit behind `platform/container.ts` DI;
  tests swap `src/adapters/mocks.ts`, never module-level mocks.
- `server/CLAUDE.md:31-32` — never hand-edit an applied migration.
- `server/CLAUDE.md:41-43` — prompt-injection defense is the one shared
  `INJECTION_GUARD`; **do not** add per-field keyword scanning (the spec's
  Non-functional "Security — untrusted input" says the same, verbatim).
- `server/CLAUDE.md:47-50` — `*.it.test.ts` = DB-backed (testcontainers,
  self-skipping); everything else hermetic.
- `.dependency-cruiser.cjs:64-73` — `no-cross-module` (error) forbids
  `modules/brief/**` importing `modules/repo-intel/**`, `modules/reviews/**`,
  `modules/pulls/**` or `modules/intent/**`, **including `import type`**
  (`tsPreCompilationDeps: true`); `_shared` is the only exempt folder.
  `:42-49` `no-container-in-services` forbids `service.ts` importing
  `platform/container.ts`. `:51-62` `db-only-in-repositories` confines
  `src/db/**` imports to `repository.ts` (and `routes.ts`). Importing
  `adapters/**` from a module is fine — `modules/reviews/adhoc.ts:4` already
  does.
- `server/LEARNINGS.md:187-...` + the 2026-08-11 addendum at `:252-271` — a new
  module needing another module's repo/service declares a **narrow local
  port**, composed at `routes.ts`; for a brand-new file needing a few fields,
  a fully local interface beats a `db/rows.ts` alias and beats a new baseline
  entry.
- `server/LEARNINGS.md:236-250` — a spec saying "X is the cross-module-safe
  facade, import it directly" does **not** exempt the edge from
  `no-cross-module`. This plan expects **zero** new baseline entries; if
  `pnpm arch` fails, the local-port rule was broken.
- `server/LEARNINGS.md:645-660` — the baseline matches exact from→to **edges**;
  `pnpm arch:baseline` + `git diff` it if it ever fires.
- `server/LEARNINGS.md:38-54` — grep for the table/contract name and confirm
  "never written to" before redesigning in place. (Done — finding 2.)
- `server/LEARNINGS.md:64-82` — `drizzle-kit generate` hangs on a non-TTY when
  a pass both drops and adds. This pass only **adds** columns; still run
  `pnpm db:generate < /dev/null`.
- `server/LEARNINGS.md:422-436` — `.nullable()` on a shared contract makes the
  key **required** and breaks every fixture that builds the type. Use optional
  (`?:`) / `.nullish()` deliberately, and decide per field.
- `server/LEARNINGS.md:84-109` — the in-flight-guard test recipe (finding 4).
- `server/LEARNINGS.md:112-129` — `parseUnifiedDiff` drops binary/rename/delete
  files (Q2).
- `server/LEARNINGS.md:148-163` — seeded PR #482 has `patch: null` (Q2).
- `server/LEARNINGS.md:273-309` — the 2-hop impact question this feature is
  answering (Q1).
- `server/LEARNINGS.md:471-494` — evidence verification, not model honesty, is
  what makes "every claim cites something real" true. That is the stance
  grounding implements.
- `server/LEARNINGS.md:661-696` — tests build partial `as unknown as Container`
  mocks; a new `container.<x>` read in shared code must tolerate a mock that
  lacks it.
- `server/src/modules/repo-intel/types.ts:1-23` — the facade is "the SINGLE
  interface every feature codes against"; its degraded contract is fixed
  (object-returning methods carry inline `degraded?`/`reason`; array-returning
  ones return `[]`). `BlastResult` (`:88-101`) obeys the object form.
- `server/src/modules/onboarding/service.ts:31-43`, `:89-151`, `:267-273` —
  the immediate precedent for this service: singleton, narrow ports, no
  `Container` import, workspace-scope check first, guard second, read-time
  staleness never stored.
- `server/src/modules/onboarding/grounding.ts:1-56`, `:202-227` — the
  `groundTour` precedent D10 names: pure, feature-local, drop-don't-rewrite,
  plus the body-text link neutralisation.
- `server/src/modules/onboarding/prompts.ts:92-121`, `:206-214` — the
  budget/drop loop and the `INJECTION_GUARD` + `wrapUntrusted` message build.
- `server/src/platform/container.ts:179-192` (`onboardingService`) — the shape
  the lazy `briefService` getter copies, including the
  `(model, tokensIn, tokensOut) => this.priceBook.estimate(...)` cost port.

### client

- `client/CLAUDE.md:13-15` — all data access goes through `src/lib/hooks/*` →
  `src/lib/api.ts`; never `fetch` in a component.
- `client/CLAUDE.md:16-17` — pages stay thin; feature logic lives in colocated
  `_components/<Name>/` folders, each with its own `*.test.tsx`.
- `client/CLAUDE.md:18-19` — new UI strings need a `messages/en/*.json` entry,
  not inline literals.
- `client/CLAUDE.md:22-28` — `src/vendor/shared` and `src/vendor/ui` are owned,
  drifted copies with no resync mechanism.
- `client/LEARNINGS.md:86-132` — the `diff-viewer` public-surface widening and
  the three existing target+nonce copies; read before Q7's threading, and note
  the "fourth case" caveat this plan answers.
- `client/LEARNINGS.md:224-243` — `Markdown.tsx` constrains no link/image
  target (finding 6).
- `client/LEARNINGS.md:296-341` — importing a **runtime value** from the bare
  `@devdigest/shared` barrel breaks the webpack build with a misleading error;
  import from `@devdigest/shared/contracts/brief`. Also: passing `typecheck` +
  `vitest` is **not** evidence the page renders.
- `client/LEARNINGS.md:381-403` — a mutation hook writing `setQueryData` in
  `onSuccess` needs `qc.cancelQueries` in `onMutate`.
- `client/LEARNINGS.md:466-482` — a design mockup overrides spec prose on
  placement (Q8).
- `client/LEARNINGS.md:483-501` — `PrDetailView`'s own `maxWidth: 1080` caps
  the PR-detail tabs; a "full-width" section is full-width **within that**.
- `client/LEARNINGS.md:502-525` — a second hook can read a slice of an
  already-fetched query with a matching `queryKey` + `select`, at zero extra
  requests. Relevant if the card wants `pr.head_sha` without a second fetch.
- `client/LEARNINGS.md:279-295` — count the `../` depth to
  `messages/en/*.json` in a test file; measure, don't guess.
- `client/src/lib/hooks/onboarding.ts` — the immediate hook precedent:
  conditional `refetchInterval` only while `status === 'generating'`,
  `cancelQueries` in `onMutate`, `setQueryData` in `onSuccess`.
- `client/src/app/repos/[repoId]/pulls/[number]/_components/BlastRadiusCard/BlastRadiusCard.tsx:104-121`
  — the `MonoLink` + `githubBlobUrl(repoFullName, headSha, file, line, line)`
  citation pattern this card mirrors for its fallback links.
- `client/src/lib/github-urls.ts:20-36` — `githubBlobUrl` already
  percent-encodes each path segment, which is what the spec's "path with
  markdown-significant or non-ASCII characters" edge case needs. No new URL
  helper.

## Approach

### 1. Shared contract — `contracts/brief.ts`, redesigned in place (D6/D7), in BOTH copies

`server/src/vendor/shared/contracts/brief.ts` and
`client/src/vendor/shared/contracts/brief.ts` are byte-identical today (127
lines each). Apply the same edit to both.

**Untouched (D7):** `Intent` (`:9-14` — consumed by `review-api.ts:3`),
`ChangedSymbol`/`BlastCaller`/`DownstreamImpact`/`BlastRadius` (`:17-49` — live
contracts, and Q1 means this feature never touches them), `PrHistoryItem`/
`PrHistory` (`:70-83` — N1/N10), the whole `SmartDiff` family (`:86-118`).

**Changed / added:**

| Symbol | Change |
|---|---|
| `RiskSeverity` (`:52-53`) | unchanged — `risk_level` reuses this value set (D4). |
| `RiskKind` | **new** enum: `auth_surface`, `dependency`, `performance`, `data_migration`, `api_contract`, `config_secrets`, `test_coverage`, `other` (clarification 6, normative). |
| `Risk` (`:55-62`) | field list unchanged (D4, verbatim reuse): `kind`, `title`, `explanation`, `severity`, `file_refs`. `kind: z.string()` → `RiskKind` (Q4 — planner recommendation). `file_refs: z.array(z.string())` stays; its **encoding is documented in the doc comment** as `"<path>"` or `"<path>:<line>"`, always server-constructed. |
| `Risks` (`:64-67`) | unchanged (unused, harmless). |
| `ReviewFocusItem` | **new**: `{ file: z.string(), line: z.number().int().nullable(), reason: z.string() }`. Structured, not a `path:line` string, because this is the field AC-39's click navigation reads — see §7. |
| `PrBrief` (`:121-127`) | **replaced**: `{ what, why, risk_level: RiskSeverity, risks: Risk[], review_focus: ReviewFocusItem[] }`. `intent`/`blast`/`history` leave the composition (D6 — they have their own live read surfaces and their own freshness; a frozen copy inside the brief would silently disagree with the cards beside it). |
| `BriefStatus` | **new** enum, exactly AC-41's seven: `none`, `generating`, `generated`, `earlier_state`, `possibly_stale`, `refused`, `failed`. Clarification 3 means "head SHA moved, never generated for the new state" and "generated then state moved" both map to `earlier_state` — one state, one marker. |
| `BriefProvenance` | **new** (AC-29, AC-43): `head_sha`, `generated_at`, `model`, `provider`, `attempts`, `tokens_in`, `tokens_out`, `cost_usd`, `index_sha`, `index_status`, `index_reason`, `intent_resolved_at`, `dropped_inputs`. |
| `BriefPage` | **new** response envelope: `{ status, reason, brief, provenance, current_head_sha, stale_markers }`. `stale_markers` is a `string[]` naming what moved (AC-25 "naming that state", AC-30 "naming what moved"). |
| `BriefGenerateResult` | **new**: `BriefPage` + `dropped` (what grounding removed, so the client can be honest — the `plans/10` precedent). |

`client/src/lib/types.ts:35` re-exports `PrBrief`; leave that line, it just
follows the new shape.

### 2. Schema + migration — `pr_brief`, redesigned in place (D8)

`server/src/db/schema/reviews.ts:57-62`, currently two columns. Redesign
to one row per pull request:

```
pr_brief(
  pr_id             uuid PK → pull_requests.id cascade   -- existing
  json              jsonb  NOT NULL                      -- existing: the grounded PrBrief
  generated_at      timestamptz NOT NULL default now()
  head_sha          text    NOT NULL          -- D9: THE state key
  index_sha         text                      -- AC-29/AC-30 marker; nullable (AC-32: an absent index still generates)
  index_status      text
  indexer_version   integer
  intent_resolved_at timestamptz              -- AC-29/AC-30 marker; nullable (AC-35: intent may be absent)
  provider          text
  model             text    NOT NULL          -- AC-29/AC-43
  attempts          integer NOT NULL default 1
  tokens_in         integer NOT NULL default 0
  tokens_out        integer NOT NULL default 0
  cost_usd          double precision
  dropped_inputs    integer NOT NULL default 0 -- AC-8
)
```

- **Add-only** migration — no drop, so no rename ambiguity
  (`server/LEARNINGS.md:64-82`). `pnpm db:generate < /dev/null`, then
  `pnpm db:migrate`.
- `NOT NULL` without a default on `head_sha`/`model` is safe **only** because
  the table has never been written; confirm `select count(*) from pr_brief;`
  returns `0` first (finding 2).
- A row exists **only** for a successful generation (AC-28: a failure writes
  nothing). `ON DELETE cascade` from `pull_requests` is already there and is
  the "no orphan brief may outlive the PR" edge case.
- No `workspace_id` column: every path resolves the PR through the workspace
  first (AC-44).
- Staleness is **computed at read time, never stored** — the
  `onboarding/service.ts:267-273` posture.

### 3. server — the new `modules/brief/` module

New folder, registered in `src/modules/index.ts` (one import + one entry).
Every file mirrors an existing precedent, named per file:

| File | Contents |
|---|---|
| `constants.ts` | `BRIEF_INPUT_TOKEN_BUDGET = 8000` (D12/Q3), `BRIEF_MAX_OUTPUT_TOKENS` (≈1500 — the output is two short paragraphs, ≤6 risks, ≤5 focus entries), `MAX_RISKS = 6`, `MAX_FOCUS = 5`, `MAX_SENTENCES = 2` (AC-14), `RISK_KINDS` (clarification 6, re-exported for normalisation), `MAX_SPEC_BYTES` / `MAX_ISSUE_BODY_CHARS`, and the fact-pool caps (`FACT_FILES_MAX`, `FACT_CALLERS_MAX`, `FACT_ENDPOINTS_MAX`, `FACT_SYMBOLS_MAX`). Each value carries its rationale in a comment, `onboarding/constants.ts`-style. |
| `ports.ts` | Narrow local interfaces, **no import from any other module**: `RepoIntelPort` (`getBlastRadius(repoId, changedFiles) → BlastResultLike`, `getIndexState(repoId) → IndexStateLike` — shapes copied from `repo-intel/types.ts:88-101` and `:42-66`, not imported — Q1), `FeatureModelResolver` (`(workspaceId, id: 'risk_brief')`), `LlmResolver`, `GithubResolver`, `CloneReader`, `Tokenizer`, `CostEstimator`, `BriefLogger`. Copy `onboarding/ports.ts`'s header comment and structure. |
| `repository.ts` | The **only** file importing `src/db/**`. `getPull(workspaceId, prId)` (workspace-scoped, returns id/repoId/number/title/body/headSha/base + the five `intent_*` columns + `intentResolvedAt` from `db/schema/pulls.ts:5-42`), `getRepo(repoId)` (owner/name/fullName/clonePath), `getPrFiles(prId)` (path/additions/deletions/patch), `getBrief(prId)`, `upsertBrief(row)` — the `onboarding/repository.ts:74-97` `onConflictDoUpdate` shape. |
| `hunks.ts` | Pure. `hunkRangesFor(patch: string | null) → Array<{ start: number; end: number }>` — scans `^@@ -\d+(,\d+)? \+(\d+)(,(\d+))? @@` headers only, `end = start + lines - 1`, `lines` defaulting to 1. **Never reads a hunk body line** (AC-2 by construction). Q2's rationale in the file header. |
| `facts.ts` | AC-1..AC-7. Assembles `BriefFactSet` from the ports; **zero LLM calls by construction** (nothing here touches `LlmResolver`). Also derives the grounding reference sets — see §5. |
| `schemas.ts` | The raw LLM-facing zod schema (§4). |
| `prompts.ts` | System prompt + payload renderer + the budget/drop loop (§4). |
| `grounding.ts` | Pure `groundBrief(raw, facts) → { brief, dropped }` (§5). |
| `service.ts` | `getPage(workspaceId, prId)` and `generate(workspaceId, prId, regenerate)`. Owns the in-flight guard and the staleness comparison. **No `Container` import.** |
| `routes.ts` | Two routes, composed from `container.briefService`. |

**`container.briefService`** — a lazy getter in `platform/container.ts`,
`onboardingService`'s shape (`:179-192`). It **must** be a process-wide
singleton or AC-27's guard is meaningless; `routes.ts` reads the getter and
never constructs the service per request.

**Routes** (zod `params` via `IdParams` from `_shared/schemas.ts`, and a zod
`body` for the POST — `server/CLAUDE.md:12-14`). Both go through
`getContext(container, req)` (`_shared/context.ts:14-22`) and then
`repository.getPull(workspaceId, prId)` **first**, which is the whole of AC-44:
another workspace's PR 404s before any `pr_brief` row is read.

```
GET  /pulls/:id/brief            → BriefPage            (0 LLM calls: AC-23)
POST /pulls/:id/brief/generate   → BriefGenerateResult  body: { regenerate?: boolean = false }
```

One POST, not two routes — the spec's Flow diagram says
`generate (regenerate: yes/no)` (AC-26: "Regenerate" is the same action).

**`service.generate` sequence:**

1. `getPull(workspaceId, prId)` → 404 if absent (AC-44, before anything else).
2. `getPrFiles(prId)`; **empty → refuse** with a stated reason, zero provider
   calls (AC-31). Note this uses the `pr_files` rows, not a parsed diff (Q2).
3. **Cache check (AC-24):** stored brief exists AND `stored.head_sha ===
   pull.headSha` AND `!regenerate` → return the stored brief, **no LLM call**.
   `regenerate === true` skips this branch entirely (AC-26).
4. **In-flight guard (AC-27):** `private inFlight = new Set<string>()`; `has`
   + `add` in one synchronous statement pair with **no `await` between them**.
   It sits **after** steps 1–3 so an unauthorised or file-less caller can
   never observe or occupy another workspace's slot — do not hoist it. A
   second call returns `{ status: 'generating' }` immediately; it does not
   queue and does not await the first. `finally` deletes the key on every exit
   path. `getPage` consults the same set so a second viewer sees `generating`
   too. Copy `onboarding/service.ts:128-151` including its comment.
5. Assemble the fact set (§4) — no LLM (AC-1).
6. `resolveFeatureModel(workspaceId, 'risk_brief')` → `llm(provider)` →
   **exactly one** `completeStructured({ model, schema, schemaName, messages,
   maxTokens })`. Provider-side repair reprompts arrive as `result.attempts`
   with summed `tokensIn`/`tokensOut` — that is AC-11, already implemented by
   the adapters; this module only records it.
7. Ground (§5) → render → persist (§2). On any throw from step 6, or a
   validation failure after permitted attempts: **write nothing**, return
   `status: 'failed'` with the previously stored brief still returned and
   still displayed (AC-28, AC-33).
8. One structured log line — model, attempts, tokens, cost, dropped counts.
   **Counts and identifiers only** — never issue bodies, spec content or brief
   prose (the spec's "Privacy of logs").

**`service.getPage`** — zero LLM calls, always (AC-23). Reads the stored brief
and classifies:

| Condition | `status` |
|---|---|
| no stored row, generation in flight | `generating` |
| no stored row | `none` |
| `stored.head_sha !== pull.head_sha` | `earlier_state` (+ `stale_markers` naming the stored SHA — AC-25, clarification 3) |
| same head SHA, but `index_sha`/`indexer_version`/`intent_resolved_at` moved | `possibly_stale` (+ `stale_markers` naming which — AC-30) |
| otherwise | `generated` |

Nothing regenerates automatically, in any branch (D13/N5, clarification 4).

### 4. The fact set, the payload, and the one call

**`BriefFactSet`** (AC-1 … AC-9), all reads over already-persisted or
already-computed data:

| Part | Source | AC |
|---|---|---|
| `pr` — number, title, body, head SHA, totals | `repository.getPull` | AC-4 |
| `intent` — summary, in-scope, out-of-scope, context gaps, signals, `resolvedAt` | the cached `intent_*` columns on `pull_requests` (`db/schema/pulls.ts:31-37`). **Never** call `intentService.resolve` — that would be a cross-module import *and* would break AC-3's verification ("generating a brief does not change the PR's intent-resolved timestamp"). | AC-3 |
| `issue` | `parseIssueNumber` (`_shared/linked-issue.ts:17-22`) + a best-effort `github.getIssue`; unresolvable → recorded as unavailable, never a failure | AC-4, AC-7 |
| `spec` | `parseSpecRef` (`_shared/linked-issue.ts:28-30`) + a `resolveContainedPath`-gated checkout read (finding 5), size-capped; **no other project document** (D11) | AC-6, AC-7 |
| `diff` — per-file path/additions/deletions + hunk ranges + whole-PR totals | `repository.getPrFiles` + `hunks.ts` (Q2). **No patch text anywhere in the payload.** | AC-2 |
| `blast` — changed symbols, cross-file callers, impacted endpoints (incl. 2-hop-only), crons, index status/reason/degraded | `RepoIntelPort.getBlastRadius` + `getIndexState` (Q1) | AC-5, AC-32 |

Fact assembly **never throws** on a missing signal — an absent intent, an
unresolvable issue, an unreadable spec, and a degraded or absent index are
each recorded as an explicit "unavailable/degraded" fact and carried into the
payload (AC-7, AC-8's honesty, AC-32, AC-35, G8).

**`prompts.ts`:**

- System prompt states the closed `kind` vocabulary verbatim, states that the
  model has **file paths, counts and hunk ranges but no file contents and no
  hunk bodies**, and states that review-focus entries are *reasons to look*,
  never asserted defects (D3, AC-19, AC-21) — the single most important
  instruction in the prompt, since the mockup's copy is exactly what a model
  will otherwise try to produce.
- Appends `INJECTION_GUARD` from `../../platform/prompt.js`, exactly as
  `onboarding/prompts.ts:211` does. **No per-feature keyword scanning**
  (`server/CLAUDE.md:41-43`).
- Every attacker-influenceable string — PR title, PR body, issue title/body,
  spec content, file paths, symbol names — travels through
  `wrapUntrusted(label, content)`. It is data, never instructions.
- **Budget loop (AC-8, AC-9, Q3):** render → `tokenizer.count(system + guard +
  user)` → while over 8,000, apply the next **whole-item** drop step and
  re-render. Never truncate mid-item. Fixed drop order, lowest-priority first:
  1. blast callers beyond the top 20 (rank-ordered)
  2. impacted crons
  3. impacted endpoints beyond 20
  4. changed-file rows beyond 40 (largest-churn first kept)
  5. the referenced spec document
  6. the linked issue body (title kept)
  **Never dropped:** PR title/body, intent, index status, the changed-file
  count and totals. The count of dropped items is recorded and persisted as
  `dropped_inputs` (AC-8) and rendered (so a reader of a very large PR can see
  the brief describes a subset).

**`schemas.ts`** — a **separate raw-response schema**, not the shared
`PrBrief`, following `conventions/schemas.ts` and
`plans/10`'s Q3 for the same reason: grounding has to reach *inside* each risk
and each focus entry to drop a reference, a line or a link, which is
impossible against a rendered blob.

```
what          string
why           string
risk_level    'high' | 'medium' | 'low'
risks         [{ kind: string, title, explanation, severity, file_refs: [{ file, line?: number|null }] }]
review_focus  [{ file, line?: number|null, reason }]
```

Note `kind: z.string()` here (Q4) and `file_refs` as **structured
`{file, line}` pairs** in the raw schema — the `"path:line"` string encoding
is produced by `render`, after grounding, so the model never has to encode
anything and the grounding check never has to parse anything.

### 5. Grounding (AC-16 … AC-22) — server-side, brief-local, pure

`brief/grounding.ts`, modelled on `onboarding/grounding.ts` (D10): pure,
feature-local, **drop-don't-rewrite**, and never touching, importing or
extending `reviewer-core`'s `groundFindings` (D14; `reviewer-core/CLAUDE.md`'s
Do-not-touch names it).

```
groundBrief(raw: BriefGenerationOutput, facts: BriefFactSet): {
  brief: PrBrief;
  dropped: { paths: string[]; lines: string[]; citations: string[]; links: string[]; risks: string[]; focus: string[] };
}
```

Reference sets, all derived from the same fact set that was sent to the model
(the spec's Inputs table, last-but-two row):

- `changedFiles: Set<string>` — the `pr_files` paths.
- `hunkRangesByFile: Map<string, Array<{start, end}>>` — from `hunks.ts`.
- `blastFiles: Set<string>` — caller files ∪ `factsByFile` keys ∪ changed-symbol
  files.
- `knownEndpoints` / `knownCrons` / `knownSymbols: Set<string>`.

Rules, one per AC:

- **AC-16** — a risk `file_ref` whose `file` is in neither `changedFiles` nor
  `blastFiles` is dropped. A downstream caller file **is** legal here (the
  spec's own edge case) — the stricter changed-files-only rule is AC-19's.
- **AC-17** — a risk with no surviving `file_ref` is dropped whole.
- **AC-18** — any endpoint, cron or symbol named in a brief that is not in the
  corresponding known-set is dropped as a citation.
- **AC-19** — a review-focus entry must name exactly one file in
  `changedFiles`; otherwise the entry is dropped.
- **AC-20** — a line on a focus entry or a risk `file_ref` must fall inside a
  hunk range of the file it names; if not, **keep the entry, discard the
  line**. (On a PR whose `pr_files.patch` is null there are no ranges, so every
  line is discarded and every citation is file-level — Q2.)
- **AC-21** — every free-text field (`what`, `why`, each risk `title` and
  `explanation`, each focus `reason`) goes through a `neutralizeLinks` pass
  that is `onboarding/grounding.ts:202-227`'s `neutralizeBody` applied to this
  feature's allow-set (repo-relative paths present in the fact set): inline
  `[x](t)` / `![x](t)` **and** reference-style `[id]: t` definitions, keeping
  the visible text and discarding the construct. This is required because
  `Markdown.tsx` constrains no URL (finding 6).
- **AC-15 normalisation** — `kind` is lowercased/trimmed and matched against
  `RISK_KINDS`; anything unrecognised becomes `other`. **Never a reason to
  drop the risk.**
- **Q5 bounds (AC-14)** — after all of the above: `risks.slice(0, 6)`,
  `review_focus.slice(0, 5)`, and a first-2-sentences clamp on `what`/`why`.
- **AC-22** — `groundBrief` runs **before** `upsertBrief`, so no ungrounded
  citation is ever persisted or displayed.
- **Q6** — `risk_level` is passed through untouched. No consistency check.

`render` then encodes each surviving `{file, line}` into `file_refs`'s
documented `"<path>"` / `"<path>:<line>"` string form (§1).

### 6. client — the brief section

| Path | Change |
|---|---|
| `src/lib/hooks/brief.ts` (+ barrel entry in `hooks/index.ts`) | `useBrief(prId)` (GET) and `useGenerateBrief(prId)` (POST, takes `{ regenerate }`). Copy `hooks/onboarding.ts` exactly: `refetchInterval` returns `3000` **only** while `data.status === 'generating'` and `false` otherwise (so a second viewer sees a generation finish and nothing else polls — N5 still holds, polling is not generating); `qc.cancelQueries` in `onMutate` before the `setQueryData` in `onSuccess` (`client/LEARNINGS.md:381-403`). No `fetch` in a component. |
| `…/pulls/[number]/_components/PrBriefCard/` | `"use client"`. `PrBriefCard.tsx` + `RiskArea.tsx` + `ReviewFocusList.tsx` + `constants.ts` (the total `RiskKind → {icon, colour, label}` map, AC-37/clarification 6) + `styles.ts` + `index.ts` + `PrBriefCard.test.tsx`. Renders, in order (AC-36/D2): risk level + provenance line, *what*, *why*, RISK AREAS, REVIEW FOCUS. |
| `…/OverviewTab/OverviewTab.tsx` + `styles.ts` | The brief `<section>` goes **above** `s.overviewGrid` (Q8); Description stays last. New props `prId`, `headSha`, `repoFullName` are already threaded (`OverviewTab.tsx:9-16`); add one `onFocusFile(file, line)` callback prop passed down from `PrDetailView`. |
| `messages/en/brief.json` | **Rewrite** per Q9 — replace the `block.*`/`noHistory`/`overlap` keys (they describe the deleted composed contract), keep `why.*` untouched, add `section.*`, `status.*` (one string per AC-41 state), `risk.*` (one label per `RiskKind`), `focus.*`, `provenance.*`, `generate.*`. |

Rendering and accessibility:

- All model-authored text renders through `@devdigest/ui`'s `Markdown`
  primitive (AC-40). It has no `rehype-raw`, so a `<script>` in an explanation
  is visible text; **do not** add an HTML-enabling plugin, and **do not** add a
  `urlTransform` — link safety is server-side (§5, finding 6).
- **AC-42:** every action is a real `<button>`/`<a>` — no div handlers. Risk
  expansion uses a `<button aria-expanded>` controlling the explanation region.
  The section's status banner is `role="status" aria-live="polite"`, the
  `BlastRadiusCard.tsx:71-79` pattern.
- **Non-functional accessibility:** the risk level must be distinguishable
  **without colour alone** — render the level as text (`HIGH`/`MEDIUM`/`LOW`)
  plus an icon, not a coloured dot.
- **AC-34:** zero surviving risks renders an explicit "no specific risks
  identified" statement, never an empty region.
- **AC-41:** one distinct rendering per status, each naming its reason where it
  has one. `earlier_state` shows the stored brief with a marker naming the SHA
  it describes (clarification 3 — no collapsed empty state, no separate
  treatment for "never generated for this state").
- **AC-43:** the provenance line shows generated-at, model, and cost —
  `formatUsd`-style, reusing whatever the run-cost badge already uses.

Import runtime values from `@devdigest/shared/contracts/brief`, **never** the
bare barrel (`client/LEARNINGS.md:296-341`).

### 7. client — AC-39's click-to-file-line navigation (Q7)

Four small, additive edits, mirroring the `findingTarget` mechanism that
already lives in these exact files:

1. **`PrDetailView.tsx`** — new state `focusTarget: { file: string; line: number | null; n: number } | null` and a `handleFocusFile(file, line)` that does `setTab("diff")` and bumps `n`. This is a line-for-line analogue of `handleSelectFinding` (`:84-93`), in the same component, which is already the only place holding both the tab state and the cross-tab targets. Pass `onFocusFile={handleFocusFile}` to `OverviewTab` and `focusTarget` to `DiffTab`.
2. **`DiffTab.tsx`** — accept `focusTarget` and pass it to both `DiffViewer` (original order) and `SmartDiffViewer` (smart order), so the jump works whichever chip is active.
3. **`DiffViewer.tsx` / `SmartDiffViewer.tsx`** — for the file matching `focusTarget.file`, pass `scrollTarget={{ line: focusTarget.line, nonce: focusTarget.n }}`; `undefined` for every other file.
4. **`FileCard.tsx`** — one **additive, backward-compatible** widening: `scrollTarget`'s `line` becomes `number | null`, and the effect (`:61-69`) falls back to a new `id={`difffile-${file.path}`}` on the card root when `line == null`. `setOpen(true)` already happens there, so a file-only target opens and scrolls to the header. No current consumer breaks — nothing passes this prop today.

**Fallback (AC-39's second clause):** when `repoFullName`/`headSha` are null,
or the focus file is not among the PR's rendered files, the entry renders as a
`MonoLink` to `githubBlobUrl(repoFullName, brief.provenance.head_sha, file,
line, line)` — the `BlastRadiusCard.tsx:104-121` pattern, pinned to **the state
the brief describes** (the provenance head SHA), not the PR's current head.
Risk `file_ref` citations always use this host-link form: a risk may cite a
downstream caller file the PR does not change (AC-16), which by definition has
no in-app diff target.

**Do not extract a shared target+nonce hook** — see Q7 and
`client/LEARNINGS.md:86-132`.

### Explicitly not built

The Why Timeline / per-commit brief history (N1), any use of review findings
as an input (N4, clarification 1), any auto-generation — on page open, import,
poll, sync or review-run completion (N5, D13, clarification 4), brief editing
or per-risk accept/dismiss (N6), an MCP tool (N7), an e2e flow (N8,
clarification 5), a brief badge on PR list rows (N9), the `PrHistory` panel
(N10), any change to intent or blast computation/caching/display (N11). Also
**not** built: any edit to `reviewer-core` (finding 1), to
`groundFindings`/`assemblePrompt`/the `INJECTION_GUARD` string, to
`blast/service.ts`, to the shared `BlastRadius`/`DownstreamImpact` contracts
(Q1), or to `Markdown.tsx`.

## Skills for implementer

Derived from `.claude/skills/pr-self-review/SKILL.md` Phase 3 (the routing
table at lines 128-137) and the catalog in `.claude/skills/README.md:9-24`.
Load the row matching the files you are currently editing, not all at once;
respect each skill's declared scope. Phase 3's "cap at 4" is a *review-pass*
budget, not an implementation one.

| Path glob in this plan | Skills to load | Why |
|---|---|---|
| `server/src/modules/brief/**`, `server/src/platform/container.ts`, `server/src/modules/index.ts` | `onion-architecture`, `fastify-best-practices` | Phase 3 row for `server/src/modules/**`, `platform/**`. The ring rules and the local-port/DI pattern are the difference between this module passing `pnpm arch` with zero new baseline entries and eating one (Q1 depends on it). `fastify-best-practices` for the schema-first zod `body` on the POST. |
| `server/src/db/schema/reviews.ts`, `server/src/db/migrations/**` | `drizzle-orm-patterns`, `postgresql-table-design` | Phase 3 row for `server/src/db/**`. Add-only column migration onto an existing PK'd table; `NOT NULL` without default needs the zero-row precondition (finding 2). |
| `server/src/vendor/shared/contracts/brief.ts`, `client/src/vendor/shared/contracts/brief.ts`, `brief/schemas.ts`, `brief/routes.ts` schemas | `zod` | Phase 3 row for `**/contracts/**` and zod schemas. Also the optional-vs-`.nullable()` trap (`server/LEARNINGS.md:422-436`) for the new nullable provenance fields. |
| `brief/facts.ts`, `brief/prompts.ts`, `brief/grounding.ts`, `brief/hunks.ts` | `security` | Phase 3's "any `.ts`/`.tsx`" row, and the sharpest need here: attacker-influenceable PR/issue/spec text and repo-controlled file paths reaching a prompt and then a browser; model-supplied link targets in free text (AC-21); the hunk-body exclusion (AC-2/N2) that must not regress into the first non-review path shipping patch text to a provider. |
| `client/src/app/repos/[repoId]/pulls/[number]/_components/**` (`PrBriefCard`, `OverviewTab`, `PrDetailView`, `DiffTab`, `SmartDiffViewer`) | `frontend-ui-architecture`, `next-best-practices`, `react-best-practices` | Phase 3 row for `client/src/app/**`. Colocated `_components/<Name>/` folders, the `"use client"` boundary, and the state-ownership question in §7 (who owns `focusTarget`). |
| `client/src/components/diff-viewer/**`, `client/src/lib/hooks/brief.ts` | `frontend-ui-architecture`, `react-best-practices` | Phase 3 row for `client/src/components/**` and `client/src/lib/**`. The `FileCard` widening is a shared component with two existing consumers; the hook needs the conditional-`refetchInterval` + `cancelQueries` pattern. |
| `client/**/*.test.tsx` | `react-testing-library` | Phase 3 row. |

**Routing gaps:** none — every path this plan touches is covered by a Phase 3
row. (`plans/09` and `plans/10` both had to flag the missing `mcp-server/**`
row; this plan touches no `mcp-server` file, so the gap does not bite here.
It is still worth adding.)

Root `CLAUDE.md` "Before you finish": append an `engineering-insights` entry to
each touched module's `LEARNINGS.md` — at minimum `server/LEARNINGS.md`
(**close the 2026-08-06 open question at `:294-309` explicitly** — record that
D15 was resolved by reading `BlastResult` directly rather than widening the
contract, and why) and `client/LEARNINGS.md` (that the "fourth target+nonce
case" arrived and was still not extracted, and why; plus whatever the
`FileCard` file-only anchor cost).

## Verification

Scoped commands, per module. `pr-self-review` re-runs the full suites before
push regardless, so nothing below is a blanket run.

### server

```
cd server && pnpm typecheck
cd server && select-count-check     # see below, before generating
cd server && pnpm db:generate < /dev/null && pnpm db:migrate
cd server && pnpm exec vitest run \
  test/brief-hunks.test.ts \
  test/brief-facts.test.ts \
  test/brief-prompts.test.ts \
  test/brief-grounding.test.ts \
  test/brief-service.test.ts \
  test/brief.it.test.ts \
  test/contracts.test.ts
cd server && pnpm arch
```

- Before generating the migration: `select count(*) from pr_brief;` **must**
  return `0` (finding 2), otherwise the `NOT NULL` columns need defaults.
- **Pass:** all green; `pnpm arch` reports **zero new** violations. If it
  fails, a cross-module import slipped in — replace it with a local port,
  do **not** run `pnpm arch:baseline` and accept a new entry
  (`server/LEARNINGS.md:645-660`).
- A **scoped** run is right here: unlike `plans/10`, nothing in this pass
  changes an existing computed value (no indexer change, no `blast` change,
  no `reviewer-core` change), so no existing suite is a regression surface.
  `test/contracts.test.ts` is included because the shared contract changed.

### client

```
cd client && pnpm typecheck
cd client && pnpm exec vitest run \
  "src/app/repos/[repoId]/pulls/[number]/_components/**" \
  "src/components/diff-viewer/**" \
  "src/lib/hooks/**"
cd client && pnpm build      # or `pnpm dev` + open a PR detail page
```

- The `diff-viewer` and `_components` globs are **both** required: §7 edits a
  shared component with two pre-existing consumers, and their existing tests
  are the regression check that the additive props changed nothing.
- The build/boot step is **not optional** — typecheck + vitest do not prove the
  page renders, and this adds new `@devdigest/shared` consumers, the exact trap
  in `client/LEARNINGS.md:296-341`.
- **Pass:** the Overview tab renders the brief section full-width above the
  Intent/Blast grid with Description last; clicking a review-focus entry
  switches to the Files tab and opens/scrolls that file.

### Cross-cutting

```
git diff --stat server/src/vendor/shared client/src/vendor/shared
git status --porcelain server/src/db/migrations
git diff reviewer-core/ mcp-server/ e2e/
diff server/src/vendor/shared/contracts/brief.ts client/src/vendor/shared/contracts/brief.ts
```

- Both `vendor/shared` copies changed, with **identical** `contracts/brief.ts`
  content (they are byte-identical today; the `diff` must stay empty). A
  one-sided change is a HIGH finding in `pr-self-review` Phase 4.
- Exactly one new migration file, no edit to an existing one
  (`server/CLAUDE.md:31-32`).
- `git diff reviewer-core/ mcp-server/ e2e/` must be **empty** — D14, N7, N8.

### Test matrix the scoped files must cover

| Test scenario | ACs |
|---|---|
| Assemble a fact set against a stubbed provider → zero provider calls | AC-1 |
| A PR whose `pr_files.patch` contains a unique sentinel string → that string is absent from the assembled model input; only paths, counts, hunk ranges and totals appear | AC-2, N2 |
| Generating a brief does not change the PR's `intent_resolved_at`; intent is read from the cached columns | AC-3 |
| PR title/body + a resolvable linked issue's title/body reach the fact set | AC-4 |
| **Fixture whose only endpoint impact is reachable at two import hops** → that endpoint is present in the assembled fact set (Q1's whole point) | AC-5, D15 |
| A PR body referencing `specs/NN-x.md` → that document's content is in the fact set, and no other project document is | AC-6, D11 |
| An unresolvable issue and an unreadable spec → both recorded as unavailable, assembly still succeeds | AC-7 |
| Over-budget fixture → whole lowest-priority items dropped in the documented order, nothing truncated mid-item, dropped count recorded | AC-8 |
| Deliberately oversized fixture PR → counted **full model input** ≤ 8,000 tokens | AC-9, Q3 |
| Trigger a generation against a stubbed provider → exactly one `completeStructured`, zero `complete`/`embed` | AC-10 |
| A repair reprompt is recorded as `attempts > 1` with summed tokens on the same request, not a second generation | AC-11 |
| Model choice comes from the workspace's `risk_brief` feature model, falling back to `openai`/`gpt-4.1` | AC-12 |
| Successful generation yields what, why, one risk level, risks, ordered review focus | AC-13 |
| Fixture PR touching hundreds of files → ≤2 sentences each for what/why, ≤6 risks, ≤5 focus entries | AC-14, Q5 |
| Stubbed response whose risk `kind` is an invented string → the risk survives, rendered under `other` | AC-15, Q4 |
| Stubbed response citing `src/does-not-exist.ts` → no such reference in the stored brief | AC-16 |
| A risk whose every reference was dropped → the risk is dropped whole | AC-17 |
| A brief naming an endpoint/cron/symbol absent from the blast facts → that citation dropped | AC-18 |
| A focus entry citing a file this PR does not change → entry dropped; a risk citing a blast-only caller file → **kept** | AC-19, AC-16 edge case |
| A citation line outside every hunk → file-level reference, line discarded | AC-20 |
| A stubbed explanation containing an external link / image → plain text, no live link, recorded in `dropped.links`; a reference-style definition too | AC-21 |
| Nothing ungrounded is ever persisted (grounding runs before `upsertBrief`) | AC-22 |
| Repeated page loads against a stubbed provider → zero provider calls | AC-23 |
| Two successive generate requests with no intervening push → exactly one provider request | AC-24 |
| Head SHA moved → stored brief presented as an earlier state, naming it, no automatic regeneration; **and the "never generated for the new state" case renders identically** | AC-25, clarification 3 |
| Explicit regenerate on a matching state key → a fresh call is made; the stored brief is replaced only on success | AC-26 |
| Two rapid regenerate actions → one provider request, the second observes `generating`; a concurrent GET also reports `generating`; the guard releases on success **and** failure. **Use `server/LEARNINGS.md:84-109`'s delayed-stub recipe, not `Promise.all`.** | AC-27 |
| A failing generation → previous brief intact, still returned, nothing partial stored | AC-28 |
| A successful generation stores head SHA, index state, intent resolution time, model, provider, attempts, tokens in/out, cost, timestamp | AC-29 |
| Same head SHA but the index or intent advanced → marked possibly-stale, naming what moved, no automatic regeneration | AC-30 |
| A PR with an empty `pr_files` list → refused with a stated reason, zero provider calls | AC-31 |
| Partial / degraded / absent index → generation still proceeds, index status in the fact set and on the rendered brief | AC-32 |
| Structured call throws / fails validation after permitted attempts → failure reported, retry offered, no model prose displayed | AC-33 |
| Zero risks after grounding → explicit "no specific risks identified", not an empty region, and not stored as a failure | AC-34 |
| Fixture PR with empty body, no issue, no spec, no cached intent → the *why* names the absence rather than asserting a motivation | AC-35 |
| The overview presents risk level, what, why, risk areas and review focus in one section, above the Intent/Blast grid | AC-36, Q8 |
| A risk renders severity + kind + title + file ref collapsed, and its explanation when expanded | AC-37 |
| The review-focus list renders as an ordered list, each entry with its file ref and one-sentence reason | AC-38 |
| Activating a focus entry switches to the Files tab and opens/scrolls that file (and line, when one survived); with no in-app target it links to the repository host **at the brief's provenance head SHA** | AC-39, Q7 |
| A stubbed explanation containing a `<script>` tag renders as visible text, not markup | AC-40 |
| Each of the seven statuses renders distinctly, each naming its reason where it has one | AC-41 |
| Generate, regenerate, expand-a-risk and open-a-focus-target are all keyboard-operable; a status change is announced to assistive tech; the risk level is legible without colour | AC-42 |
| A displayed brief shows generated-at, model and cost | AC-43 |
| A brief requested for another workspace's PR is refused before any `pr_brief` row is read, on both routes | AC-44 |
| A file path with spaces / non-ASCII / a `#` round-trips through the fact set, grounding and the rendered citation unchanged | edge case |
| An existing `DiffViewer`/`SmartDiffViewer`/`FileCard` test suite passes unchanged after the §7 widening | regression |

`*.it.test.ts` for anything DB-backed (brief persistence, workspace scoping,
the `pr_files`/`pull_requests` reads); everything else hermetic against a
stubbed provider and fixture rows (`server/CLAUDE.md:47-50`).

### Manual acceptance beyond an automated run

Generate a brief on a real imported PR with a real provider key, and confirm:
one call in the logs, a second click within the same head SHA spends nothing,
the provenance line's cost is non-zero, and a review-focus click lands on the
right file. That is a human step after this plan lands — and note the seeded
demo PR #482 is a poor choice for it (`patch: null`, Q2).
