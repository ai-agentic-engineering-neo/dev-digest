# Conventions Extractor — client

Server half: [../../server/specs/conventions.md](../../server/specs/conventions.md).

## Goal

As a user I can:
- run the conventions analysis on a repo;
- see every convention found;
- accept, reject or edit each one;
- open the skill editor built from the ones I accepted, edit its text and metadata;
- save the skill, or cancel.

This follows the "Conventions" and "Create skill from conventions" designs.

## Scope

### Nav
SKILLS LAB → **Conventions** (`/repos/:repoId/conventions`, `g c`, icon `ListChecks`), next to
Skills and Agents. It uses the active repo. An unknown `:repoId` shows `RepoNotFound`.

### `/repos/[repoId]/conventions` — `_components/ConventionsView`
- **Header.** Title "Conventions in **<repo>**" (accent, mono).
  - Subtitle after a scan: "Detected from N sample files · M candidates dropped (no evidence)".
  - Otherwise: "N candidates · grounded against sampled files", or the intro text.
- **Re-scan** button (with a loading state) once candidates exist.
- **Empty state** with **Run extraction**. An extraction error appears as a toast.
- **Toolbar:**
  - **Deselect all** when something is accepted, otherwise **Accept all**;
  - "A of N accepted";
  - **Create skill** (primary), disabled with a hint until at least one convention is accepted.
- **`ConventionCard`, one per candidate:**
  - Rule in italic bold, with its category. A pencil switches to inline edit (Enter saves, Esc
    cancels).
  - Evidence box: header `path:start-end` with a copy button (copies the ref and the code), and
    under it the real code lines from the file.
  - Confidence bar plus %: green from 80%, amber from 50%, red below.
  - Right column:
    - **Accepted / Accept**: clicking Accepted again un-accepts.
    - **Reject / Undo**: Undo puts a rejected card back to pending.
  - Accepted cards have a green left border; rejected cards are dimmed.
- Status changes and rule edits are optimistic (`useUpdateConvention`) and roll back on error, with
  a toast.

### `CreateConventionsSkillModal`
- Loads the draft built on the server (`GET …/skill-draft`) and seeds the form once; a later
  refetch does not overwrite edits.
- Banner: "Merged from **N accepted conventions** in <repo>. Everything below is editable before
  you save."
- Fields:
  - Name (kebab-case);
  - Description (directive);
  - Type and an **Enabled** toggle side by side ("Whether this block is added to agents' prompts.");
  - **Attach to agent**, optional; the default is "Don't attach";
  - **Skill body** editor with a `<name>.md` header, an `unsaved` badge and "~N tokens".
- Footer: "Saved as v1 · added to Skills Lab", **Cancel** (nothing saved) and **Create skill**.
- On success:
  - a toast ("created" or "created and attached to <agent>");
  - the `skills`, `skill-usage` and the agent's `agent-skills` caches are invalidated.

### Data
`src/lib/hooks/conventions.ts`:
- `useConventions`
- `useExtractConventions` (writes the result to the cache)
- `useUpdateConvention` (optimistic)
- `useSetAllConventions`
- `useConventionsSkillDraft`
- `useCreateConventionsSkill`

Query key: `["conventions", repoId]`.

## Acceptance criteria
`ConventionsView.test.tsx`:
1. The empty state runs the extraction.
2. Cards show the evidence ref (`path:23-31` or `path:1`), the confidence % and "1 of 2 accepted".
3. Accept → `accepted`, Accepted → `pending`, Reject → `rejected`.
4. Inline edit sends `{ rule }`.
5. Accept all / Deselect all; Create skill is disabled with 0 accepted.
6. The modal is prefilled from the draft; edits to the description, body and agent are sent as is;
   the modal closes on success.
