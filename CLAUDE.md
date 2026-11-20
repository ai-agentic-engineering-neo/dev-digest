# DevDigest — локальний AI-рев'ю pull request'ів (стартер, роадмап M1–M8 у README.md)

## Stack
Node ≥22 · pnpm ≥10 · TypeScript 5.x · Zod 3.25 (не v4) · vitest 2 · Postgres 16 + pgvector (Docker) · GitHub Actions (5 workflow'ів, path-filtered)

## Map
- client/        — Next.js 15 UI :3000              → client/CLAUDE.md
- server/        — Fastify 5 API :3001 + БД + jobs  → server/CLAUDE.md
- reviewer-core/ — чистий движок рев'ю (без БД/FS)  → reviewer-core/CLAUDE.md
- e2e/           — детерміновані браузерні флоу     → e2e/CLAUDE.md
- docs/          — наскрізні документи (онбординг, промпти агентів)
- scripts/       — dev.sh (весь стек), e2e.sh (герметичний e2e)

Працюєш у підпроєкті → спершу прочитай його CLAUDE.md (автозавантаження ненадійне у VS Code-розширенні).

## Commands
- Весь стек з нуля: `./scripts/dev.sh` (`--no-client`, `--db-only`, `--no-seed`)
- Тести/typecheck — з теки пакета, див. його CLAUDE.md

## Cross-package conventions
- Monorepo-workspace НЕМАЄ: у кожного пакета свій package.json і lockfile.
  pnpm — client/, server/; npm — reviewer-core/, e2e/. Не змішувати.
- Код між пакетами — через tsconfig path aliases; server імпортує сирці ../reviewer-core/src
- Zod-контракти скопійовано двічі: server/src/vendor/shared і client/src/vendor/shared, копії вже розійшлися.
  Змінюєш контракт → онови обидві копії. reviewer-core читає копію з server/.
- Зміна в reviewer-core/** запускає CI server-unit — перевір і server typecheck
- .claude/skills/* — вендорні skills для асистента, не код продукту

## Do not touch
- `docker compose down -v` — знищує том devdigest_pgdata з усіма імпортованими репо
- ~/.devdigest/secrets.json — секрети не потрапляють у БД, git чи логи

## Read when
- Before changing architecture or a cross-package flow → read README.md ("Architecture")
- Before your first task in this repo → read docs/ONBOARDING.md
- Before adding or changing an API route → read server/README.md ("API map")
- Before writing or running tests, or touching CI → read TESTING.md
- Before editing a reviewer agent prompt → read docs/agent-prompts/README.md
- Before editing a package → read its INSIGHTS.md
