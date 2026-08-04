# server — engineering learnings

**While working:** append only. Read the file before writing — if the lesson
is already here, extend that entry instead of adding a second copy. If one
turns out wrong, add a new entry correcting it rather than editing history.

**During a scheduled review** (quarterly, or when this file stops being
useful): merge duplicates, delete entries about code that no longer exists,
and resolve contradictions explicitly — two entries giving opposite advice
make the agent pick at random. Treat this file as a draft under review, not
as truth; a bad entry is worse than a missing one.

Covers `server/` and its submodules, including
`server/src/modules/repo-intel` (no separate file for it).

## What Works

### 2026-07-28 — per-run cost is already computed; the pipeline just drops it

`reviewer-core` computes cost end-to-end with no extra API calls:
`OpenRouterProvider.completeStructured` (`reviewer-core/src/llm/openrouter.ts`)
asks OpenRouter for `usage: { include: true }`, prefers OpenRouter's own
`usage.cost`, and falls back to the injected `estimateCost` (wired from
`platform/price-book.ts` → `adapters/llm/pricing.ts` in `container.ts`).
`reviewPullRequest` then sums it into `ReviewOutcome.costUsd`.

Commit `d45ab0d` removed only the *persistence* of that value, not its
computation — `run-executor.ts` was destructuring `const { tokensIn,
tokensOut, grounding } = outcome;` and silently discarding `costUsd`. So
surfacing run cost is a wiring job (schema column + `completeAgentRun` +
contracts), never a provider/pricing job. Check what `ReviewOutcome` already
carries before adding anything to the LLM path.

Caveat from `reviewer-core/src/review/run.ts`: on the map-reduce strategy
`costUsd` collapses to `null` if *any* chunk lacks a cost — so null means
"unknown", and must not be rendered as $0.

### 2026-08-03 — the `conventions` table and `getConventionSamples` sat fully-provisioned and completely unused for a whole lesson

Before the Conventions Extractor (specs/03) was built, the `conventions`
table, the `ConventionCandidate` contract, the `conventions` `FeatureModelId`
(wired into Settings), and `repoIntel.getConventionSamples(repoId, n)` all
already existed in the tree — zero readers, zero writers, zero routes. Only
`repoIntel.getConventionSamples` had a real implementation (it's just
`getTopFilesByRank` under a different name); everything else was schema/
contract scaffolding waiting for a module. Before assuming a feature needs
new schema, grep for its likely table/contract name — this repo tends to lay
groundwork a lesson or two ahead of the code that uses it.

Because the table had never been written to, redesigning it in place (tri-state
`status` instead of a boolean `accepted`, added `scan_id`/line-range/`category`
columns) was free — no migration had to preserve old rows, no back-compat
shim needed. Confirm "unused" with a repo-wide grep for the table/type name
before assuming the same is safe elsewhere.

## What Doesn't Work

### 2026-08-04 — `reviews.it.test.ts`'s "runs a review" test intermittently times out because `intentService.resolve()` makes a REAL OpenRouter network call on a dev machine with real secrets configured

`test/reviews.it.test.ts`'s `appWith()` helper only overrides `llm: { [provider]: mockLLM }` for `openai`/`anthropic` — never `openrouter`. `review_intent`'s `FEATURE_MODELS` default is `openrouter`/`deepseek-v4-flash` (unchanged since L03 v1), so every `executeRuns` batch's intent-resolution step calls the REAL, un-mocked `container.llm('openrouter')` → a genuine network call to OpenRouter, IF `~/.devdigest/secrets.json` has a real `OPENROUTER_API_KEY` (as it does on a dev machine that's used the app for real). Without that key it fails fast with a `ConfigError` (no network attempt) and the flake doesn't happen — this is why it may not reproduce in a clean CI sandbox.

Measured with temporary timing instrumentation: the intent-resolution block took anywhere from ~500ms to 3.4s+ across repeated runs of the same test, depending on network conditions and how many other testcontainers/`.it.test.ts` files were running in parallel. `test/helpers/runs.ts`'s `waitForPrRuns` has only a 10s default timeout — under load (e.g. the full `pnpm test` run, 30+ files, several spinning up their own Postgres testcontainer), the review run can genuinely take longer than 10s end-to-end and `waitForPrRuns` gives up early, so the test reads back zero persisted reviews (`expect(reviews).toHaveLength(1)` fails with `+0`, or a later test in the same file reads `reviews[0]` as `undefined`). Confirmed NOT a functional regression: re-running the same test file in isolation, or the full suite at a quieter moment, passes cleanly every time (verified twice, including a full 34-file/216-test green run) — this is a pre-existing timing race between a live network call and a fixed local timeout, present since L03 v1 shipped `intentService.resolve()` with this same provider default, not something introduced by the revision-2 (scope-based) rewrite. If this test starts failing, check whether it's this race before suspecting the diff — rerunning it alone, or bumping `waitForPrRuns`'s `timeoutMs`, is the fix, not touching `run-executor.ts`/`intent/service.ts`.

### 2026-08-03 — `drizzle-kit generate` hangs (spins CPU, never prompts, never exits) under piped/non-TTY stdin when it needs a rename-ambiguity answer

Dropping a column and adding several new ones to the same table in one
schema-change pass makes `drizzle-kit generate` ask an interactive "is this a
rename?" question via a raw-mode terminal prompt. Piping input at it
(`yes "" | pnpm db:generate`, `pnpm db:generate < /dev/null`) does not answer
the prompt — the prompt library needs a real TTY for `setRawMode`, and
without one it spins at ~90%+ CPU indefinitely rather than erroring or
defaulting. `< /dev/null` alone hung for 90+ seconds before being killed; no
timeout, no visible progress.

Fix: split the schema change into two generate passes that are each
unambiguous on their own — pass 1 adds only new columns (temporarily keep the
old column so nothing is dropped, no rename candidate exists), pass 2 removes
the old column alone (nothing new was added, so nothing to rename it *to*).
Two small migrations instead of one, but `pnpm db:generate < /dev/null` then
exits cleanly with no prompt at all. Do this preemptively for any migration
that both drops and adds columns on the same table — don't discover the hang
by waiting on it.

## Codebase Patterns

### 2026-08-04 — the seeded `acme/payments-api` PR #482 has non-zero `additions`/`deletions` but empty `patch` text on every `pr_files` row, and `files_count` (9) doesn't match the actual seeded row count (4)

Verified building Smart Diff (specs/06-smart-diff.md) against this PR — it's
the same PR the course's Smart Diff mockup screenshot uses (`src/middleware/
ratelimit.ts`, `src/api/public/webhooks.ts`, `src/api/users.ts`,
`src/config.ts`), so it's a likely target for future demos/screenshots of any
diff-rendering feature. `GET /pulls/:id` returns real `additions`/`deletions`
per file but `patch: null` for all four rows, so `DiffViewer`/`FileCard` (and
now `SmartDiffViewer`) correctly render "No diff text available" for every
file — this is NOT a bug in the diff renderer or the classifier, it's how the
seed data was authored. Also `pull_requests.files_count` is seeded as `9`
while only 4 `pr_files` rows actually exist for this PR — another seed-data
mismatch, not a bug in whatever reads `files_count` vs. `files.length`. If a
future session sees "Files changed · 9 files" but only 4 file cards render,
or an empty diff body on this specific PR, check the seed data before
suspecting the feature under test.

### 2026-07-28 — list endpoints denormalize per-PR data with IN-query + JS grouping, not SQL joins

`GET /repos/:id/pulls` (`modules/pulls/routes.ts`) does not join `reviews` or
`agent_runs`. It collects `prIds`, runs one `inArray(...)` query ordered
`desc(createdAt/ranAt)`, and takes first-seen-per-PR in a JS `Map` as "the
latest". Follow that shape when adding another per-PR column (I added the
`latestRunByPr` block for tokens/cost this way).

Non-obvious part: the newest `agent_runs` row for a PR is frequently *not*
`done` (still running, or failed). Gate on `status === 'done'` when building
the map, otherwise the list shows a half-finished run's zeroed tokens — or
worse, silently falls through to an older run's numbers as if they were
current.

### 2026-07-28 — `vendor/shared` copies have already drifted

Diffing `server/src/vendor/shared` against `client/src/vendor/shared` shows
they're not identical: server has `sessionId`, the `openrouter` provider id,
`CommitFile`/`CommitFilesPayload` that client's copy lacks. There is no sync
script — editing a shared contract in one copy does not propagate to the
other; the other package keeps stale types and still type-checks clean.

### 2026-08-03 — a new module needing another module's repo/service must use the `AgentLookup`-style local port, not a direct import — `pnpm arch` catches it, but only per-file

`no-cross-module` in `.dependency-cruiser.cjs` fires on ANY file inside a
module folder — `service.ts` and `routes.ts` alike, not just services — so
composing a new module (`conventions/{service,routes}.ts`) by importing
another module's repository or service class directly fails CI immediately
(6 errors from one new module in `add page conversations`, 2026-08-03). The
established fix, already used by `reviews/service.ts`'s `AgentLookup`
(`modules/reviews/service.ts:1-12`): declare a narrow interface locally in the
consuming service describing only the methods it calls, and let the real
class satisfy it structurally — never import the other module's type. Wire
the concrete instance only at the composition point (`routes.ts`), and if the
dependency is cross-cutting (a repository, or a same-shaped instantiation
every module would otherwise repeat), promote it to a `platform/container.ts`
getter (`container.repoRepo`, `container.skillsService`) instead of
`new XRepository(app.container.db)` inline in the route — mirrors the existing
`agentsRepo`/`skillsRepo`/`reviewRepo` getters. `service.ts` files additionally
may not import `Container` at all (`no-container-in-services`), including
type-only — so a container-dependent helper (e.g. `resolveFeatureModel`) needs
its signature narrowed to the one thing it actually reads (here: `Db`, not the
whole `Container`) before it can be called from a `service.ts` at all, and
before `container.ts` can wrap it as a method without creating an import cycle
(`container.ts → feature-models.ts → container.ts`).

### 2026-08-04 — a spec's "byproduct" claim about existing behavior can be stale; verify against the adapter, not just the route it cites

specs/05-intent-layer.md's Scope item 8 asserted `PrDetail.linked_issue` is
"defined but never set by either branch of `GET /pulls/:id`
(`modules/pulls/routes.ts:218-309`)". Reading only that route file, the claim
looks right. It's actually stale: `OctokitGitHubClient.getPullRequest`
(`adapters/github/octokit.ts`) already resolves `linked_issue` itself, via its
own private `resolveLinkedIssue` (regex over the PR body + a `getIssue` call),
and `pulls/routes.ts`'s GitHub-refreshed branch already returns it by
spreading `...detail`. Only the OFFLINE/persisted branch never sets it — and
it structurally can't (no column to cache it in, no GitHub client available
offline to fetch it with), so that's not a gap either, just the same offline
posture every other GitHub-refresh field in this route already has. Net
effect: nothing needed to change for that scope item. When a spec names a
"today this doesn't happen" gap as justification for new work, check the
actual adapter/service implementation the route calls into before building
the fix — the route file alone can look like the whole story and not be.

**Follow-up (same day, caught by `plan-verifier`):** "nothing needed to
change" was true for the *output* (the field was already populated) but false
for the spec's actual instruction, which was "shared, not duplicated — put
the regex+fetch pair in `_shared`". The new `_shared/linked-issue.ts` got
built exactly as specified, but nobody deleted the old private
`resolveLinkedIssue` in `octokit.ts` (a weaker regex — no past-tense
"closed"/"fixed", no word boundary on the bare-issue match) — so two
implementations of the same lookup existed side by side, one of them dead
code. Fixed by having `getPullRequest` call the shared helper and deleting
the private one. Lesson: "the behavior already exists" and "the plan's
de-duplication instruction was carried out" are two separate claims — verify
both, not just the one that's easier to check by reading the route.

## Tool & Library Notes

## Recurring Errors & Fixes

### 2026-07-28 — `.nullable()` on a shared contract breaks every fixture that builds it

Adding `cost_usd: z.number().nullable()` to `RunStats`/`RunSummary`
(`vendor/shared/contracts/trace.ts`) makes the *key required* — value may be
null, presence may not. Every object literal building one of those types
stops compiling until the field is added, including test fixtures far from
the change (`server/test/contracts.test.ts` `RunTrace` fixture, client's
`RunHistory.test.tsx` / `RunTraceDrawer.test.tsx`).

Use `.nullable()` when siblings are required-but-nullable (`RunStats`,
`RunSummary`); use `.nullish()` for `PrMeta`-style optional-tolerant types
where `score`, `opened_at` etc. are already `.nullish()`. Picking the wrong
one is not caught by tests — it shows up as a spray of TS2741/TS2719 errors
in unrelated files, or as a field that silently goes missing from responses.

### 2026-08-03 — a `*/` inside a JSDoc comment's own text silently truncates the comment, and the cascade of errors points nowhere near the cause

Writing `.claude/skills/*/SKILL.md` or `` `*/SKILL.md` `` inside a `/** ... */`
block (describing a glob path) closes the comment at that literal `*/` —
whatever the comment meant to say next becomes real code. `tsc` doesn't error
at that line; it errors dozens of lines later, wherever the resulting
stray-identifier soup finally produces something structurally invalid
(`TS1127 Invalid character`, `TS1443 Module declaration names...`, `TS1161
Unterminated regular expression`). The line numbers in the diagnostic are
nowhere near the actual bug.

Found in `modules/skills/helpers.ts` (written by an agent, describing
`SKILL.md`-matching glob patterns in its own doc comments) — two separate
occurrences, ~30 and ~90 lines before their respective error clusters started.
The fix is always the same: grep the file for `\*/` and check whether every
hit is an *intentional* comment terminator (`grep -n '\*/' file.ts`, read each
one). When a comment must describe a path containing `*/`, rephrase around it
("matches `SKILL.md` at any depth") rather than writing the literal glob.

### 2026-08-03 — two independent enabled-gates, not one: don't let "disabled" collapse to a single flag

Skills (L02) are gated twice: `skills.enabled` (workspace/vetting — is this
skill trustworthy at all) and `agent_skills.enabled` (per-agent — does *this*
reviewer use it). A skill reaches a prompt only when both are true, and they
must stay genuinely independent columns, not one derived from the other:
disabling a skill workspace-wide must silently drop it from every agent's
prompt while every agent's own checkbox stays visibly checked (so re-enabling
the skill instantly restores every agent that had it), and toggling the
per-agent gate off must NOT delete the `agent_skills` row — deleting it loses
`order`, and re-linking would append the skill to the end of the prompt instead
of restoring its place. `AgentsRepository.setSkillEnabled` upserts in place for
exactly this reason; `AgentsRepository.enabledSkills` ANDs both flags in one
query rather than checking them in two places that could drift apart.

### 2026-08-03 — evidence verification, not model honesty, is what makes "every candidate cites real code" true

The Conventions Extractor's LLM call (`ConventionsService.extract`) is
explicitly instructed to quote real snippets, but the guarantee that evidence
is real does NOT come from the prompt — it comes from
`findSnippetLines` (`modules/conventions/evidence.ts`) re-reading the cited
file off the clone and searching for the snippet (whitespace-normalized) after
the model responds. A candidate whose file is missing or whose snippet isn't
found is dropped before it ever reaches the DB or the UI. Same shape as
`groundFindings` in reviewer-core (never trust a citation without checking it
against the source), but this one runs in the *server* module rather than the
shared review engine, because conventions extraction isn't a
`reviewPullRequest` call at all — one-off structured calls that aren't PR
reviews still need their own citation-checking step; there's no shared gate to
reuse for them.

Also: sample selection for this feature is entirely code — no LLM call. The
mock adapter's `structuredBySchema` comment anticipated a two-step
`ConventionFileSelection` → `ConventionExtraction` dialogue, but the actual
task requirement was explicit that file *selection* is code-driven
(`repoIntel.getConventionSamples` + reading config files off the clone) and
only *extraction* is a model call. Don't assume mock/comment scaffolding
describes the final design — it can describe a design that was later narrowed.

### 2026-08-03 — `GitClient.currentHead(repo: RepoRef)` already resolves a real commit sha; no new method needed to pin evidence links

Needed a commit sha to build GitHub blob URLs for evidence found by scanning a
repo generally (not tied to a PR's `headSha`). `SimpleGitClient.currentHead`
(`adapters/git/simple-git.ts`) already runs `git rev-parse HEAD` — it just
takes a `RepoRef` (`{owner, name}`), not a raw `clonePath` string, and derives
the path itself via `clonePathFor`. Since GitHub blob URLs need
`owner/name` anyway, this was already the right shape with no new adapter
method. Check the `GitClient` interface (`vendor/shared/adapters.ts`) before
adding a path-based read — most of what you'd want (`currentHead`, `readFile`,
`log`) already exists keyed by `RepoRef`.

### 2026-08-03 — the file-import SSRF guard pattern: validate before fetch, size-cap the stream, not just Content-Length

`SkillsService.parseImportFromUrl` fetches a user-typed URL server-side. Two
things worth reusing verbatim for the next feature that does this:
(1) `assertPublicHttpUrl` (`modules/skills/helpers.ts`) is a pure, unit-tested
deny-list (http/https only, refuse localhost/loopback/private ranges/link-local
inc. the cloud metadata address) checked BEFORE the fetch ever fires — a test
asserts `global.fetch` was never called for a blocked host, not just that the
call errors. (2) The response body is read via a manual `getReader()` loop
that aborts once bytes read exceed `MAX_UPLOAD_BYTES`, because a server can lie
about or omit `Content-Length` — trusting that header alone doesn't cap a
slow-drip or large-body response. Both guards are pure/testable without a real
network call (mock `global.fetch` returning a hand-rolled `ReadableStreamDefaultReader`).

### 2026-08-04 — the 2026-08-03 SSRF guard entry above was incomplete: `redirect: 'follow'` walks straight past `assertPublicHttpUrl`, no DNS control needed

`assertPublicHttpUrl` only validates the URL string it's called with — it's
never re-run against a redirect target. `fetchSkillText`
(`modules/skills/service.ts`) fetched with `redirect: 'follow'`, so a host
that passes the check on its own URL (e.g. `https://example.com/skill.md`)
could 302 to `http://169.254.169.254/latest/meta-data` and the fetch would
follow it with zero further validation — no DNS rebinding attack needed, just
one HTTP redirect. Caught by an automated PR review (branch
`feat/L02-page-conversation`), not by the existing unit tests, because every
test's mocked `fetch` returned a terminal response directly.

Fix: `redirect: 'manual'` + a loop that reads `res.headers.get('location')`,
resolves it against the current URL, re-validates it through
`assertPublicHttpUrl` before the next `fetch`, and bails past
`MAX_URL_REDIRECTS` hops (`modules/skills/constants.ts`). Any future
server-side fetch of a user-supplied URL needs the same treatment — passing
the SSRF guard once at the top is not enough if the fetch call itself is
allowed to follow redirects.

Same fix pass also closed a second gap in that code path: the `AbortController`
timeout was cleared in the `finally` right after `fetch()` resolved (i.e. once
headers arrived), but the response body was then read afterward via a manual
`getReader()` loop with no active timeout — a slow-drip body (each chunk under
`MAX_UPLOAD_BYTES` cumulative) could hold the request open indefinitely since
only the byte cap, not a time cap, applied during the read. Fix: keep the
timeout alive for the whole operation (`clearTimeout` moved to run after the
read loop, not after `fetch()`), so an abort during body-reading now also
throws the same "Timed out fetching…" `ValidationError`.

### 2026-08-04 — "restore an old version" needs no new persistence logic on top of an archive-then-bump versioning scheme — it's just `update`, sourced from history

Added `POST /skills/:id/restore` (`{ version }` in the body — matching the
literal route the PR reviewer's comment named, rather than the nested
`/skills/:id/versions/:version/restore` this first shipped with; both are
equally valid REST shapes, this repo just didn't have a precedent either way,
so when a human reviewer names a specific shape, match it over a
self-justified alternative). Flagged as missing by an
automated PR review on `feat/L02-page-conversation`; the client's
`VersionsTab.tsx` and `specs/02` had both explicitly documented "no restore in
v1" as a deliberate exclusion, not an oversight — an automated reviewer has no
visibility into that intent, so treat "missing endpoint" findings against a
documented v1 scope as a prompt to check specs/comments before assuming a gap).

`SkillsService.restoreVersion` (`modules/skills/service.ts`) is three lines:
look up the archived body via the existing `repo.getVersion`, then call
`this.update(workspaceId, id, { body: target.body })` — the same
archive-current/bump-version path a normal body edit already takes. No new
repository method, no new archive-write logic. Two edge cases fall out for
free from existing invariants rather than needing special-casing: (1)
restoring the CURRENT version 404s on its own, because `skill_versions` only
ever holds superseded bodies (see the `INITIAL_SKILL_VERSION` comment in
`constants.ts`) — the current version was never archived, so `getVersion`
correctly can't find it; (2) restoring drops you at a NEW version number
(v1 while at v2 → v3), never back to v1, because `update` doesn't know or
care that the body it received came from history instead of an editor —
history stays append-only with zero extra code to enforce it. When a feature
request is "let the user undo/revert an already-versioned entity," check
whether the existing edit path already produces the right append-only
semantics before reaching for new schema or a soft-delete/rewind concept.

### 2026-08-03 — findings attribution from `run_skills` is RUN-level, not skill-level, and the UI must say so

`run_skills` records which skills were injected into *a run's* prompt, not
which skill produced *which finding* — the model doesn't (yet) name a skill
per finding. So a run that injected four skills has all of its findings
counted toward all four skills' stats. This over-counts by design, and
`SkillsRepository`'s `findingCounts`/`findingsByCategory` comments call it out
explicitly so nobody "fixes" the over-count into a false precision the data
doesn't support. The Stats tab's panel title reflects this too: "Findings in
runs using this skill", never "caused by". If per-finding attribution is ever
wanted, it needs the `Review` schema to carry a skill reference per finding —
a real schema change, not a stats-query fix.

### 2026-08-03 — a reserved-but-unwired column can name the exact integration point for the feature that will fill it

`skills.evidenceFiles` had a code comment in `modules/skills/helpers.ts`
("stays null until the Conventions extractor") for a whole lesson before that
extractor existed. When it was time to populate it, the column existed but
`SkillsService.create`/`SkillsRepository.insert` had never threaded an
`evidenceFiles` field through — the DTO mapper (`toSkillDto`) already read it,
nothing ever wrote it. Threading one optional field through
`CreateSkillInput` → `InsertSkill` → the insert `.values()` was the entire
change; no schema migration needed, since the column had shipped speculatively
in spec 02's migration. When a column's comment names a future feature,
that's usually the whole integration contract, not just documentation.

**2026-08-04 addendum — the same pattern can reserve TWO different integration
points under the same word.** Implementing specs/05-intent-layer.md (L03,
`review_intent`) found `db/schema/reviews.ts`'s `pr_intent` table (columns:
`pr_id`, `intent`, `in_scope`/`out_of_scope` jsonb) plus a `pr_brief` table,
backed by `Intent`/`BlastRadius`/`Risks`/`PrHistory`/`SmartDiff`/`PrBrief`
contracts (`vendor/shared/contracts/brief.ts`, `review-api.ts`) and
`ReviewRepository.upsertIntent`/`getIntent` — all already fully wired
end-to-end at the repository layer, and all completely unused (zero routes,
zero other callers). Grepping "intent" makes this look like the obvious place
to land L03's work. It isn't: it's reserved for the LATER "PR Brief card"
lesson (README's roadmap: L04 Blast Radius, L05 PR Brief card), whose `Intent`
shape (`{intent, in_scope[], out_of_scope[]}`) is richer and serves a
different composed document. specs/05-intent-layer.md never references
`pr_intent` at all — it deliberately defines its own simpler cache (four
nullable columns directly on `pull_requests`) because there's nothing to
accept/reject or version for a single advisory string. Before wiring into a
same-named existing table/contract, confirm which `FeatureModelId` / which
lesson the spec in front of you actually targets — this codebase can reserve
more than one integration point under the same name for different lessons.

**2026-08-04 second addendum — implementing Smart Diff confirmed `SmartDiff`
does NOT need `pr_brief` after all, despite the addendum above grouping it
with `pr_intent` under the same "reserved for PR Brief card" umbrella.**
specs/06-smart-diff.md built `GET /pulls/:id/smart-diff` as fully
compute-on-read (`modules/reviews/smart-diff.ts`'s `buildSmartDiff`, called
from a new `ReviewService.smartDiff`) — no read or write of `pr_brief` at
all, deliberately, to avoid colliding with whatever the later PR Brief card
lesson still wants to do with that table. The `SmartDiff` zod contract
(`vendor/shared/contracts/brief.ts`) was itself the only "reservation" that
mattered here — it needed zero changes, matched the feature exactly, and
`ReviewRepository.getPrFiles`/`reviewsForPull` (both pre-existing, used by
`/pulls/:id/reviews`) were sufficient with no new repository method. Lesson
for whoever eventually builds the PR Brief card: don't assume `SmartDiff`'s
groups/`split_suggestion` still need to be composed into `pr_brief.json` just
because the contract sits in the same file as `PrBrief` — check what shipped
in specs/06 first.

### 2026-08-03 — `.dependency-cruiser-known-violations.json` baselines exact from→to edges, not files — narrowing a param type can silently add a new violation next to an already-ignored one

Changing `getFeatureModelOverride`/`resolveFeatureModel`
(`modules/settings/feature-models.ts`) to take `Db` instead of `Container` (to
break an import cycle — see the port-injection entry above) turned a
type-only `Container` import into a value import of `db/client.ts`. The file
already had a *grandfathered* `db-only-in-repositories` violation for
`db/schema.ts` on the same file, but the baseline matches on the literal
`to` path, so the new `db/client.ts` edge was NOT covered and failed `pnpm arch`
even though it's the same pre-existing class of debt (settings module reads
`t.settings` directly, bypassing a repository). Fix was `pnpm arch:baseline`
(regenerates the whole file) — diff it afterward (`git diff
.dependency-cruiser-known-violations.json`) to confirm it added only the one
expected edge and didn't silently swallow an unrelated new violation elsewhere
in the tree.

### 2026-08-04 — a debug log gated on `container.config.X` breaks every test that builds a partial mock `Container`

Adding `PROMPT_ASSEMBLY_DEBUG` (logs prompt-assembly section name/source/char-length
per run, metadata only, gated by `AppConfig.promptAssemblyDebugEnabled`) as a
plain `this.container.config.promptAssemblyDebugEnabled` check in
`run-executor.ts`'s `runOneAgent` broke 11 tests across 2 files immediately.
Cause: several tests (`test/skills-preview.test.ts` and one other) construct
`ReviewRunExecutor` with a hand-rolled `{ runBus, llm, tokenizer } as unknown
as Container` — no `config` key at all — so `.config.promptAssemblyDebugEnabled`
threw `Cannot read properties of undefined`. Fix: `this.container.config
?.promptAssemblyDebugEnabled` (optional-chain the `config` access itself, not
just the boolean). Generalizes: this codebase's test suite leans on
`as unknown as Container` casts that only populate the fields a given test
actually exercises — any new `container.config.<field>` read added to shared
executor code must optional-chain `config` defensively, or grep
`as unknown as Container` first to see which mocks would need updating
instead.

## Session Notes

## Open Questions
