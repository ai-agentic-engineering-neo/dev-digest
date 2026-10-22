# Insights — client

Non-obvious, actionable lessons for this module — treat as high-confidence guidance.
Agents append via the `engineering-insights` skill (dated, atomic, append-only);
humans consolidate at ~100 entries.

## What Works
<!-- Approaches, patterns and solutions that proved effective -->

## What Doesn't Work
<!-- Dead ends and anti-patterns: the wrong approach and the right one -->

- **2026-09-23 · Contract copy** — `src/vendor/shared` is a copy of
  `server/src/vendor/shared` and has already drifted (e.g. `sessionId` exists only on
  the server's `LLMProvider` options). Check the server copy before trusting a type here.

- **2026-10-10 · Popovers in the PR list get clipped** — `tableCard` (pulls/styles.ts)
  has `overflow: hidden`. Portal hover cards to `document.body` with `position: fixed`
  (see `components/severity-counts`). React events still bubble through the portal to
  `PRRow`'s row `onClick` (navigation) — `stopPropagation` inside the popover.

## Codebase Patterns
<!-- Conventions, architecture decisions, naming -->

- **2026-09-23 · Future-lesson messages** — `messages/en` already has files for later
  lessons (blast, brief, ci, conventions…). They are placeholders, not dead strings.

- **2026-10-10 · Two `Severity` types** — `@devdigest/shared` `Severity` is
  `CRITICAL | WARNING | SUGGESTION`; `@devdigest/ui` `Severity`/`SEV` adds `INFO`. Type
  data with the shared one and use `SEV[sev]` only for colour/icon.

## Tool & Library Notes
<!-- Quirks and gotchas of dependencies -->

- **2026-10-15 · No ESLint configured** — no package has an ESLint config or `lint`
  script, so `// eslint-disable-line react-hooks/exhaustive-deps` comments are inert and
  hook-deps mistakes are not caught. Only `tsc` + vitest guard the client.

- **2026-10-16 · jsdom has no `Blob.arrayBuffer`** — `file.arrayBuffer()` throws in vitest.
  Read uploads with `FileReader.readAsDataURL` (works in browsers and jsdom), as
  `skills/.../ImportFromFile/helpers.ts` does.

## Recurring Errors & Fixes
<!-- Error message / symptom → fix -->

- **2026-10-16 · Mocked query returns a new array per render** — a `vi.mock` hook like
  `useX: () => ({ data: [...] })` hands back a fresh `data` every render; a component that
  syncs it into state in `useEffect([data])` loops forever and vitest dies with "Worker
  exited unexpectedly" after minutes. Hoist mock results to module constants.

## Session Notes
<!-- Dated 1–2 sentence summaries of meaningful sessions -->

## Open Questions
<!-- Unresolved items worth investigating -->
