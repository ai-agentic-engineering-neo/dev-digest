# 04 — Conventions extractor (client)

Server half + API: [`server/specs/04-conventions.md`](../../server/specs/04-conventions.md).
Design reference: Skills Lab → Conventions (list with Accepted/Reject buttons, and the
"Create skill from conventions" modal).
Status: **in progress** (2026-09-22).

## Route + nav

- `src/app/repos/[repoId]/conventions/page.tsx` → async server component → client
  `<ConventionsView repoId>` (pattern of `repos/[repoId]/pulls`).
- Nav: `SKILLS LAB` gets **Conventions** (`ListChecks`, `/repos/:repoId/conventions`,
  `g c`) after Agents. `app-shell/helpers.ts` already maps `/conventions`.
- Breadcrumb: `Skills Lab › Conventions` (messages `conventions.page.crumb*`).

## Screen (`ConventionsView`)

- Header: `Conventions in <repo name>` · subtitle `Detected from N sample files · last
  scan <relative>` · **Re-scan** / **Run extraction** button (spinner "Scanning…" while
  the scan is `running`). While running, the state query polls every 2 s.
- Failed scan → an inline error banner with `scan.error`.
- Toolbar: filter chips `All · Pending · Accepted · Rejected` with counts,
  `N of M accepted`, **Accept all pending** / **Clear accepted** (the mock's "Deselect
  all"), **Create skill** (primary, disabled with 0 accepted).
- Card per rule: category badge, rule (italic title), `Edit` (pencil) switches to an
  inline form (rule textarea + category select, Save/Cancel), primary evidence
  block `path:start-end` with a copy button and the snippet in mono, `+N more places`
  expander for the other evidence, confidence bar (green ≥ 0.8, amber ≥ 0.6, red
  below), an "edited" marker, a "in skill <name>" link when `skill_id` is set.
  Right column: **Accept** (filled when accepted) and **Reject** (filled when rejected).
  Clicking the active one again resets the rule to pending. The left border is green
  when accepted, muted when rejected.
- Dropped candidates: a collapsed section "N candidates dropped by the evidence
  check", listing rule · path · reason (i18n per reason).
- Empty state (no scan yet): title/body/CTA from `conventions.page.empty`.

## Create skill modal (`CreateConventionSkillModal`)

- Info banner: "Merged from **N accepted conventions** in <repo>. Everything below is
  editable before you save."
- Fields: Name (default `<repo-name>-conventions`, slug-validated), Description
  (default `N house conventions extracted from <repo>`), Type (default `convention`),
  Enabled toggle (default on; hint "Whether this block is added to agents' prompts"),
  **Link to agents** (checkbox list of agents), Skill body (mono editor, header
  `<name>.md` · `unsaved` · `~N tokens`).
- Body draft = `buildSkillDraft(repoName, accepted)` (pure helper, unit-tested):
  ```
  # <name>

  House conventions for `<repo>`. Flag changes that violate any rule below and cite the offending `file:line`.

  ## <category>: <rule slug>
  <rule>

  Detected in `<path>:<start>-<end>`:
  ```<lang>
  <snippet>
  ```
  ```
- Footer: "Saved as v1 · added to Skills Lab" · Cancel · **Create skill**.
  POST `/repos/:id/conventions/skill`. On success: toast with a link to the skill,
  close, and refresh conventions, skills and agent links. 409 `conflict` → inline error
  under Name (the mutation sets `meta.quietErrorCodes`).

## Hooks (`src/lib/hooks/conventions.ts`, keys in `keys.ts`)

- `conventionKeys.state(repoId)` under `repoKeys.detail(repoId)`.
- `useConventions(repoId)` (polls while `scan.status === 'running'`),
  `useExtractConventions(repoId)`, `useUpdateConvention(repoId)` (optimistic),
  `useCreateConventionSkill(repoId)` (invalidates conventions, `skillKeys.list`,
  `agentKeys.skillsAll`, `skillKeys.agentsAll`).

## Acceptance criteria

1. The empty repo shows the empty state. Run extraction → scanning state → the list appears.
2. Accept / reject toggles and "reset to pending" send PATCH and update at once.
3. Edit a rule → saved text shows with an "edited" marker.
4. Create skill is disabled with 0 accepted. With 2 accepted, the modal shows the draft
   with both rules. Editing the name updates the `<name>.md` header, and saving
   posts the edited values.
5. Every string is in `messages/en/conventions.json`. Component tests use
   `renderWithProviders` + `mockFetch`.
