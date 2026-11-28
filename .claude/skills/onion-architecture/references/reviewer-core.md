# reviewer-core as the review core

reviewer-core is consumed by the server as raw source (`@devdigest/reviewer-core`). In onion terms it is **domain + application for reviews**: diff + agent config + repo context → prompt → LLM → grounded findings, with the LLM as the only injected side effect.

| Ring | reviewer-core files |
|---|---|
| Domain model / services | `grounding.ts` (`groundFindings`), `review/reduce.ts`, `output/to-review.ts`, `prompt.ts` (`assemblePrompt`, `INJECTION_GUARD`) |
| Application service | `review/run.ts` (`reviewPullRequest`) — orchestrates, receives `LLMProvider` as a parameter |
| Adapter (outer) | `llm/openrouter.ts`, `llm/structured.ts` — the only `openai` importers |
| Public API | `index.ts` |

Rules:
- No `node:fs`, `child_process`, network clients, `process.env`, Drizzle, Fastify or `server/src/**` (except `@devdigest/shared` contracts) — `reviewer-core-no-io`.
- `openai` only under `src/llm/` — `reviewer-core-sdk-only-in-llm-adapter`.
- New dependency (e.g. tokenizer, clock) → parameter typed by an interface, implemented in `server/src/adapters`.
- The server wires `OpenRouterProvider` in `platform/container.ts`; keep that one-way: reviewer-core never imports the server.
- Don't restructure reviewer-core into ring folders without a spec — its flat layout is small and already obeys the dependency rule; the lint rules are what protect it.
- Every change here is a server change: run reviewer-core `npm test` + `npm run typecheck`, then server typecheck + unit tests, then `pnpm arch:check`.
