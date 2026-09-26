# Enforcement: dependency-cruiser and the baseline

## Files

| File | Role |
|---|---|
| `server/.dependency-cruiser.cjs` | The rules. Rings are regex constants at the top; each `forbidden` entry names a rule from `SKILL.md` and carries the fix in `comment`. |
| `server/.dependency-cruiser-known-violations.json` | The baseline: violations that existed when the check was introduced. Committed. |
| `server/package.json` → `lint:arch` | `depcruise --config .dependency-cruiser.cjs --ignore-known .dependency-cruiser-known-violations.json src`. Exit 1 on any violation not in the baseline. |
| `server/package.json` → `lint:arch:baseline` | Regenerates the baseline from the current tree. |
| `server/eslint.config.mjs` | Warning-level `no-restricted-imports` mirrors per ring for editor feedback, plus an error-level `process.env` ban in `modules/` and `platform/`. |
| `.github/workflows/server-unit.yml` | Runs `pnpm lint:arch` in the typecheck job. |
| `scripts/check-arch.sh` (this skill) | Wrapper: default = gated run; `--all` = show everything including baseline; `--baseline` = regenerate. |

## How resolution works

- `tsConfig` points at `server/tsconfig.json`, so `@devdigest/shared` and `@devdigest/reviewer-core` resolve through the path aliases. `not-to-unresolvable` is an error, so a broken alias fails the check instead of silently passing.
- `tsPreCompilationDeps: true` counts `import type` edges. A type-only import of `Container` in a service is still a violation of rule 3; only the `no-circular` rule ignores type-only edges (`viaOnly.dependencyTypesNot: ['type-only']`) because the container legitimately imports module classes while modules import its type.
- `reviewer-core/` is `doNotFollow`: it is cruised as a leaf, so its own imports do not need `node_modules` for the check to run in CI.
- Tests (`*.test.ts`) and `db/migrations/` are excluded.

## Reading a failure

```
error application-no-container: src/modules/widgets/service.ts → src/platform/container.ts
```

Rule name → find it in `SKILL.md` "The rules" for the intent and in
`examples/bad-vs-good.md` for the fix. The `comment` field in the config
prints with `--output-type text`.

## Adding a rule

1. Add a `forbidden` entry using the ring constants. Name it `<from-ring>-no-<thing>` or `<thing>-only-in-<ring>`.
2. Run `scripts/check-arch.sh --all` and read every new hit. If a hit is legitimate, narrow the rule with `pathNot`; do not add the file to the baseline.
3. Add the rule to the table in `SKILL.md` and, if an editor mirror is useful, a `no-restricted-imports` pattern in `eslint.config.mjs` (warning).
4. Regenerate the baseline (`--baseline`) so pre-existing violations of the new rule are recorded, and list them in the commit body.

## The baseline is a debt list, not an allow-list

Recorded 2026-09-25, 31 entries. Suggested burn-down order, smallest first:

1. `adapters/astgrep`, `adapters/depgraph` → `modules/repo-intel/constants.ts` (rule 5): move `MAX_SIGNATURE_CHARS`, `SUPPORTED_EXT`, and the depgraph constants into `repo-intel/types.ts` (the port) or the adapters themselves.
2. `repos/service.ts` → `repo-intel/constants.ts` (rule 6): same move.
3. `reviews/routes.ts` hand `RunRequest.parse` (rule 9, ESLint-only): declare it as the route `body` schema.
4. `settings/feature-models.ts` (rules 2, 3, 4): it is a repository; rename to `settings/repository.ts`, give it a port, and let a `SettingsService` own the logic.
5. `workspace`, `polling`, `settings` routes (rules 1, 2): extract service + repository; each is under 100 lines.
6. `pulls/routes.ts` (rules 1, 2): extract `PullsService` (GitHub sync, offline fallback) and `PullsRepository` (upsert, list with rollups). The findings preview and cost rollup already live in `reviews/repository/run.repo.ts`; inject `reviewRepo` through the deps object.
7. `repos/helpers.ts`, `reviews/diff-loader.ts`, `reviews/run-executor.ts`, `reviews/service.ts` row types (rule 4): widen the review port to return DTOs; `db/rows.ts` then has no consumer outside ring 3a.
8. Service constructors (rule 3): `agents`, `repos`, `reviews`, `repo-intel` and its pipeline: introduce `ports.ts` + deps object per module; `Container` keeps building the repositories and gains `ContainerOverrides` keys for them.
9. When step 8 is done, make `Container.db` private.

Each step: fix, run `--baseline`, commit fix and baseline together with the
new count in the message.
