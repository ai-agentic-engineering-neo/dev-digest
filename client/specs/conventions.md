# Conventions Extractor (HW2) — client

Data model, API and extraction pipeline are in
[`server/specs/conventions.md`](../../server/specs/conventions.md).

Status: **implemented 2026-09-26** (`/conventions`, SKILLS LAB nav item,
Settings → Models row already existed, unit tests, e2e flow `11-conventions`).

## Page `/conventions` (`ConventionsView`)

- Repo: the active repo from the shell's repo switcher (`useActiveRepo`,
  stored in `localStorage`). Header: **Conventions in `<repo>`**, then
  «Detected from N sample files · last scan 3m», «Scanning…», or the last
  scan's error.
- **Run Scan** (no scan yet) / **Re-scan** (`useExtractConventions`,
  `POST /repos/:id/conventions/extract`); disabled while a scan runs or the
  repo has no clone. `useConventions` polls every 2 s while `scan.status` is
  `running`.
- Toolbar: **Deselect all**, «N of M accepted», «Show N rejected» toggle,
  and **Create skill**, which appears once at least one candidate is
  accepted.
- `CandidateCard`: rule (italic), category badge, evidence `path:line` with
  a copy button, the snippet, a confidence bar with the percentage, and
  **Accept** (toggles Accepted), **Reject**, **Edit**. Edit swaps the rule
  and category for inline inputs with Save / Cancel; nothing navigates.
  Rejected cards are hidden by default and offer **Reconsider** when shown.
  All changes go through `useDecideConvention` (`PUT /conventions/:id`) and
  patch the list cache in place, so a reload shows the same state.
- `CreateSkillModal`: fetches the draft (`GET …/skill-draft`), shows the
  banner «Merged from N accepted conventions in repo. Everything below is
  editable before you save.», the existing-skill note when the name is
  taken, then Name, Description, Type, Enabled, **Link to agent** (defaults
  to General Reviewer), and the Skill body textarea with `name.md · ≈ N
  tokens` (chars / 4). Cancel discards; **Create skill** posts
  `…/conventions/skill`, toasts, and opens the new skill on `/skills`.
- States: no repos → «Select a repository»; repo without clone → «Repository
  not cloned yet»; nothing extracted → empty state with a Run Scan CTA;
  everything rejected → «Every candidate is rejected».

## Settings → Models

The **Conventions** row in `FEATURE_MODELS` (`src/lib/feature-models.ts`)
already offered a searchable model dropdown; the extractor reads that
choice through `container.featureModel(workspace, 'conventions')`. On this
machine the workspace override points at OpenRouter because no OpenAI key is
configured.

## Tests

| File | Covers |
|---|---|
| `CandidateCard/CandidateCard.test.tsx` | rule / evidence / confidence rendering, Accept / Reject / toggle / Reconsider payloads, inline Edit → Save payload |
| `CreateSkillModal/CreateSkillModal.test.tsx` | draft prefill, editable name and body, token estimate, create payload with the default agent |
| `../../e2e/specs/11-conventions.flow.json` | nav item, heading with the active repo, not-cloned state on the seeded repo |
