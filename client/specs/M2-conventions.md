# M2 — Conventions Extractor (client)

Status: built

## Problem

Users need a screen to run the extractor, judge each candidate against its code
and turn the accepted ones into a skill.

## Goals

- `/repos/:repoId/conventions` (sidebar: Skills Lab → Conventions, `g c`).
- Empty state with **Run extraction**; after a scan: summary, `N of M accepted`,
  **Re-scan**, **Create skill** (disabled with no accepted candidate).
- Card: rule (click to edit inline), category and Accepted/Rejected badges,
  evidence `path:start-end` linked to GitHub at the default branch, snippet,
  confidence bar, Accept / Reject (pressing again resets to pending).
- Modal: Name (`repo-conventions`), Description, Enabled (off by default) and
  the Markdown body generated from accepted candidates grouped by category;
  Cancel / Create skill.

## Behaviour

- Loading → skeleton; load error → `ErrorState` with retry; extraction error →
  inline alert with the server message.
- Accept/reject/edit update the list optimistically and roll back on error.
- After saving, an inline notice links to the new skill.

## Changes

- Route `src/app/repos/[repoId]/conventions/` with `ConventionsView`,
  `ConventionCard`, `CreateConventionSkillModal`.
- Hooks `src/lib/hooks/conventions.ts`, key `queryKeys.conventions`.
- `SkillBodyEditor` moved to `src/components/skill-body-editor/` (shared by
  Skills and Conventions).
- Nav item in `src/vendor/ui/nav.ts`; texts in `messages/en/conventions.json`.

## Tests

Helpers (`scanAge`, `evidenceLocation`, `evidenceUrl`, `buildSkillBody`, …) and
`ConventionsView.test.tsx`: run → evidence link → accept one, reject one →
modal → POST body carries only the accepted id and rule.

## Related specs

- [server/specs/M2-conventions.md](../../server/specs/M2-conventions.md)
