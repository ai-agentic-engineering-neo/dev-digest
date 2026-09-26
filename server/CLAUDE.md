# server — agent map

`@devdigest/api`: Fastify 5 API over Drizzle/Postgres. Imports repos and PRs,
indexes repos with repo-intel, runs the reviewer. Architecture, API map and the
DI flow are in README.md — read it before adding routes or touching a review.

## Before answering

Always search the relevant package's `docs/`, `specs/`, and `INSIGHTS.md` for
what the user asks about FIRST — these are curated and may already answer it —
then read code.

## Non-default conventions

- A module is a Fastify plugin at `modules/<name>/routes.ts`, with `service.ts`
  and `repository.ts` beside it. Register it in `modules/index.ts`: one import,
  one entry. Filesystem autoload is deliberately unused — `@fastify/autoload`
  sitting in dependencies is not a signal to use it.
- Validation is schema-first. Declare zod `params`/`body` on the route
  (`fastify-type-provider-zod`); do not hand-roll `Schema.parse(req.body)`
  inside a handler. Invalid input is rejected with 422 before the handler runs.
- Resolve every adapter through `platform/container.ts`. `new SomeAdapter()`
  inside a service is a bug. Tests inject doubles from `adapters/mocks.ts`
  via `ContainerOverrides`.
- Generate migrations with `pnpm db:generate`. Never hand-edit files under
  `src/db/migrations/`.
- Every domain table carries `workspace_id` and every query scopes by it, even
  though auth is currently a single seeded workspace.
- The schema already contains **every** table. The empty ones belong to later
  course lessons — do not "clean them up".
- Secrets are deliberately not part of `AppConfig`. `LocalSecretsProvider`
  (`adapters/secrets/local.ts`) is the single read chokepoint.
- A DB-backed test must be named `*.it.test.ts`, or the unit/integration split
  silently stops covering it.
- Layer rules (onion: routes → service → domain/ports; Drizzle only in
  repositories) are enforced by `pnpm arch:check`. Never regenerate the
  known-violations baseline to make a new violation pass — see the
  `onion-architecture` skill.

## Non-obvious behavior

- repo-intel enrichment is best-effort by design: on failure or an unindexed
  repo the prompt section is simply omitted and the review degrades to
  diff-only. It never fails the run — and it never announces itself loudly.
- `instanceof z.ZodError` can fail across duplicate zod module instances, so
  `app.ts` also matches ZodError by shape. Do not "simplify" that check.
- Stale-run reaping on boot assumes a single API instance per database.

## Do-not-touch

- `src/db/migrations/**` — generated.
- `src/vendor/shared/**` — canonical contracts; reviewer-core aliases this same
  directory, so an edit here changes that package too.
- `clones/**` — runtime checkouts of imported repos.

## Read when

- Read `README.md` before adding a route or touching the review path — it holds
  the API map, the DI flow and the non-obvious "Review context" notes.
- Read `docs/architecture.md` before adding a module, touching the DI container
  or changing the error envelope — request lifecycle, ports, data layer.
- Read `specs/review-flow.md` before changing anything on the review path — it
  states the invariants (grounding, null-vs-zero cost, lifetime cost vs latest-per-agent findings).
- Read `specs/conventions.md` before touching the Conventions Extractor — the
  invariants (evidence verification, re-scan semantics, the skill it produces).
- Read `specs/intent.md` before touching the intent module, `WebFetchClient` or
  the reviewer `## PR intent` slot — sources, budget, confidence, SSRF policy.
- Read `src/modules/repo-intel/README.md` before working on the indexer.
- Read `../TESTING.md` before adding or changing a test.
- Read `../docs/agent-prompts/` before editing reviewer system prompts.
- Read `INSIGHTS.md` before starting non-trivial work here.

Found a trap that cost you time? Capture it with the `engineering-insights`
skill, which appends it to `INSIGHTS.md`.
