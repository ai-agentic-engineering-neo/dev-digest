# INSIGHTS — client

Practical findings hit while working in this module. Append-only: correct a
stale entry with a new dated line — never silently edit or delete history.

Before writing here, check [CLAUDE.md](CLAUDE.md) — a finding that should
*always* apply belongs there as a standing rule. This file is for things too
specific, too contextual, or too unproven for that yet.

**Anti-vague test:** if someone who just read the code wouldn't be surprised,
don't write it here.

## What Works

## What Doesn't Work

## Codebase Patterns

**2026-09-16** — There is no shared `client/src/lib/format.ts`; small display-formatting helpers (`formatSeconds`/`formatTokens`, now `formatCost`) are deliberately colocated per component tree (`pulls/helpers.ts`, `pulls/[number]/_components/RunTraceDrawer/helpers.ts`, and inline in `ReviewRunAccordion.tsx` next to `formatWhen`) rather than centralized — when a value needs formatting in more than one place, add a small local copy per tree instead of introducing a shared utils module. Evidence: `client/src/app/repos/[repoId]/pulls/helpers.ts`, `client/src/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer/helpers.ts`.

**2026-09-16** — `pulls/page.tsx`'s header row renders generically from `COLUMN_KEYS` (`constants.ts`), so adding a new PR-list column only needs `constants.ts` (new key + wider `GRID`) + the row component (`PRRow.tsx`) + an i18n key under `list.columns` — no separate header-component edit. Evidence: `client/src/app/repos/[repoId]/pulls/page.tsx:100-101`, `client/src/app/repos/[repoId]/pulls/constants.ts:42-49`.

## Gotchas & Recurring Errors

## Open Questions

## Session Notes
