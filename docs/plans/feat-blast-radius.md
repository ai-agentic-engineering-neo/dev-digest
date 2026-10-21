# Plan: Blast radius block on the PR Overview · branch feat/blast-radius

Design-system task: no

Status: implemented and reviewed in this branch (plan written alongside the code, 2026-10-12; architecture + security reviews PASS, reports in `.pipeline/feat-blast-radius/`).
Source: course note "Blast Radius" (what the starter already has) plus two design
screenshots (Tree view, Graph view with "Prior PRs touching these files").

## Goal & acceptance criteria

Show the impact map of a PR on the Overview tab next to the Intent card, from
the map `repoIntel.getBlastRadius` already computes. No model call.

- [x] AC1 `GET /pulls/:id/blast` returns `BlastRadiusResponse` (`BlastRadius` from `contracts/brief.ts` plus `degraded`, `reason`, `head_sha`, `history`). Unknown PR → 404 envelope, bad id → 422. Verified by `server/test/blast-routes.test.ts`.
- [x] AC2 The flat facade `BlastResult` (callers with `viaSymbol`, `factsByFile`) is mapped to the grouped contract: one `downstream` entry per changed symbol that has callers, callers sorted by rank then file, endpoints and crons attributed through the caller files' facts. Verified by `server/test/blast-helpers.test.ts`.
- [x] AC3 `history` lists other PRs of the same repo whose persisted files overlap the PR's files, newest first, at most `HISTORY_LIMIT`, with the overlapping paths and the first line of the body as `notes`. Verified by `server/test/blast.it.test.ts`.
- [x] AC4 The Overview tab renders a BLAST RADIUS card: stat row (symbols, callers, endpoints, crons), Tree/Graph toggle, tree of symbols → caller links to GitHub at the PR head (`githubBlobUrl`), endpoint and cron chips, a "Prior PRs touching these files" disclosure. Verified by `BlastRadiusCard.test.tsx`.
- [x] AC5 Degraded map with no data shows an empty state with the reason and a "Rebuild index" action (`POST /repos/:id/resync`); degraded with data shows the data plus an "approximate" badge. Verified by `BlastRadiusCard.test.tsx`.
- [x] AC6 `devdigest_get_blast_radius` takes `repo` + `pr_number`, calls the new route and returns a capped payload. Verified by `mcp/test/tools-list.test.ts` and `mcp/test/run-tool.test.ts`.
- [x] AC7 Checks green: server typecheck · lint · lint:arch (no new baseline entries) · unit; client typecheck · lint · test; mcp typecheck · lint · test; contract copies identical.

## Out of scope

- Re-computing callers: the facade's `MAX_CALLERS_PER_SYMBOL` and `BFS_DEPTH` stay as they are.
- A model-written `notes` for prior PRs (the design's prose). `notes` is the PR body's first line.
- Persisting the blast result (`pr_brief.json`). The route is read-time, like Smart Diff.
- Changing the seed. The seeded repo has no clone, so PR #482 renders the degraded empty state.

## Work breakdown

| # | Package | File | Change |
|---|---|---|---|
| 1 | shared | `contracts/brief.ts`, `contracts/review-api.ts` | `BlastCaller` gains optional `endpoints`/`crons`; new `BlastRadiusResponse`; copy to client |
| 2 | server | `modules/blast/{ports,constants,helpers,repository,service,routes}.ts` | new module, onion trio; `BlastIntelPort` typed structurally (no import of repo-intel) |
| 3 | server | `platform/container.ts`, `modules/index.ts` | `blastRepo` getter + override; register `blast` |
| 4 | server | `test/blast-helpers.test.ts`, `test/blast-routes.test.ts`, `test/blast.it.test.ts` | mapping, route smoke with fake ports, repository IT |
| 5 | client | `lib/hooks/blast.ts` | `useBlastRadius(prId)`; the grandfathered hooks barrel is not extended (architecture review) |
| 6 | client | `pulls/[number]/_components/BlastRadiusCard/**` (promoted from `OverviewTab/_components` after the architecture review) | card, `BlastTree`, `BlastGraph`, `PriorPrs`, styles, constants, helpers, test |
| 7 | client | `OverviewTab.tsx`, `OverviewTab/styles.ts` (comment), `page.tsx`, `messages/en/blast.json` | wire the card, pass `repoId` + `headSha`, strings |
| 8 | mcp | `tools/get-blast-radius.ts`, `format.ts`, `server.ts`, tests, README, specs | real tool |
| 9 | docs | `server/specs/blast-radius.md`, `server/README.md`, `server/AGENTS.md`, `client/specs/pages.md`, `e2e/specs/13-pr-blast-radius.flow.json`, `e2e/specs/flows.md` | spec, API map, e2e |

## Relevant INSIGHTS

- server 2026-09-26: sibling capabilities come from the container and are typed structurally in `ports.ts` → `BlastIntelPort`.
- server 2026-10-06: `pr_files` are written only by `GET /pulls/:id` → the Overview tab always runs after that call; the IT test inserts files itself.
- client 2026-09-26: import `type` only from `@devdigest/shared`; mirror runtime values locally.
- client 2026-10-06: deep relative imports into `src/lib` are an ESLint error → `@/lib/...`.
