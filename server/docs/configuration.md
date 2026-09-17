# `@devdigest/api` — configuration

Everything the API reads at startup, and where secrets actually live.

## Environment

`server/.env`, copied from `.env.example`:

| Var | Default | Notes |
|-----|---------|-------|
| `DATABASE_URL` | `postgres://devdigest:devdigest@localhost:5432/devdigest` | required to migrate and serve |
| `API_PORT` / `WEB_PORT` | `3001` / `3000` | API port; `WEB_PORT` also sets the allowed CORS origin |
| `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `OPENROUTER_API_KEY` | — | optional, per provider; also settable via the Settings UI |
| `GITHUB_TOKEN` | — | optional; PAT with repo scope (`GITHUB_PAT` accepted as a fallback) |
| `EMBEDDINGS_ENABLED` | `false` | memory/RAG embeddings (OpenAI); off means **zero** OpenAI calls |
| `REPO_INTEL_ENABLED` | `true` | repo skeleton + callers in the prompt; `false` degrades every consumer to ripgrep-only |
| `DEVDIGEST_CLONE_DIR` | `./clones` | imported-repo checkouts (git-ignored) |
| `LOG_LEVEL` | `info` (`silent` in test) | pino level |
| `NODE_ENV` | `development` | `test` means silent logs and no global rate limit |

Config is loaded by `src/platform/config.ts`, which marks every secret optional — the app boots with none.

## Secrets

Secrets are **not** part of `AppConfig`. They are read through `SecretsProvider` (`src/adapters/secrets/local.ts`), which is the single chokepoint:

- stored in `~/.devdigest/secrets.json`, mode `0600`, written when a key is entered in Settings;
- `process.env` is the fallback;
- never in git, never in the database;
- `GITHUB_TOKEN` is canonical, `GITHUB_PAT` is accepted for back-compat;
- after storing a key, cached provider clients are dropped so the next resolve picks it up without a restart.

## Database

Migrations are **not** applied on boot. Run `pnpm db:migrate`; pgvector is enabled by migration `0000`. `pnpm db:seed` is idempotent demo data (`acme/payments-api`, PR #482, the two built-in agents). Schema changes go through `pnpm db:generate` — existing migrations and `meta/_journal.json` are append-only.
