# Insights — reviewer-core

Non-obvious, actionable lessons for this module — treat as high-confidence guidance.
Agents append via the `engineering-insights` skill (dated, atomic, append-only);
humans consolidate at ~100 entries.

## What Works
<!-- Approaches, patterns and solutions that proved effective -->

## What Doesn't Work
<!-- Dead ends and anti-patterns: the wrong approach and the right one -->

- **2026-09-23 · Cost can be null** — `costUsd` becomes `null` if any chunk's provider
  can't price the call; treat it as "unknown", not zero.

## Codebase Patterns
<!-- Conventions, architecture decisions, naming -->

- **2026-09-23 · Map-reduce trigger** — `strategy: 'auto'` switches to per-file
  map-reduce only when the diff is over 400 changed lines AND touches more than one file.
- **2026-09-23 · Unused slots** — `skills`, `memory`, `specs` and `toReviewPayload` exist
  for later lessons; the starter server passes only diff, system prompt, repo map and
  callers.

- **2026-10-16 · Skills slot is live, and trusted** — the server now passes
  `formatSkillBlock()` output as `skills`. Skill bodies are intentionally NOT
  `wrapUntrusted`: the injection guard would tell the model to ignore them. Trust is
  handled upstream (imported skills are saved disabled until a human enables them).

## Tool & Library Notes
<!-- Quirks and gotchas of dependencies -->

- **2026-09-23 · Pinned zod** — `tsconfig.json` maps `zod` to `./node_modules/zod` so the
  shared contracts (which live under `server/`) and the engine use the same zod instance.

## Recurring Errors & Fixes
<!-- Error message / symptom → fix -->

## Session Notes
<!-- Dated 1–2 sentence summaries of meaningful sessions -->

## Open Questions
<!-- Unresolved items worth investigating -->
