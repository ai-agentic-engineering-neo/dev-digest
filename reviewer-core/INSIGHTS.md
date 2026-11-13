# reviewer-core/ — Insights

Running log of gotchas, tricky bugs, and rationale for non-default decisions in
this module. Linked from [CLAUDE.md](./CLAUDE.md) — not inlined there because
this list is expected to grow and change often (volatile by design).

Format: newest first within each section. One entry = one decision or one
gotcha. Keep entries short; link to code/PR/commit for the full story instead
of re-explaining it here.

---

## What Works

## What Doesn't Work

## Codebase Patterns

### 2026-09-16 — `build` is a type-check, not a real build
This package intentionally never emits JS — `npm run typecheck` (`tsc --noEmit`)
doubles as the build. The server consumes reviewer-core's TypeScript **source**
directly via a tsconfig path alias (`@devdigest/reviewer-core` → `../reviewer-core/src`),
compiled in-process by tsx (dev) / vitest (tests). Do not "fix" this to emit a
`dist/` — nothing consumes it, and it would desync from the path-aliased source
the server actually type-checks against.

### 2026-09-16 — Grounding is the mandatory gate, not a best-effort filter
Every finding must cite a real diff line or `groundFindings()` drops it — there
is no fallback path that keeps an ungrounded finding around "just in case." This
is what prevents hallucinated line references from ever reaching the UI.

## Tool & Library Notes

## Recurring Errors & Fixes

## Session Notes

## Open Questions

---

<!-- Add new entries above this line within the relevant section, newest first. -->
