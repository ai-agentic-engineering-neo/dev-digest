# Insights — @devdigest/web

Durable findings recorded by the `engineering-insights` skill: things that are
true about this code but not visible in it. Append-only — correct a stale entry
with a dated note beneath it, never edit it away.

**Scope:** only what applies to `@devdigest/web`. Findings that cross package boundaries
go in the repo-root `INSIGHTS.md`.

**Lifecycle:** when an entry hardens into a standing rule, move one line of it
into `CLAUDE.md` as a `NEVER`/`ALWAYS` directive and delete the entry here;
bulky reference material goes to `docs/` instead. This file is the staging
area, not the destination.

Sections are fixed — add to the one that fits, never invent a new heading.
Entry format: `.claude/skills/engineering-insights/reference/entry-format.md`.

## Decisions

## What Works

## What Doesn't Work

- **2026-09-18** — ESLint cannot enforce this module's folder boundaries on its
  own. `import/no-restricted-paths` matches the RESOLVED path, so it needs an
  import resolver to follow the `@/*` alias — and `eslint-import-resolver-typescript`
  pulls `unrs-resolver`, a native package pnpm 12 blocks behind
  `pnpm approve-builds`. Both were removed again. `dependency-cruiser` reads
  `tsconfig.json` directly, needs no resolver plugin, and is already the tool
  `server/` uses, so the boundary rules live in `client/.dependency-cruiser.cjs`
  (`pnpm arch`) and `eslint.config.mjs` is left to do only what the import graph
  cannot see: hook correctness and the `fetch` ban.

- **2026-09-17** — `<SeverityBadge compact>` renders an icon plus the count and
  nothing else — `Badge.tsx:80` drops the label in compact mode. So a compact
  chip has no accessible name, no tooltip, and no text for RTL to query: tests
  that `getByText("Warning")` fail, and a screen reader hears only a number.
  Any compact cluster must supply its own `title`/`aria-label`; ours does it in
  `components/severity-counts/SeverityCounts.tsx`.

## Codebase Patterns

## Tool & Library Notes

- **2026-09-18** — Two flat-config traps when touching
  `client/eslint.config.mjs`. (1) `eslint-plugin-react-hooks` is on v7, which
  ships the React Compiler rules (`static-components`, `use-memo`,
  `preserve-manual-memoization`, `capitalized-calls`, …) alongside the classic
  two; its `recommended-latest` preset turns them on, so the config enables
  `rules-of-hooks` and `exhaustive-deps` EXPLICITLY — "tidying" those two lines
  into the preset floods the tree. (2) `next build` prints "The Next.js plugin
  was not detected in your ESLint configuration" unless
  `@next/eslint-plugin-next` is in the config; its `recommended` set is enough
  and, unlike `core-web-vitals`, is correctness rather than performance. It paid
  for itself immediately — `no-html-link-for-pages` caught an `<a
  href="/settings/api-keys">` with a hand-rolled `preventDefault` +
  `router.push` in `AddRepoView.tsx`, which also broke middle-click.

## Recurring Errors & Fixes

## Session Notes

- **2026-09-18** — Added `eslint.config.mjs`, `.dependency-cruiser.cjs` and the
  `lint`/`arch` scripts, wired both into `client.yml`. Both were green on the
  existing tree; each boundary rule was confirmed to fire against an injected
  violation first.

## Open Questions
