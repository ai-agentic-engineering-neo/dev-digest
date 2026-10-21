# Spec: Onboarding Tour
Spec ID: SPEC-02
Status: draft
Supersedes: —

## Problem and user

A developer who joins a project, or opens an unfamiliar repository, has no quick way to learn how it is built. They read the README, guess which files matter, hunt for the commands that start the project, and ask a colleague what to work on first. DevDigest already clones and indexes every imported repository, but the only trace of an "Onboarding Tour" today is a sidebar label, a model setting (`onboarding` in `FEATURE_MODELS`), an unused `onboarding` table and an unused draft prompt. There is no page.

Users: the **reviewer** or **repo owner** who imports an unfamiliar repository and wants a first-day guide. They notice the gap today when they import a repo and have nothing but the PR list to start from.

## Goals / Non-goals

Goals:
- A per-repository page, `/repos/[repoId]/tour`, reachable from the sidebar item "Onboarding Tour" (WORKSPACE section, between Pull Requests and Project Context) and from the command palette.
- A generated tour in five sections, in this order: Architecture overview, Critical paths, How to run locally, Guided reading path, First tasks.
- Every file path the tour shows is verified against the repository; every run command is verified against a file the code read. The tour never invents either.
- The tour is stored per repository and reloaded without a model call. Regenerate is the only action that costs money, and the page shows its model and cost.
- A previous good tour stays visible while a regeneration runs and after a failed one.
- The page tells the user when the stored tour is older than the repository's latest sync or index.

Non-goals (each is something a user could reasonably expect):
- No in-app file viewer. "Open" goes to GitHub.
- No writing of the tour to the repository folder. `Settings.sync_to_folder` is not read or changed.
- No automatic regeneration after an import, sync or index rebuild.
- No MCP tool for the tour.
- No difficulty, estimate or issue link on a first task, and no GitHub issue lookup.
- No coloured per-node diagram styling and no structured diagram format: the diagram is Mermaid text rendered by the existing `MermaidDiagram`.
- No tour for a pull request, and no multi-repo tour.
- No change to the Add-repository screen at `/onboarding`.
- No confirmation step before generating or regenerating.
- No share link that works on another machine: the link is the local page URL.

## User stories

- US-1 · As a reviewer, I want a generated tour of an unfamiliar repository, so that I understand how it is built before I read any code.
- US-2 · As a reviewer, I want critical paths, a reading order and first tasks that point at real files, so that I can act on the tour without checking it.
- US-3 · As a repo owner, I want to copy the commands that run the project locally, so that a newcomer can start it in minutes.
- US-4 · As a repo owner, I want to see which model wrote the tour and what it cost, and to regenerate only when I choose, so that I stay in control of spend.
- US-5 · As a reviewer, I want to know when the tour is out of date, and to keep reading the old tour while a new one is written, so that regeneration never leaves me with nothing.
- US-6 · As a reviewer, I want to open a file on GitHub and share a link to the page or a section, so that I can show a colleague where to look.

## Acceptance criteria (EARS)

Page, navigation and routes

- AC-1 (US-1) · The system shall serve the tour at `/repos/[repoId]/tour` inside `AppShell`, with the breadcrumb `<owner>/<name> › Onboarding Tour`.
- AC-2 (US-1) · The system shall show a sidebar item "Onboarding Tour" with the nav id `onboarding-tour` **(new, in `client/src/vendor/ui/nav.ts`)**, placed between "Pull Requests" and "Project Context", linking to `/repos/:repoId/tour`, with the shortcut `g t` and a command-palette entry "Go to Onboarding Tour".
- AC-3 (US-1) · WHILE the pathname is `/repos/<id>/tour`, the system shall mark `onboarding-tour` active in the sidebar.
- AC-4 (US-1) · WHILE the pathname is `/onboarding` (the Add-repository screen), the system shall NOT mark `onboarding-tour` active.
- AC-5 (US-1) · The system shall expose `GET /repos/:id/onboarding` **(new)** returning an `OnboardingView` **(new)**: the stored tour (or `null`), the latest run (or `null`), and `stale` (boolean). The route shall read from the database only and make no model call.
- AC-6 (US-4) · The system shall expose `POST /repos/:id/onboarding/generate` **(new)** that answers 202 with the run (`status: running`) and does the work in a background job.
- AC-7 (US-1) · The system shall resolve both routes through `getContext()` and scope the repository to the workspace; an unknown repository shall give 404 in the standard error envelope.

Sections and content

- AC-8 (US-1) · The system shall render exactly five section cards, in this order, with these titles: "Architecture overview", "Critical paths", "How to run locally", "Guided reading path", "First tasks". Each card has an icon tile, the title and a collapse chevron.
- AC-9 (US-1) · The system shall keep the left "ON THIS PAGE" table of contents with one link per section, highlight the section nearest the top of the viewport, and write that section's id to the URL hash with `router.replace`.
- AC-10 (US-1) · WHEN the user clicks a table-of-contents link, the system shall scroll to that section and set the hash.
- AC-11 (US-1) · WHEN the page loads with a `#<section-id>` hash, the system shall scroll to that section once the tour has rendered.
- AC-12 (US-1) · WHEN the user clicks a card's chevron, the system shall collapse or expand that card. Collapsed state is local component state and is not stored.
- AC-13 (US-1) · The Architecture overview card shall show the section `body` through the `Markdown` primitive, followed by the `diagram` through `MermaidDiagram` when the diagram is present and valid.
- AC-14 (US-1) · IF the architecture `diagram` is null or does not validate as Mermaid, THEN the system shall show the `body` alone, with no empty box and no error.
- AC-15 (US-2) · The Critical paths card shall list rows of `path`, a one-line `why`, and an "Open" button.
- AC-16 (US-3) · The How to run locally card shall list numbered rows, each showing one `command` in monospace and a copy button.
- AC-17 (US-3) · WHEN the user clicks a command's copy button, the system shall write exactly that command to the clipboard and show a brief copied confirmation on that row.
- AC-18 (US-2) · The Guided reading path card shall list numbered badges starting at 1, each with the `path` in monospace and a one-line `rationale` below.
- AC-19 (US-2) · The First tasks card shall list 3 to 5 items, each with a `title`, a `why` and its `files` as paths with an "Open" button.
- AC-20 (US-1) · The system shall show the header title "Onboarding for `<repo name>`" with the name in monospace accent colour.
- AC-21 (US-4) · The system shall show a subtitle "Generated from index of `<files_indexed>` files · last refreshed `<relative generated_at>`" built from the stored tour, and the model and cost of that generation (`<provider>/<model>`, `formatCost(cost_usd)`).

Generation and grounding

- AC-22 (US-4) · WHEN the user clicks Regenerate (or the "Generate onboarding tour" button on the empty state), the system shall call `POST /repos/:id/onboarding/generate`.
- AC-23 (US-4) · WHILE a run for the repository has `status: running`, the system shall disable Regenerate and show a spinner on it, and the page shall poll `GET /repos/:id/onboarding` until the run ends.
- AC-24 (US-4) · The system shall allow at most one running run per repository. IF a run is already running and younger than the stale limit, THEN the system shall return it as is. IF it is older than the stale limit, THEN the system shall mark it failed as abandoned and start a new one.
- AC-25 (US-1) · IF the repository has no clone (`clone_path` is null), THEN `POST /repos/:id/onboarding/generate` shall answer 422 and no run shall be created.
- AC-26 (US-1) · The system shall choose the input files in code with no model call: the root README, manifests and scripts files (`package.json`, `Makefile`, compose files, `.env.example`), the top-ranked source files from `repoIntel.getTopFilesByRank`, and the chains from `repoIntel.getCriticalPaths`. Files shall be read through `container.git` and capped per file and in total.
- AC-27 (US-1) · The system shall make one structured model call on the workspace's `onboarding` feature model (Settings → Feature Models; default from `FEATURE_MODELS`), with all file content inside `<untrusted source="path">` blocks.
- AC-28 (US-2) · The system shall drop from the model output every path (critical paths, reading path, first-task files) that is not in the repository's indexed file list or the set of files read.
- AC-29 (US-3) · The system shall keep a run command only when it matches a script name in a read `package.json` (invoked with any package manager) or appears verbatim as a line in a read README, compose file, Makefile or `.env.example`; every other command shall be dropped.
- AC-30 (US-2) · IF a section has no item left after verification, THEN the system shall store it empty and the page shall show that section's explicit empty note. The system shall NOT add a fallback item the model did not return.
- AC-31 (US-2) · The system shall keep the order the model returned for the reading path, and shall number rows from 1 after dropping.
- AC-32 (US-4) · WHEN a run finishes, the system shall store on its run row `status`, `provider`, `model`, `tokens_in`, `tokens_out`, `cost_usd` (from the price book, null when the model is unpriced), `files_indexed`, `error` and timestamps.
- AC-33 (US-5) · WHEN a run finishes with `status: done`, the system shall replace the stored tour and its metadata; WHEN it finishes with `status: failed`, the system shall leave the stored tour unchanged.
- AC-34 (US-5) · WHILE a run is running or after a run failed, the page shall keep showing the last stored tour; after a failure it shall also show the run `error` in an inline error banner.
- AC-35 (US-4) · IF the model output does not match the contract, THEN the run shall end `failed` with an error saying the model returned an invalid tour, and the page shall show it.

Index and staleness

- AC-36 (US-1) · IF the repository index is `degraded`, `partial` or `failed`, or `REPO_INTEL_ENABLED` is off, THEN the system shall still generate, using the file tree and the read files in place of ranks and chains, and mark the tour `limited`.
- AC-37 (US-1) · WHILE the stored tour is `limited`, the page shall show a "Limited: no code index" banner with a "Rebuild index" action that calls `POST /repos/:id/resync` and, once the index state's `updatedAt` advances, refetches the view.
- AC-38 (US-5) · The system shall set `stale` to true when the index `updatedAt` or the repository's `last_polled_at` is later than the stored tour's `generated_at`.
- AC-39 (US-5) · WHILE `stale` is true, the page shall show a hint next to the subtitle saying the repository changed since the tour was generated. The system shall NOT regenerate on its own.

Actions

- AC-40 (US-6) · WHEN the user clicks "Open" on a path and the repository's `full_name` is known, the system shall open `githubBlobUrl(full_name, default_branch, path)` in a new tab with `rel="noopener noreferrer"`.
- AC-41 (US-6) · IF the repository's `full_name` is unknown, THEN "Open" shall copy the path to the clipboard and show a copied confirmation.
- AC-42 (US-6) · WHEN the user clicks "Share link", the system shall copy the page URL (including the active `#section` hash) to the clipboard and show a toast, and the button's tooltip shall say the link works on this machine only.
- AC-43 (US-4) · The system shall show the feature model (`<provider>/<model>`) in the Regenerate button's tooltip and in the empty-state button, taken from the workspace settings.

States

- AC-44 (US-1) · WHILE the view is loading, the page shall show skeletons for the header and the section cards.
- AC-45 (US-1) · IF `GET /repos/:id/onboarding` fails, THEN the page shall show an `ErrorState` "Couldn't load the onboarding tour" with Retry.
- AC-46 (US-1) · IF the view has no stored tour and no running run, THEN the page shall show an `EmptyState` "Generate onboarding tour" naming the five sections, with the generate button.
- AC-47 (US-1) · IF the repository has no clone, THEN the page shall show a "Repository not cloned yet" state and no generate button.
- AC-48 (US-1) · IF `repoId` matches no loaded repository, THEN the page shall show `RepoNotFound`.
- AC-49 (US-1) · WHILE no tour exists and a run is running, the page shall show a "Generating…" state with the model name.

Rendering and safety

- AC-50 (US-1) · The system shall render every Markdown field through the `Markdown` primitive and every diagram through `MermaidDiagram` only; it shall not render model text as HTML.
- AC-51 (US-1) · The system shall validate the stored `json` against the `Onboarding` contract when reading it; IF it does not validate (for example a tour stored in the old shape), THEN the view shall return no tour and the page shall show the empty state.
- AC-52 (US-1) · The system shall never execute a command from the tour; commands are only copied.

Contract and persistence

- AC-53 (US-1) · The system shall change `Onboarding`, `OnboardingSection` and `OnboardingLink` in `server/src/vendor/shared/contracts/knowledge.ts` to the five-kind typed structure below, and the client copy shall be replaced by copying the server file over (this also removes the existing drift in that file).
- AC-54 (US-4) · The system shall add the `onboarding_runs` table **(new)** with a partial unique index that allows one `running` row per repository, and extend the `onboarding` table with the metadata of the stored tour, through `pnpm db:generate`. Migrations shall not run on boot.
- AC-55 (US-1) · The system shall add the new strings under `client/messages/en/onboarding.json` (replacing the old five-section copy), with no hard-coded colours and keyboard-reachable TOC links, chevrons, copy and Open buttons.
- AC-56 (US-1) · The system shall add the new UI pieces (section card, command row, reading-path badge, TOC) to `/showcase`.

Contract shape (new, field names only):
`Onboarding { generated_at, provider, model, tokens_in, tokens_out, cost_usd (nullable), files_indexed, limited, sections: [architecture { title, body, diagram (nullable) }, critical_paths { title, items[{ path, why }] }, run_locally { title, items[{ command, note? }] }, reading_path { title, items[{ path, rationale }] }, first_tasks { title, items[{ title, why, files[] }] }] }`;
`OnboardingRun { id, status (running | done | failed), provider, model, tokens_in, tokens_out, cost_usd, files_indexed, error, started_at, finished_at }`;
`OnboardingView { tour: Onboarding | null, run: OnboardingRun | null, stale }`.

## Edge cases

| Case | What the user sees | Refines |
|---|---|---|
| Tiny repository, one source file | Critical paths and reading path hold at most that file; empty sections show their empty note | AC-30 |
| Huge repository (`repo_too_large` index) | Tour generated from the file-tree fallback, "Limited" banner | AC-36, AC-37 |
| Model returns a path that is not in the repo | The row is dropped silently; no placeholder | AC-28 |
| Model returns a command not found in any read file | The row is dropped; "How to run locally" may show its empty note | AC-29, AC-30 |
| Two clicks on Regenerate, or two browser tabs | One run; the second request gets the running run | AC-24 |
| Run orphaned by a crash or hung provider | After the stale limit the next Regenerate marks it failed and starts a new run | AC-24 |
| Regenerate fails (provider error, 401, timeout, invalid output) | Old tour stays; inline error banner; Regenerate enabled again | AC-33, AC-34, AC-35 |
| No API key for the feature model | The run ends `failed` with the provider error; same banner | AC-34 |
| Repository removed while a run is running | Cascade delete removes both tables' rows; the run's final write finds no repository and ends silently | AC-7 |
| Re-import of the same repository | The stored tour is kept (same repository id) and is marked stale after the next sync | AC-38 |
| Rebuild index finishes after the tour was generated | `stale` turns true; no automatic regeneration | AC-38, AC-39 |
| Clone deleted from disk after generation | Stored tour still loads; Regenerate answers 422 and the page shows the not-cloned state | AC-25, AC-47 |
| Stored tour is in the old `{ kind, title, body, diagram, links }` shape | Treated as no tour: empty state | AC-51 |
| Fenced code block in the architecture `body` | The `Markdown` primitive styles every `code` node as inline code, so a block would render as a flat inline chip. The planner must check this and, if it is confirmed, fix it in the design-system task | AC-13, AC-50 |
| Mermaid invalid or disabled by an unknown keyword | Diagram omitted, body shown | AC-14 |
| Very long path or command | Wraps or scrolls horizontally inside its row; no layout break | AC-15, AC-16 |
| Clipboard API unavailable | The copy button does nothing and shows no confirmation | AC-17, AC-41 |
| `generated_at` in the future (clock skew) | Relative time reads "now" | AC-21 |
| Sidebar repo switched while on the page | The page navigates to the new repository's `/tour` | AC-1 |
| Hash names an unknown section | Ignored; page opens at the top | AC-11 |
| Postgres unavailable | `GET` fails; error state with Retry | AC-45 |

## Non-functional requirements

- Reading the page (`GET /repos/:id/onboarding`) makes no model call and no GitHub call.
- One generation = exactly one model call. Total input read from the repository is capped (suggested caps: 6 000 characters per file, 60 000 in total, as in Conventions); the caps are constants, not user settings.
- Cost and tokens per generation are recorded and shown (AC-21, AC-32); a null cost shows "—".
- Generation runs as a background job and never blocks the request; the stale-run limit is 10 minutes.
- Accessibility: TOC links, chevrons (`aria-expanded`), copy and Open buttons are keyboard operable and have accessible names; colours come from CSS variables only.
- The mutation toast policy of `providers.tsx` applies to Regenerate; a run failure that is already shown in the inline banner shall not also toast.
- Secrets only through `container.secrets`; nothing from the tour or the repository is logged beyond path counts and the run id.
- Server work follows the onion rules: a new `modules/onboarding/` with `routes.ts` · `service.ts` · `repository.ts` · `ports.ts`, services built from ports, `pnpm lint:arch` with no new baseline entries.

## Inputs and provenance

| Input | Source | Provenance | Owner |
|---|---|---|---|
| Repository record (`full_name`, `default_branch`, `clone_path`, `last_polled_at`) | `GET /repos`, `Repo` contract | `[reused: Repo, useRepos]` | repos module |
| Index state (`status`, `filesIndexed`, `updatedAt`) | `GET /repos/:id/index-state`, `repoIntel.getIndexState` | `[reused: IndexState]` | repo-intel |
| Top-ranked source files | `repoIntel.getTopFilesByRank` | `[deterministic: file_rank, junk filter]` | repo-intel |
| Critical-path chains | `repoIntel.getCriticalPaths` | `[deterministic: file_edges + file_rank]` | repo-intel |
| README, manifests, compose, Makefile, `.env.example`, sampled source | `container.git` reads from the clone | `[deterministic: selected in code]` | onboarding module **(new)** |
| Architecture body and diagram, why / rationale / note texts, first tasks | one structured model call on the `onboarding` feature model | `[llm: onboarding]` | onboarding module **(new)** |
| Verified paths and commands | code check against indexed files and files read | `[deterministic: verification]` | onboarding module **(new)** |
| Feature model choice | Settings → Feature Models, `FEATURE_MODELS.onboarding` | `[reused: featureModel, FEATURE_MODELS]` | settings |
| Tokens and cost | provider usage and the price book | `[reused: price book]` | platform |
| Stored tour and run rows | `onboarding` (extended), `onboarding_runs` | `[new]` | onboarding module **(new)** |
| `stale` | index `updatedAt`, `last_polled_at`, `generated_at` | `[deterministic: timestamp comparison]` | onboarding module **(new)** |
| GitHub blob URL | `githubBlobUrl(full_name, default_branch, path)` | `[reused: lib/github-urls.ts]` | client |
| Section layout, copy, states | the two design screenshots; section text for the missing "First tasks" card decided with the user | `[new]` | design |
| Prompt | `server/src/prompts/onboarding.system.md`, rewritten for the five kinds | `[new]` | onboarding module **(new)** |

## Untrusted inputs

| Input | Handling |
|---|---|
| Repository files (README, manifests, source, compose, `.env.example`) | Sent to the model only inside `<untrusted source="path">` blocks; the prompt states they are data, never instructions. Capped in size. Read only through `container.git`; paths come from the index or a fixed list, never from the user or the model. |
| File names and the file tree | Treated as data; never concatenated into instructions outside an `<untrusted>` block. |
| Model output (bodies, texts, paths, commands, diagram, first tasks) | Parsed against the contract. Paths and commands are verified (AC-28, AC-29) before storing. Markdown is rendered without raw HTML; the diagram is rendered by `MermaidDiagram` (`securityLevel: strict`, validated); commands are only copied, never run; `Open` URLs are built by the client from the verified path, not taken from the model. |
| Stored `json` read back from the database | Validated against the contract on read (AC-51); anything else is treated as no tour. |
| The `#section` URL hash | Matched against the five fixed ids; anything else is ignored. |

## Open questions

- Fenced code blocks in `body`: the `Markdown` primitive renders them as inline code. Suggested answer: the planner confirms, and if confirmed the design-system task adds block rendering (`pre`). What changes: AC-13 and the "Design-system task: yes" scope grow beyond `nav.ts`.
- Per-file and total input caps (6 000 and 60 000 characters) are copied from Conventions, not decided by the user. Suggested answer: keep them as constants. What changes: AC-26 and the cost estimate per tour.
- Stale hint wording and the "repository's last sync" source (`last_polled_at`): the user confirmed the rule, not the copy. Suggested answer: use the wording in `onboarding.json`, and review it during approval. What changes: AC-38, AC-39.
- First tasks was not in the screenshots: its card layout (title, why, file rows with Open) is inferred from the other cards. Suggested answer: approve the layout when the design is available. What changes: AC-19 and the `/showcase` piece.
