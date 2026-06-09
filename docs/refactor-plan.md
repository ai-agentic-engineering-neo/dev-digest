# Refactor Plan — DevDigest apps

> **Статус виконання (виконано за один прохід, спрощено — без оверінженірингу):**
> - **Фаза 1 (звʼязаність)** — зроблено простим способом: спільні row-типи в
>   `server/src/db/rows.ts`; спільні репозиторії через ліниві геттери на `Container`
>   (`agentsRepo`/`reviewRepo`/`runsRepo`), споживачі типізовані через
>   `Container['agentsRepo']` (без портів-інтерфейсів/DTO-шарів). 0 крос-модульних
>   імпортів чужого `repository.ts`.
> - **Фаза 2–3 (сервер)** — `reviews/repository.ts` розбито по агрегатах (`repository/`),
>   god-services `reviews` (770→227), `onboarding` (422→11 фасад), `eval` (386→232),
>   `ci` (384→226), `runs` (311→259), `conventions` (309→70) декомпозовано; публічні API класів незмінні.
> - **Фаза 4–5 (клієнт)** — `vendor/ui/{primitives,kit,shell}.tsx` → теки-барелі по
>   компонентах (зовнішні імпорти незмінні); `pulls/[number]/page.tsx` 477→212.
> - **Фаза 0 (ESLint-огорожі) — свідомо ПРОПУЩЕНО** як оверінженірінг (конфіг із нуля
>   + import-плагіни). За потреби додається пізніше.
> - Верифікація: `server` typecheck ✓ + 43 unit-тести ✓; `client` typecheck ✓.
>   (4 пре-існуючі падіння в `skills/` — мок не оновлено під `useDeleteSkill`, поза рефактором.)
> - Найбільші файли тепер: `reviews/run-executor.ts` (369, цілісний `runOneAgent`),
>   `db/seed.ts` (367, демо-дані) — обидва виправдані.



> Мета: довести кодову базу до **Onion / Hexagonal + Vertical Slices** з **слабкою
> звʼязаністю**, прибрати god-файли (>400 рядків без причини), винести всі хелпери
> в `helpers.ts`, константи в `constants.ts`, типи — окремо (крім дрібних локальних),
> і **машинно зафіксувати** межі, щоб структура не деградувала.

Документ — джерело істини для серії PR. Кожна фаза = один PR (де явно не сказано
інакше), зі своїм acceptance-критерієм і перевірками (`pnpm typecheck && pnpm test && pnpm lint`).

---

## 1. Принципи

1. **Правило залежностей — лише всередину.** Стрілки залежностей вказують до ядра:
   `routes / UI → service (application) → ports → adapters / db (infrastructure)`.
   Ядро (`@devdigest/shared` контракти) не знає ні про що зовні.
2. **Модуль = вертикальний зріз.** Один модуль НЕ імпортує `repository.ts` іншого
   модуля. Дозволена взаємодія — лише через **порт-інтерфейс** або публічний
   `service`-фасад, отриманий через DI-контейнер.
3. **Жодних магічних значень і інлайн-хелперів** у `service.ts` / `*.tsx`.
4. **≤ 400 рядків на файл** (warn), розбиття обовʼязкове понад 500 — крім файлів зі
   згенерованим/портованим вмістом, явно позначених коментарем `// codegen` / `// vendored`.
5. **Типи окремо**, коли їх >2 або вони експортуються; дрібні локальні — на місці.

---

## 2. Цільова архітектура

```
                    ┌─────────────────────────────────────────┐
   DOMAIN CORE      │  @devdigest/shared  (Zod-контракти+типи)  │  ← нуль залежностей
                    │  + _shared/ports.ts (read-порти зрізів)   │
                    └───────────────▲───────────────────────────┘
                                    │ implements / depends-on (interface)
   APPLICATION      ┌───────────────┴───────────────────────────┐
   (modules/*/      │  service.ts — оркестрація use-case'ів       │
    service.ts)     │  отримує порти через конструктор (DI)       │
                    └───────────────▲───────────────────────────┘
                                    │
   INFRASTRUCTURE   ┌───────────────┴───────────────────────────┐
                    │  repository.ts (Drizzle)  adapters/*  db/   │
                    └───────────────▲───────────────────────────┘
                                    │
   EDGE             ┌───────────────┴───────────────────────────┐
                    │  routes.ts (Fastify)   client app/ pages    │
                    └─────────────────────────────────────────────┘
```

**Сервер уже на 80% такий** (`platform/` = composition root, `adapters/` = порти,
`modules/` = зрізи). Доводимо до кінця + прибираємо крос-модульні витоки.

---

## 3. Поточні порушення (база для робіт)

### 3.1 Великі файли

| Файл | Рядків | Дія | Фаза |
|---|---:|---|---|
| `client/src/vendor/ui/primitives.tsx` | 791 | розбити по компонентах у теку-барель | 4 |
| `server/src/modules/reviews/service.ts` | 770 | винести executor/intent/smart-diff/findings | 3 |
| `client/src/vendor/ui/kit.tsx` | 730 | розбити по компонентах | 4 |
| `client/.../pulls/[number]/page.tsx` | 477 | винести секції в `_components`, тонкий композитор | 5 |
| `server/src/modules/onboarding/analyzer.ts` | 422 | розділити parsers/walkers/facts | 3 |
| `server/src/modules/eval/service.ts` | 386 | винести scoring + dashboard | 3 |
| `server/src/modules/ci/service.ts` | 384 | винести генератори YAML/файлів | 3 |
| `client/src/vendor/ui/shell.tsx` | 370 | розбити Nav/RepoSwitcher/Sidebar/Topbar/Frame | 4 |
| `server/src/modules/reviews/repository.ts` | 329 | розділити на review/run/finding-repo | 3 |
| `server/src/modules/runs/service.ts` | 311 | винести stats/trend | 3 |
| `server/src/modules/conventions/service.ts` | 309 | винести extract-pipeline | 3 |

### 3.2 Крос-модульна звʼязаність (граф імпортів)

**Спільні репозиторії, які читають інші зрізи (головний борг):**

| Репозиторій-власник | Імпортують модулі |
|---|---|
| `agents/repository.ts` (`AgentsRepository`, `AgentRow`) | ci, conformance, eval, performance, reviews, runs |
| `reviews/repository.ts` (`ReviewRepository`, `FindingRow`, `PullRow`) | compose, conformance, hooks |
| `runs/repository.ts` (`RunsRepository`, `AgentRunRow`) | performance |

**Service-to-service (через публічний фасад — менший борг, лишаємо, але реєструємо в DI):**

| Залежність | Місце |
|---|---|
| `brief → BlastService` | `brief/service.ts:18` |
| `conventions → SkillsService` | `conventions/service.ts:8` |
| `runs → ReviewService` | `runs/service.ts:13` |
| `reviews → MemoryService` | `reviews/service.ts:21` |

---

## 4. Фаза 0 — Огорожі (guardrails) `[PR #0]`

Без цього рефактор відкотиться. Спершу зафіксувати правила машинно.

**Дії:**
1. Додати ESLint flat-config у `server/eslint.config.mjs` та `client/eslint.config.mjs`
   (ESLint 9 flat). Плагіни: `eslint-plugin-import` (або `eslint-plugin-boundaries`).
2. Правила меж (`server`):
   - `import/no-restricted-paths`: заборонити будь-якому
     `src/modules/*/**` імпортувати `src/modules/<other>/repository*` — лише через
     `_shared/ports` або `<module>/service`.
   - заборонити `src/adapters/**` та `src/platform/**` імпортувати `src/modules/**`.
   - заборонити `src/db/**` імпортувати `src/modules/**` / `src/adapters/**`.
3. Правило `max-lines: ["warn", { max: 400, skipBlankLines: true, skipComments: true }]`
   (виняток через `// eslint-disable ... -- vendored/codegen` з причиною).
4. `import/no-cycle: "error"`.
5. Додати скрипт `"lint": "eslint ."` у `server/package.json` і `client/package.json`;
   додати `lint` у CI (`.github/workflows`).

**Acceptance:** `pnpm lint` працює; нові правила дають список поточних порушень
(очікувано — червоні на cros-module imports з §3.2). Тимчасово додати baseline-ignore
для наявних порушень, які знімаємо у Фазах 1–5.

---

## 5. Фаза 1 — Розвʼязати крос-модульну звʼязаність (ядро) `[PR #1–#3]`

Найбільший виграш у слабкій звʼязаності. Робимо в 3 PR (по власнику репозиторія).

### 5.1 Винести спільні row-типи з data-layer `[PR #1]`
Зараз модулі тягнуть `AgentRow`/`FindingRow`/`PullRow`/`AgentRunRow` (Drizzle
`$inferSelect`) напряму з чужого `repository.ts` — це і тип-звʼязаність, і витік
схеми БД.

- Створити `server/src/modules/_shared/dto.ts` (або розширити `@devdigest/shared`)
  з **публічними read-DTO**: `AgentRef`, `PullRef`, `FindingRef`, `AgentRunRef` —
  рівно ті поля, що потрібні споживачам (не весь рядок таблиці).
- Власні мапери `rowTo*` лишаються в репозиторії-власнику.

### 5.2 Ввести read-порти `[PR #2]`
- `server/src/modules/_shared/ports.ts`:
  ```ts
  export interface AgentsReadPort { getById(ws: string, id: string): Promise<AgentRef | undefined>; list(ws: string): Promise<AgentRef[]>; }
  export interface ReviewReadPort  { getPull(ws: string, prId: string): Promise<PullRef | undefined>; findingsForPull(prId: string): Promise<FindingRef[]>; /* ... */ }
  export interface RunsReadPort    { /* стати/трендові читання */ }
  export interface MemoryPort      { /* recall/remember, що треба reviews */ }
  ```
- Репозиторії-власники (`AgentsRepository`, `ReviewRepository`, `RunsRepository`)
  реалізують відповідний порт (`implements AgentsReadPort`).

### 5.3 Інжектити порти через контейнер `[PR #3]`
- У `platform/container.ts` додати лінива-конструйовані спільні репозиторії/сервіси
  (`agentsRead`, `reviewRead`, `runsRead`, `memory`) — типізовані **як порти**.
- Споживчі сервіси (`ci`, `eval`, `performance`, `conformance`, `compose`, `hooks`,
  `runs`, `reviews`) у конструкторі приймають порт, а не `new XRepository()`.
- Прибрати всі `import { XRepository } from '../<other>/repository.js'`.
- Service-to-service (`brief→Blast`, `conventions→Skills`, `runs→Review`,
  `reviews→Memory`) — лишаємо, але теж резолвимо через контейнер (не `new`).

**Acceptance:** `grep -rE "from '\.\./[a-z]+/repository" server/src/modules` порожній;
ESLint-правило меж зелене; тести зелені (моки інжектяться через порти простіше, ніж раніше).

---

## 6. Фаза 2 — Розбити `reviews/repository.ts` (329) `[PR #4]`

Репозиторій тримає 4 агрегати. Розділити по агрегатах (одна тека `reviews/`):
- `repository/review.repo.ts` — review+findings CRUD (`insertReview`, `insertFindings`,
  `reviewsForPull`, `getReview`, `deleteReview`, finding accept/dismiss/context).
- `repository/run.repo.ts` — agent-runs (`createAgentRun`, `completeAgentRun`,
  active/list/cancel/reap/delete, `saveRunTrace`, `getRunTrace`).
- `repository/pull.repo.ts` — `getPull`, `getRepo`, `getPrFiles`, intent upsert/get.
- `repository/index.ts` — барель, зберігає зовнішній API (тонкий фасад або реекспорт).

**Acceptance:** жоден файл репозиторію > 200 рядків; зовнішні імпорти не змінились.

---

## 7. Фаза 3 — Розбити серверні god-services `[PR #5–#9]`

Патерн (skill `refactor`): god-service → тонкий `service.ts` (оркестрація + делегування)
+ співмодулі поруч; константи/хелпери йдуть у наявні `constants.ts`/`helpers.ts`.

### 7.1 `reviews/service.ts` 770 → `[PR #5]`
- `reviews/run-executor.ts` — `executeRuns`, `runOneAgent`, `publish`, `traceFromBuffer`
  (приватний клас `ReviewRunExecutor`, отримує порти через конструктор).
- `reviews/intent.ts` — `deriveIntent`, `getIntent`.
- `reviews/smart-diff.ts` — `smartDiff`, `loadDiff`, `diffFromPrFiles`.
- `reviews/findings.ts` — `actOnFinding`, `collectSkills`, `collectSpecs`.
- `service.ts` лишає: `resolveTargets`, CRUD-делегування, `runReview` (оркестрація),
  `reviewsForPull`, `getRunTrace`. Ціль ≤ 250 рядків.

### 7.2 `onboarding/analyzer.ts` 422 → `[PR #6]`
- `onboarding/parsers/routes.ts` — `nextAppRoute`/`nextPagesRoute`/`svelteKitRoute`/regex.
- `onboarding/fs-walk.ts` — `walk`, `collectKeyFiles`, `readJson`, `readCoverage`.
- `onboarding/facts.ts` — `analyzeRepo`, `emptyFacts`, агрегація.
- regex-константи → `onboarding/constants.ts`; `isRecord`/`uniq`/`cleanPath` → `helpers.ts`.

### 7.3 `eval/service.ts` 386 → `[PR #7]`
- `eval/scoring.ts` — `score`, `findingMatches`, `aggregate`.
- `eval/dashboard.ts` — `dashboard`, `runToRecord`.
- `service.ts` лишає CRUD кейсів + `runCase`/`runAllForAgent` оркестрацію.

### 7.4 `ci/service.ts` 384 → `[PR #8]`
- `ci/generators.ts` — `generateFiles`, `workflowYaml`, `agentYaml`, `prBody` (чисті функції).
- `ci/mappers.ts` — `installationToDto`, `runToDto`.
- `service.ts` лишає `export`/`ingest`/`listRuns`/`listInstallations`.

### 7.5 `runs/service.ts` 311 + `conventions/service.ts` 309 → `[PR #9]`
- runs: `runs/stats.ts` — `agentStats`, `buildTrend`.
- conventions: `conventions/extract-pipeline.ts` — тіло `extract` (≈100 рядків).

**Acceptance кожного PR:** цільовий `service.ts` ≤ ~250 рядків; публічний API класу
не змінено (routes не чіпаємо); тести зелені.

---

## 8. Фаза 4 — Клієнт: розбити `vendor/ui` `[PR #10–#12]`

`vendor/ui` — портований UI-кіт; розбиваємо по компонентах у теки-барелі, **зовнішні
імпорти не змінюються** (через `index.ts`).

### 8.1 `primitives.tsx` 791 → `vendor/ui/primitives/` `[PR #10]`
- `tokens.ts` — `Severity`, `Category`, `SEV`, `CAT`.
- по файлу на компонент: `Button.tsx`, `IconBtn.tsx`, `Badge.tsx`, `SeverityBadge.tsx`,
  `CategoryTag.tsx`, `Chip.tsx`, `Avatar.tsx`, `ConfidenceNum.tsx`, `MonoLink.tsx`,
  `ProgressBar.tsx`, `PercentProgress.tsx`, `CircularScore.tsx`, `Toggle.tsx`, `Kbd.tsx`,
  `SectionLabel.tsx`, `Card.tsx`, `EmptyState.tsx`, `Skeleton.tsx`, `ErrorState.tsx`,
  `Markdown.tsx`.
- `index.ts` реекспортує все (зберігає `vendor/ui/index.ts` API).

### 8.2 `kit.tsx` 730 → `vendor/ui/kit/` `[PR #11]`
- `Drawer.tsx`, `Modal.tsx`, `Tabs.tsx`, `Dropdown.tsx`, та форми: `FormField.tsx`,
  `TextInput.tsx`, `SelectInput.tsx`, `SearchableSelect.tsx`, `Textarea.tsx`,
  `Checkbox.tsx`; спільні типи (`TabDef`, `DropdownItemDef`) → `kit/types.ts`.

### 8.3 `shell.tsx` 370 → `vendor/ui/shell/` `[PR #12]`
- `NavItem.tsx`, `RepoSwitcher.tsx`, `Sidebar.tsx`, `Topbar.tsx`, `AppFrame.tsx`;
  типи (`LinkLike`, `RepoSummary`, `ShellContext`, `Crumb`) → `shell/types.ts`.

**Acceptance:** жоден файл > 300 рядків; `client` typecheck/test зелені; зовнішні
імпорти `from "@/vendor/ui"` без змін.

---

## 9. Фаза 5 — Клієнт: тонкі сторінки `[PR #13]`

`pulls/[number]/page.tsx` (477) уже має 14 готових `_components`. Лишилось:
- винести інлайн `MountPoint` → `_components/MountPoint/`.
- винести великі секції верстки (layout-секції сторінки) у `_components/PrLayout/*`,
  лишивши `page.tsx` тонким композитором (дані з hooks + збірка секцій). Ціль ≤ 150.
- те саме перевірити для `pulls/page.tsx` (213).

**Acceptance:** `page.tsx` лише компонує; уся логіка/верстка секцій — у `_components`.

---

## 10. Фаза 6 — Прибирання типів/констант `[PR #14]`

Прохід по решті `service.ts`/`*.tsx`, що тримають інлайн-типи (>2) чи магічні значення:
винести у `types.ts`/`constants.ts` модуля. Дрібні локальні типи лишаємо.
Зняти baseline-ignore з Фази 0 — усі ESLint-правила меж/розміру мають бути зелені без винятків
(окрім явно позначених `// vendored` / `// codegen`).

**Acceptance:** `pnpm lint` зелений у `server` і `client` без baseline-ignore.

---

## 11. Шаблон декомпозиції (skill `refactor`)

Кожен зріз/компонент після рефактора:
```
<Name>/
  <Name>.tsx | service.ts   # оркестрація / рендер, тонкий
  helpers.ts                # чисті функції
  constants.ts              # магічні значення
  types.ts                  # типи (якщо >2 або експортні)
  index.ts                  # публічний барель (єдина точка входу)
  <Name>.test.tsx           # тести
  _components/ | repository/ # вкладені частини
```

---

## 12. Порядок і залежності PR

```
PR#0 (огорожі)
  └─> PR#1 dto → PR#2 ports → PR#3 inject     (Фаза 1, послідовно)
        ├─> PR#4 reviews/repo split           (Фаза 2)
        ├─> PR#5..#9 god-services             (Фаза 3, паралельно між собою)
PR#10..#12 vendor/ui  (Фаза 4, паралельно, незалежні від сервера)
PR#13 thin pages      (Фаза 5, після #10–12)
PR#14 cleanup         (Фаза 6, останній)
```
Клієнтські фази (4–5) і серверні (1–3) **незалежні** — можна вести двома потоками.

---

## 13. Чого НЕ чіпаємо

- `agent-runner/dist/**` — навмисно закомічений бандл GitHub Action (`.gitignore`).
- `@devdigest/shared` контракти — уже коректне ядро (лише доповнюємо read-DTO у §5.1).
- Загальна схема `platform / adapters / modules` — вона вже правильна.
- Згенеровані `*.js`/`*.d.ts`/`*.map` у `dist/`.

---

## 14. Перевірка на кожному PR

```sh
# server
cd server && pnpm typecheck && pnpm test && pnpm lint
# client
cd client && pnpm typecheck && pnpm test && pnpm lint
```
Жоден PR не змінює зовнішню поведінку (рефактор без зміни контрактів routes/API/props).
Регресій бізнес-логіки немає → достатньо наявних тестів + lint-меж.

---

## 15. Метрики готовності (Definition of Done)

- [ ] 0 крос-модульних імпортів чужого `repository.ts`.
- [ ] 0 файлів > 400 рядків без позначки `// vendored` / `// codegen`.
- [ ] ESLint-межі (`no-restricted-paths`, `no-cycle`, `max-lines`) зелені без baseline.
- [ ] Усі хелпери в `helpers.ts`, константи в `constants.ts`.
- [ ] `typecheck + test` зелені в усіх пакетах.
