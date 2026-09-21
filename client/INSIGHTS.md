# Insights — client

Lessons learned in `client/` that the code doesn't tell you. Written by the
`engineering-insights` skill via `.claude/skills/engineering-insights/scripts/append_insight.py`.
**Append only** — new bullets go on top of a section; existing lines are never changed by agents.
Format: `- YYYY-MM-DD — <where>: <fact> → <action>`.
Reviewed monthly: stale entries are removed in a dedicated commit.

## What Works
<!-- approaches and solutions that worked here -->

## What Doesn't Work
<!-- dead ends and anti-patterns — the most valuable section -->

## Codebase Patterns
<!-- conventions and architectural decisions not obvious from the code -->
- 2026-09-21 — src/app/repos/[repoId]/pulls/[number]/_components/ReviewRunAccordion: opening it renders FindingsPanel → useFindingAction/useDeleteReview (TanStack mutations), so a test that expands it fails with 'No QueryClient set' → wrap the render in <QueryClientProvider client={new QueryClient()}> instead of mocking single hooks

## Tool & Library Notes
<!-- dependency quirks, versions, flags -->
- 2026-09-21 — client/.npmrc has node-linker=hoisted, so node_modules/.bin (tsc, vitest) is created only at the very END of pnpm install. A hung install (one stalled registry socket, no output for 10+ min) looks like a filled node_modules with no tsc → kill it and rerun `npx -y pnpm@10 install --frozen-lockfile --fetch-timeout 60000`; with the store warm it finishes in ~16s
- 2026-09-21 — design/DevDigest Design (standalone).html: screen sources (jsx mocks, e.g. CostBadge, ScreenDashboard grid) are gzip+base64 blobs in <script type="__bundler/manifest"> JSON (keys data/compressed), so plain grep finds nothing → decode with python (json.loads → b64decode → gzip.decompress) into the scratchpad, then grep the JS for exact columns and formats

## Recurring Errors & Fixes
<!-- error message → cause → fix -->

## Session Notes
<!-- YYYY-MM-DD — one-line summary of a meaningful session -->

## Open Questions
<!-- what is still unresolved -->
