# Development Plan: 4 субагенти після implementer — test-writer, architecture-reviewer, plan-verifier, doc-writer
Save as: docs/plans/2026-09-24-review-test-doc-agents.md
Packages: repo tooling (`.claude/agents/`); агенти працюють над server, client, reviewer-core, e2e · Base: feat/lab3@301874f · Spec: none (вимоги — завдання користувача + 4 звіти researcher)
Status: затверджено користувачем 2026-09-24 (усі Open questions — за default)

## Goal
У `.claude/agents/` з'являються 4 проектні агенти з вузькими ролями й фіксованими форматами виводу, як у `researcher`/`planner`/`implementer`: `test-writer` пише лише тести; `architecture-reviewer` і `plan-verifier` — read-only, запускаються паралельно над одним знімком коду; `doc-writer` пише лише README і `docs/**`. `.claude/agents/README.md` оновлено: каталог, pipeline, розділи агентів, джерела. Security-рев'юер лишається окремим майбутнім агентом.

## Out of scope
- Security-рев'юер.
- Зміни форматів виводу `planner`/`implementer`/`researcher`.
- Зміни `settings.json`, хуків, `routing.json`, скілів, `CLAUDE.md`, `INSIGHTS.md`.
- Встановлення інструментів (MSW, Stryker, mmdc).

## Context used
- INSIGHTS для test-writer — `server/INSIGHTS.md`: `overrides.llm` в `*.it.test.ts` (інакше реальний платний LLM-виклик); чекати конкретний run id на seeded PR; `tsconfig` не покриває `test/**` (фейки ламаються лише в рантаймі); прогрів пулу в тестах конкурентності; перший pull testcontainers; `REVIEW_MAP_CONCURRENCY`. `client/INSIGHTS.md`: `renderWithProviders` + `mockFetch`; повний suite окремо від tsc/biome; оптимістичні мутації; фільтр vitest підрядком (дужки маршрутів); `beforeEach` з блоковим тілом; `__dirname` у jsdom; dnd-kit; `findBy…({timeout})` для dynamic-редакторів. `reviewer-core/INSIGHTS.md`: лише `test/fixtures`, без server mocks; формат escape `wrapUntrusted` закріплено в `server/test/prompt-callers.test.ts`.
- INSIGHTS для architecture-reviewer — server: application не імпортує `db/rows`; p-queue = FRAMEWORK для application; baseline може лише зменшуватись (зараз `[]`); підключення модулів лише в `composition.ts`; помилки через `AppError.kind`; response-схеми з контракту `@devdigest/shared`. Client: `@devdigest/ui` barrel у RSC-файлах без `"use client"` не ловиться tsc/vitest/build (є grep-перевірка); сторінки = async Server Components; query keys лише з `keys.ts`; barrel `@devdigest/shared` тягне zod.
- Промпти посилаються на INSIGHTS за темою, а не за номером рядка: файли append-only, номери рядків зсуваються.
- Docs: `TESTING.md`, `*/AGENTS.md`, `server/docs/README.md` (docs = deep dives, sequence diagrams, decision records; посилання з README + рядок «Read when» в AGENTS.md), `docs/review-flow.md`.
- Скіли: `pr-self-review` (+ `reference/severity.md`), `onion-architecture` (+ `references/testing.md`), `frontend-ui-architecture`, `react-testing-library`, `fastify-best-practices/rules/testing.md`, `mermaid-diagram`, `engineering-insights`.
- Шаблони: `implementer.md` — для агентів, що пишуть; `planner.md`/`researcher.md` — для read-only.

## Constraints & decisions
**Спільне**
- Frontmatter з рядка 1: `name` + `description` («що + коли + Not for …») — `.claude/agents/README.md` §Adding.
- Без `Agent`, `memory`, `isolation`, preload скілів — README §Sources (Sub-agents).
- Кожен агент читає `AGENTS.md` + `INSIGHTS.md` пакетів свого scope — `CLAUDE.md` §Read when.
- Жоден не пише `INSIGHTS.md` і не комітить; кандидати → «Insight candidates».
- Описи починаються з «DevDigest …»: у `~/.claude/agents` є загальні `tester`/`writer`/`reviewer`/`architect`.

**test-writer** — sonnet/high; `Read, Edit, Write, Grep, Glob, Bash, Skill`; yellow.
- Межі запису: `**/*.test.ts(x)`, `**/*.it.test.ts`, `server/test/**`, `reviewer-core/test/**`, нові `client/src/test/*-fixtures.ts`; наявні `client/src/test/{render.tsx,fetch-mock.ts,setup.ts,fake-event-source.ts}` — лише адитивно; `e2e/flows/*.flow.json` — лише якщо план вимагає. Ніколи: продакшн-код, `vitest.config.*`, `package.json`, lockfiles, `src/vendor/**`.
- Режими `red-first` (до implementer; падіння на assertion/404, не на синтаксисі) і `backfill` (після implementer). [T1][T3]
- Ніколи не змінювати тест, щоб пройшов; ніколи не правити продакшн-код; коректний червоний тест лишається червоним (без `.skip/.fails/.todo`) → `STATUS: BLOCKED` + «Suspected bugs». [T3]
- Проти тавтологій: очікування з spec/плану/контракту/bug report; для кожного тесту «would fail if …»; класичні фейки без підрахунку викликів (`onion-architecture/references/testing.md`). [T4][T5][T6]
- Скіли: `routing.json` для тестового й тестованого файлу + таблиця для `server/test/**`, `reviewer-core/test/**` (не маршрутизовані). Конфлікти: (a) fastify skill на `node:test` → Vitest API; (b) RTL skill радить MSW → у client `mockFetch`, встановлення заборонені; (c) next-intl уже в `render.tsx` → конфіг не чіпати. [T7][T12][T13]
- Назви: `*.it.test.ts` при імпорті `test/helpers/pg.ts`; client `_components/<Name>/<Name>.test.tsx`; reviewer-core `test/*.test.ts` + `test/fixtures`; «один happy path + одна важлива межа» (`TESTING.md`).
- Gates: цільовий файл → повний suite пакета + typecheck + lint; integration лише з Docker; client suite окремо від tsc/biome; reviewer-core `test:coverage`.
- Заборони: `vitest -u`, `.only`, `.skip`, installs, git що змінює стан, `docker compose down -v`, `db:migrate`, `next build`.

**architecture-reviewer** — opus/high; `Read, Grep, Glob, Bash`, `disallowedTools: Write, Edit, NotebookEdit, Skill`; red.
- Спершу детерміновані перевірки (ground truth) [A5][A7]: `pnpm arch:check`; `--no-ignore-known` для контексту; `typecheck` пакетів diff; `./scripts/check-shared-drift.sh`; grep-перевірка RSC ← `@devdigest/ui`.
- Заборонено: `next build`/`pnpm build` (пише `.next/`, переписує tracked `next-env.d.ts`/`tsconfig.json`, ламає dev), `depcruise-baseline`, `--fix/--write`, тести, installs, docker.
- Baseline `[]`: нове порушення `arch:check` або ріст baseline = CRITICAL; легасі на незмінених рядках — LOW-контекст (`severity.md`).
- Scope — рядки, змінені від base (+ untracked); base з плану або `git merge-base HEAD main`.
- Severity — шкала `severity.md` (CRITICAL/HIGH/MEDIUM/LOW), узгоджено з `/pr-self-review`.
- Знахідка: `# · Severity · Rule (source) · file:line · Import chain · Evidence · Confidence · Fix`. Самоперевірка кожного кандидата (перечитати, заново простежити імпорти, рядок у diff, цитата правила); confidence < 80 → відкинути. [A1][A2]
- `VERDICT: PASS | BLOCK | INCOMPLETE`.

**plan-verifier** — opus/high; як architecture-reviewer за інструментами; purple.
- Вхід: план (обов'язково), spec (з `Spec:` або явно), Implementation Report / Test Report (опційно — вказівники, не докази). [P1]
- Може повторно запускати герметичні «Done when» і рядки Verification plan; integration — лише за прапорцем `run-integration`; ніколи `e2e.sh`, `db:*`, installs, `next build`, `depcruise-baseline`.
- Рядок на кожен пункт (Sx.files / change / tests / done-when / rules, Contracts & migrations, Out of scope, кожен AC). Колонки: `ID · Item (quoted) · Method · Evidence · Verdict`. Вердикти: `PASS`, `FAIL-missing`, `FAIL-partial`, `FAIL-wrong`, `CANNOT_VERIFY — <що бракує>`. [P1][P2][P3][P6]
- Scope creep = (`git diff --name-only <base>` ∪ untracked) − (Files усіх кроків ∪ Deviations) → «Not traceable»; кроки без змін → «Planned but untouched» (власна техніка).
- Заборона загальних порад: немає Recommendations, кожен рядок цитує план/spec. [P2][P8]
- `VERDICT: PASS | FAIL | INCOMPLETE`.

**doc-writer** — sonnet/medium; `Read, Edit, Write, Grep, Glob, Bash, Skill`; cyan.
- Межі запису: `README.md` (root, пакетів, модулів), `docs/**`, `<pkg>/docs/**`, `TESTING.md` (лише при зміні стратегії тестування), один адитивний рядок «Read when» у `<pkg>/AGENTS.md` або `CLAUDE.md`. Ніколи: `specs/**`, `INSIGHTS.md`, `docs/plans/**`, `docs/agent-prompts/**` (якщо не просили), код.
- Таблиця розміщення: огляд/API/env → `<pkg>/README.md`; будова модуля → `server/src/modules/<m>/README.md`; deep dive → `<pkg>/docs/<topic>.md` + посилання + Read when; крос-пакетний потік → `docs/<flow>.md` + абзац у `README.md` §Architecture. Diátaxis як лінза (how-to + reference). [D1]
- Твердження звіряються з поточним кодом, не з планом; посилання замість копій. [D2]
- Mermaid через skill `mermaid-diagram` у стилях репо; без `C4Context`/`C4Container`. [D4][D5][D6]
- ADR лише на запит (Nygard/MADR, у `<pkg>/docs/`). [D7][D8]

**Pipeline**: planner → approval → [test-writer red-first] → implementer → [test-writer backfill] → architecture-reviewer ∥ plan-verifier → BLOCK/FAIL → implementer / test-writer → re-run → обидва PASS → doc-writer → WRAP-UP → `/pr-self-review`.

## Steps
### S1 — `test-writer` [tooling]
- Files: A `.claude/agents/test-writer.md`
- Done when: frontmatter з рядка 1, `name: test-writer`, `Not for`, `STATUS: DONE | PARTIAL | BLOCKED`.
### S2 — `architecture-reviewer` [tooling]
- Files: A `.claude/agents/architecture-reviewer.md`
- Done when: `disallowedTools: Write, Edit, NotebookEdit, Skill`; немає Write/Edit у `tools`; `VERDICT: PASS | BLOCK | INCOMPLETE`.
### S3 — `plan-verifier` [tooling]
- Files: A `.claude/agents/plan-verifier.md`
- Done when: `FAIL-missing`, `CANNOT_VERIFY`, `ls-files --others --exclude-standard`, `disallowedTools` присутні.
### S4 — `doc-writer` [tooling]
- Files: A `.claude/agents/doc-writer.md`
- Done when: згадано C4-заборону, `specs/`, `STATUS: DONE | PARTIAL | BLOCKED`.
### S5 — README агентів [tooling]
- Files: M `.claude/agents/README.md` — каталог +4, pipeline, розділи агентів, «Sources behind the agents» + нові джерела, «Not backed by an official source».
### S6 — Валідація
1. Цикл перевірки frontmatter усіх агентів — порожній вивід.
2. `claude plugin validate .claude/agents` (якщо команда не приймає директорію — лишається п.1 + `/agents`).
3. Перезапуск сесії → `/agents` показує 7 проектних агентів.
4. Smoke: plan-verifier на цьому плані; architecture-reviewer від base `301874f` → PASS «nothing in scope».

## Contracts & migrations
- none

## Risks
- Межі запису test-writer і doc-writer тримаються лише на промпті (у frontmatter немає path-scope). Пом'якшення: обов'язковий «Changed files»; plan-verifier і `/pr-self-review` ловлять зайве.
- `pnpm` може бути відсутній на WSL → `npx -y pnpm@10`.
- Автоделегування може вибрати користувацьких `tester`/`writer`/`reviewer` → специфічні описи, виклик на ім'я.
- red-first лишає червоний suite до implementer — очікувано.

## Затверджені рішення (Open questions → default)
- `settings.json` deny для INSIGHTS/design/clones/`depcruise-baseline` — **не додавати** в цій зміні.
- PreToolUse-хуки для path-allowlist — не використовувати.
- `implementer.md` не правити; caller передає «тести з red-first звіту read-only» в делегуванні.
- doc-writer може додати один рядок «Read when» (фіксує в «Pointers updated»).
- Моделі: рецензенти opus/high, writers sonnet (doc-writer — medium).

## Sources
Звіти researcher (2026-09-24): [T*] test-writer, [A*] architecture-reviewer, [P*] plan-verifier, [D*] doc-writer — перелік URL у `.claude/agents/README.md` §Sources behind the agents.
