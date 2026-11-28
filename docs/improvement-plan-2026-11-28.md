# План покращень dev-digest — 2026-11-28

Аналіз усіх пакетів (`client/`, `server/`, `reviewer-core/`, `e2e/`, CI) за скілами:
`frontend-ui-architecture` (FUA), `react-best-practices` (RBP), `next-best-practices` (NBP),
`fastify-best-practices` (FBP), `drizzle-orm-patterns` (DOP), `security` (SEC).

Пріоритети: **P0** — коректність даних, мало роботи · **P1** — помітно покращує надійність/підтримку · **P2** — гігієна, коли буде час.
Розмір: **S** < 2 год · **M** ~ пів дня · **L** > 1 дня.

## Статус (оновлено 2026-11-28)

| # | Статус | Примітка |
|---|---|---|
| 1 | ✅ зроблено | `deleteAgentRun` і новий `insertReviewWithFindings` у транзакції; тип `DbOrTx` у `db/client.ts`; тест `server/test/reviews-atomic.it.test.ts` |
| 2 | ✅ зроблено | `FileCard key={f.path}`; регресійний тест `DiffViewer.test.tsx` (падає без фіксу). `ToolCallRow` лишився з index — трейс незмінний, ідентифікатора немає |
| 3 | ✅ зроблено | 7 індексів, міграція `0010_tidy_wallop.sql` (`run_traces.run_id` — уже PK) |
| 5 | ❌ не потрібно | `e2e-web.yml` уже робить `pnpm build` на кожну зміну `client/**` |
| 7 | ✅ зроблено | 30 файлів переведено на `@/`; лишилися тільки імпорти `messages/*.json` у тестах (поза `src`) |
| 10 | ✅ зроблено | `app/error.tsx`, `app/global-error.tsx`, `app/not-found.tsx` + `components/route-states` з тестом; тексти в `messages/en/common.json` |
| 21 | ✅ змінено | grounding уже покрито в `server/test/grounding.test.ts`; додано `reviewer-core/test/reduce.test.ts` (score, reduce, sliceDiff) |

Серверні пункти 15, 18, 19 узгодити зі скілом `onion-architecture` (додано паралельно, `pnpm arch:check`).

Що вже добре і чіпати не треба: route-colocated `_components/` з `helpers/constants/styles`; уся робота з API через `lib/api.ts` + `lib/hooks` (жодного `fetch` у компонентах); немає render-factory і `{n && …}`; `react-markdown` з `safeUrlTransform`, mermaid `securityLevel: "strict"`; CSP, helmet, CORS allowlist, rate limit, `bodyLimit`; tenancy-фільтри в `repos`/`agents`/`reviews`; reviewer-core чистий (без `fs`/`env`).

---

## Фаза 1 — швидкі виправлення коректності

| # | Пакет | Що | Докази | Скіл | P | Розмір |
|---|---|---|---|---|---|---|
| 1 | server | **Жодної транзакції в коді** (`.transaction(` — 0). Багатокрокові записи можуть лишити напівстан: `deleteAgentRun` видаляє `reviews`, потім `agent_runs` окремими запитами; `insertReview` + `insertFindings` — окремо (огляд без findings при збої). Обгорнути в `db.transaction`, репозиторні функції приймати `Db \| Tx`. | `server/src/modules/reviews/repository/run.repo.ts` (`deleteAgentRun`), `review.repo.ts` (`insertReview`, `insertFindings`), виклик у `run-executor.ts` | DOP | P0 | S |
| 2 | client | **Index як `key` у списках зі станом.** `DiffViewer` рендерить `FileCard key={i}`, а `FileCard` має `useState(open)` + `InlineComposer` — при зміні списку файлів стан «з'їжджає» на інший файл. Ключ — `f.path`. Те саме для `ToolCallRow key={i}` (взяти id/індекс виклику з трейсу). | `client/src/components/diff-viewer/DiffViewer/DiffViewer.tsx`, `FileCard/FileCard.tsx`, `RunTraceDrawer/_components/TraceBody/TraceBody.tsx` | RBP (Key Prop, CRITICAL) | P0 | S |
| 3 | server | **Індекси на FK.** Postgres не індексує FK автоматично; немає індексів на `agent_runs(pr_id)`, `agent_runs(workspace_id)`, `reviews(pr_id)`, `reviews(run_id)`, `findings(review_id)`, `run_traces(run_id)`, `pr_files(pr_id)`, `pr_commits(pr_id)` — а саме за ними фільтрують списки ранів/findings PR. Додати в `db/schema/*` → `pnpm db:generate`. | `server/src/db/schema/runs.ts`, `reviews.ts`, `pulls.ts` (лише `pr_ws_idx`, `pr_repo_number_uq`) | DOP, postgresql-table-design | P1 | S |

## Фаза 2 — інструменти, які тримають архітектуру

| # | Пакет | Що | Докази | Скіл | P | Розмір |
|---|---|---|---|---|---|---|
| 4 | всі | **Немає лінтера в жодному пакеті** (немає `eslint.config.*`, немає `lint` у `package.json`, CI робить лише typecheck + test). Додати ESLint flat config: `typescript-eslint`, `eslint-plugin-react-hooks`, `@next/eslint-plugin-next` (client); правила меж: client — `src/lib`, `src/components` ✗→ `src/app`; server — `modules/*/routes.ts` ✗→ `drizzle-orm`, `db/schema`. Крок `lint` у кожен workflow. | `.github/workflows/*.yml` | FUA §10, RBP, FBP | P1 | M |
| 5 | client CI | **`next build` не запускається в CI** — помилки, що з'являються лише при збірці (RSC-межі, Suspense для `useSearchParams`, серверні/клієнтські імпорти), не ловляться. Додати `pnpm build`. | `.github/workflows/client.yml` | NBP (Bundling, Suspense) | P1 | S |
| 6 | shared | **Розсинхрон контрактів не перевіряється.** 4 з 10 файлів `client/src/vendor/shared/contracts` відрізняються від серверних (`trace.ts` — лише коментарі; `eval-ci.ts`, `knowledge.ts`, `productionize.ts` — перевірити). Скрипт у CI: зібрати типи, які імпортує client, і перевірити сумісність із серверною копією (або `tsc` client проти серверного контракту). | `client/src/vendor/shared/contracts/*` | FUA §9 | P2 | M |

## Фаза 3 — фронтенд-архітектура

| # | Що | Докази | Скіл | P | Розмір |
|---|---|---|---|---|---|
| 7 | **Глибокі відносні імпорти при наявному `@/`.** 29 файлів імпортують через `../../../…` (до 7 рівнів), лише 13 — через `@/`. Codemod на `@/lib/…`, `@/components/…`; правило лінтера проти `../../..` (п. 4). | `client/src/app/settings/[section]/_components/SettingsView/_components/SettingsModels/SettingsModels.tsx`, `app/repos/[repoId]/pulls/[number]/page.tsx` | FUA §10 | P1 | S |
| 8 | **Товсті клієнтські `page.tsx`.** `pulls/[number]/page.tsx` (185 рядків) — `"use client"`, 8 хуків, резолв number→uuid, інвалідація кешу, стан табів; так само `pulls/page.tsx` (135), `agents/[id]/page.tsx` (124). Винести у `_components/PrDetailView` + хук `usePrDetailPage()`; `page.tsx` лише читає params і рендерить view. | `client/src/app/repos/[repoId]/pulls/[number]/page.tsx` | FUA §2, §5; NBP (RSC boundaries) | P1 | M |
| 9 | **Query keys витікають із data-шару.** Сторінка PR інвалідує `["pr-active-runs", prId]`, `["pr-runs", prId]` рядковими літералами; ключі по всіх `lib/hooks/*.ts` інлайнові. Ввести фабрики ключів (`reviewKeys.runs(prId)`) або `queryOptions()` на домен; винести інвалідацію в хук (`useRefreshRuns(prId)`). | `client/src/lib/hooks/reviews.ts`, `app/repos/[repoId]/pulls/[number]/page.tsx` | FUA §6, TkDodo | P1 | M |
| 10 | **Немає `error.tsx` / `loading.tsx` / `not-found.tsx`** у жодному сегменті — необроблена помилка рендеру кладе весь застосунок. Додати мінімум root `error.tsx` + `global-error.tsx` і `not-found.tsx`; для PR-сторінки — сегментний `error.tsx`. | `client/src/app/**` (жодного файлу) | NBP (Error Handling), RBP (Error Boundaries) | P1 | S |
| 11 | **Мертвий/демо-код у продакшн-дереві.** `components/showcase/Showcase.tsx` (259 рядків, найбільший файл) використовується лише в `test/smoke.test.tsx`. Видалити або перенести в тестові фікстури. | `client/src/components/showcase/` | FUA §12 | P2 | S |
| 12 | **Великі компоненти**: `RunHistory` (235), `FindingsTab` (172), `ReviewRunAccordion` (162), `AddRepoView`, `ConfigTab` (146). Спершу винести логіку в `helpers.ts`/`use*.ts`, потім іменовані частини в `_components/`. | `client/src/app/repos/[repoId]/pulls/[number]/_components/RunHistory/RunHistory.tsx` | FUA §5, RBP | P2 | M |
| 13 | **`lib/types.ts` — шар реекспорту** типів із `@devdigest/shared` (48 рядків). Дублює alias і дає два шляхи до одного типу. Імпортувати напряму з `@devdigest/shared`, файл прибрати. | `client/src/lib/types.ts` | FUA §9 | P2 | S |
| 14 | **CSP `script-src 'unsafe-inline'`** — свідомий компроміс (задокументований у конфігу). Наступний крок — nonce через middleware. | `client/next.config.mjs` | SEC (A02) | P2 | M |

## Фаза 4 — серверна архітектура

| # | Що | Докази | Скіл | P | Розмір |
|---|---|---|---|---|---|
| 15 | **Порушення routes → service → repository.** `pulls/routes.ts` (356 рядків) робить `container.db.select/insert/update` прямо в хендлерах; так само `settings`, `polling`, `workspace` (уже в `server/INSIGHTS.md`). Винести `PullsService` + `PullsRepository`, почати з `pulls`. | `server/src/modules/pulls/routes.ts` | FBP (routes), FUA-принцип «UI тонкий» для API | P1 | L |
| 16 | **Tenancy у repo-intel.** `GET /repos/:id/index-state` і `POST /repos/:id/resync` не перевіряють, що репо належить workspace; `repo-intel/repository.ts` не має жодного фільтра `workspaceId` — всупереч правилу `server/AGENTS.md`. Local-first з одним workspace → низька експлуатованість (SEC: MEDIUM), але правило порушене. Перевіряти власника репо в сервісі. | `server/src/modules/repo-intel/routes.ts`, `service.ts` (`getIndexState`) | SEC (A01) | P1 | S |
| 17 | **Жодної response-схеми** (0 з 37 маршрутів). Немає захисту від випадкового витоку полів з рядків БД і немає швидкої серіалізації. Додавати `response: { 200: … }` зі спільних Zod-контрактів, почати з маршрутів, що повертають рядки БД (`settings`, `agents`, `pulls`). | `server/src/modules/*/routes.ts` | FBP (schemas, serialization) | P2 | M |
| 18 | **Сервіси самі створюють репозиторії** (`new RepoRepository(container.db)` у `repos`, `agents`, `repo-intel`, `reviews`) — не підмінити в тестах без БД. Реєструвати репозиторії в DI-контейнері. | `server/src/modules/*/service.ts`, `platform/container.ts` | FBP (plugins/decorators) | P2 | M |
| 19 | **God-файли**: `repo-intel/service.ts` (765), `repo-intel/repository.ts` (618), `reviews/run-executor.ts` (433), `adapters/astgrep/index.ts` (641). Ділити за use case (index-state, resync, map, callers). | ці файли | FUA §5 (сигнали розбиття) | P2 | L |
| 20 | **Проковтнуті помилки**: `resync` робить `catch {}` без логування — відмова enqueue невидима. Мінімум `req.log.warn`. | `server/src/modules/repo-intel/routes.ts` | FBP (logging), SEC (A09) | P2 | S |

## Фаза 5 — reviewer-core і тести

| # | Що | Докази | Скіл | P | Розмір |
|---|---|---|---|---|---|
| 21 | **Немає окремих тестів для `grounding.ts` і `review/reduce.ts`**, хоча grounding «обов'язковий» за `reviewer-core/AGENTS.md`. Додати unit-тести: findings поза diff відкидаються, score перераховується; map-reduce об'єднує findings; null-ціна одного чанка → `costUsd: null` (див. `reviewer-core/INSIGHTS.md`). | `reviewer-core/test/` (лише `run`, `prompt`, `to-review`) | — (TESTING.md) | P1 | S |

---

## Рекомендований порядок

1. **Тиждень 1:** п. 1, 2, 3, 10, 7, 5, 21 — усе S, закриває ризики даних і дає базову страховку.
2. **Тиждень 2:** п. 4 (лінтер + межі), потім 8 і 9 разом (одна сторінка PR), 16.
3. **Далі:** 15 (pulls як зразок шару), 17, 18, 19, 12, 11, 13, 6, 14, 20.

Перед кожним кроком, що зачіпає кілька пакетів (п. 6, 17), — спершу spec у `specs/` (правило з `AGENTS.md`).
