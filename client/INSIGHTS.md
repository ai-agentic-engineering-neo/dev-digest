# Insights — client

Non-obvious, file-grounded findings that reading the code does not reveal.
Written and maintained through the `engineering-insights` skill, which carries the format,
the section rules and the quality bar.

## What Works

## What Doesn't Work

**2026-09-21** — Do not key UI state in a findings panel on the identity of its `findings` prop.
`useFindingAction` invalidates `["reviews", prId]` on success, the refetch hands down a fresh array,
and any `useEffect` with `findings` in its deps fires on every accept/reject — a severity filter
reset itself the moment the reader acted on a card, which reads as the list jumping on its own.
Reviews are per-run and each run mounts its own panel, so remount already gives fresh state; key
such effects on `prId` alone. Evidence: client/src/lib/hooks/reviews.ts:158

## Codebase Patterns

**2026-09-19** — One run's token count is rendered two different ways on screens a click apart: the
Agent-runs timeline sums them (`9,119 tok`, `RunCostBadge.tsx:31`) while the trace drawer keeps them
separate and rounded (`12k→1.5k`, `RunTraceDrawer/helpers.ts:27`). Neither is wrong on its own, but
the same run reads as two different numbers, and the drawer's form cannot be compared to the
timeline's at all. Reuse one of the two when adding a third surface rather than inventing a format
that matches neither. Evidence: client/src/components/run-cost-badge/RunCostBadge.tsx:31


## Tool & Library Notes

## Recurring Errors & Fixes

**2026-09-21** — The client's `vendor/shared` barrel cannot be used to import a VALUE. It
re-exports `./contracts/findings.js` while the files on disk are `.ts` — the server's extension
convention, carried into the client along with the vendored copy — and Next's bundler does not
rewrite `.js` to `.ts`, so the page 500s with module-not-found pointing at the importing file.
Every other client import from that barrel is an `import type`, which is erased before bundling,
which is why the mine sat untouched. Import a value deep instead, past the barrel:
`from "@devdigest/shared/contracts/findings"` — the `@devdigest/shared/*` alias already exists in
`client/tsconfig.json`. `pnpm typecheck` and vitest both resolve the extension themselves and stay
green on the broken import, so this is only reproducible through `pnpm dev`.
The deep import is no longer the remedy: `next.config.mjs` now sets
`resolve.extensionAlias = { ".js": [".ts", ".tsx", ".js"] }`, which teaches the bundler what tsc
and vitest already did, so the barrel is importable as a value like any other module. The deep
import fixed one call site and left the mine for whoever came next.
Evidence: client/src/vendor/shared/index.ts:19

## Session Notes

## Open Questions
