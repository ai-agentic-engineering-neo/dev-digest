# Insights — client

Non-obvious findings for agents working in this package, written via the `engineering-insights` skill.
Entries are hints to verify, not rules: if the code disagrees, the code wins — add a `contradicted` comment.
Add only: new entries go last in their section; comments go as indented sub-bullets under the entry they refer to.
Format: `` - YYYY-MM-DD · <insight> — <why>. Evidence: `path` (`symbol`) `` — no line numbers.
Hygiene: monthly `/engineering-insights review` (logged under Review log); split into `INSIGHTS-<domain>.md` past ~100 entries.

## Patterns

## Mistakes
- 2026-11-23 · The React warning "Updating a style property during rerender (borderColor) when a conflicting property is set (borderLeftColor)" in FindingsPanel tests comes from FindingCard, not the panel: `borderColor` is itself a 4-side shorthand, so the "all-longhand" fix in `s.card` still conflicts with `borderLeftColor`. It only fires when a card's `focused` flips on rerender (j/k, severity filter resets focusIdx); fix would be per-side colors (`borderTopColor`/`borderRightColor`/`borderBottomColor`) — old smoke tests never rerendered, so it looked new. Evidence: `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingCard/styles.ts` (`s.card`)

## Decisions

## Context
- 2026-11-23 · Import the `Severity` type from `@devdigest/shared` (CRITICAL/WARNING/SUGGESTION), not from `@devdigest/ui` — the UI kit exports its own `Severity` that also includes `INFO`, so UI-typed code would render/count a level the API never returns. `SEV[sev]` still accepts the shared type. Evidence: `client/src/vendor/ui/primitives/tokens.ts` (`Severity`, `SEV`), `client/src/vendor/shared/contracts/findings.ts` (`Severity`)
- 2026-11-28 · `@/*` → `src/*` is configured in `client/tsconfig.json`, yet 29 files still import via `../../../…` (up to 7 levels, e.g. `SettingsModels.tsx`) — use `@/lib/…` / `@/components/…` in new code; nearby relative imports are not the convention. Evidence: `client/tsconfig.json` (`paths`), `client/src/app/settings/[section]/_components/SettingsView/_components/SettingsModels/SettingsModels.tsx`
- 2026-11-28 · Running `next build` in `client/` while `pnpm dev` is up overwrites the shared `.next` and breaks the dev server; to check a production build without stopping dev, build from a scratch dir that symlinks everything in `client/` except `.next` (copy `next.config.mjs`) — that build passed and left the repo untouched. Evidence: `client/next.config.mjs`

## Open Questions

## Review log
