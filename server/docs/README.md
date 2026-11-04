# server — docs index

Deeper design notes for `server/`, one topic per file. The package `README.md` stays the canonical overview;
put here what is too detailed for it. Add each new doc to the list below with a one-line "read when".

<!-- - [topic.md](topic.md) — read when … -->
- [architecture.md](architecture.md) — read when adding a module/route/plugin, touching `buildApp` order, the error envelope, the DI container, or choosing JobRunner vs fire-and-forget
- [review-pipeline.md](review-pipeline.md) — read when changing how a review run is started, executed, cancelled, streamed over SSE (`RunBus`) or persisted (`agent_runs`, `run_traces`)
- [database.md](database.md) — read when adding/changing tables or columns, writing a migration, scoping queries by workspace, or relying on seed data
