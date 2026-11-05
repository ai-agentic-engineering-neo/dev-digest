# Background work — JobRunner (p-queue), fire-and-forget runs, RunBus (SSE)

Scheduling and streaming are delivery mechanisms (outer rings); what a job *does* is a use case.

## Rules

- **Job handler = thin driving adapter.** `container.jobs.register(KIND, handler)` lives in the owning
  service; the handler parses the job payload (Zod) and calls a service method. No Drizzle in handlers.
- **Job kinds** — `<NAME>_JOB_KIND = 'kebab-string'` in the module's `constants.ts`.
- **Enqueue through the port.** Services call `deps.jobs.enqueue(...)`; take `jobs` via
  `Pick<Container, 'jobs' | …>` so tests can pass a fake runner.
- **Review runs stay fire-and-forget** (`void executor.executeRuns(...)`, not JobRunner) — that's a
  documented decision (`server/CLAUDE.md`). Keep the executor in the application ring: it orchestrates
  ports (LLM, repos, RunBus) and must not import `db/schema` (legacy violation, see `examples.md`).
- **RunBus is an outbound port.** Application code publishes run events via
  `deps.runBus.publish(runId, kind, msg, data)` (`kind: RunEventKind`) and calls `complete(runId)`;
  the SSE route only `subscribe`s / replays `buffer(runId)` and forwards. Event shapes come from
  `@devdigest/shared` contracts.
- **Enqueue signature** — `deps.jobs.enqueue(workspaceId, KIND, payload)`; handlers are registered with
  `jobs.register(KIND, (payload, { jobId }) => service.handle(...))`.
- **Idempotency & reaping** (stale `running` runs on boot) are infrastructure concerns — keep them in
  repositories (`reapStaleRunningRuns`) called from `app.ts`, not in domain code.
- **Clock & IDs** — pass `now` (number) into domain functions (`deriveReviewStatus({ …, now })`) rather
  than calling `Date.now()` inside the core.
