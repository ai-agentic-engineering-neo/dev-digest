# Architecture — how the packages talk

High-level overview is in the [root README](../README.md#architecture). This page
shows the runtime wiring between packages and the review flow end to end.

## Module map

```mermaid
flowchart LR
  subgraph CLIENT["client/ · Next.js :3000"]
    PAGES["app/* routes"] --> HOOKS["lib/hooks/* (TanStack Query)"]
    HOOKS --> APIC["lib/api.ts (fetch)"]
  end

  subgraph SERVER["server/ · Fastify :3001"]
    REG["modules/index.ts<br/>static plugin registry"]
    MODS["settings · repos · pulls · polling<br/>workspace · agents · reviews · repoIntel"]
    DI["platform/container.ts<br/>DI composition root"]
    JOBS["JobRunner<br/>p-queue + jobs table"]
    BUS["RunBus<br/>in-memory SSE bus"]
    ADP["adapters/*<br/>github · git · llm · codeindex · depgraph · secrets"]
    RI["repo-intel pipeline<br/>walk → ast-grep → dep-cruiser → PageRank → repo map"]
    EXEC["reviews/run-executor.ts"]
    REG --> MODS --> DI
    DI --> JOBS & BUS & ADP & RI
    MODS --> EXEC
  end

  subgraph CORE["reviewer-core/ (pure)"]
    RUN["reviewPullRequest()"] --> PROMPT["assemblePrompt + INJECTION_GUARD"]
    RUN --> STRUCT["structured output<br/>zod → JSON Schema + repair"]
    RUN --> GROUND["groundFindings()"]
  end

  SHARED["@devdigest/shared<br/>zod contracts<br/>(server/src/vendor/shared)"]
  PG[("Postgres + pgvector")]
  LLM["LLM<br/>OpenAI · Anthropic · OpenRouter"]
  GH["GitHub"]

  APIC -->|REST JSON| MODS
  BUS -->|"SSE /runs/:id/events"| HOOKS
  MODS --> PG
  RI --> PG
  EXEC -->|"diff + repo map + callers"| RUN
  RUN -->|"injected LLMProvider"| LLM
  ADP --> GH
  SHARED -.-> CLIENT & SERVER & CORE
```

`client/src/vendor/shared` is a manual copy of the shared contracts; everything else
imports the server copy via tsconfig path aliases.

## Review flow

```mermaid
sequenceDiagram
  participant UI as client
  participant API as server (reviews)
  participant EX as ReviewRunExecutor
  participant RI as repo-intel
  participant RC as reviewer-core
  participant LLM
  UI->>API: POST review
  API-->>UI: runs queued (not awaited)
  UI->>API: subscribe SSE /runs/:id/events
  EX->>EX: load diff once
  loop each agent
    EX->>RI: getRepoMap / getFileRank / getCallerSignatures
    EX->>RC: reviewPullRequest(diff, prompt, context, llm)
    RC->>LLM: completeStructured (single-pass or per-file map-reduce)
    RC-->>EX: grounded Review
    EX->>API: persist review, findings, run_trace
  end
  API-->>UI: live events via RunBus
```

## Deeper docs

- Server request / DI flow: [server/README.md](../server/README.md#request--di-flow)
- repo-intel pipeline: [server/src/modules/repo-intel/README.md](../server/src/modules/repo-intel/README.md)
- Engine pipeline: [reviewer-core/README.md](../reviewer-core/README.md#pipeline)
- UI route map: [client/README.md](../client/README.md#ui-route-map)
