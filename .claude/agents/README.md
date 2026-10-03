# Агенти проєкту DevDigest

Цей файл описує кастомних субагентів, визначених у `.claude/agents/`, та
джерела інформації, якими кожен з них користується під час роботи.

## Огляд

| Агент | Файл | Модель | Права | Призначення |
|---|---|---|---|---|
| `implementation-planner` | `implementation-planner.md` | opus | Read, Grep, Glob, Skill | Implementation-план — перевіряє вимоги, ставить уточнення, дає рекомендації, питає режим (multi/single-agent), розбиває на кроки; специфікацій не пише, нічого не редагує |
| `implementor` | `implementor.md` | sonnet | Read, Write, Edit, Bash, Grep, Glob, Skill | Виконання одного вже описаного кроку плану (backend або frontend) |
| `researcher` | `researcher.md` | sonnet | Read, Grep, Glob, WebSearch, WebFetch | Пошук і зведення інформації — про проєкт або в інтернеті, без правок коду |
| `test-writer` | `test-writer.md` | sonnet | Read, Write, Edit, Bash, Grep, Glob, Skill | Пише/доповнює тести — UI (`client/`, react-testing-library) і backend (`server/`, `reviewer-core/`, Vitest) |
| `architecture-reviewer` | `architecture-reviewer.md` | sonnet | Read, Grep, Glob, Bash (read-only git + `depcruise`), Skill | Архітектурне рев'ю вже написаного коду — layering, Dependency Rule; без правок коду |
| `spec-creator` | `spec-creator.md` | opus | Read, Glob, Grep, Bash (лише `date`), WebFetch, Write, Edit, Skill, Agent(researcher, Explore), AskUserQuestion + guard-хук | Пише специфікації (WHAT/WHY, EARS, traceability) для Spec-Driven Development; пише лише `YYYY-MM-DD-<slug>.md` у `specs/` модулів |

Усі агенти читають відповідь мовою запиту та не виконують `git commit`,
`git push` чи інші дії поза власним мандатом.

---

## `implementation-planner`

**Роль:** read-only агент, що створює **лише implementation-плани**.
Викликається перед будь-якою нетривіальною реалізацією, особливо перед
запуском кількох паралельних `implementor`.

**Чого не робить:** не пише, не чернетить і не редагує специфікації
(`specs/`, `<модуль>/specs/*.md`), не змінює їм `Status:` і не планує
кроків, що їх чіпають. Специфікації — лише вхідні дані. Якщо специфікації
немає або вона суперечлива — це питання до користувача, а не привід
дописати її самому. Виняток: `e2e/specs/*.flow.json` — це тести, їх
планувати можна.

**Працює у дві фази** (субагент не може спілкуватись з користувачем
напряму, тож питання передає сесія, що його викликала):
1. **Requirements review** — перевіряє вимоги на прогалини, конфлікти
   (зі specs/docs/INSIGHTS) і неоднозначності, дає рекомендації, як
   зробити краще, і **завжди** питає режим виконання: multi-agent
   (паралельні `implementor`) чи single-agent (один послідовний прохід) —
   зі своєю рекомендацією. На цьому зупиняється.
2. **Implementation plan** — після відповідей користувача (сесія
   відновлює агента через `SendMessage`) будує план під обраний режим:
   для multi-agent — батчі ≤4, worktree-ізоляція; для single-agent —
   лінійний порядок із чекпойнтами.

**Джерела, які використовує:**
- `<модуль>/specs/` → `<модуль>/docs/` → `<модуль>/INSIGHTS.md` → вихідний код —
  саме в такому порядку, за конвенцією з кореневого `CLAUDE.md`.
- Кореневі `specs/`, `INSIGHTS.md` і `README.md` — для рішень, що зачіпають
  кілька пакетів.
- Таблиця "Where things live" з `CLAUDE.md` — стартова карта модулів, але
  перевіряється наживо через `Glob`/`Read`, а не береться на віру.
- `.claude/skills/` — каталог навичок проєкту; для кожного кроку плану підбирає
  відповідний skill замість власного винаходу правил (`onion-architecture`,
  `fastify-best-practices`, `drizzle-orm-patterns`, `postgresql-table-design`,
  `frontend-ui-architecture`, `next-best-practices`, `react-best-practices`,
  `react-testing-library`, `zod`, `typescript-expert`, `security`,
  `mermaid-diagram`, `plan-verifier`, `pr-self-review`,
  `engineering-insights`).
- Явно ігнорує `server/clones/**` (клоновані репозиторії) і `**/src/vendor/**`
  (провендорений код) як джерела для плану.
- Якщо питання зовнішнє (бібліотека, best practice) — не гуглить сам, а
  виносить його у Phase 1 як питання для `researcher`.

**Не використовує:** Bash, Write, Edit — суто read-only.

---

## `implementor`

**Роль:** виконавець одного конкретного кроку плану (як правило, отриманого від
`implementation-planner`). Може запускатись паралельно кількома інстансами одночасно.

**Джерела, які використовує:**
- Той самий порядок ґрунтування, що й у `implementation-planner`: `<модуль>/specs/` →
  `<модуль>/docs/` → `<модуль>/INSIGHTS.md` → джерельний код. Якщо крок плану
  вже цитує `INSIGHTS.md`, довіряє цитаті й повторно файл не читає (щоб N
  паралельних інстансів не платили за повторне читання).
- `.claude/skills/`, викликаються через `Skill`-тул **до** написання коду,
  за доменом модуля:
  - **Backend** (`server/src/modules/**`, `server/src/adapters/**`,
    `server/src/db/**`, `reviewer-core/**`): `onion-architecture` (завжди
    першим), `fastify-best-practices`, `drizzle-orm-patterns`,
    `postgresql-table-design`, `zod` (якщо чіпається `@devdigest/shared`).
  - **Frontend** (`client/src/app/**`, `client/src/components/**`):
    `next-best-practices`, `react-best-practices`, `react-testing-library`,
    `zod`.
  - **Обидві сторони:** `typescript-expert`, `security`.
- Скіли: завантажує рівно `Required skills` зі свого кроку; таблиця вище —
  лише fallback.
- Верифікація — одна команда на пакет: `scripts/verify.sh <pkg> <files>`
  (typecheck + depcruise по своїх файлах + `vitest related`, без
  `*.it.test.ts`). Повний suite (`--full`), інтеграційні тести й e2e запускає
  `/implement-plan` один раз після всіх кроків.
- Ніколи не читає й не редагує `server/clones/**` і `**/src/vendor/**`
  (крім свідомої зміни контракту в `vendor/shared`, якщо це прямо вимагає крок).
- Не викликає сам `pr-self-review` і крок "запис" з `engineering-insights` —
  це ворота, які виконує сесія, що викликала агента, після приземлення всіх
  паралельних кроків.

---

## `researcher`

**Роль:** read-only пошук і зведення інформації — про сам проєкт або
зовнішньої (документація бібліотек, best practices, порівняння).

**Джерела, які використовує:**
- **Проєктне дослідження:** той самий порядок, що й у решти агентів —
  `<модуль>/specs/` → `<модуль>/docs/` → `<модуль>/INSIGHTS.md` → вихідний код,
  через `Read`/`Grep`/`Glob`. Пропускає `server/clones/**`,
  `**/node_modules/**`, `**/src/vendor/**`, якщо явно не попросили туди
  зазирнути.
- **Зовнішнє дослідження:** `WebSearch`/`WebFetch` — документація, поведінка
  фреймворків, порівняння, актуальні дані. Ліміт — приблизно 3–6
  пошуків/читань на запит, без відкритого нарощування обсягу.
- Перед пошуком завжди проганяє запит через "інтерв'ю"-крок (чи достатньо
  конкретна тема, обсяг, тип очікуваної відповіді, чи є подвійне трактування) —
  і за потреби ставить до 3 уточнювальних питань, перш ніж почати шукати.
- Кожен факт у відповіді супроводжується джерелом (шлях+рядок для проєкту,
  URL+дата для вебу); якщо нічого не знайдено — прямо каже "не знайдено",
  а не здогадується.

---

## `test-writer`

**Роль:** пише і доповнює тести для вже написаного коду — і UI (`client/`),
і backend (`server/`, `reviewer-core/`) — не редагуючи сам код продукту.

**Джерела, які використовує:**
- Спочатку формулює очікувану поведінку (happy path + edge cases) з
  формулювання задачі/`specs/`/acceptance criteria — **до** читання
  реалізації. Ніколи не пише assert під те, що поточний код зараз повертає,
  якщо це розходиться з очікуванням; розбіжність звітує як знахідку, а не
  тихо підлаштовує тест під баг.
- **Frontend** (`client/**`): скіл `react-testing-library` — обов'язково
  перед першим написаним тестом.
- **Backend** (`server/**`, `reviewer-core/**`): корінний `TESTING.md` —
  hermetic за замовчуванням, `*.it.test.ts` для DB-backed (testcontainers).
- Той самий порядок ґрунтування, що й у решти агентів: `<модуль>/specs/` →
  `<модуль>/docs/` → `<модуль>/INSIGHTS.md` → джерельний код.
- Перед звітом про завершення завжди запускає відповідну команду пакета
  лише для своїх тест-файлів (`vitest run <file> --reporter=dot`, не весь
  suite) і санітарно перевіряє, що написаний тест здатен
  впасти (не є тавтологією).

**Не викликає сам:** `pr-self-review`, запис-половину `engineering-insights`
— це ворота сесії, що викликала агента.

---

## `architecture-reviewer`

**Роль:** read-only архітектурне рев'ю вже написаного коду (модуль, перелік
файлів або diff-текст) проти проєктних скілів — layering, Dependency Rule,
type-level дизайн. Не пише і не редагує код, не гейтить PR, не перевіряє
покриття вимог плану.

**Джерела, які використовує:**
- **Backend**: скіл `onion-architecture` — завжди першим, без винятків
  (Dependency Rule, чи не витікають persistence/framework типи через межі
  шарів, чи конструюються адаптери лише в `platform/container.ts`); скіл
  `fastify-best-practices`, якщо змінено `routes.ts`/plugin.
- **Frontend**: скіли `next-best-practices`, `react-best-practices`.
- **Обидві сторони**: скіл `typescript-expert` для нетривіального
  типового дизайну.
- Кожна знахідка — у структурованому форматі `Location → Layer → Reasoning
  → Finding → Confidence`, причому Reasoning завжди йде перед Finding
  (документований прийом проти false positives).
- Явно консервативний scope: лише архітектурні порушення, не стилістика,
  не security, не test coverage, не requirements-coverage (те й інше —
  зона `pr-self-review`/`plan-verifier`).

**Права:** `Bash` дозволений виключно для read-only git-інспекції (`git
diff`, `git log`, `git show`, `git status`), коли задача не дала явного
переліку файлів/diff — ніколи для запису чи будь-якої іншої дії. Ніколи
`Edit`/`Write`.

---

## `spec-creator`

**Роль:** автор специфікацій для Spec-Driven Development — фіксує **що** і
**навіщо** (поведінка, межі, міжмодульна взаємодія, форми контрактів), але
ніколи **як** (жодних шляхів до нових файлів, шарів, функцій, бібліотек).
Ланцюжок — див. «SDD-workflow» нижче.

**Уточнення:** блокуючі питання (scope > security > UX > technical) і
UX-пропозиції (accept / reject / defer):
- запущений як main thread (`claude --agent spec-creator`) — питає сам через
  AskUserQuestion;
- як субагент (AskUserQuestion субагентам недоступний) — повертає блоки
  `Blocking questions` + `Proposals` і зупиняється; сесія питає користувача й
  відновлює агента через `SendMessage`.
Дефолти, які можна обґрунтовано обрати, не питає — записує в `Assumptions`;
відкритих `[NEEDS CLARIFICATION]` — не більше 3.

**Джерела, які використовує:**
- Дизайн-джерела: текст, Figma/URL (`WebFetch`), скріншоти/папки зображень
  (`Read`) + поточний UI, який дизайн змінює.
- Порядок ґрунтування: specs → docs → `INSIGHTS.md` → код; `INSIGHTS.md` —
  **лише модулів, де буде розробка** (кореневий — якщо ≥2 пакети або shared).
- Паралельні `researcher` (через `Agent(researcher, Explore)`) — по одному на
  незалежну гілку питання; `Explore` — для швидкого огляду файлів.
- Preload-скіли: `engineering-insights`, `mermaid-diagram`; на вимогу —
  `onion-architecture`, `frontend-ui-architecture`, `security`, `zod`.

**Що в спеці:** EARS-критерії `AC-N` з `observable:`-підказкою, `NFR-N` з
порогами, edge cases (→ AC або "accepted"), cross-module interactions
(+ Mermaid), contracts (лише форми), Inputs (provenance), Untrusted inputs,
Assumptions, Traceability (ID | Story | Task | Test | Commit),
Recommendations / follow-ups, Open questions; фінальний self-check.

**ID і файл:** `SPEC-YYYY-MM-DD-<slug>` / `YYYY-MM-DD-<slug>.md` (дата з
`date +%Y-%m-%d`), без глобального лічильника.

**Права:** PreToolUse-хук `.claude/hooks/spec-creator-guard.mjs` (у frontmatter):
`Write`/`Edit` — лише `YYYY-MM-DD-<slug>.md` безпосередньо в `specs/`,
`server/specs/`, `client/specs/`, `reviewer-core/specs/`, `mcp-server/specs/`
(`e2e/specs/` виключено — там виконувані flows); `Bash` — лише
`date +%Y-%m-%d`.

---

## SDD-workflow

Три чати, три команди:

1. `/spec <запит>` — `spec-creator` ⇄ користувач до `Status: draft` без
   блокуючих питань; людина ставить `Status: approved`.
2. `/plan-feature <spec>` — `implementation-planner` Phase 1 ⇄ користувач →
   Phase 2. План з таблицею Coverage (кожен `AC-N`/`NFR-N` → крок → тест)
   сесія зберігає в `docs/plans/<та сама назва>.md` і вписує в спеку `Plan:`.
3. `/implement-plan docs/plans/<file>` (новий чат):
   `implementor`×N (кожен — лише `scripts/verify.sh <pkg> <files>`) →
   `scripts/verify.sh <pkg> --full` один раз → `plan-verifier` pre-review
   (бракує чогось → назад до implementor) → паралельно
   `architecture-reviewer` + `/code-review` + `test-writer` (від `AC-N`) →
   fix-loop ≤2 ітерацій → `plan-verifier` final (кожен `AC-N` має код і тест)
   → Traceability у спеці → `pr-self-review` → `engineering-insights`.

`plan-verifier` іде двічі: до рев'ю (щоб не рев'юїти й не тестувати неповний
код) і фінально (покриття тестами). Він працює у fork-контексті, тож не
бачить звітів implementor'ів і перевіряє незалежно.

---

## Спільні правила для всіх агентів

- Порядок ґрунтування — з кореневого `CLAUDE.md`: `specs/` → `docs/` →
  `INSIGHTS.md` → код.
- `.claude/skills/` — єдине джерело правди для доменних конвенцій
  (архітектура, Fastify, Drizzle, Next.js/React, Zod, TypeScript, безпека);
  агенти посилаються на навички за назвою, а не вигадують власні правила.
- Заборонені зони для читання/редагування: `server/clones/**` (клоновані
  репозиторії користувачів, у `.gitignore`) та `**/src/vendor/**` (провендорений
  код), крім свідомої зміни контракту в `vendor/shared`.
- Жоден з агентів не робить `git commit`/`git push`, не відкриває PR і не
  запускає деструктивні операції (наприклад, `docker compose down -v`).
