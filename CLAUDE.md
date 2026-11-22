# DevDigest — instructions for Claude

Local-first AI PR reviewer. This is the **starter template**: one feature end to
end (import a PR → agent review). Roadmap milestones (M1–M8) are intentionally
absent — don't build them unless asked.

Packages (each has its own `CLAUDE.md`, `README.md` and `insights.md`; read the
package's `CLAUDE.md` before editing there):

- `server/` — Fastify 5 API + Drizzle/Postgres (pgvector) · port 3001
- `client/` — Next.js 15 studio · port 3000
- `reviewer-core/` — pure review engine (diff → prompt → LLM → grounded findings)
- `e2e/` — deterministic browser suite (agent-browser, no LLM)
- `server/src/vendor/shared` — Zod contracts shared by every package

**Source of truth:** the package `README.md` files (and `TESTING.md`). If this
file and a README disagree, the README wins — fix this file.

## Commands

- Whole stack from zero: `./scripts/dev.sh` (flags: `--no-seed`, `--no-client`, `--db-only`)
- Migrations are **not** applied on boot: `cd server && pnpm db:migrate`
- Seed demo data (idempotent): `cd server && pnpm db:seed`
- Never run `docker compose down -v` to "reset" the dev DB — it deletes real imported data.
- Testing strategy and which suite to extend: `TESTING.md`.

## Invariants — do not break

- **Grounding gate** (`reviewer-core/src/grounding.ts`): every finding must cite a
  line that exists in the diff, or it is dropped. Never bypass it.
- **Scores are recomputed** from surviving findings. Never trust the model's self-reported score.
- **Injection guard:** untrusted PR content (diff, title, body, comments) is
  wrapped and treated as data. Do not add keyword/denylist injection filters.
- **Secrets** go only through `SecretsProvider` (`~/.devdigest/secrets.json`,
  mode 0600). Never in git, the database, or `AppConfig`.
- **Test naming:** DB-backed tests must be named `*.it.test.ts`; everything else is hermetic.
- **Vendored copies:** `server/src/vendor/shared`, `client/src/vendor/ui` and
  `client/src/vendor/shared` are copies, not packages. Keep them in sync when a contract changes.

## Conventions

- Validate routes with Zod schemas (`fastify-type-provider-zod`); invalid input is a 422 before the handler runs.
- Feature UI lives in colocated `_components/<Name>/` folders with a `*.test.tsx`.
- Data fetching in the client goes through `src/lib/hooks/*` → `src/lib/api.ts`. Pages stay thin.
- UI strings live in `client/messages/<locale>/*.json` (next-intl).
- Keep `reviewer-core` free of I/O (no DB, network beyond the injected LLM, or filesystem).
## Session context and end of session

- **Session start:** read the `insights.md` of the package you are working in, via the `engineering-insights` skill, and state the top 3 entries that apply.
- **End of session:** run the `engineering-insights` wrap-up when its trigger conditions are met. Do not skip it.
