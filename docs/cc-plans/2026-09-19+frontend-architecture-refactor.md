# Plan: рефакторинг архітектури фронту (`client/`)

## Context

Аудит `client/src` (185 файлів, ~8,2 тис. рядків без `vendor/`) за скілами `frontend-ui-architecture`, `react-best-practices` і `next-best-practices`. Колокація `_components/<Name>/` вже дотримана добре. Проблеми зосереджені в трьох місцях: шар даних `lib/`, товсті `page.tsx` і shared-код не на своєму рівні.

Там, де `react-best-practices` суперечить конвенціям проєкту (Tailwind, Axios, `useApiQuery`), лишаємо конвенції проєкту. Бекенд і продуктивність поза scope. У `vendor/shared` лише **додаємо** схеми, в обидві копії.

Рішення користувача:
- ручні wire-типи переносимо в контракти (client і server копії);
- `lib/format.ts` лишається в `lib/`;
- включаємо `AppShell` у layout, перевірку меж імпорту через dependency-cruiser (як у `server/`, для клієнта ще не налаштовано) та i18n хардкод-рядків;
- `showcase` переносимо до його єдиного споживача, у `src/test/` (див. крок 8).

Кожен крок — окремий коміт. Після кожного: `pnpm typecheck && pnpm test` у `client/`.

## Кроки

### 1. Спайк: runtime-імпорт з `@devdigest/shared`
- **Проблема.** `vendor/shared/index.ts` реекспортує `./contracts/*.js`, а webpack у Next.js не резолвить `.js` у `.ts`, тож клієнт імпортує лише типи (див. [lib/feature-models.ts:6-12](client/src/lib/feature-models.ts)).
- **Рішення.** У `client/next.config.mjs` додати `webpack(config) { config.resolve.extensionAlias = { ".js": [".ts", ".tsx", ".js"] }; return config; }`.
- **Перевірка.** `pnpm build` і `pnpm dev` з одним runtime-імпортом схеми.
- **Fallback.** Прямий імпорт `@devdigest/shared/contracts/<x>` (path alias уже є в `tsconfig`).
- **Далі.** Видалити `lib/feature-models.ts`. `SettingsModels.tsx` імпортує `FEATURE_MODELS` з shared.

### 2. Модулі ресурсів `lib/api/<resource>.ts` замість `lib/hooks/`
- **Що переносимо.** `lib/api.ts` (`apiFetch`, `ApiError`) → `lib/api/client.ts`. `apiFetch` отримує опційну схему: `apiFetch(path, init, schema?) → schema ? schema.parse(json) : json`.
- **Нова структура.** Вміст `lib/hooks/{core,agents,reviews,trace,repo-intel}.ts` розкласти по ресурсах: `settings.ts`, `repos.ts`, `pulls.ts`, `context.ts`, `agents.ts`, `reviews.ts` (runs, comments, findings, SSE `useRunEvents`), `trace.ts`, `repo-intel.ts`.
- **Вміст модуля.** Експортована key factory (`pullKeys = { all, list: (repoId), detail: (id) }`), fetcher-и, `queryOptions`, query- і mutation-хуки. Модуль лишається без директив (`"use client"` прибрати). Server Components можуть імпортувати fetcher-и.
- **Інвалідація.** Усі `invalidateQueries` і `setQueryData` працюють лише через key factory. Прибрати ручні ключі в [pulls/[number]/page.tsx:52,57](client/src/app/repos/[repoId]/pulls/[number]/page.tsx).
- **Прибирання.** Видалити хаб `lib/hooks/index.ts`, імпорти перевести на конкретні модулі (7 файлів).

### 3. Контракти замість ручних типів, видалити `lib/types.ts`
- **Нові Zod-схеми.** Додати в **обидві** копії: `client/src/vendor/shared/contracts/` і `server/src/vendor/shared/contracts/`.
  - `ActiveRun`, `CreateCommentInput` і `RunReviewInput` — у `review-api.ts`.
  - `CreateAgentInput` і `UpdateAgentInput` — у `knowledge.ts`, поруч з `Agent`.
  - `RepoIntelState` — у `platform.ts`.
  - Перед цим звірити з серверними Zod-схемами роутів, щоб не дублювати наявні.
- **Типи.** Тип береться через `z.infer`, відповіді парсяться в модулях з кроку 2.
- **`lib/types.ts`.** Прибрати: імпортувати напряму з `@devdigest/shared`, видалити мертвий `PrRowView` (0 споживачів).

### 4. Тонкий `pulls/[number]/page.tsx` (185 рядків)
- **`FindingsTab`.** Сам викликає `usePrRuns`, `usePrActiveRuns`, `useCancelRun`, `useDeleteRun` і `usePrReviews` за `prId`. Пропсів стає 13 → ~5, а `cancelMutation: UseMutationResult<any…>` зникає.
- **URL.** Керування `tab` і `trace` винести в колокований `_lib/usePrDetailParams.ts`.
- **Стилі.** Inline-стилі перенести в `styles.ts`, як у сусідніх компонентах.
- **Поза scope.** Резолв `number → uuid` через список PR лишається (потребує бекенду). Записати в INSIGHTS як відкрите питання.

### 5. Тонкий `agents/[id]/page.tsx`
- Створити `_components/AgentEditorView/` (`AgentEditorView.tsx`, `styles.ts`, `index.ts`) за зразком `agents/_components/AgentsListView`.
- `page.tsx` лише рендерить view.

### 6. `pulls/page.tsx`: логіку в helpers і model, стан в URL
- **Helpers.** `filterPulls(pulls, {status, q, sort})` і `countPulls(pulls)` винести в `pulls/helpers.ts`, додати тести в наявний `helpers.test.ts`.
- **Model.** `OPEN_STATUSES`, `SIZE_SMALL_MAX`, `SIZE_MEDIUM_MAX` і `sizeOf` перенести в `pulls/_lib/model.ts`: це бізнес-пороги. `STATUS_META`, `SIZE_COLOR`, `GRID` і `COLUMN_KEYS` лишаються в `constants.ts` (UI).
- **Constants.** Прибрати `export type { PrMeta }` з [constants.ts:63](client/src/app/repos/[repoId]/pulls/constants.ts).
- **URL.** `sort` і `q` перенести в URL (`?sort=&q=`), як обіцяє коментар у шапці файлу.

### 7. Прибрати `useEffect`, які синхронізують стан
- **[ConfigTab.tsx](client/src/app/agents/[id]/_components/AgentEditor/_components/ConfigTab/ConfigTab.tsx).** Замість 9 `useState` плюс effect-скидання: `key={agent.id}` у батька і один `useState<Draft>`.
- **[FindingsPanel.tsx:43-45](client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/FindingsPanel.tsx).** `setFocusIdx(0)` робити в обробниках фільтрів замість effect.

### 8. Shared-код на правильний рівень
| Що | Куди |
|---|---|
| `components/mermaid-diagram/` (0 споживачів) | видалити; `pnpm remove mermaid` |
| `components/showcase/` (лише smoke-тест; маршруту `/showcase` вже нема) | `src/test/showcase/` як тестовий fixture, виправити застарілий коментар |
| `components/diff-viewer/` (1: `DiffTab`) | `pulls/[number]/_components/DiffTab/diff-viewer/…`; оновити імпорт у `test/smoke.test.tsx` |
| `components/findings-preview/` (1: `PRRow`) | `pulls/_components/PRRow/FindingsPreviewCard/` |
| `components/page-shell/` (1: root page) | `app/_components/PageShell/` |
| `components/repo-not-found/` (2 під `repos/[repoId]`) | `app/repos/[repoId]/_components/RepoNotFound/` |
| `lib/github-urls.ts` (2 під `pulls/[number]`) | `pulls/[number]/_lib/github-urls.ts` |

Три форматери часу звести в один `lib/date.ts` поруч із `lib/format.ts`: `formatWhen` ×2 ([ReviewRunAccordion.tsx:21](client/src/app/repos/[repoId]/pulls/[number]/_components/ReviewRunAccordion/ReviewRunAccordion.tsx), `CommentCard.tsx:11`) і `relativeTime` ([pulls/helpers.ts:12](client/src/app/repos/[repoId]/pulls/helpers.ts)). До них додати тест.

### 9. `AppShell` у layout
- **Route group.** Створити `app/(shell)/layout.tsx` і перенести туди `page.tsx` (root), `agents/`, `repos/`, `settings/`. URL не змінюються. `onboarding/` лишається поза групою, бо без shell.
- **Layout.** `(shell)/layout.tsx` рендерить `<AppShell>` із `CrumbProvider`.
- **Крихти.** Сторінки задають крихти через `<ShellCrumb items={…} />`: effect, що записує в context, бо це синхронізація із зовнішнім shell. Ці компоненти живуть у `components/app-shell/`.
- **Прибирання.** З 6 сторінок/view (`SettingsView`, `AgentsListView`, `PageShell` і сторінки) прибрати обгортки `<AppShell>`.

### 10. Гігієна
- Імпорти уніфікувати на `@/` (51 глибокий відносний імпорт).
- Стабільні `key` замість `key={i}`: `DiffViewer` (`f.path`), `FileCard`, `TraceBody` (`tool_calls`).
- Прибрати зайвий `"use client"` в [onboarding/page.tsx](client/src/app/onboarding/page.tsx).
- **i18n.** Хардкод-рядки перенести в наявні namespace-и: root page → `shell.json`, `agents/[id]` → `agents.json`, `pulls/[number]` → `prReview.json`, `AddRepoView` → `onboarding.json`.

### 11. Перевірка меж імпорту: dependency-cruiser для `client/`
- **Конфіг.** `client/.dependency-cruiser.cjs` за зразком [server/.dependency-cruiser.cjs](server/.dependency-cruiser.cjs). Скрипти `pnpm arch` і `pnpm arch:baseline`, devDep `dependency-cruiser` (через `pnpm add -D`). Правила:
  - `shared-not-importing-app`: `src/(components|lib)/` не імпортують `src/app/`;
  - `no-sibling-route-internals`: файл не імпортує `_components/` чи `_lib/` маршруту, який не є його предком;
  - `no-circular`;
  - `lib-api-only-via-modules`: заборона повертати хаб `lib/hooks`.
- **Baseline.** Якщо після кроків 1–10 лишаться порушення, заморозити їх у `.dependency-cruiser-known-violations.json`.
- **Скіл.** Оновити `frontend-ui-architecture` до **v1.1.0**: у SKILL.md рядок «Enforced by `cd client && pnpm arch`», у README — changelog.

## Виконання сабагентами

Кроки виконують сабагенти (`general-purpose`). Я (Opus) веду оркестрацію:
- даю кожному агенту точний бриф: крок, файли, скіли, які треба прочитати (`frontend-ui-architecture`, `react-best-practices`, `next-best-practices`, `client/INSIGHTS.md`), і критерій готовності `pnpm typecheck && pnpm test`;
- рев'юю diff;
- перевіряю в браузері;
- комічу по кроку.

| Крок | Модель | Чому |
|---|---|---|
| 1 спайк `extensionAlias` | Sonnet | діагностика збірки, можливий fallback |
| 2 `lib/api/<resource>` + key factories | Sonnet | дизайн модулів, інвалідація кешу |
| 3 контракти в обох копіях | Sonnet | звірка з серверними схемами |
| 4 тонкий PR detail + `FindingsTab` | Sonnet | перерозподіл даних і пропсів |
| 5 `AgentEditorView` | Haiku | механічне перенесення JSX і стилів |
| 6 `pulls` helpers/model + URL-стан | Sonnet | логіка + тести |
| 7 прибрати effects (`ConfigTab`, `FindingsPanel`) | Sonnet | тонка поведінка форми |
| 8 переміщення shared-коду + `lib/date.ts` | Haiku | переміщення файлів і імпортів |
| 9 `AppShell` у `(shell)` layout | Sonnet | route group + context крихт |
| 10 імпорти `@/`, `key`, `use client`, i18n | Haiku | механічні заміни |
| 11 dependency-cruiser + скіл v1.1.0 | Sonnet | правила й baseline |

**Порядок:**
1. Кроки 1 → 2 → 3 послідовно, бо це фундамент для решти.
2. Кроки 4, 5, 6, 7 паралельно: у них різні файли.
3. Кроки 8 → 9 → 10 → 11 послідовно, бо вони масово змінюють імпорти.

Якщо Haiku-агент не пройде typecheck чи тести з першої спроби, переналаштовую бриф і перезапускаю на Sonnet.

**Коміти.** Кожен завершений і перевірений крок — окремий коміт, тобто 11 комітів.
- **Коли комічу.** Лише після того, як для кроку пройшли `pnpm typecheck && pnpm test`, для кроків 1, 2, 9 і 11 ще й `pnpm build`, а якщо крок змінює UI, то й перевірка в браузері. Сабагенти не комітять самі.
- **Паралельна пачка 4–7.** Комічу кожен крок окремо, додаючи в коміт лише його файли (`git add <paths>`).
- **Повідомлення.** Conventional Commits, англійською, у стилі історії репо. Subject описує крок: `refactor(client): …`, `feat(client): …` чи `chore(client): …`. У body коротке «чому» і посилання на пункт плану.
- **Перший коміт** (крок 1) включає архівований план `docs/cc-plans/2026-09-19+frontend-architecture-refactor.md`.
- **Крок 3** в одному коміті містить client- і server-копії контрактів.

## Файли, що змінюються найбільше
- `client/next.config.mjs`
- `client/src/lib/**` (новий `lib/api/`, видалення `hooks/`, `types.ts` і `feature-models.ts`)
- `client/src/vendor/shared/contracts/{review-api,knowledge,platform}.ts` і дзеркальні файли в `server/src/vendor/shared/contracts/`
- `client/src/app/**/page.tsx` (переїзд у `(shell)/`)
- `client/src/components/**` (переміщення)
- `client/package.json` (прибрати `mermaid`, додати `dependency-cruiser`)

## Verification
- **Після кожного кроку.** У `client/`: `pnpm typecheck`, `pnpm test`. Після кроків 1, 2, 9 і 11 також `pnpm build`.
- **Кроки 3 і 11.** У `server/`: `pnpm typecheck && pnpm test`, бо змінились контракти, та `pnpm arch`.
- **У браузері (preview `client`).** Пройти сценарії:
  - список PR: фільтр, пошук, сортування переживають reload;
  - деталі PR: таби, запуск рев'ю зі SSE-логом, trace drawer, diff з коментарями;
  - редактор агента: перемикання агентів скидає форму;
  - settings: моделі та ключі;
  - onboarding без shell.
- **Консоль.** Перевірити, що немає помилок і що `ZodError` не з'являється.
- **Wrap-up.** `/engineering-insights`.

## Після затвердження
- `mv ~/.claude/plans/enchanted-riding-river.md docs/cc-plans/2026-09-19+frontend-architecture-refactor.md`.
- Видалити попередню чернетку `~/.claude/plans/frontend-architecture-audit.md`.
- Архівований план іде в перший коміт реалізації.
