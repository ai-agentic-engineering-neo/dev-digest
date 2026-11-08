# Spec: Onboarding Tour   |   Spec ID: SPEC-02   |   Status: approved
Modules: server · client

## Problem and why

A new team member, or an AI agent starting a task, needs to understand a repository fast: how it is put
together, which files matter, how to run it, what to read first, and what to try first. Reading the whole
codebase takes days. DevDigest already indexes each repo (file rank, import graph) and can find its docs
(SPEC-01). The Onboarding Tour turns that into a short guided tour per repo. Most of it is deterministic;
one model call writes the text. The tour can be copied as Markdown for people and agents.

## Goals / Non-goals

Goals
- A per-repo **Onboarding Tour** page with five fixed sections: Architecture overview · Critical paths ·
  How to run · Guided reading path · First tasks.
- File lists come from the repo index (deterministic); one LLM call per generation writes the text.
- One stored tour per repo, with Regenerate, a stale indicator and Copy/Download as Markdown.

Non-goals
- The first-run setup wizard (`screen_onboarding.jsx`: OpenAI key → GitHub PAT → Add repo). That is the
  existing `/onboarding` add-repository flow and is not part of this feature.
- The design's "Share link". DevDigest is local-first; Copy/Download as Markdown replaces it.
- A new MCP tool. Agents get the tour through the Markdown export.
- An in-app file viewer. File entries open on GitHub.
- Localization of the tour text. It is always English for now; the app ships only the `en` locale.
- Editing the tour by hand, tour history/versions, per-user reading progress.
- Choosing sections or their order.

## User stories

- As a new team member, I open the tour of `acme/payments-api` and learn the architecture, the key files and
  how to start it locally in about 10 minutes.
- As a tech lead, I regenerate the tour after a big refactor and see when it went stale.
- As a developer working with an AI agent, I copy the tour as Markdown into the agent's context.

## Acceptance criteria (EARS)

- **AC-1** WHEN the user opens the Onboarding Tour of a repo that has no tour yet, the system SHALL show an
  empty state that describes the five sections and shows the model to be used, an estimated token count and
  an approximate cost for that model, with a "Generate onboarding tour" action.
- **AC-2** WHEN the user starts generation, the system SHALL show a progress state, then an English tour with
  exactly these sections in this order: Architecture overview, Critical paths, How to run, Guided reading
  path, First tasks. Each section is collapsible and linked from an "On this page" index. First tasks is
  labelled "Suggested by AI".
- **AC-3** The Critical paths and Guided reading path sections SHALL list files chosen from the repo index
  (file rank and import graph) at the indexed commit. Each Critical-paths entry has a one-line role, each
  reading entry has a numbered position and a one-line reason, and each entry's "Open" action opens that
  file on GitHub at the indexed commit.
- **AC-4** The How to run section SHALL have one block for the repo root and one for each top-level package
  that has its own README or run scripts, each with its own ordered commands.
- **AC-5** Every file path, command and script shown anywhere in the tour SHALL exist in the repo at the
  indexed commit (files) or in its manifests/docs (commands). An item that fails this check SHALL be dropped
  before display. A section (or How-to-run block) left with no items SHALL say "Not enough data in this
  repository" instead of showing invented content.
- **AC-6** The Architecture overview SHALL show a short text and a diagram of how the main parts connect.
  IF the diagram can't be rendered, THEN the system SHALL show the section without it and SHALL NOT show an error.
- **AC-7** The tour header SHALL show the repo name, the indexed commit the tour was generated from, the
  indexed file count, how long ago it was generated, the model used, and the tokens and cost of that generation.
- **AC-8** WHILE the repo's indexed commit differs from the commit the tour was generated from, the system
  SHALL show a "Tour is out of date" banner with a Regenerate action.
- **AC-9** IF a generation fails or doesn't finish within 90 seconds, THEN the system SHALL store nothing from
  it, keep showing the previous tour (or the empty state if there was none), and show an error with the
  reason and a Retry action. During a Regenerate the current tour stays visible until the new one is ready.
- **AC-10** WHILE a generation is running for a repo, the system SHALL disable Generate/Regenerate for that
  repo. A second request (another tab or user) SHALL wait for the running generation and not start a
  second model call.
- **AC-11** IF the repo's index is missing or failed, or no model or API key is set up for the onboarding
  feature, THEN the system SHALL disable Generate, give the reason, and offer the fix (Resync, or a link to
  Settings).
- **AC-12** IF the repo's import graph is unavailable (partial index), THEN the system SHALL still generate the
  other sections and mark Critical paths and Guided reading path "unavailable" with the reason.
- **AC-13** WHEN the user clicks "Copy as Markdown" or "Download .md", the system SHALL produce the whole
  tour as one Markdown document: the five sections in order, file paths as text, the diagram as a mermaid
  code block, and a header with repo, commit and generation date.

## Edge cases

- **Tiny repo (1–3 files) or no README:** sections or How-to-run blocks may hit the AC-5 "Not enough data"
  state. How to run falls back to manifest scripts, if any.
- **Huge repo (10k+ files):** inputs to the model are capped (top-ranked files + project docs within 3,000
  tokens), so cost stays near the estimate. The header shows the real file count.
- **Monorepo:** How to run has a root block plus one per top-level package with its own README or run
  scripts (AC-4). Packages without either get no block.
- **Project docs over the 3,000-token budget:** docs are taken whole in priority order (see Inputs). A doc
  that doesn't fit is skipped, never cut. No docs at all → the tour is built from code facts only.
- **Model returns fewer sections, a malformed reply, a reply cut off by the token cap, or a timeout:** the
  generation fails (AC-9). No partial tour is stored or shown.
- **Repo deleted or re-synced during generation:** the generation is dropped. A tour built from a commit that
  is no longer indexed is shown with the AC-8 banner.
- **Very long section text:** sections collapse, and the page index stays usable.

## Non-functional

- **Cost:** exactly one model call per Generate/Regenerate (none on opening, copying or downloading).
  Default model = the "Onboarding" feature model in Settings. Design estimate ~5,000 tokens. The empty state
  shows the real estimate before the user commits (AC-1).
- **Latency:** one generation is limited to 90 seconds (AC-9).
- **Security:** model output is shown as Markdown only (no raw HTML, no scripts). Commands are shown as
  copyable text and are never executed by DevDigest.
- **a11y:** collapsible headers are buttons with an expanded state. The copy and Open actions have accessible names.
- **i18n:** UI text comes from message catalogs. The tour text is English. Code identifiers, paths and
  commands stay verbatim.

## Inputs (provenance)

- File rank, import graph, top files and critical-path chains, indexed commit, file count:
  `[deterministic: repo-intel index]`.
- File tree, top-level packages, package manifests and their run scripts: `[deterministic: repo clone at the indexed commit]`.
- Project docs: `[reused: SPEC-01 doc discovery]`.
  - Budget: 3,000 tokens, whole docs only.
  - Priority: root README → package READMEs → `docs/` → `specs/` → `INSIGHTS.md`.
  - Independent of any agent's attachments.
- Architecture text and diagram, one-line roles and reasons, How-to-run steps, First tasks:
  `[new: 1 LLM call per generation]` (onboarding feature model, ~5,000 tokens per the design). The
  deterministic file lists go into this call; the model writes text around them and doesn't choose the files.
- Grounding check (AC-5) and GitHub links (AC-3): `[deterministic: repo clone at the indexed commit + repo remote]`, no LLM.

## Untrusted inputs

READMEs, docs, `INSIGHTS.md`, file names, manifest scripts and code excerpts are repository content that
goes straight into the LLM prompt. They are always data, never instructions:
- They go to the model inside untrusted blocks with the injection guard. Instructions or role changes inside
  them don't change what the generator does.
- The model's reply is untrusted too: paths and commands are checked against the repo (AC-5), Markdown is
  rendered without HTML, and an invalid diagram is dropped (AC-6).
- Commands are only displayed, never run.

## Module interactions

- **repo-intel (server):** provides ranking, import graph and index state. Index missing → AC-11;
  partial → AC-12. Slow indexing shows as "index not ready" with Resync.
- **Project Context Folder (SPEC-01):** provides the doc list. If none are found, the tour is built from
  code facts only.
- **Settings (feature models, API keys):** the onboarding model, its key and the pricing used for the AC-1
  estimate. Missing model or key → AC-11. Provider down or slow → generation fails or times out (AC-9).
- **GitHub:** file "Open" links point at the repo's remote at the indexed commit, like Blast Radius links. No
  GitHub API call is made.
- **Blast radius / intent:** not used. The tour is per repo, not per PR.
- **MCP server:** not involved (no new tool).

## Design review

Sources: `docs/design/devdigest-2/screen_tour_context.jsx` (N5 Onboarding Tour: five sections, diagram,
"On this page" index, Regenerate, Share link, empty state with the "30–60s, ~5,000 tokens" estimate);
`screen_onboarding.jsx` (the first-run setup wizard, not this feature); the standalone HTML for the app
frame; the existing onboarding prompt and UI copy in the repo, which list other sections.

User decisions:
- **Conflict:** three section lists (design, existing UI copy, existing prompt). → Design N5. The existing
  prompt and copy must be brought in line with it.
- **Replaced:** "Share link" → Copy / Download as Markdown. This also gives agents access to the tour.
- **Gap:** monorepo How to run. → Root block plus one per top-level package (AC-4).
- **Gap:** "Open" target. → GitHub at the indexed commit (AC-3).
- **Accepted proposal:** the empty state shows a real estimate: model, tokens, approximate cost (AC-1).
- **Accepted proposal:** First tasks is labelled "Suggested by AI" (AC-2).

Other notes:
- **Misread source:** `screen_onboarding.jsx` is the setup wizard. → Non-goal here.
- **Missing states added:** generating (AC-2), failure or timeout with the previous tour kept (AC-9), stale
  (AC-8), concurrent generation (AC-10), index or key missing (AC-11), partial graph (AC-12), empty section (AC-5).
- **Corner case:** the design shows a hand-drawn diagram, but a generated one may not render (AC-6).

## [NEEDS CLARIFICATION]

none
