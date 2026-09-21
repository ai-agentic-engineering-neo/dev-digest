# Spec: Onboarding Generator   |   Spec ID: SPEC-10   |   Status: approved

Feature 2 of the "Project Context" epic (L05 in the roadmap: *Project Context
Folder · Onboarding generator · PR Brief card*). SPEC-09 gave the **reviewer**
the project's own written docs; this feature gives a **human** the repo's own
structure, computed rather than written.

**Affected modules:** `server`, `client`, `mcp-server`. Cross-module, hence a
root spec. `reviewer-core` is **not** affected (decision D9); `e2e` is not
affected in this slice (N9).

## Problem & Motivation

DevDigest already computes, on every indexed repo, a far better description of
that repo than any human has written down: an import graph, a PageRank over it,
per-file symbols and signatures, HTTP endpoints and crons, and a token-budgeted
repo map. All of it is aimed at a model. The person who has to *review* the PR —
a new joiner, or a reviewer meeting this repo for the first time — gets none of
it. They open the repository, see several thousand files, and start guessing
which ones matter.

This is a real gap in this product specifically. DevDigest's premise is that a
reviewer with repo context reviews better than one without. It currently applies
that premise only to the model. A reviewer who cannot tell whether
`src/lib/redis.ts` is load-bearing or vestigial cannot judge whether a finding
about it matters, and cannot judge the diff either.

The Onboarding Tour is **the repo map, for humans**: a single page, generated on
request, with five sections — architecture overview, critical paths, how to run
locally, guided reading path, first tasks. The facts behind it are collected
deterministically from the existing index (`repoIntel.*`), the reading order is a
*computed rank* rather than a model's opinion, and exactly one structured LLM
call turns those facts into prose. When the facts are thin or the call fails, the
page still renders the facts, labelled as facts — it never invents a repository.

Two pieces of this feature already exist in the codebase, built for it and left
unwired: `getTopFilesByRank` and `getCriticalPaths`
(`server/src/modules/repo-intel/service.ts:703-720`, `:727-766`), commented "T3:
onboarding reading-path + critical paths" (`types.ts:165`) and reachable from no
route; and the `Onboarding` contract itself
(`server/src/vendor/shared/contracts/knowledge.ts:28-47`), whose
`sections[].{kind,title,body,diagram,links}` shape is exactly five-sections-with-
an-optional-mermaid-diagram. A third piece is reserved but deliberately switched
off: `file_rank.hotness` is hardcoded to `0`
(`server/src/modules/repo-intel/pipeline/rank.ts:51`) with the schema comment
"`rank` would then become `pagerank * (1 + hotness)`"
(`server/src/db/schema/repo-intel.ts:95-98`). This feature makes `hotness` real —
but deliberately stops short of the second half of that comment: the shared
persisted `rank` keeps its current structural definition for the consumers that
already read it, and the weighted score `pagerank * (1 + hotness)` is derived at
read time inside this feature only (decision D7).

## Goals / Non-goals

### Goals

- **G1 — Deterministic facts.** Collect everything the tour is built from —
  detected stack, repository structure, HTTP routes, package scripts, ranked
  files, dependency chains — with **no LLM call at all**. Fact-gathering is
  `repoIntel.*` plus checkout reads; it is reproducible from (index state, repo
  checkout, ingested PR history).
- **G2 — A computed reading order, not a model opinion.** The guided reading path
  and the critical-paths list are ordered by a **weighted score**,
  `pagerank * (1 + hotness)`, over the import graph, with `hotness` finally real
  (G3). That score is derived at read time **inside this feature** and is never
  written back to the shared persisted rank (D7). The model never reorders the
  list; it may only explain each entry.
- **G3 — Real hotness within a shallow clone.** `hotness` becomes a genuine churn
  signal without deepening the clone (`CLONE_DEPTH = 1`,
  `pipeline/rank.ts:5-7`) and without any `git log` history, sourced from the
  pull-request file history the workspace has already ingested (decision D6). It
  degrades honestly to `0` — i.e. to today's pure-PageRank behavior — when no such
  history exists.
- **G4 — Exactly one structured LLM call per generation.** One
  `completeStructured` request emits all five sections. Not five calls, not zero.
  Its cost is recorded and readable afterwards without a debugger (G6).
- **G5 — Never a silent failure and never fabricated prose.** A degraded or
  absent index, or a failed structured call, still renders a **deterministic
  skeleton** — facts only, no narrative — with an honest status indicator naming
  the reason.
- **G6 — Auditable spend.** Generating a tour produces a durable record of the
  call: model, attempts, tokens in/out, estimated cost, and the index state it
  was generated from. Opening a tour that already exists spends nothing.
- **G7 — Grounded output.** Every file path, link, and setup command the tour
  shows is checkable against the collected facts; anything the model emits that
  isn't, is dropped rather than displayed. This is the same stance
  `groundFindings` takes on review findings (`reviewer-core/CLAUDE.md`,
  "Do-not-touch").
- **G8 — Reachable from a coding agent.** The tour is readable over MCP by a
  read-only tool, so an agent working in the repo can orient itself the same way
  a human does — without being able to spend tokens (D8).

### Non-goals (explicitly out of scope for this slice)

- **N1 — Personalized or role-specific tours.** One repo has one current tour.
  It does not vary per user, per seniority, per team, or per task (D5).
- **N2 — A conversational or interactive tour.** No follow-up questions, no chat,
  no "explain this file" drill-down. The page is a generated artifact, not a
  session.
- **N3 — Editing the tour.** No inline editing, no pinning a hand-written
  section, no accepting/rejecting individual entries. Regeneration replaces the
  whole tour.
- **N4 — Writing the tour into the repository.** No commit, no PR, no file in the
  checkout — despite the unimplemented Settings string "On — onboarding tours and
  digests are written to the repo folder"
  (`client/messages/en/settings.json:46`, referenced by no component). SPEC-09
  already established that this product adds no write path to a checkout
  (SPEC-09 N2/AC-5); this feature does not reopen it. Export/download is likewise
  out.
- **N5 — A public or unauthenticated share link.** The mockup's "Share link"
  affordance copies the workspace-scoped page URL (optionally with a section
  anchor); it mints no token and grants no access to anyone who could not already
  open the page (D5).
- **N6 — An in-app file viewer.** "Open" on a critical-path row leaves DevDigest
  for the file on the repository host, at the indexed revision (AC-44).
- **N7 — Automatic generation.** Nothing generates a tour on import, on clone, on
  index, on a schedule, or on page load. Generation is always an explicit user (or
  API) action (D3, AC-19).
- **N8 — Ranking beyond the indexed file set.** The index bounds itself at
  `MAX_INDEXED_FILES = 5000` files (`repo-intel/constants.ts:42`,
  `pipeline/walk.ts:65-67`). The tour describes what was indexed and says so; it
  does not attempt whole-repository coverage for larger repos (D1, D2, AC-30).
- **N9 — A new e2e browser flow.** The existing flows assume a DB seeded with the
  one demo repo, and a generated tour needs a real provider call the hermetic e2e
  stack has no key for. If a flow is added later it must exercise the
  deterministic skeleton path only, never a live generation.
- **N10 — Non-TS/JS stacks as a first-class case.** The index parses
  `.ts/.tsx/.js/.jsx/.mjs/.cjs` only (`repo-intel/constants.ts:14`), so stack
  detection and ranking are meaningful for those repos. A repo the indexer cannot
  parse gets the skeleton and an honest reason (AC-33), not a wrong tour.
- **N11 — Quality evaluation of the tour.** No eval harness, no scoring of
  whether the prose is good. The acceptance bar in this slice is *grounded,
  bounded, honest, and one call*.

### Decisions resolved from the design sources

The two mockups are the design source for section order, page shape, and copy
tone. Four things in them conflict with facts in this codebase or with the fixed
technical requirements. All four are resolved here.

- **D1 — "12,450 files" is not what the tour was generated from.** The mockup's
  provenance line reads "Generated from index of 12,450 files · last refreshed 2h
  ago". The indexer caps at `MAX_INDEXED_FILES = 5000` and truncates the walk in
  **alphabetical** order (`pipeline/walk.ts:60-67`), recording the overflow in
  `stats.bounded` — which today is computed and then **never propagated into
  `IndexResult`/`IndexState`** (`stats.bounded` has no reader in `server/src`
  outside `project-context`, which keeps its own copy of the pattern in
  `project-context/discovery.ts:84`). So on the mockup's own example repo the
  tour would be generated from at most 5,000 files chosen alphabetically, while
  the page claimed 12,450. Resolution: the provenance line states **what was
  actually indexed and what was excluded** — indexed file count, count excluded by
  the index bound, index status/freshness, and how many pull requests informed the
  churn weighting (AC-18, AC-30). A tour that overstates its own coverage is the
  exact failure mode G5 exists to prevent.
- **D2 — Bounded, fixed-size sections; no pagination.** The mockup shows four
  critical-path rows and a short reading path, with no paging control. That is
  correct and is now a rule, not an accident: a tour is a fixed-size artifact. A
  "guided reading order" of 300 files is not a reading order. Caps are set in
  AC-17 and AC-25 and apply identically whether the repo has 40 indexed files or
  5,000.
- **D3 — First visit shows the skeleton and a Generate action, not a tour.** The
  mockup shows only the generated state and a "Regenerate" button, which implies
  a tour already exists. Nothing may generate one implicitly: an implicit
  generation on page load would spend tokens on a navigation, and would make
  "exactly one LLM call" a per-page-load claim rather than a per-generation one.
  Resolution: with no stored tour the page renders the deterministic skeleton with
  an explicit generate action (AC-19, AC-33); "Regenerate" is the same action once
  a tour exists. A pre-existing, currently unused i18n namespace already assumes
  this shape — `client/messages/en/onboarding.json` has `generate.cta` "Generate
  onboarding tour" alongside `regenerate`.
- **D4 — The five sections are the product owner's five, and the stale i18n copy
  is wrong.** That same unused namespace describes the tour as "overview,
  architecture, key modules, getting started, and conventions & gotchas" —
  five sections, but not these five. The authoritative set is **architecture
  overview, critical paths, how to run locally, guided reading path, first
  tasks**, in that order (AC-16), matching the mockup's own "ON THIS PAGE" table
  of contents. The stale copy is a placeholder to be corrected, not a competing
  requirement.

### Decisions resolved by the product owner

- **D5 — What "onboarding" means here: one repo, one current tour, aimed at a
  first-time reader of *this* repo.** The audience is the DevDigest user opening
  a repository they do not know — whether they are joining the team that owns it
  or reviewing it from outside; the tour does not distinguish those, because the
  product has no per-user identity to distinguish them with, and because both need
  the same first answer ("what matters here, and in what order do I read it").
  The tour's purpose is tied to this product's own premise: DevDigest already
  feeds repo context to the model, and this is the same context, rendered for the
  human who has to act on the model's findings. Two consequences, both
  deliberate: (a) no personalization (N1); (b) a repo the workspace has been
  reviewing for months **does** get a different tour from one just imported — not
  through different prose targets, but because months of ingested pull requests
  give `hotness` something to weight with (D6), and the page says how many PRs
  informed it (AC-30). "Share link" therefore means "link to this page", not
  "publish this repo's internals" (N5).
- **D6 — Hotness comes from ingested pull-request history, not from git.** The
  clone is shallow by deliberate design (`CLONE_DEPTH = 1`), so `git log` churn is
  unavailable, and deepening the clone would be a global cost regression on every
  repo to serve one feature. The workspace already persists exactly the signal
  needed — per-PR changed files with timestamps (`pr_files` +
  `pull_requests.opened_at`, `server/src/db/schema/pulls.ts:26,45-54`) — and the
  180-day window constant was already reserved for this
  (`HOTNESS_WINDOW_DAYS`, `repo-intel/constants.ts:48`, currently unused).
  Rejected alternative: accumulating a churn counter across incremental-refresh
  diffs. It needs new persistence, starts at zero for every repo, and can only
  ever describe the future — whereas PR history describes the past that already
  exists on import. Hotness is **real from day one where history exists and zero
  where it doesn't** (AC-7, AC-9), which makes the degraded case identical to
  today's shipped behavior rather than a new failure mode.
- **D7 — The weighted score is derived at read time, scoped to onboarding; the
  shared persisted `rank` is left untouched.** The persisted `rank` column is read
  today by repo-map rendering, blast-radius caller ordering, and conventions
  sampling. Redefining it as `pagerank * (1 + hotness)` — the step the schema
  comment reserved (`repo-intel.ts:95-98`) — would silently change the ordering
  behavior of three already-shipped features, and would put this feature (and its
  plan) on the hook for regression-testing all three. That is scope this spec
  declines. Resolution: `hotness` becomes a real, persisted per-file value, and
  **onboarding derives `weightedRank = pagerank * (1 + hotness)` itself, at read
  time, from the two values that are already stored separately**. It never writes
  that product back to the shared rank, never changes what the existing rank-read
  methods return to their existing callers, and gets any hotness-aware behavior as
  an *additive* variant (a new method, or an optional parameter defaulting to
  today's behavior) rather than as a change to an existing one's output. (AC-6,
  AC-11, AC-12.)
- **D8 — The MCP tool is read-only and cannot spend tokens.** It returns the
  stored tour, or the skeleton with its status, and never triggers a generation —
  keeping the package's existing separation between read tools and the one action
  tool (AC-47, AC-48).
- **D9 — `reviewer-core` is out of scope.** Verified against
  `reviewer-core/CLAUDE.md`: it is a pure engine with "no DB, GitHub, or
  filesystem access", whose only side effect is an LLM call for a *review*. The
  tour needs the index, the checkout, and PR history, is not a review, and follows
  the precedent of `modules/conventions/service.ts:107-118`, which makes its own
  structured call from the server module without touching the engine. Nothing in
  this feature enters the PR-review path.
- **D10 — The tour lives at a URL that does not contain `onboarding`, and the
  nav matcher is fixed as part of this feature.** `activeKeyFor` matches by
  substring — `if (pathname.includes("/onboarding")) return "onboarding-tour"`
  (`client/src/components/app-shell/helpers.ts:29`) — while `/onboarding` is the
  unrelated "add your first repo" screen
  (`client/src/app/onboarding/page.tsx`). The key is dead today because `NAV`
  (`client/src/vendor/ui/nav.ts:20-51`) has no onboarding-tour item; adding one
  makes the mis-highlight live. Both halves are therefore in scope: the tour's
  path avoids the `onboarding` segment, **and** the matcher stops claiming the
  add-repo screen (AC-39). The sidebar label stays "Onboarding Tour"
  (`client/messages/en/shell.json:19`), which reads correctly against the mockup.
- **D11 — "Exactly one LLM call" means one structured request per generation.**
  Both providers implement `completeStructured` with a bounded schema-repair
  reprompt (`server/src/adapters/llm/openai.ts:88-133`, `anthropic.ts:89`), which
  accumulates tokens into the single `StructuredResult` and reports `attempts`.
  A repair reprompt is a retry of the same request, not a second generation: it
  is counted, attributed, and visible (AC-13, AC-14, AC-21). Anything that would
  need a second *generation* — one call per section, a refinement pass, a critique
  pass — is out.
- **D12 — Numeric prompt/token budgets are delegated to
  `implementation-planner`.** The *rules* are fixed here: section caps (AC-17,
  AC-25), facts-only payload (AC-5), and drop-don't-truncate bounding. The token
  budget for the fact payload sent in the one call is a planning decision — pick
  it in the plan and document it there. Do not escalate it back.

## User stories

- **US-1** — As a reviewer meeting an unfamiliar repo, I open its Onboarding Tour
  and get five sections — what the architecture is, which files matter, how to run
  it, what to read in order, and what to do first — so I can be useful on it today
  instead of next week. *(AC-16, AC-17, AC-22, AC-25, AC-26, AC-40)*
- **US-2** — As that reviewer, I trust the reading order because it is computed
  from the repo's own import graph and change history rather than guessed by a
  model. *(AC-6, AC-7, AC-8, AC-12, AC-27)*
- **US-3** — As a reviewer on a repo the workspace has reviewed for months, the
  files that actually change rank above the ones that merely sit at the bottom of
  the import graph. *(AC-6, AC-7, AC-30)*
- **US-4** — As a reviewer on a freshly imported repo with no PR history, I still
  get a sensible structural ordering rather than an error or an empty page.
  *(AC-9, AC-10, AC-11, AC-30)*
- **US-5** — As a user opening a repo's tour page for the first time, nothing is
  spent until I ask for it, and asking twice quickly does not bill me twice.
  *(AC-19, AC-20, AC-22)*
- **US-6** — As a workspace owner, I generate a tour and can then open the logs
  and see one call, its token counts, and its cost — the whole spend of this
  feature. *(AC-1, AC-13, AC-14, AC-15, AC-21, AC-30)*
- **US-7** — As a reviewer, every path the tour names is a real file in this
  repo, and clicking it takes me to that file at the revision the tour describes.
  *(AC-26, AC-28, AC-32, AC-44)*
- **US-8** — As a reviewer, the setup commands are the repo's own declared
  commands, shown as text I copy and run myself, not something DevDigest invented
  or executed. *(AC-2, AC-4, AC-29, AC-43)*
- **US-9** — As a reviewer on a huge repo, the page tells me plainly how much of
  the repository it actually indexed and what it left out, instead of implying it
  read all of it. *(AC-3, AC-18, AC-25, AC-30)*
- **US-10** — As a user whose repo is still cloning or whose index is degraded, I
  see the deterministic facts and an honest status saying why there is no
  narrative, not a spinner forever and not invented prose. *(AC-33, AC-35, AC-37,
  AC-38)*
- **US-11** — As a user whose generation just failed, I get told it failed, I keep
  the tour I had, and I can retry. *(AC-24, AC-34, AC-36)*
- **US-12** — As a security-conscious owner, a repository that contains hostile
  text in its README, its package scripts, or its file names cannot use my tour
  generation to issue instructions to the model, to run a command, or to inject
  markup into my browser. *(AC-5, AC-32, AC-41, AC-42, AC-43)*
- **US-13** — As a coding agent working in this repo, I can read the current tour
  over MCP to orient myself, and I cannot accidentally spend the workspace's
  tokens by doing so. *(AC-47, AC-48, AC-49)*
- **US-14** — As a user, the sidebar highlights "Onboarding Tour" when I am on a
  tour and not when I am on the add-a-repo screen. *(AC-39)*
- **US-15** — As a keyboard or screen-reader user, I can generate a tour, move
  through its sections, copy a setup step, and be told when its status changes.
  *(AC-40, AC-45, AC-46)*
- **US-16** — As a reviewer returning to a tour weeks later, I can tell at a
  glance that the repo has moved on since it was generated, and nothing has
  quietly regenerated it behind my back. *(AC-19, AC-21, AC-23)*

## Acceptance criteria (EARS)

*Terms used below.* The **fact set** is the deterministic collection of AC-1..AC-5.
The **weighted rank order** is the descending order by the read-time weighted
score defined in AC-6 — distinct from the repository's shared persisted rank,
which this feature does not redefine (D7, AC-11). A **tour**
is a stored, successfully generated five-section artifact. The **skeleton** is the
facts-only rendering of AC-33/AC-35.

### Deterministic fact collection

- **AC-1** — The system shall assemble the entire fact set for a repository
  without making any LLM call, using the existing repository index and reads of
  the repository's synced checkout only.
  *Verify: assemble the fact set against a stubbed provider and assert zero
  provider calls.*
- **AC-2** — The system shall detect, deterministically from the repository's
  synced checkout, the repository's language/runtime, package manager, and
  declared framework dependencies, and shall report each detected value together
  with the file that evidenced it.
  *Verify: a fixture checkout with a known manifest and lockfile yields the
  expected stack values, each naming its evidence file.*
- **AC-3** — The system shall include in the fact set a structural summary of the
  repository (its directory skeleton and the ranked files within it) derived from
  the existing index, never from a fresh unbounded filesystem walk performed for
  this feature.
- **AC-4** — The system shall collect the candidate setup steps deterministically
  from the repository's own declared facts — its declared scripts, the presence of
  an environment-example file, and the presence of a container-compose definition
  and the services it declares — and shall record for each candidate step the file
  that evidenced it.
  *Verify: a fixture checkout whose manifest declares `dev` and `install` scripts
  and which contains an env-example file yields exactly the corresponding
  candidate steps, each with an evidence file.*
- **AC-5** — The fact set sent to the model shall contain structured facts only —
  paths, symbol and route names, declared script strings, detected stack values,
  ranks — and shall contain no raw source-file contents.
  *Verify: for a fixture repo containing a unique sentinel string in a source
  file, that string is absent from the assembled request.*

### Ranking and the computed reading order

- **AC-6** — WHERE this feature orders files (the guided reading path and the
  critical-paths list), the system shall order them by a weighted score computed
  at read time as `pagerank * (1 + hotness)`, where `pagerank` is the existing
  PageRank over the import graph and `hotness` is a value in `[0, 1]`, and shall
  not persist that score as the repository's shared file rank.
  *Verify: for a fixture index with known pagerank and hotness values, the tour's
  ordering matches the product while the stored shared rank is unchanged.*
- **AC-7** — The system shall derive each indexed file's `hotness`
  deterministically from how often that file appears in the repository's
  already-ingested pull-request file history within a bounded recency window,
  normalized so that the most-frequently-changed indexed file in that window has
  `hotness = 1`.
  *Verify: two fixture repos with identical graphs but different PR histories
  produce different rank orders, reproducibly.*
- **AC-8** — The system shall derive hotness without deepening the repository
  clone and without reading git commit history.
  *Verify: hotness is produced for a fixture whose checkout has a single-commit
  history.*
- **AC-9** — IF a repository has no ingested pull-request history within the
  window, THEN the system shall set `hotness = 0` for every file, making the
  weighted score equal to `pagerank`, and shall not fail, warn, or block tour
  generation.
  *Verify: a freshly imported repo with zero PRs orders identically to today's
  pure-PageRank behavior.*
- **AC-10** — WHEN a pull-request file appearing in the history does not
  correspond to an indexed file, the system shall ignore it rather than
  introducing an unranked entry.
- **AC-11** — The system shall leave the repository's shared persisted file rank
  and its derived percentile with their current structural definition, and shall
  not change the results returned to the existing callers of the existing
  rank-read operations; any hotness-aware ordering shall be additive, leaving
  those callers' current behavior as the default.
  *Verify: for a fixture index, the shared rank, the percentile, and the results
  of every pre-existing rank-read operation are identical before and after
  hotness becomes non-zero.*
- **AC-12** — WHEN this feature orders files for a repository, the system shall
  derive the weighted score over the full indexed file set it is ordering, so the
  ordering is internally consistent rather than a mix of weighted and unweighted
  values.

### The one structured call

- **AC-13** — WHEN a user (or an API caller) triggers generation for a repository,
  the system shall make **exactly one** structured completion request, which
  returns all five sections, and shall make no other LLM call anywhere in the
  generation path.
  *Verify: trigger a generation against a stubbed provider and assert exactly one
  structured request and zero completions/embeddings.*
- **AC-14** — WHERE the provider's structured-output implementation reprompts to
  repair a schema-invalid response, the system shall treat those reprompts as
  attempts of the same request and shall record the attempt count alongside the
  request's summed token usage, rather than reporting them as additional
  generations.
- **AC-15** — The system shall select the model for this call from the
  workspace's configured model choice for the onboarding feature, falling back to
  that feature's documented default when the workspace has not chosen one.
- **AC-16** — WHEN a generation succeeds, the resulting tour shall contain exactly
  five sections, of the fixed kinds *architecture overview*, *critical paths*,
  *how to run locally*, *guided reading path*, and *first tasks*, in that order.
  *Verify: the stored tour's section kinds equal that sequence exactly.*
- **AC-17** — The system shall permit at most one diagram in the whole tour, on
  the architecture-overview section, expressed as a Mermaid diagram.
- **AC-18** — WHEN the fact set is assembled for a repository whose index is
  bounded or partial, the system shall include the index's coverage facts —
  indexed file count, count excluded by the index bound, and index status — in the
  fact set, so the generated narrative and the provenance line describe the
  indexed subset rather than the repository as a whole.

### Generation, caching and freshness

- **AC-19** — The system shall generate a tour only in response to an explicit
  generate/regenerate action, and shall never generate one as a side effect of
  opening the tour page, importing a repository, cloning, indexing, refreshing, or
  any scheduled job.
  *Verify: open the tour page for a repo with no stored tour against a stubbed
  provider and assert zero provider calls.*
- **AC-20** — WHILE a generation is already in flight for a repository, the system
  shall not start a second generation for that repository, and shall surface the
  in-flight state rather than queueing or duplicating the call.
  *Verify: two rapid regenerate actions produce one provider request.*
- **AC-21** — WHEN a generation succeeds, the system shall store the tour together
  with the identity of the index state it was generated from, the model used, the
  attempt count, tokens in and out, and the estimated cost.
- **AC-22** — WHEN a user opens a repository's tour page and a stored tour exists,
  the system shall render that stored tour without making any LLM call.
  *Verify: repeated page loads against a stubbed provider produce zero provider
  calls.*
- **AC-23** — WHEN the repository's index has advanced past the index state a
  stored tour was generated from, the system shall mark the tour as stale, naming
  both what it was generated from and how current the index now is, and shall not
  regenerate it automatically.
- **AC-24** — WHEN a regeneration is triggered, the system shall replace the
  stored tour only if the new generation succeeds; on failure the previously
  stored tour shall remain intact and shall remain the tour that is displayed,
  alongside the failure status of AC-34.
- **AC-25** — The system shall bound every section of a generated tour: at most 10
  critical paths, at most 10 guided-reading-path entries, at most 10 setup steps,
  and between 3 and 5 first tasks — irrespective of repository size.
  *Verify: a fixture repo with thousands of indexed files still yields sections
  within these bounds.*
- **AC-26** — Each guided-reading-path entry shall consist of one repository file
  path and one single-sentence reason, and each critical-path entry shall consist
  of one repository file path and one single-sentence reason.

### Grounding

- **AC-27** — The system shall order the guided reading path by the weighted rank
  order, and shall not allow the model's response to change that order; the model
  contributes each entry's reason only.
  *Verify: for a fixture whose model response returns the entries shuffled, the
  rendered order still matches the weighted rank order.*
- **AC-28** — IF the model's response names a file path that is not present in the
  repository's index, THEN the system shall drop that entry rather than displaying
  it.
  *Verify: a stubbed response citing `src/does-not-exist.ts` yields a tour with no
  such entry.*
- **AC-29** — IF the model's response contains a setup step that does not
  correspond to a collected setup fact (AC-4), THEN the system shall drop that
  step rather than displaying it.
  *Verify: a stubbed response adding `curl … | sh` to a fixture whose facts do not
  contain it yields a tour without that step.*
- **AC-30** — The system shall present, with every tour and every skeleton, a
  provenance statement covering: how many files were indexed, how many were
  excluded by the index bound, the index's status and freshness, how many pull
  requests informed the churn weighting, and — for a generated tour — when it was
  generated and by which model.
  *Verify: for a repo whose index is bounded, the page states the indexed count
  and the excluded count, not the repository's total file count.*
- **AC-31** — The system shall label the first-tasks section as model-suggested
  rather than derived, and each first task shall reference at least one indexed
  file path.
- **AC-32** — WHERE a tour is rendered, each section's links shall resolve only to
  repository-relative paths present in the index; the system shall not render a
  link to any location the model supplied as an absolute or external address.
  *Verify: a stubbed response whose link target is an external URL renders no such
  link.*

### Degraded, failed and empty states

- **AC-33** — WHEN a repository's index is degraded, partial, absent, or still
  being built, the system shall render the deterministic skeleton — the facts it
  does have, with no narrative prose — together with a status indicator naming the
  reason.
  *Verify: for each degraded reason the index layer can report, the page renders
  the skeleton with that reason stated.*
- **AC-34** — IF the structured call fails, times out, or returns a response that
  cannot be validated after its permitted attempts, THEN the system shall render
  the skeleton with a status indicating the generation failed, shall offer a
  retry, and shall never display model-authored prose from a failed generation.
  *Verify: a stubbed provider that always fails validation yields a skeleton and a
  failure status, and no partial narrative.*
- **AC-35** — The skeleton shall contain no prose narrative and no diagram: it
  presents the detected stack, the ranked file list, the collected setup steps,
  and the detected routes as facts, each attributable to its evidence.
- **AC-36** — The system shall not store a skeleton as if it were a generated
  tour, so that a failed or degraded rendering never later appears as a
  successfully generated one.
- **AC-37** — WHEN a repository has no checkout and no index at all, the system
  shall render an explanatory empty state naming what is missing and the action
  that would resolve it, rather than an error or an empty page.
- **AC-38** — IF generation is triggered while the repository's index is degraded
  or absent, THEN the system shall refuse to make the LLM call and shall explain
  why, rather than generating a narrative from an empty fact set.
  *Verify: triggering generation on an unindexed repo produces zero provider calls
  and a stated reason.*

### Client surface

- **AC-39** — The tour page's URL path shall not contain the segment
  `onboarding`, and the sidebar shall highlight the Onboarding Tour entry when a
  tour page is open and shall not highlight it on the add-a-repository screen.
  *Verify: navigating to the add-a-repository screen leaves the Onboarding Tour
  nav entry unhighlighted.*
- **AC-40** — WHEN a tour is rendered, the page shall present a table of contents
  listing exactly the five sections of AC-16, each linking to its section.
- **AC-41** — The system shall render model-authored and repository-derived text
  through the product's existing sanitized markdown renderer and its existing
  validated Mermaid renderer, and shall not render supplied HTML as markup.
  *Verify: a stubbed section body containing a script tag renders as visible text,
  not as markup.*
- **AC-42** — IF a supplied diagram is not a valid Mermaid diagram, THEN the
  system shall render that section without a diagram rather than an error state or
  a broken graphic.
- **AC-43** — The system shall present setup steps as copyable text only, and
  shall not execute, evaluate, or offer to execute any command shown in a tour.
  *Verify: the page exposes no control whose action runs a command.*
- **AC-44** — WHEN a user opens a critical-path or reading-path entry, the system
  shall navigate to that file on the repository host at the revision the tour
  describes.
- **AC-45** — WHEN the tour page's status changes — generating, generated, stale,
  degraded, failed — the system shall announce the new status to assistive
  technology.
- **AC-46** — Every action on the tour page — generate, regenerate, copy a setup
  step, open a file, jump to a section — shall be operable from the keyboard.

### Cross-module access

- **AC-47** — The system shall expose the current tour over the MCP server as a
  read-only tool that returns either the stored tour or the skeleton with its
  status and reason.
- **AC-48** — The MCP tool shall never trigger a generation and shall never cause
  an LLM call.
  *Verify: invoking the tool against a repo with no stored tour produces zero
  provider calls.*
- **AC-49** — WHERE a tour is requested for a repository outside the caller's
  workspace, the system shall not disclose it, over any surface.

## Edge cases

- **Repository larger than the index bound** — the tour describes the indexed
  subset, which is selected alphabetically by the existing walk, and the
  provenance line states the indexed and excluded counts (D1, AC-18, AC-30).
  This is the mockup's own "12,450 files" case, corrected.
- **Repository the indexer cannot parse at all** (no supported extensions) — no
  graph, no ranks; skeleton with a stated reason (N10, AC-33), generation refused
  (AC-38).
- **Repository just imported, clone in progress** — empty state naming what is
  missing (AC-37); no generation, no spinner-forever.
- **Index degraded mid-way (partial)** — skeleton plus reason; the facts that do
  exist are still shown (AC-33, AC-35).
- **Zero ingested pull requests** — hotness is 0 for every file, the weighted
  score equals pagerank, and the provenance line says zero PRs informed the
  weighting (AC-9, AC-30). This is the current shipped ordering, so the fallback
  is a known-good state rather than a new one.
- **All PR history older than the recency window** — same as zero history
  (AC-9); the window is what makes the signal a *churn* signal rather than a
  lifetime counter.
- **A single file dominating PR history** (e.g. a lockfile or a generated bundle)
  — normalization pins it at `hotness = 1` and everything else compresses toward
  0. The existing junk-path filter that already excludes tests, configs,
  migrations and generated directories from rank-driven samples
  (`repo-intel/service.ts:772-778`) is the mitigation; the reading path must not
  open with a lockfile.
- **Import graph with no edges** — PageRank degrades to a uniform floor today
  (`pipeline/rank.ts:39-47`); a flat structural score multiplied by hotness
  becomes a pure churn ordering, which is still a defensible reading order and
  must not throw.
- **Model returns fewer or more than five sections, or an unknown kind** — the
  response fails validation and takes the AC-34 failure path; no partial tour is
  shown.
- **Model returns a plausible file path that does not exist** — dropped (AC-28).
  This is the tour's equivalent of an ungrounded finding.
- **Model returns a plausible-looking command that no manifest declares** —
  dropped (AC-29). A tour that tells a newcomer to run a command this repo never
  declared is worse than a tour with three steps.
- **Repository whose package scripts contain hostile text** — script strings are
  untrusted repository content: wrapped as data in the request, never executed,
  and shown as copyable text (AC-5, AC-43, Untrusted inputs).
- **Two rapid regenerate clicks** — one call (AC-20).
- **Regeneration fails after a successful earlier tour** — old tour preserved and
  still displayed, failure surfaced (AC-24, AC-34).
- **Index advances while a generation is in flight** — the completed tour records
  the index state it was actually generated from, and is immediately marked stale
  against the newer index (AC-21, AC-23); it is never silently relabelled.
- **A file named in a stored tour has since been deleted** — the entry's link
  targets the indexed revision it described (AC-44), so it resolves; staleness is
  what tells the reader the tour has moved on (AC-23).
- **Path with unusual characters** (spaces, non-ASCII, `#`) — must round-trip
  through the fact set, the response, the grounding check, and the link unchanged.
- **Repository with no PRs and no docs but a full index** — a tour is still
  generatable; every section has deterministic facts behind it.

## Non-functional

- **Cost — one call, and it must be visible.** Generating a tour costs exactly one
  structured request (AC-13). Its model, attempts, token counts and estimated cost
  are recorded at generation time and readable afterwards without instrumenting
  anything (AC-21, AC-30) — the same information the review path already records
  per run (`server/src/modules/reviews/run-executor.ts:426-449`, via
  `platform/price-book.ts:33-38`). The provider's own `StructuredResult` already
  carries `tokensIn`, `tokensOut`, `costUsd` and `attempts`
  (`server/src/vendor/shared/adapters.ts:72-79`), so this is a record of a value
  the call already returns, not a new estimate. **Opening a tour costs nothing**
  (AC-22); nothing generates implicitly (AC-19).
- **Cost — the fact payload is bounded.** Sections are capped (AC-25), the fact
  set is facts-not-contents (AC-5), and the payload is drawn from the already
  token-budgeted index rather than from raw files. The numeric budget is
  delegated to planning (D12).
- **Performance.** Fact assembly is reads over an index that already exists;
  PageRank is already recomputed on every full index and every incremental
  refresh over at most 5,000 nodes (`db/schema/repo-intel.ts:100-104`), and the
  weighted score is a per-file multiplication applied at read time over a bounded
  candidate set, so this feature adds no new graph work. Hotness itself is an
  aggregation over already-persisted PR file rows. Page load of an existing tour must be a
  read, never a generation. Generation is user-initiated and dominated by the one
  LLM call, so its latency budget is that call's.
- **Security — repository content is untrusted, and this feature enlarges what
  reaches the model.** Detected stack values, script strings, route strings and
  file paths all originate in repository content, which on any repo accepting
  outside contributions is attacker-influenceable. They are delimiter-wrapped as
  data under the existing shared injection guard
  (`reviewer-core/prompt.ts`'s `INJECTION_GUARD`; `reviewer-core/CLAUDE.md`
  "Do-not-touch"). No per-field keyword scanning is introduced — that would
  contradict the product's standing rule that one shared guard, not denylists, is
  the defense.
- **Security — path containment on every checkout read.** Stack and setup-step
  detection reads files from the synced checkout. Those reads must be proven to
  resolve inside that repository's checkout before they happen, as SPEC-09
  established for its own reads (SPEC-09 AC-27; the containment rationale in
  `server/src/modules/project-context/paths.ts:1-19` records that other existing
  checkout readers do **not** perform this check).
- **Security — model output is untrusted output.** The tour renders
  model-authored markdown and a model-authored Mermaid diagram in the user's
  browser. Both go through the product's existing hardened renderers — markdown
  without raw-HTML support (`client/src/vendor/ui/primitives/Markdown.tsx`) and
  Mermaid with `securityLevel: "strict"` plus a parse-before-render validation
  (`client/src/components/mermaid-diagram/MermaidDiagram.tsx:36-46`) — and
  model-supplied link targets are constrained to indexed repository paths (AC-32),
  so no supplied address can become an arbitrary or `javascript:` link.
- **Security — no execution surface.** The tour displays shell commands derived
  from repository-declared scripts. Nothing in this feature executes, evaluates,
  or offers to execute them (AC-43); the copy button hands the string to the user,
  who remains the one deciding to run it.
- **Security — no new write surface and no new exposure surface.** The feature
  writes nothing to any checkout or repository (N4) and mints no shareable
  credential or public link (N5, AC-49).
- **Honesty as a quality attribute.** Every state the page can be in — generated,
  stale, degraded, failed, empty — is named on the page with its reason (AC-23,
  AC-30, AC-33, AC-34, AC-37). A tour that cannot say what it was built from is
  not shippable, because a newcomer has no way to discount it.
- **Backwards compatibility.** The shared persisted file rank and percentile keep
  their current structural definition, so repo-map rendering, blast-radius caller
  ordering and conventions sampling are unaffected by this feature and are not
  something it has to regression-test: the churn weighting exists only as a
  read-time derivation inside onboarding, and any hotness-aware read operation is
  additive with today's behavior as the default (D7, AC-11). Making `hotness`
  itself non-zero must leave those consumers' results identical. No existing
  prompt gains or loses a section because of this feature.
- **Accessibility.** Status changes are announced (AC-45); the five-section table
  of contents is a real navigation list (AC-40); generate, copy, open-file and
  section-jump are keyboard-operable (AC-46). Rank order carries meaning, so the
  reading path must convey each entry's position, not only its label.

## Inputs (provenance)

| Input | Provenance |
|---|---|
| Repository structure / directory skeleton | `[reused: the existing repo-intel index and its token-budgeted repo map]` |
| Import graph + PageRank per file | `[reused: the existing file-rank pipeline over the index's file edges]` |
| `hotness` per file | `[deterministic: frequency of that file in the workspace's already-ingested pull-request file history within a bounded recency window, normalized to [0,1]]` |
| Weighted score used by this feature | `[deterministic: pagerank * (1 + hotness), derived at read time within onboarding; never written back to the shared persisted rank]` |
| Guided reading path ordering | `[deterministic: descending weighted rank order, bounded]` |
| Critical paths (dependency chains) | `[reused: the existing rank-seeded dependency-chain walk built for this feature and previously unwired]` |
| HTTP routes / crons | `[reused: the endpoint and cron facts already extracted per file by the index]` |
| Detected stack (language, package manager, frameworks) | `[deterministic: containment-checked reads of the repository's manifests and lockfiles in its synced checkout]` |
| Candidate setup steps | `[deterministic: the repository's declared scripts plus the presence of an environment-example file and a container-compose definition]` |
| Index coverage facts (indexed count, excluded-by-bound count, status, freshness) | `[reused: the existing index state, extended so the bound's overflow is observable]` |
| Model choice for the call | `[reused: the workspace's per-feature model resolution for the onboarding feature]` |
| The five narrative sections (prose, per-entry reasons, diagram, first tasks) | `[new: 1 LLM call — one structured request per generation; provider schema-repair reprompts are attempts of that same request and are counted into its usage]` |
| Token/cost/attempt record of the generation | `[deterministic: the structured result's own reported usage, priced with the existing price book]` |
| Skeleton rendering | `[deterministic: the fact set alone — no LLM call, ever]` |
| Tour served on a page load or over MCP | `[deterministic: a read of the stored tour — 0 LLM calls]` |

## Untrusted inputs

- **Repository file contents read for stack and setup detection** — manifests,
  lockfiles, compose definitions and environment-example files are committed by
  whoever can land a commit, including an outside contributor. Their extracted
  values are **data, never instructions**: delimiter-wrapped under the existing
  shared injection guard, never interpolated into a shell command, never executed.
- **Declared script strings** (`"dev": "…"`) — repository-controlled text that
  this feature deliberately surfaces to a human next to a copy button. Displayed
  as inert text with its evidence file named; never run by DevDigest (AC-43).
- **Repository file paths, symbol names, route strings** — repository-controlled
  strings that travel into the request and into the rendered page. They are label
  data: they must not be interpretable as markup, must not escape the untrusted
  wrapper, and must not become link targets other than indexed repository paths
  (AC-32).
- **Pull-request titles, bodies and file paths feeding hotness** — only the file
  paths and timestamps are consumed, as counts. No PR text reaches the request
  through this feature.
- **The model's own response** — treated as untrusted output, not as truth:
  schema-validated, path-grounded (AC-28), command-grounded (AC-29),
  link-constrained (AC-32), rendered through sanitized renderers (AC-41), and its
  ordering overridden by the weighted rank order (AC-27).

## Flow

```mermaid
sequenceDiagram
    participant U as User / MCP client
    participant UI as Onboarding Tour page
    participant API as Server (onboarding)
    participant RI as repo-intel index
    participant FS as Repo checkout (read-only)
    participant M as LLM (one structured call)

    U->>UI: open tour page
    UI->>API: get current tour
    API->>RI: index state + ranks + graph + routes
    API->>FS: manifests / lockfile / compose / env-example (containment-checked)
    alt a tour is stored
        API-->>UI: stored tour + provenance + stale? (0 LLM calls)
    else nothing stored yet
        API-->>UI: skeleton + provenance + status
    end
    Note over U,UI: nothing is spent until the user asks

    U->>UI: Generate / Regenerate
    UI->>API: generate
    alt index degraded or absent
        API-->>UI: refused, with reason — skeleton stays (AC-38)
    else facts available
        API->>API: assemble fact set (facts only, bounded, no file contents)
        API->>M: ONE structured request → 5 sections
        alt call fails or fails validation
            M-->>API: error / invalid after permitted attempts
            API-->>UI: failure status; previous tour preserved (AC-24, AC-34)
        else success
            M-->>API: sections + optional mermaid diagram
            API->>API: ground — drop unknown paths, ungrounded commands, external links
            API->>API: re-impose weighted rank order on the reading path
            API->>API: store tour + index state + model + attempts + tokens + cost
            API-->>UI: tour + provenance ("N files indexed, M excluded, K PRs weighted")
        end
    end
```

## [NEEDS CLARIFICATION: …]

**None open.** Every question raised during authoring was resolved above, in the
section named after it:

- *What "onboarding" means in this product, and whether it varies by audience or
  by how long the repo has been reviewed* → **D5** (one repo, one current tour,
  aimed at a first-time reader of that repo; no personalization; the months-vs-
  just-imported difference is expressed through hotness and stated in the
  provenance line, not through different prose).
- *Behavior against a very large repository* → **D1, D2, N8** and AC-18, AC-25,
  AC-30 (the index bound is the ceiling; sections are fixed-size; the page states
  indexed and excluded counts instead of the repository's total).
- *What can be shown with no full clone / a degraded or absent index* → **G5** and
  AC-33..AC-38 (deterministic skeleton with a named reason; empty state when
  there is nothing at all; generation refused rather than hallucinated; a skeleton
  is never stored as a tour).
- *Whether hotness must be real from day one* → **D6** (real where PR history
  exists, `0` — i.e. today's behavior — where it does not; no deeper clone).
- *The consequence for existing consumers of the shared `rank`* → **D7**
  (avoided, not accepted: the shared persisted rank keeps its structural
  definition, the weighted score is derived at read time inside onboarding, and
  any hotness-aware read operation is additive — so repo-map, blast-radius and
  conventions sampling are out of this feature's blast radius).
- *The `/onboarding` route/nav collision* → **D10** (both halves in scope).
- *"Regenerate" and caching semantics implied by the mockup* → **D3** and
  AC-19..AC-24.
- *"Share link"* → **D5/N5** (a link to the page, not a published artifact).
- *Whether `reviewer-core` is affected* → **D9** (no, verified against its own
  stated scope).

One item is **delegated, not open**: the numeric token budget for the fact
payload sent in the single call is explicitly handed to
`implementation-planner` by **D12**. The rules that constrain it (facts-only
payload, section caps, drop-don't-truncate) are fixed here; the number is a
planning decision to be documented in the plan, and should not be escalated back.
