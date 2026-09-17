# Skill: `engineering-insights`

## Context

Агент щосесії стартує з нуля: повторює ті самі помилки, перевідкриває ті самі квірки,
а інституційне знання лишається в голові людини, а не агента. Репо вже зробило половину
кроку — у кожному модулі лежить `INSIGHTS.md`, і всі `CLAUDE.md` на нього посилаються, —
але петля не замкнена: нема правила, ЩО туди писати, КОЛИ і В ЯКІЙ формі, і нема правила
читати його ПЕРЕД роботою. Тому 4 з 5 файлів досі `**PENDING:** first entry.`

Цей скіл замикає петлю: **читай перед роботою → пиши в кінці, але лише суттєве, і лише
якщо цього там ще нема**. Це перший скіл курсу (L01); на L06 його тригер стане Stop-hook'ом,
бо ручний тригер не спрацьовує стабільно.

**Що вже є (не ламаємо):**
- `INSIGHTS.md` × 5: root, `client/`, `server/`, `reviewer-core/`, `e2e/`
- `server/INSIGHTS.md` — єдиний живий запис (journal-corruption, 2026-08) із гарним
  форматом: заголовок+дата → суть → `**Rule:**` → доказ (commit `2006964`)
- `.claude/skills/` + каталог у `.claude/skills/README.md`
- у кожному module `CLAUDE.md`: рядок `hit repeated bug/gotcha → INSIGHTS.md first`

**Розбіжність зі слайдом (свідома):** слайд називає файл `LEARNINGS.md` і модулі
`apps/client` / `apps/server` / `packages/reviewer-core` / `packages/repo-intel`.
У цьому репо — `INSIGHTS.md` і `client` / `server` / `reviewer-core` / `e2e`
(`repo-intel` не існує). Беремо реальний layout; у SKILL.md лишаємо явну примітку про
зв'язок із LEARNINGS.md-патерном.

---

## Рішення (узгоджені)

| Питання | Рішення |
|---|---|
| Файл | `INSIGHTS.md` (наявна конвенція) |
| Структура | 7 фіксованих секцій зі слайду + формат запису з наявного `server/INSIGHTS.md` |
| Мова | SKILL.md і записи — English; спілкування в чаті — українська |
| Тестування | швидкий смоук: субагентні прогони (позитивний + негативний + дедуп), модель **Sonnet** |

---

## Що будуємо

### 1. Скіл `.claude/skills/engineering-insights/`

```
engineering-insights/
├── SKILL.md                 # ~150-180 рядків: протокол read-first + write-last
├── reference.md             # каталог секцій, good/bad приклади, dedupe, pruning
└── scripts/detect-module.sh # git-based детектор модуля (код надійніший за здогад)
```

#### `SKILL.md` — frontmatter

```yaml
---
name: engineering-insights
description: >
  Use at the start of any coding session to read the touched module's INSIGHTS.md
  before doing any other work, and again when wrapping up to append a non-obvious
  lesson to that same file. Use whenever a session hit a surprising bug, a dead end,
  a library quirk, a convention discovered the hard way, or a decision worth keeping
  for next time. Also use when the user says "wrap up", "capture learnings",
  "session insights", or invokes /engineering-insights.
---
```

Опис = лише умови тригера, без переказу workflow (інакше агент піде за описом і не
прочитає тіло скіла).

#### `SKILL.md` — тіло, 4 блоки

**A. Read-first protocol (початок сесії)**
- визнач модуль (`scripts/detect-module.sh`, або з промпта користувача);
- прочитай `<module>/INSIGHTS.md` **до** будь-якого іншого read/edit;
- якщо робота зачіпає 2+ модулі — прочитай їхні файли + root `INSIGHTS.md`;
- підтверди вголос 1-3 релевантними для цієї задачі пунктами (не переказ усього файлу).
  Змушене активне читання — це і обробка, і sanity-check, що файл узагалі прочитано;
- ставлення: high-confidence guidance, доки користувач не сказав інше.

**B. Capture as you go (по ходу)**
- щойно трапилось неочевидне — тримай кандидата в голові, **не пиши одразу**;
- пиши лише після того, як фікс/рішення підтверджено; неперевірена гіпотеза в
  INSIGHTS.md гірша за її відсутність.

**C. Write-last protocol (кінець сесії) — з трьома воротами**

```
1. Чи є кандидат? ──ні──→ нічого не пишемо, кажемо «no insight worth recording»
        │так
2. Обов'язковий re-read цільового INSIGHTS.md
        │
3. Три ворота, ВСІ три мають пройти:
   ├ Non-obvious?  «якби це було очевидно будь-кому, хто читає код — не пиши»
   ├ Actionable cold? агент прочитав через місяць і ЗНАЄ, що робити, без розслідування
   └ Не дубль?  вже є в файлі → не пиши
        │
4. append-only в потрібну секцію (ніколи не перезаписуємо)
```

Явно закриваємо обидва провали: **писати банальність** і **промовчати про справжній урок**.
Мовчання — валідний і частий результат.

Тонкість для кроку 3: якщо запис у файлі вже є, але **новий факт його уточнює або
спростовує** — не переписуємо і не дублюємо, а дописуємо під ним датовану ремарку
(`> **2026-09-17 correction:** …`). Перезапис у команді = стерті чужі уроки + мерж-конфлікти.

**D. Формат запису** (узагальнений із наявного `server/INSIGHTS.md`)

```markdown
## <Short, specific title> (YYYY-MM)

<2-4 речення: що сталося, чому неочевидно, чого це коштувало>

**Rule:** <директива, читана «cold»> (`path/to/file.ts:42`, commit `abc1234`)
```

Кожен запис — під одним із 7 заголовків. Доказ (`file:line` або commit) обов'язковий:
він і робить запис перевірним, і відсікає вигадані «уроки».

#### 7 секцій (кожен `INSIGHTS.md`)

| Секція | Що туди |
|---|---|
| What Works | підхід, який спрацював і його варто повторювати |
| What Doesn't Work | глухі кути й антипатерни — **найцінніша й найчастіше пропущена** |
| Codebase Patterns | конвенції та архітектурні рішення, не видимі з коду |
| Tool & Library Notes | квірки залежностей, версій, тулінгу |
| Recurring Errors & Fixes | помилка, що повторилась ≥2 рази + фікс |
| Session Notes | датовані підсумки — лише коли урок не лягає в жодну секцію вище |
| Open Questions | що лишилось нез'ясованим |

`Session Notes` тримаємо навмисно вузько, інакше секція перетворюється на реплей чату.

#### `reference.md`

Завантажується, лише коли скіл реально пише запис:
- по кожній із 7 секцій — 1 good / 1 bad приклад **з цього репо**
  (напр. bad: «be careful with migrations» → good: наявний journal-corruption запис);
- decision tree «яка секція для цього факту»;
- dedupe-евристики (як розпізнати, що запис уже є в іншому формулюванні);
- гігієна: ліміт ~30 активних записів на модуль (за evoleinik: «додав нове — прибери
  застаріле»), monthly prune, вирішення конфліктів між записами, дроблення на
  `INSIGHTS-<domain>.md` якщо файл розпухає.

#### `scripts/detect-module.sh`

```
git status --porcelain + git diff --name-only HEAD
  → префікс-мапа: client/ server/ reviewer-core/ e2e/
  → 0 або 2+ модулі, або зміни поза модулями → root
  → друкує список цільових INSIGHTS.md
```

Список модулів — один масив угорі скрипта, щоб додати `repo-intel` пізніше було
однорядковою правкою. Детермінований детектор надійніший за здогад моделі й дешевший
за токенами.

### 2. Перебудова 5 × `INSIGHTS.md`

Кожен файл → шапка + 7 порожніх секцій. Наявний запис `server/INSIGHTS.md`
(journal corruption) **переїжджає дослівно** у `Recurring Errors & Fixes` — текст не
чіпаємо, лише додаємо `**Rule:**`-лінію до формату, якщо треба.

Файли: `INSIGHTS.md`, `client/INSIGHTS.md`, `server/INSIGHTS.md`,
`reviewer-core/INSIGHTS.md`, `e2e/INSIGHTS.md`.

### 3. Замикання петлі в `CLAUDE.md`

Скіл спрацьовує, лише коли його викликали, — тому протокол має жити і в `CLAUDE.md`,
який завантажується завжди.

**root `CLAUDE.md`** — нова секція перед «Do not touch»:

```markdown
## Session protocol

- Before any work: read the touched module's `INSIGHTS.md` and name the 1-3 entries
  relevant to this task. Treat them as high-confidence guidance unless told otherwise.
- When wrapping up: run `/engineering-insights` to capture what this session learned.
  If nothing non-obvious happened, it writes nothing — that is the expected outcome,
  not a skipped step.
```

**4 × module `CLAUDE.md`** — посилення наявного рядка в «Read when»:
`hit repeated bug/gotcha → INSIGHTS.md first` → `before any work → INSIGHTS.md (read first, always)`.

### 4. Каталог

Рядок у `.claude/skills/README.md`:
`| engineering-insights | Shared | Read module INSIGHTS.md before work; append non-obvious lessons after |`

`skills-lock.json` **не чіпаємо** — він для вендорених із GitHub скілів; цей наш,
first-party, і хеша в нього не буде.

---

## Файли

**Нові**
- `.claude/skills/engineering-insights/SKILL.md`
- `.claude/skills/engineering-insights/reference.md`
- `.claude/skills/engineering-insights/scripts/detect-module.sh` (`chmod +x`)

**Змінені**
- `INSIGHTS.md`, `client/INSIGHTS.md`, `server/INSIGHTS.md`, `reviewer-core/INSIGHTS.md`, `e2e/INSIGHTS.md` — 7 секцій
- `CLAUDE.md` — секція Session protocol
- `client/CLAUDE.md`, `server/CLAUDE.md`, `reviewer-core/CLAUDE.md`, `e2e/CLAUDE.md` — read-first рядок
- `.claude/skills/README.md` — рядок каталогу

**Не чіпаємо:** `skills-lock.json`, `server/src/db/migrations/`, `*/src/vendor/`

---

## Верифікація

Усі субагентні прогони (2, 3, 4) — **на моделі Sonnet** (`Agent(model: "sonnet")`).
Причина не лише в ціні: скіл має працювати на слабшій моделі, ніж та, що його писала.
Якщо три ворота тримаються на Sonnet — на Opus вони тримаються тим паче; зворотне невірно.

**1. Детектор модуля**
```bash
.claude/skills/engineering-insights/scripts/detect-module.sh
```
Очікування: без змін → `INSIGHTS.md` (root). Після `touch server/src/x.ts` → `server/INSIGHTS.md`.
Після правок у двох модулях → обидва файли + root.

**2. Смоук-тест, позитивний прогін**
Субагент зі скілом отримує задачу в `server/`, у якій закладено неочевидну знахідку.
Проходить, якщо: прочитав `server/INSIGHTS.md` **до** правок → дописав рівно 1 запис →
у правильну секцію → у форматі заголовок/суть/`**Rule:**`/доказ → наявний запис про
міграції не зачеплено.

**3. Смоук-тест, негативний прогін (головний)**
Субагент зі скілом отримує тривіальну задачу (перейменувати змінну, поправити коментар).
Проходить, якщо: прочитав INSIGHTS.md на старті → **не дописав нічого** → сказав, що
писати нема чого. Це найважливіший тест: скіл, який пише завжди, зіпсує файли швидше,
ніж наповнить їх.

**4. Дедуп**
Субагенту дається знахідка, яка вже описана в `server/INSIGHTS.md`
(журнал міграцій). Проходить, якщо він її розпізнав і не продублював.

**5. Ручна перевірка тригера**
Нова сесія, промпт на кшталт «додай роут у server» — чи згадав агент INSIGHTS.md сам,
без явного виклику. Якщо ні — це очікувано і є точним аргументом для Stop-hook на L06;
фіксуємо результат як є.

---

## Ризики

- **Автотригер ненадійний** — визнана властивість патерну, а не баг. L06 закриває хуком.
- **Скіл пише банальності** — три ворота + обов'язковий доказ `file:line`; негативний
  смоук-тест ловить регресію.
- **Файли розпухають** — ліміт ~30 записів/модуль і monthly prune у `reference.md`.
- **LLM хибно підсумовує** — INSIGHTS.md це чернетка під спот-чек людини, не істина;
  усе під git, поганий wrap-up відкочується.

## Коміт

Один коміт: скіл + перебудовані INSIGHTS.md + правки CLAUDE.md + каталог +
`docs/cc-plans/2026-09-17+engineering-insights-skill.md` (цей план, після схвалення
переїжджає туди через `mv`).
