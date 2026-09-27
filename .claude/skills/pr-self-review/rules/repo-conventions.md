# Conventions lane — runs on every file, always

No skill covers these; `AGENTS.md` does. This lane sees the whole file list, including
the files no path rule routed anywhere.

## Contracts exist twice

`@devdigest/shared` is two physical copies: `server/src/vendor/shared` and
`client/src/vendor/shared`, and `reviewer-core` type-checks against the server copy. One
copy changed alone is a CRITICAL, not a follow-up.

```bash
diff -r server/src/vendor/shared client/src/vendor/shared
```

## Lockfiles

`pnpm-lock.yaml` (`server/`, `client/`) and `package-lock.json` (`reviewer-core/`, `e2e/`)
are written by the package manager only. A lockfile in the diff with no `package.json`
change beside it → CRITICAL. There is no root lockfile; one appearing is a mistake.

## Migrations

- Filename `YYYY_MM_DD_HHMMSS_<name>.sql|ts` with **today's** date (`date +%Y_%m_%d`);
  a prefix copied from the previous migration → WARNING.
- Generated names (`NNNN_<name>.sql`) are never renamed by hand.
- `DROP TABLE` / `DROP COLUMN` → CRITICAL unless the diff carries an explicit note why.
- Migrations are never applied on boot — a change that assumes they are → WARNING.

## Naming

- Modules: kebab-case files; a server feature is
  `src/modules/<name>/{routes,service,repository,helpers,constants}.ts`.
- React: PascalCase folder with `<Name>.tsx` + `index.ts`; route-local UI in
  `_components/<Name>/`, cross-route chrome in `client/src/components/<kebab-case>/`.
- Tests: `*.test.ts(x)` beside the code; **DB-backed server tests must end in `*.it.test.ts`**
  — a DB test without that suffix lands in the hermetic lane and breaks CI → CRITICAL.
- Zod: schema and inferred type share a PascalCase name.
- Wire JSON is snake_case, TS is camelCase, Drizzle columns snake_case in SQL / camelCase in TS.
- i18n keys are camelCase under `client/messages/<locale>/<namespace>.json`; a new visible
  string hardcoded in a component instead of a message file → WARNING.

## Comments

The project's standing rule: no comments unless the *why* is genuinely non-obvious. A
comment that restates the code, or references a task/ticket/author, → SUGGESTION to delete.

## Files that must not be in the diff

`server/clones/**` (runtime data), `.env`, anything under `server/package.json` (it is
`skip-worktree`; a change there will not reach CI) → WARNING, or CRITICAL for `.env`.

## Docs

A feature from a written spec should leave `specs/<slug>.md` consistent with what shipped.
A new cross-package behaviour with no spec → SUGGESTION, not a blocker.
