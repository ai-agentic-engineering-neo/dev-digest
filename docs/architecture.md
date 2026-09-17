# Architecture

Full diagram + module table → [../README.md#architecture](../README.md#architecture).

## Runtime topology

```
client (Next.js :3000) ──REST──▶ server (Fastify :3001) ──▶ Postgres (pgvector, Docker)
                                        │
                                        ├─ imports ──▶ reviewer-core (pure TS lib, path alias @devdigest/reviewer-core)
                                        │                    │
                                        │                    └─▶ LLM (OpenAI / Anthropic / OpenRouter)
                                        └─ imports ──▶ GitHub (PR data, via a token)

e2e drives `client` over CDP (Vercel agent-browser), asserting against the
rendered DOM — it never talks to `server` or Postgres directly.
```

`client` and `server` are two long-running processes on the developer's host
(`pnpm dev` in each, per `client/CLAUDE.md`, `server/CLAUDE.md`). Only
Postgres runs in Docker (`docker-compose.yml` at repo root; see root
`CLAUDE.md:5`). `reviewer-core` has no process of its own — it only executes
inside `server`'s process, consumed as TypeScript source via a tsconfig path
alias (`reviewer-core/CLAUDE.md`), never published or built to JS for
distribution.

## Module boundaries

| Module | Owns | Does not own |
|---|---|---|
| `client` | UI, routing (`src/app/`), client-side data fetching (TanStack Query) | persistence, review logic |
| `server` | HTTP API (`src/modules/<kebab-case>/routes.ts`), Postgres schema (`src/db/`), orchestrating a review run | prompt assembly, grounding (delegates to `reviewer-core`) |
| `reviewer-core` | diff → prompt → LLM → grounded findings pipeline | HTTP, DB, GitHub — pure function of (diff, prompt, LLMProvider) |
| `e2e` | browser-driven flow assertions against a running `client` | unit/integration coverage (that's `server/test/`, `client/**/*.test.tsx`) |

## Cross-module contract: `@devdigest/shared`

There is no npm workspace — `@devdigest/shared`'s Zod contracts exist as two
hand-maintained copies, `server/src/vendor/shared/` and
`client/src/vendor/shared/`, kept in sync manually (root `CLAUDE.md`, "Do not
touch"). Every wire shape (`PrMeta`, `Finding`, `ReviewRecord`, …) is defined
once per copy as a Zod schema + inferred TS type in
`vendor/shared/contracts/*.ts`; changing one without the other typechecks
locally but breaks at runtime the moment the two sides disagree on a field.

Concrete example from this session: `PrMeta.findings_counts` (the PR-list
FINDINGS column's data) was added to `server/src/vendor/shared/contracts/platform.ts`
and `client/src/vendor/shared/contracts/platform.ts` in the same change —
see `server/src/modules/pulls/findings-counts.ts` for the server-side
reducer that fills it, and
`client/src/app/repos/[repoId]/pulls/_components/PRRow/PRRow.tsx` for the
consumer.

## Data flow: opening a PR and reviewing it

1. **Import** — `client` calls `GET /repos/:id/pulls` (`server/src/modules/pulls/routes.ts`);
   the server syncs from GitHub when a token is configured, always serves
   persisted rows otherwise (local-first).
2. **Review** — from the PR detail page, `client` triggers a run; `server`
   passes the diff + repo map to `reviewer-core`, which assembles a prompt,
   calls the configured LLM, and runs the mandatory grounding gate (drops any
   finding that cites a line not in the diff) before persisting `reviews` +
   `findings` rows (`server/src/db/schema/reviews.ts`).
3. **List rollup** — the PR-list endpoint reduces those rows on read, not on
   write: latest review's score, the SUM of every `status='done'` run's cost
   across all batches (`server/src/modules/pulls/total-cost.ts`), and each
   agent's latest-review severity breakdown
   (`server/src/modules/pulls/findings-counts.ts`). All three follow the same
   "one `IN` query + JS reduce" shape because the PR list is small enough
   that this beats a denormalized column that needs invalidation.
4. **Detail view** — the PR detail page's "Agent runs" tab flattens findings
   from every review run (`client/src/app/repos/[repoId]/pulls/[number]/page.tsx`),
   grouped into per-run accordions
   (`.../_components/ReviewRunAccordion/ReviewRunAccordion.tsx`); each
   accordion's `FindingsPanel` derives severity pill counts and the active
   filter purely client-side from the findings it already has
   (`.../_components/FindingsPanel/helpers.ts`) — no extra request, no LLM
   call.

Each package has its own README with deeper diagrams:
[`client`](../client/README.md) (UI route map) ·
[`server`](../server/README.md) (API map) ·
[`reviewer-core`](../reviewer-core/README.md) (review pipeline) ·
[`e2e`](../e2e/README.md).
