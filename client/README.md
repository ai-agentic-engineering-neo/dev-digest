# `@devdigest/web` — the studio (Next.js 15)

The DevDigest UI: import repos, browse pull requests, run and read AI reviews,
author agents & skills, inspect memory, evals, and CI runs. App Router + React
Server/Client components, data via **TanStack Query** hooks over the Fastify API.

- **Stack:** Next.js 15 (App Router), React 19, TanStack Query, `next-intl`
  (messages in `messages/<locale>/*.json`), `recharts`, `mermaid`,
  `react-markdown`. UI primitives are vendored under `src/vendor/ui`
  (`@devdigest/ui`) and shared Zod contracts under `src/vendor/shared`
  (`@devdigest/shared`).
- **API base:** `NEXT_PUBLIC_API_BASE` (default `http://localhost:3001`), used by
  `src/lib/api.ts`. Every data hook lives in `src/lib/hooks/*`.
- **Run:** `pnpm dev` (`:3000`). **Test:** `pnpm test` (vitest + jsdom, fetch
  mocked — no API needed). **Typecheck:** `pnpm typecheck`.

## UI route map

Routes (`src/app/**/page.tsx`) and the API surface each leans on (via
`src/lib/hooks/*` → `src/lib/api.ts`):

```mermaid
flowchart TD
  ROOT["/"] -->|"useRepos → GET /repos"| PULLS["/repos/:repoId/pulls<br/>PR list"]

  subgraph Repo["/repos/:repoId/*"]
    PULLS --> PR["/pulls/:number<br/>review detail"]
    PR --> CONF["/pulls/:number/conformance"]
    CTX["/context<br/>project context"]
    CONV["/conventions"]
    MULTI["/multi-agent"]
    RONB["/onboarding<br/>tour"]
  end

  AGENTS["/agents"] --> AGENT["/agents/:id"]
  AGENT --> EVALCASE["/agents/:id/evals/:caseId"]
  PERF["/agent-performance"]
  CIRUNS["/ci-runs"]
  EVAL["/eval"]
  MEM["/memory"]
  SKILLS["/skills"] --> SKILL["/skills/:id"]
  SETTINGS["/settings/:section"]
  ONB["/onboarding"]
  SHOW["/showcase"]

  PR -->|"GET /pulls/:id · /reviews · /findings · /pulls/:id/brief · /blast"| API[("Fastify API")]
  CONF -->|"GET /conformance"| API
  CTX -->|"GET /context"| API
  CONV -->|"GET /conventions"| API
  AGENTS -->|"/agents"| API
  EVAL -->|"/eval/dashboard · /eval-cases"| API
  CIRUNS -->|"/ci-runs · /runs"| API
  MEM -->|"/memory"| API
  SKILLS -->|"/skills · /skills/community"| API
  PERF -->|"/performance · /stats"| API
  SETTINGS -->|"/providers · /plugins · /settings"| API
```

Cross-cutting chrome lives in `src/components/app-shell` (nav, breadcrumbs,
`g`-then-key shortcuts). Pages are thin; feature logic sits in colocated
`_components/<Name>/` folders, each with its own `*.test.tsx`.

## Testing

Component/interaction tests (`*.test.tsx`) run under vitest + jsdom with `fetch`
mocked, so they need neither the API nor a browser. The real browser journeys
(client + API + seeded DB) are covered by the deterministic agent-browser suite
in [`../e2e`](../e2e/README.md) and the `e2e-web.yml` workflow. See
[`../TESTING.md`](../TESTING.md).
