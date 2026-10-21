# Blast radius

The impact map of a pull request, shown on the PR Overview tab next to the
Intent card and exposed to MCP clients. Read-time, served from the repo-intel
index; never a model call. Plan: `docs/plans/feat-blast-radius.md`.

## Route

`GET /pulls/:id/blast` → `BlastRadiusResponse` (`contracts/review-api.ts`):

| Field | Source |
|---|---|
| `changed_symbols[]` `{ name, file, kind }` | symbols declared in the PR's persisted `pr_files` (`repoIntel.getBlastRadius`) |
| `downstream[]` `{ symbol, callers[], endpoints_affected[], crons_affected[] }` | one entry per changed symbol that has at least one caller, most callers first |
| `downstream[].callers[]` `{ name, file, line, endpoints?, crons? }` | facade callers grouped by `viaSymbol`; `endpoints`/`crons` are the caller file's facts, present only on the persistent-index path |
| `summary` | one sentence with the counts, built in code (`helpers.ts summarize`) |
| `degraded`, `reason` | the facade's flag; `reason` is `flag_off` · `index_failed` · `index_partial` · `repo_too_large` · `no_data`, `null` when not degraded |
| `head_sha` | the PR head, so the client deep-links caller lines on GitHub (caller files are not in the diff) |
| `history[]` `PrHistoryItem` | other PRs of the repo whose `pr_files` overlap, newest first, at most `HISTORY_LIMIT` (5) |

Unknown PR → 404 envelope; non-uuid id → 422. The PR must have been opened once
(`GET /pulls/:id` writes `pr_files`); a PR with no persisted files gets an empty,
degraded map.

## Mapping (module `blast/`, `helpers.ts`)

The facade returns a flat `BlastResult`: `callers[{ file, symbol, viaSymbol, line, rank }]`,
`impactedEndpoints[]` and, on the persistent path, `factsByFile`. The contract
groups callers under their changed symbol:

- Callers keep the facade's rank order (stable on file, then line).
- Persistent path: `endpoints_affected` / `crons_affected` of a symbol are the
  union of its caller files' facts; each caller also carries its own file's facts.
- Ripgrep fallback (no `factsByFile`): the flat `impactedEndpoints` union is
  attributed to every symbol that has callers, crons are empty, callers carry no
  per-file facts. The response is `degraded: true`.
- Changed symbols without callers appear in `changed_symbols` only.

`history[].merged_at` is `updated_at`, else `opened_at` (the schema stores no
merge date). `notes` is the first prose line of the body (headings, HTML
comments and fences skipped, 200 chars), empty when the body was never loaded.

## Module layout

`ports.ts` declares `BlastRepositoryPort` and `BlastIntelPort`: the slice of the
repo-intel facade the service reads, re-declared structurally because modules
do not import each other. `routes.ts` builds `BlastService({ repo:
container.blastRepo, intel: container.repoIntel })`.

## Invariants

1. No LLM call and no clone parsing in this module; everything comes from the facade and `pr_files`.
2. The facade never throws for a missing index; the route therefore returns 200 with `degraded: true` instead of an error.
3. Every repository method is workspace-scoped; prior PRs come from the same `repo_id` only.

## Tests

- `test/blast-helpers.test.ts` — mapping, summary, history notes.
- `test/blast-routes.test.ts` — route smoke with fake ports (`blastRepo`, `repoIntel` overrides).
- `test/blast.it.test.ts` — repository against Postgres.
