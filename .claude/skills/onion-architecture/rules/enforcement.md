---
name: enforcement
description: Making the dependency rule mechanical — dependency-cruiser config, script and CI lane
metadata:
  tags: enforcement, dependency-cruiser, ci, architecture-linting
---

# Enforcement

Documented layering decays; checked layering does not. `dependency-cruiser@17` is
**already a dependency of `server/`** (the `DepCruiseGraph` adapter uses it for import
graphs), so architecture linting costs no new package.

There is no ESLint in this repository, which is why the rules below are
dependency-cruiser rules rather than `eslint-plugin-boundaries` zones. If ESLint is ever
introduced, the same rules can be mirrored there for in-editor feedback.

## Config

The real config is `server/.dependency-cruiser.cjs` — read it rather than copying a
snippet from here; it is the source of truth and it is green.

Ten rules, all at `severity: 'error'`:

| Rule | Forbids |
|---|---|
| `drizzle-only-in-repositories` | anything but the persistence edge importing `drizzle-orm` / `postgres` |
| `schema-only-in-repositories` | anything but the persistence edge importing `src/db/schema` |
| `no-row-types-in-transport` | `modules/*/routes.ts` importing `src/db/rows.ts` |
| `no-domain-to-infra` | `src/domain/**` importing transport, persistence, SDKs or node builtins |
| `no-adapter-to-module` | `src/adapters/**` importing `src/modules/**` |
| `no-cross-module-internals` | module A importing module B's `repository` / `helpers` |
| `no-service-to-container` | `modules/*/service.ts` or `deps.ts` importing the composition root |
| `core-purity` | `reviewer-core/src/**` importing DB, transport, fs or server code other than `vendor/shared` |
| `core-llm-sdk-stays-in-llm-folder` | any reviewer-core file outside `src/llm/` importing a provider SDK |
| `no-circular` | import cycles |

`reviewer-core` needs no config and no dependency of its own: the server tsconfig aliases
`@devdigest/reviewer-core` to `../reviewer-core/src`, so its modules are already in this
graph. The `core-purity` rule allows exactly one server import — `src/vendor/shared`, the
Zod contracts the engine compiles against.

### Two things that will bite

- **`tsPreCompilationDeps: true` is mandatory.** The package is ESM and `service.ts`
  imports `./service.js`. Without it the local graph resolves to nothing and every rule
  passes vacuously — a green run that proves nothing.
- **npm dependencies match on the resolved path, not the specifier.** `^drizzle-orm`
  never fires; `node_modules/drizzle-orm` does. Under pnpm the real path is
  `node_modules/.pnpm/drizzle-orm@0.38.4.../node_modules/drizzle-orm/index.cjs`, so
  anchoring with `^` silently disables the rule.

`no-cross-module-internals` uses dependency-cruiser's `$1` backreference from the
`from.path` capture group inside a negative lookahead. Verified: a probe rule with
`to: '^src/modules/$1/'` reported 62 same-module edges, so substitution happens before
the regex compiles.

## Script

```json
"arch:check": "depcruise src --config .dependency-cruiser.cjs",
"arch:graph": "depcruise src --config .dependency-cruiser.cjs --output-type dot"
```

`server/package.json` is marked `skip-worktree` and the local copy diverges from the
committed one, which is why CI invokes `pnpm exec depcruise` directly instead of the
script name.

## Severity ladder

Start a NEW rule at `warn`, record its violation count as the baseline, and flip it to
`error` once that count reaches zero. A rule that starts at `error` on a red tree gets
disabled within a week.

All ten rules are at `error` today because the tree is clean. Keep it that way: when a
rule would go red, fix the import, do not lower the severity.

## CI

`.github/workflows/server-unit.yml`, in the `typecheck` job, right after `pnpm typecheck`.
The workflow is path-filtered per package and already includes `reviewer-core/**`, which
is exactly right — the core-purity rules live in the server config.

## Verifying a change

1. `pnpm exec depcruise src --config .dependency-cruiser.cjs` — must print
   `no dependency violations found`.
2. `pnpm typecheck` in `server/`, plus `reviewer-core/` if a shared type moved.
3. Walk the `SKILL.md` pre-flight checklist for the signature-level rules the graph
   cannot see.
4. Check that no route calls an adapter. The graph cannot see this one: a route
   reaches an adapter by PROPERTY access on the container it already holds, not by an
   import. This must print nothing:

   ```bash
   grep -nE "container\.(github\(|llm\(|git\b|codeIndex|embedder\(|secrets)" src/modules/*/routes.ts
   ```

Report what actually ran. A check that was not executed is not evidence.
