# reviewer-core/ — `@devdigest/reviewer-core`

TypeScript ^5.7 · Zod ^3.24 · `openai` SDK ^4.77 (also drives OpenRouter) ·
vitest ^2.1 · Node 22 · **npm**.

## Commands

- `npm test` · `npm run typecheck` (this IS the build)
- Then also `pnpm typecheck` in `../server` — the server compiles this source directly,
  and `server-unit` CI runs on every change here.

## Where things live

- `src/review/run.ts` — `reviewPullRequest`, the engine entry point
- `src/prompt.ts` — `assemblePrompt`, `wrapUntrusted`, `INJECTION_GUARD`
- `src/grounding.ts` — citation gate against the diff
- `src/review/reduce.ts` — merge partial reviews, `scoreFromFindings`
- `src/llm/openrouter.ts` · `src/llm/structured.ts` — provider + Zod→JSON Schema, parse-with-repair
- `src/output/to-review.ts` — GitHub review payload, `countBlockers`
- `src/index.ts` — the public API; export anything new from here

## Rules

- Pure package: no DB, filesystem, network, GitHub or `process.env`. The only side
  effect is the injected `LLMProvider`. I/O belongs in `server/`.
- Never emit JS: no `dist/`, no `outDir`, no build step. Consumers use the source.
- New context enters as an optional, already-resolved string/array field on
  `ReviewInput`; when empty, `assemblePrompt` must omit the section entirely.
- Every untrusted input (diff, PR body, repo-derived text) goes through `wrapUntrusted`.
- `INJECTION_GUARD` stays appended to every system prompt. Don't replace it with
  keyword-scanning of untrusted text — that's a deliberate design decision.
- Every finding passes through `groundFindings`; the returned score is always
  `scoreFromFindings(kept)`, never the model's self-reported score.
- `@devdigest/shared` resolves to `../server/src/vendor/shared`; edit contracts there
  (and mirror to `client/src/vendor/shared`), never add a local copy here.
- `zod` is pinned to this package's `node_modules` in `tsconfig.json`; keep it, it
  prevents duplicate Zod instances.

## Read when…

- Read `README.md` (this package) when changing the pipeline order, the public API,
  or the optional prompt slots.
- Read `../docs/ONBOARDING.md` when changing the `reviewPullRequest` signature (the
  server's `run-executor.ts` must change with it).
- Read `INSIGHTS.md` before debugging here; append a dated entry (Status: unverified)
  when you find non-obvious behaviour.
- Read `specs/` before implementing an engine feature that has a spec; `docs/` for
  long-form design notes.
