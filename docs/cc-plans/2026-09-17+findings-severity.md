# ДЗ №1 — findings за критичністю + закриття всіх 24 критеріїв

## Context

Домашнє завдання №1 оцінюється за 24 обов'язковими критеріями (залік = всі 24).
Попередній PR (змержений у `main`) закрив частину, але аудит показав реальний стан:

| Стан | Критерії |
|---|---|
| VERIFIED | 1, 2, 6, 8, 13, 14, 22, 23 |
| PARTIAL | 3, 4, 9, 10, 11, 12, 24 |
| MISSING | 5, 7, 16, 17, 18, 19, 20, 21 |

Основна фіча завдання — лічильники findings за severity з фільтром (16–19) — відсутня.
Попап «N FINDINGS IN THIS RUN» на списку PR (20–21) теж відсутній: колонки FINDINGS
у списку немає (`client/src/app/repos/[repoId]/pulls/constants.ts:42-50`), сервер навмисно
не шле breakdown (`server/src/modules/pulls/routes.ts:117-119`).

**Важливо:** реалізація 16–21 існує в git history за авторством автора курсу
(`7641b48`, `97b6edc`, `0953fdc`), вирізана ревертом `c6af1e4` з коментарем
*"The starter has to ship unsolved, so this restores main's tree to 66727c8 exactly"*.
Повний стан збережений на гілці `integration/all-features`. **Весь код у цьому плані
пишеться з нуля** — реверт-код не копіюється й не cherry-pick-ається.

Мета: один PR на `L01-HW`, після якого всі 24 критерії — VERIFIED.

---

## A. Лічильники severity + фільтр (критерії 16, 17, 18, 19)

Місце: розгорнута картка прогону на вкладці «Agent runs» → секція «Review runs».
`ReviewRunAccordion.tsx:144-154` рендерить `VerdictBanner` (вердикт + PR SCORE),
одразу під ним `:157-162` — `FindingsPanel`. Пілюлі йдуть у тулбар `FindingsPanel`,
тобто буквально «під вердиктом і PR SCORE».

### Файли

- `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/helpers.ts`
  — нова `severityCounts(findings): Record<Severity, number>`, проста редукція по
  полю `severity`. Існуючу `visibleFindings(findings, hideLow)` (`:5-11`) розширити
  третім аргументом `severity: Severity | null`.
- `.../FindingsPanel/constants.ts` — додати `SEVERITY_FILTERS` (порядок
  CRITICAL → WARNING → SUGGESTION). `SEVERITY_ORDER` (`:4-9`) уже є, перевикористати.
- `.../FindingsPanel/FindingsPanel.tsx` — новий стейт `const [severity, setSeverity] =
  React.useState<Severity | null>(null)`; ряд пілюль у `s.toolbar` (`:50-55`) зліва від
  існуючого «Hide low confidence».
- `.../FindingsPanel/_components/SeverityFilterChip/` — локальна пілюля
  (`SeverityFilterChip.tsx`, `styles.ts`, `index.ts`). Не чіпаємо `vendor/ui`
  (do-not-touch, дубльовані копії); `Chip.tsx:35-37` фарбує active-стан у `--accent`,
  а нам треба severity-колір.
  Візуал: іконка з `SEV[sev].icon` + `N Label` (напр. `⊙ 1 Critical`), бордер
  `SEV[sev].c` коли active, `--border` коли ні — як на скріні.
- `client/messages/en/prReview.json` — ключі `panel.severityFilter.*`.

### Логіка (закриває 17 і 19)

```
const shown = visibleFindings(findings, hideLow, severity)   // що рендериться
const counts = severityCounts(visibleFindings(findings, hideLow, null))  // що на пілюлях
```

Лічильники рахуються по набору **після** `hideLow`, але **до** severity-фільтра.
Тому число на пілюлі завжди дорівнює кількості карток, що з'являться при кліку
по ній — критерій 17 виконується і при увімкненому «Hide low confidence».
(Реверт-версія `7641b48` рахувала повний список і тут ламалась.)

Пілюлі з нульовим лічильником не рендеряться (критерій 16: «тільки ті severity,
що реально є»). Ряд ховається цілком, якщо findings немає.

Клік по активній пілюлі → `setSeverity(null)` (критерій 18).
Усе — `React.useMemo` над уже завантаженими findings, жодного fetch (критерій 19).

Побічне: `focusIdx` (j/k навігація, `:29,38-39`) скидати в 0 при зміні фільтра,
інакше вказівник зависає за межами списку.

`INFO` є в UI-типі (`vendor/ui/primitives/tokens.ts:3`), але не в Zod-контракті
(`vendor/shared/contracts/findings.ts:11-12`). Пілюлі будуємо по контракту —
трьох severity, без INFO.

### Тести

- `FindingsPanel/helpers.test.ts` — `severityCounts` + `visibleFindings` з severity.
- `FindingsPanel/FindingsPanel.test.tsx` — рендер тільки непорожніх пілюль;
  клік фільтрує; повторний клік знімає; число на пілюлі == кількість `FindingCard`
  у DOM; hideLow + severity разом.

---

## B. Колонка FINDINGS + попап на списку PR (критерії 20, 21)

> **Дві пастки цього блоку** (root `CLAUDE.md`, «Do not touch»):
> 1. `vendor/shared/` існує двома руками скопійованими копіями —
>    `server/src/vendor/shared/` і `client/src/vendor/shared/`. Це не симлінк.
>    Зміна `PrMeta` має лягти в **обидві**, інакше typecheck пройде, а рантайм
>    відвалиться. Після правки: `diff -r server/src/vendor/shared client/src/vendor/shared`.
> 2. `client/src/vendor/ui/` не редагуємо. Потрібні нові візуальні елементи
>    робимо локальними компонентами в `_components/` / `src/components/`.

### Сервер

- `server/src/vendor/shared/contracts/platform.ts` — у `PrMeta` (`:157-177`) додати
  `findings_counts: z.object({ CRITICAL, WARNING, SUGGESTION }).nullish()`.
  **Дзеркально скопіювати** в `client/src/vendor/shared/contracts/platform.ts`
  (ручні дублікати, root `CLAUDE.md`).
- `server/src/modules/pulls/findings-counts.ts` (новий) — чиста функція
  `findingsCountsByPr(rows)`: групує по `prId`, бере останній review на кожен
  `agentId` (рядки приходять newest-first), рахує severity. Той самий набір, що
  показує сторінка PR → числа збігаються.
- `server/src/modules/pulls/routes.ts:115-135` — один IN-запит
  `findings ⋈ reviews` по `prIds` з `kind='review'`, `orderBy desc(reviews.createdAt)`,
  редукція в JS (той самий патерн, що вже стоїть для score і cost). Прибрати
  застарілий коментар `:117-119`. Віддавати `findings_counts` у мапі `:157-182`.
  Таблиці: `server/src/db/schema/reviews.ts:9-46`.

### Клієнт

- `client/src/app/repos/[repoId]/pulls/constants.ts` — `"findings"` у `COLUMN_KEYS`
  між `score` і `status` (`:42-50`); `GRID` (`:27`) з 7 треків → 8:
  `"1fr 132px 92px 60px 108px 118px 86px 78px"`.
- `client/src/app/repos/[repoId]/pulls/_components/PRRow/PRRow.tsx` — нова комірка
  між score (`:50-56`) і status (`:57-61`): компактні severity-чіпи з `findings_counts`,
  нульові приховані, `—` коли прогонів не було. `onMouseEnter` комірки → відкрити попап.
- `client/src/components/findings-preview/` (новий, поруч із `app-shell`,
  `diff-viewer`) — `FindingsPreviewCard.tsx`, `styles.ts`, `index.ts`,
  `FindingsPreviewCard.test.tsx`.
  `position: fixed`, прив'язка до `getBoundingClientRect()` наведеної комірки —
  контейнер таблиці (`pulls/styles.ts:97+`) обрізає absolute-дітей.
  Заголовок: `t("findings.previewTitle", { n })` → `"{n} FINDINGS IN THIS RUN"`.
  Кожне прев'ю — **тільки текст** (критерій 21): `SeverityBadge compact`, заголовок,
  `CategoryTag`, `file:start_line` моно-шрифтом, `{Math.round(confidence*100)}% conf`,
  rationale обрізаний `-webkit-line-clamp: 2`. **Жодного `<button>`.**
- `client/src/lib/hooks/reviews.ts:51-57` — `usePrReviews(prId, enabled?)`:
  додати необов'язковий прапорець, щоб попап тягнув `/pulls/:id/reviews` ліниво
  при першому hover. Ключ `["reviews", prId]` уже кешується TanStack Query —
  повторний hover не робить запиту. Не LLM-виклик, критерій 19 не порушено.

### Тести

- `PRRow.test.tsx` — чіпи рендеряться з `findings_counts`; нульові приховані;
  `—` без прогонів.
- `FindingsPreviewCard.test.tsx` — заголовок містить реальне число;
  `queryAllByRole("button")` порожній (read-only, критерій 21).
- `server/test/findings-counts.test.ts` — редукція, включно з кількома агентами
  й кількома review на агента.
- `server/test/reviews.it.test.ts` — `findings_counts` у відповіді списку.

---

## C. Cost = сума всіх успішних прогонів (критерій 12)

Зараз `server/src/modules/pulls/latest-batch-cost.ts:10-33` сумує тільки найновіший
batch. Критерій вимагає суму всіх успішних прогонів.

- Перейменувати файл на `server/src/modules/pulls/total-cost.ts`, функцію на
  `totalCostByPr(rows)`: сума `costUsd` по всіх рядках `status='done'` на PR;
  `null`, якщо жоден прогін не має ціни; ключа немає, якщо прогонів немає
  (`PRRow.tsx:62-64` + `format.ts:12` уже дають `—`).
- `routes.ts:133-154` — прибрати `batchId` із select, викликати `totalCostByPr`.
- `server/test/latest-batch-cost.test.ts` → `total-cost.test.ts`, переписати кейси:
  кілька batch сумуються; `null`-ціни ігноруються; жодної ціни → `null`.
- Оновити доккоментар: пояснити, що re-run тепер додається до суми — це навмисно,
  бо критерій визначає cost як сукупну вартість рецензування PR.

---

## D. CLAUDE.md і конфіг (критерії 3, 4, 5, 7, 9)

- **5 — naming conventions.** Новий розділ `## Naming` у кожному
  `client|server|reviewer-core|e2e/CLAUDE.md` + зведення в root `CLAUDE.md`.
  Писати з фактичного коду, не вигадувати: client — `_components/<PascalCase>/`
  з `index.ts` + `styles.ts` + `constants.ts` + `helpers.ts`, co-located `*.test.tsx`,
  i18n-namespace = файл у `messages/en/`; server — модулі `src/modules/<kebab>/routes.ts`,
  таблиці snake_case у `schema/`, контракти PascalCase-Zod у `vendor/shared/contracts/`;
  API-поля snake_case, TS-поля camelCase (межа — Zod-контракт).
- **7 — lock-файли.** У root `CLAUDE.md:25-28` («Do not touch») додати пункт:
  `client/pnpm-lock.yaml`, `server/pnpm-lock.yaml`, `reviewer-core/package-lock.json`,
  `e2e/package-lock.json` — не редагувати руками, змінювати лише через менеджер
  пакетів. Продублювати в модульних `CLAUDE.md`.
- **3 — run-команди.** Модульні `CLAUDE.md:3` делегують у README. Додати явний
  один рядок команди запуску в кожен (`pnpm dev`, `pnpm test:flows` тощо), лишивши
  посилання на README для деталей. `reviewer-core/README.md` і `e2e/README.md` —
  дописати рядок `Run:`.
- **4 — check-команди.** `server/CLAUDE.md:5` доповнити `pnpm typecheck`
  (скрипт існує в `server/package.json`). Лінтера в репо немає — явно зазначити
  «lint: не налаштовано», щоб пропуск був свідомим.
- **9 — автотригер скіла.** Створити `.claude/settings.json` з хуками
  `SessionStart` і `Stop`, що echo-ять нагадування (читати `INSIGHTS.md` модуля /
  запустити `/engineering-insights`). Тільки `echo`, без побічних ефектів.
  Не чіпати `.claude/settings.local.json` (особистий, permissions).

---

## E. docs/ і specs/ по кожному пакету (критерій 24)

> Єдиний блок, що делегується Haiku-субагентам — див. «Розподіл моделей» нижче.

8 із 9 директорій — 5-рядкові PENDING-стаби. Наповнити реальним змістом,
витягнутим із коду (не generic-текст):

- `client/docs/` — routing та структура App Router, конвенція `_components/`,
  шар даних (TanStack Query keys), i18n. `client/specs/` — спека фічі
  severity-фільтра з цього PR (критерії 16–19 як acceptance criteria).
- `server/docs/` — межі модулів `src/modules/*`, життєвий цикл review-прогону,
  агрегація cost для списку (сюди ж обґрунтування зміни з C). `server/specs/` —
  контракт `GET /repos/:id/pulls` з `findings_counts`.
- `reviewer-core/docs/` — пайплайн review-движка, контракт findings.
  `reviewer-core/specs/` — інваріанти severity/confidence.
- `e2e/docs/` — як працює `run.ts` поверх CDP, як додати flow.
  `e2e/specs-docs/` — опис наявних 7 `.flow.json`.
- `docs/architecture.md` (зараз 5 рядків, а root `CLAUDE.md:13` обіцяє його як
  джерело крос-модульної архітектури) — розписати межі модулів і потік даних.

---

## F. INSIGHTS.md (критерії 10, 11)

Зараз один реальний запис на весь репо (`server/INSIGHTS.md:26-30`), і той
посилається на директорію + коміт, без `file:line`.

- `client/INSIGHTS.md` — записи з цієї сесії: пастка з підрахунком лічильників
  до/після `hideLow` (`FindingsPanel.tsx:31`); `position: fixed` для попапа через
  обрізання контейнером (`pulls/styles.ts`); розбіжність `Severity` між UI-токеном
  і Zod-контрактом (`vendor/ui/primitives/tokens.ts:3` vs
  `vendor/shared/contracts/findings.ts:11`).
- `server/INSIGHTS.md` — зміна семантики cost (`total-cost.ts`); ручне дзеркалення
  `vendor/shared/contracts/platform.ts` в обидві копії.
- Дописати `file:line` до наявного запису `server/INSIGHTS.md:30`.
- `reviewer-core/INSIGHTS.md`, `e2e/INSIGHTS.md` — по запису, якщо робота їх зачепить;
  інакше не вигадувати (скіл прямо забороняє порожні записи).
- Формат кожного запису: повна дата `YYYY-MM-DD` + `file.ts:42` (критерій 11 просить
  і те, і те; шаблон скіла дозволяє місяць — беремо суворіший варіант).

---

## G. 5-фазний цикл і завершення (критерій 15)

Фази: Initiation (аудит 24 критеріїв) → Planning (цей файл) → Implementation (A–F)
→ Validation → Completion (PR).

Після апруву перенести цей файл:
`mv ~/.claude/plans/elegant-napping-lighthouse.md docs/cc-plans/2026-09-17+findings-severity.md`
і закомітити разом з імплементацією.

PR: `otkachuk777/dev-digest` ← `L01-HW` → `main` (не upstream курсу).
В описі PR — таблиця 24 критеріїв із посиланнями на файли-докази й проходження 5 фаз.

---

## Розподіл моделей

Імплементація виконується на **Sonnet 5**. Цього достатньо: блоки A–C — звичайна
фіча-робота з наперед названими файлами, наявними патернами поруч і тестами як
страхувальною сіткою.

| Блок | Модель | Чому |
|---|---|---|
| A — пілюлі + фільтр | Sonnet, основна сесія | Логіка `counts` vs `shown` — головне місце, де ламається критерій 17. Тести пишуться тут же. |
| B — колонка + попап + сервер | Sonnet, основна сесія | Найризикованіше: дзеркалення контракту, SQL-агрегація, `position: fixed`. |
| C — cost | Sonnet, основна сесія | Дрібно, але міняє семантику + тести. |
| D — CLAUDE.md, settings.json | Sonnet, основна сесія | ~30 рядків, але naming-розділ треба звіряти з реальним кодом. Делегувати дорожче, ніж зробити. |
| **E — docs/ і specs/** | **Haiku 4.5, 4 паралельні субагенти** | 9 директорій, незалежні одна від одної, чиста писанина по вже прочитаному коду. |
| F — INSIGHTS.md | Sonnet, основна сесія — **не делегувати** | Записи мають бути про те, що реально трапилось під час імплементації. Субагент цього контексту не має й вигадає правдоподібну пустушку. |
| G — валідація, PR | Sonnet, основна сесія | Треба бачити вивід тестів і бігати по UI. |

### Як запускати Haiku на E

Чотири субагенти (`subagent_type: Explore` не підходить — потрібен запис; беремо
`general-purpose` з `model: haiku`), по одному на пакет: client, server,
reviewer-core, e2e. П'ятий — `docs/architecture.md` — робить основна сесія,
бо він крос-модульний.

Кожному субагенту в промпті обов'язково:
- точний список файлів-джерел для читання (напр. для `server/docs/`:
  `server/src/modules/*/routes.ts`, `server/src/db/schema/reviews.ts`,
  `server/src/modules/pulls/total-cost.ts`);
- точні шляхи, куди писати, і що нічого іншого не чіпати;
- вимога критерію 24 дослівно: реальний контент, не README-стаб;
- бюджет 80–200 рядків на файл, обов'язкові `file:line`-посилання на код;
- заборона вигадувати команди/шляхи, яких немає в репо.

Запускати **після** A–C, щоб документація описувала фінальний стан коду
(`findings_counts` у контракті, `totalCostByPr`), а не проміжний.

Після повернення субагентів основна сесія **читає кожен файл** перед комітом:
критерій 24 оцінюється людиною, а Haiku схильний до узагальнень, які виглядають
як стаб. Усе, що не посилається на конкретний код, — переписати.

---

## Verification

```bash
cd client && pnpm typecheck && pnpm test && pnpm build
```
```bash
cd server && pnpm typecheck && pnpm test
```

Ручна перевірка (Postgres у Docker, `pnpm dev` у `client` і `server`):

1. **16/17** — PR → «Agent runs» → «Review runs» → розгорнути картку: під вердиктом
   і PR SCORE ряд пілюль; жодної пілюлі з 0; число на кожній == кількість карток
   findings цієї severity нижче.
2. **18** — клік по пілюлі лишає тільки її severity; повторний клік повертає повний
   список.
3. **19** — DevTools → Network: при відкритті сторінки й перемиканні фільтра
   жодного нового запиту до `/reviews` чи до моделі.
4. **20/21** — список PR: колонка FINDINGS з severity-іконками; hover → попап
   «N FINDINGS IN THIS RUN» з реальним N; у попапі жодної кнопки.
5. **22** — на сторінці PR у розгорнутій картці кнопки Accept/Dismiss на місці
   (регресія від A).
6. **12** — PR із двома batch прогонів: COST у списку == сума всіх успішних.
7. **13/14/23** — регресія: cost на плитках Timeline, блок COST у Trace drawer → Stats,
   findings у Trace drawer.
8. Обидві теми (`data-theme="dark"` / `"light"`) — нові пілюлі й попап читабельні.
