# План: скіл `pr-self-review`

Статус: реалізовано в `.claude/skills/pr-self-review/`. Відхилення від плану: маршрутизація лежить у
`references/routing.json` (`routing.md` її пояснює); помилка типів у незміненому файлі — `high`, а не
`pre-existing` (її може спричинити зміна експорту); додано `references/gate.md`.

Мета: перевіряти **локальні** зміни перед відкриттям PR. Кожен скіл із `.claude/skills/` запускається
лише на тих файлах diff, які він покриває. Якщо знайдено хоча б один підтверджений і непогоджений
`critical` — PR, push і merge блокуються.

Запуск: вручну (`/pr-self-review`) або автоматично. Автоматичний запуск забезпечує gate-хук (§9):
він не дає зробити push чи відкрити PR, доки немає свіжого вердикту PASS.

---

## 1. Що перевіряємо

`collect-diff.mjs` (Node, бо на Windows pnpm-скрипти й bash ненадійні) збирає:

- коміти гілки відносно `git merge-base origin/main HEAD`. Репо — форк, тому база — **власний**
  `origin/main`, не `upstream`;
- staged і unstaged зміни;
- нові файли, які ще не додані в git (`git ls-files --others --exclude-standard`).

Результат — JSON: `{ base, head, diffHash, files: [{ path, status, fileHash, changedLines: [[from,to]…], hunks }] }`.
`diffHash` — sha256 повного diff разом із вмістом нових файлів. `fileHash` — sha256 поточного вмісту
файлу разом із його `changedLines`; на ньому працює кеш (§7).

Якщо змін немає → вердикт PASS, жоден скіл не запускається.

## 2. Групи файлів і скіли

Маршрутизація відбувається у два кроки: спершу файл потрапляє в **групу** (bucket), потім детальніші
glob-правила всередині групи вирішують, які скіли на ньому запускати. Таблиця живе в
`references/routing.md` — це явні правила, а не рішення моделі на ходу.

| Група | Файли | Скіли |
|---|---|---|
| **UI** | `client/src/**/*.{ts,tsx}` | `frontend-ui-architecture`, `react-best-practices`, `next-best-practices` |
| UI · тести | `client/**/*.test.{ts,tsx}` | + `react-testing-library` |
| **Backend** | `server/src/modules/**`, `server/src/platform/**`, `server/src/adapters/**` | `onion-architecture`, `fastify-best-practices` |
| Backend · БД | `server/src/db/schema/**`, `*repository*.ts`, файли з імпортом `drizzle-orm` | + `drizzle-orm-patterns`, `postgresql-table-design` |
| **reviewer-core** | `reviewer-core/src/**` | `typescript-expert`, `zod` |
| **e2e** | `e2e/**` | тільки політика (§5) + `security` |
| **Full-stack** (накладається поверх груп) | будь-який `.ts/.tsx` | `security` завжди; `zod` — якщо файл імпортує `zod` або лежить у `contracts/`; `typescript-expert` — якщо змінено типи, generics, `tsconfig*` |
| CI / config | `.github/workflows/**`, `*.env*`, `docker-compose.yml` | `security` |
| Docs | `*.md`, `docs/**` | скіли не запускаються, діє тільки політика |

Ніколи не запускаються: `mermaid-diagram`, `engineering-insights`, сам `pr-self-review`.

**Перевірка, що скіл існує.** Перед запуском роутер перевіряє, що кожен скіл із таблиці справді є
в `.claude/skills/<name>/SKILL.md`. Якщо його немає — у звіті з'являється `WARN skill not found:
<name>`, і запуск триває без нього. Якщо в `.claude/skills/` є скіл, якого немає в таблиці, —
`WARN unrouted skill: <name>`. Автоматично в маршрутизацію він **не** додається.

## 3. Шкала severity

Скіли мають різні шкали: `react-best-practices` — CRITICAL/HIGH/MEDIUM; `security` — окремо
впевненість і окремо тяжкість; у `zod` CRITICAL означає важливість категорії правил, а не
конкретної знахідки. Тому все зводиться в одну шкалу (`references/severity-rubric.md`).

**CRITICAL** (блокує):

- знахідка `react-best-practices`, позначена правилом рівня CRITICAL;
- `security`: висока впевненість **і** тяжкість CRITICAL (експлойт без автентифікації, секрети в
  коді, RCE, обхід автентифікації). Висока впевненість + HIGH — це лише `high`;
- `onion-architecture`: **нове** порушення рівня `error` у dependency-cruiser (детерміновано, §5);
- зламаний контракт `@devdigest/shared`: видалено чи змінено export, тип поля або enum, яким
  користуються `client/` чи `reviewer-core/`;
- порушення політики «Do not touch» (§5);
- помилка типів у зміненому пакеті або падіння обов'язкових тестів (детерміновано, §5);
- код, що гарантовано ламає збірку чи роботу програми (невідповідний імпорт, відсутнє розширення
  `.js` в ESM-імпорті на server чи reviewer-core).

**HIGH / MEDIUM / LOW** — усе інше. Такі знахідки потрапляють у звіт як попередження й не блокують.

Правило воріт: `critical_count ≥ 1` → **BLOCK**, інакше **PASS**. До `critical_count` **не**
входять знахідки, погоджені через waiver (§8).

## 4. Хід виконання (fan-out)

1. **Збір diff** — `collect-diff.mjs` (§1).
2. **Маршрутизація** — пари «скіл → файли» (§2).
3. **Кеш** (§7) — з кожної пари прибираються файли, для яких у кеші вже є результат цього скіла з
   тим самим `fileHash`. Їхні знахідки беруться з кешу. Якщо в пари не лишилося файлів, агент
   для неї не запускається.
4. **Детерміновані перевірки** — паралельно з кроком 5 (§5).
5. **Огляд.** На кожен скіл запускається **один** підагент на всю групу його файлів (не по агенту
   на файл), усі паралельно. Кожен отримує:
   - шлях до `SKILL.md` свого скіла (сам читає його й `references/`, якщо потрібно);
   - **`<pkg>/INSIGHTS.md`** кожного пакета, файли якого він перевіряє. Там записано, на чому вже
     помилялися саме в цьому репо; порушення такого інсайту на зміненому рядку — щонайменше `high`;
   - **тільки свій зріз diff**: hunks і `changedLines` своїх файлів, щоб контекст лишався чистим;
   - рубрику severity і схему findings.

   Повертає **тільки JSON**, без вільного тексту (`references/finding-schema.md`):
   ```json
   { "skill": "", "file": "", "line": 0, "severity": "critical|high|medium|low",
     "rule": "", "issue": "", "evidence": "", "fix": "", "onChangedLine": true }
   ```
6. **Що враховується.** Знахідки з `onChangedLine: false` отримують позначку `pre-existing`,
   показуються окремим блоком і не блокують.
7. **Дедуплікація.** Однаковий `file` + `line` (±2 рядки) і однакова суть — зливаються в одну
   знахідку з найвищим severity і списком скілів.
8. **Перевірка critical.** Кожен `critical`, знайдений LLM, окремо перевіряє ще один підагент: він
   отримує код і знахідку без висновку першого агента. Якщо проблема не відтворилася або стоїть
   не на зміненому рядку — severity знижується до `high`. Детерміновані critical (§5) не
   перевіряються повторно.
9. **Waivers** (§8) — до кожного critical застосовуються погодження.
10. **Вердикт** — правило воріт (§3) → звіт і текст для PR (§6) → оновлення кешу (§7).

Ліміт вартості: якщо після маршрутизації скіл отримує більше ~40 файлів — його група ділиться на
частини (не більше 3 агентів на скіл).

## 5. Детерміновані перевірки (без LLM)

| Перевірка | Умова | Severity |
|---|---|---|
| Шари server | змінено `server/**` → `node server/scripts/check-architecture.mjs` (падає тільки на **нових** порушеннях рівня `error`) | critical на кожне нове порушення |
| Типи | для кожного зміненого пакета (`client`, `server`, `reviewer-core`, `e2e`) → `npx tsc --noEmit -p <pkg>`. Напряму через `npx`, не через pnpm-скрипти (на Windows вони ненадійні) | critical на кожну помилку в зміненому файлі; помилки в незмінених файлах → `pre-existing` |
| reviewer-core → server | змінено `reviewer-core/**` → unit-тести `server` (AGENTS.md: server перевіряє типи по вихідному коду reviewer-core) | critical, якщо тести падають |
| `server/src/vendor/shared/**`, `client/src/vendor/shared/**` | змінено | critical (AGENTS.md: спершу запитати користувача) |
| `server/src/db/migrations/**` | змінено, а `server/src/db/schema/**` — ні | critical (міграцію правили вручну) |
| `*/pnpm-lock.yaml`, `*/package-lock.json` | змінено, а відповідний `package.json` — ні | critical |
| `server/clones/**` | є в diff | critical (там лежить GitHub-токен) |
| `.claude/skills/<vendored>/**`, `skills-lock.json` | змінено (крім власних скілів) | critical |

Якщо `node_modules` пакета немає і перевірку типів або тести запустити неможливо — у звіті
`WARN typecheck skipped: <pkg>`, вердикт від цього не залежить.

## 6. Звіт і результат

- **Термінал:** вердикт PASS/BLOCK, потім критичні знахідки → погоджені (waived) → high →
  medium/low → `pre-existing` → попередження (`skill not found`, `unrouted skill`,
  `typecheck skipped`, прострочені waivers), таблиця «скіл → кількість файлів → кількість
  знахідок → скільки взято з кешу». Кожна знахідка у форматі `file:line · skill · rule · issue · fix`.
- **Файл:** `.claude/pr-self-review/last-run.json` →
  `{ verdict, criticalCount, waivedCount, head, diffHash, timestamp, findings[] }`.
- **Текст для опису PR:** `.claude/pr-self-review/pr-summary.md`, а також вивід у терміналі,
  готовий до вставлення (PR відкриваються через compare URL):
  ```markdown
  ### Self-review: PASS
  Skills: frontend-ui-architecture, react-best-practices, security (12 files)
  Critical: 0 · High: 2 · Medium: 5 · Waived: 1
  <details><summary>High findings</summary> … </details>
  <details><summary>Waivers</summary> file:line · rule · reason · expires </details>
  ```
- Папку `.claude/pr-self-review/` (крім `waivers.json`) додати в `.gitignore`.

## 7. Кеш (повторний запуск тільки по змінених файлах)

- Зберігається в `.claude/pr-self-review/cache/<skill>/<fileHash>.json` — знахідки цього скіла для
  файлу з цим вмістом і цими змінами.
- Ключ кешу: `skill` + `fileHash` + хеш `SKILL.md` скіла + хеш `INSIGHTS.md` пакета + версія рубрики.
  Якщо змінився скіл, інсайти або рубрика — кеш для них автоматично стає недійсним.
- Детерміновані перевірки (§5) **не** кешуються: вони швидкі й залежать від стану всього пакета.
- Типовий цикл: запуск → BLOCK → виправлення двох файлів → повторний запуск переглядає тільки ці
  два файли.
- `/pr-self-review --no-cache` — повний прогін; кеш старший за 14 днів видаляється при запуску.

## 8. Waivers (погодження хибних спрацювань)

- Файл `.claude/pr-self-review/waivers.json` — **комітиться**, щоб рецензент бачив погодження в diff:
  ```json
  [{ "file": "server/src/modules/x/service.ts", "rule": "onion/no-drizzle-in-application",
     "line": 42, "reason": "тимчасово до T3, issue #15", "expires": "2026-12-01" }]
  ```
- Збіг: `file` + `rule` (+ `line` ±5, якщо вказано). Погоджена знахідка переходить у блок «Waived»
  і не входить у `critical_count`.
- `reason` і `expires` обов'язкові. Прострочений waiver ігнорується, і про нього є попередження.
- **Не можна** погодити: порушення «Do not touch» (`server/clones/**`, `vendor/shared`) і секрети
  з `security` — вони блокують завжди.
- Скіл **ніколи** не створює waivers сам. Він лише пропонує готовий запис, який користувач
  додає власноруч.
- Gate (§9) враховує `waivers.json` у `diffHash`, тож новий waiver вимагає перезапуску перевірки.

## 9. Блокування (merge-gate)

1. **Хук Claude Code** — `PreToolUse` з matcher `Bash` у `.claude/settings.json` →
   `node .claude/skills/pr-self-review/scripts/gate.mjs`. Перехоплює `gh pr create`,
   `gh pr merge`, `git push`. Блокує (exit 2 з поясненням), якщо:
   - `last-run.json` немає;
   - `verdict === "BLOCK"`;
   - `diffHash` не збігається з поточним (результат застарів — треба перезапустити).
2. **Git `pre-push`** — `.githooks/pre-push` викликає той самий `gate.mjs`. Підключається через
   `git config core.hooksPath .githooks` (одноразово, крок описати в README).
3. **Обмеження:** локальний скіл не може заборонити кнопку Merge на самому GitHub. Для цього
   потрібен required status check у branch protection, а CI без API-ключа Claude цей скіл не
   запустить. Локальний gate обходиться через `git push --no-verify` — це свідоме рішення
   користувача.

## 10. Файли

Нові:

- `.claude/skills/pr-self-review/SKILL.md` — тригери, workflow §4, правило воріт, прапорці `--no-cache`
- `.claude/skills/pr-self-review/references/routing.md` — таблиця §2
- `.claude/skills/pr-self-review/references/severity-rubric.md` — §3
- `.claude/skills/pr-self-review/references/finding-schema.md` — JSON-схема + промпт підагента
- `.claude/skills/pr-self-review/references/waivers.md` — формат і правила §8
- `.claude/skills/pr-self-review/scripts/collect-diff.mjs` — §1 + маршрутизація + фільтр кешу
- `.claude/skills/pr-self-review/scripts/checks.mjs` — детерміновані перевірки §5
- `.claude/skills/pr-self-review/scripts/finalize.mjs` — waivers, вердикт, `last-run.json`,
  `pr-summary.md`, запис кешу
- `.claude/skills/pr-self-review/scripts/gate.mjs` — §9
- `.claude/skills/pr-self-review/evals/` — тестові diff і очікувані вердикти
- `.claude/pr-self-review/waivers.json` — порожній масив `[]`
- `.claude/settings.json` — хук `PreToolUse`
- `.githooks/pre-push`

Змінити:

- `AGENTS.md` — `pr-self-review` у винятки розділу «Do not touch»; у «Read when»: «Перед
  push/PR → запустити `pr-self-review`»
- `.claude/skills/README.md` — рядок у каталозі
- `.gitignore` — `.claude/pr-self-review/*` + `!.claude/pr-self-review/waivers.json`
- `README.md` — один крок налаштування `core.hooksPath`

## 11. Evals

| Тестовий diff | Очікування |
|---|---|
| імпорт `drizzle-orm` у `modules/*/domain` | BLOCK (onion error) |
| чиста UI-зміна в `client/src/components` | PASS, запущено тільки UI-скіли |
| правка `server/src/vendor/shared/contracts/*` | BLOCK (політика) |
| тільки `*.md` | PASS, 0 скілів |
| міграція + відповідна зміна schema | PASS (легітимна генерація) |
| міграція без зміни schema | BLOCK |
| `useEffect` для похідного стану (react-bp CRITICAL) | BLOCK |
| старе порушення в незміненому рядку | PASS, знахідка в `pre-existing` |
| помилка типів у зміненому `.ts` | BLOCK (typecheck) |
| зміна `reviewer-core`, що ламає тести `server` | BLOCK |
| onion-порушення + чинний waiver | PASS, знахідка в «Waived» |
| той самий waiver, прострочений | BLOCK + попередження |
| waiver на `server/clones/**` | BLOCK (не погоджується) |
| повторний запуск після зміни 1 з 5 файлів | агенти запускаються тільки для 1 файлу |
| порушення запису з `server/INSIGHTS.md` | щонайменше `high` |

## 12. Рішення за замовчуванням

1. Блокує тільки `critical`; `high` — попередження.
2. Gate перехоплює також `git push` (PR відкриваються через compare URL, тож `gh pr create` може не
   викликатися).
3. Git `pre-push` хук — так, на додачу до хука Claude Code.

## 13. Наступний етап (поза першою версією)

- **`--fix`**: після BLOCK запропонувати застосувати `fix` з critical-знахідок і автоматично
  перезапустити перевірку (з кешем — швидко).
- **`--quick`**: тільки детерміновані перевірки + `security`, для частих пушів; повний огляд —
  перед відкриттям PR.
- **Статистика по скілах**: журнал запусків — скільки critical знайшов кожен скіл і скільки з них не
  пройшли повторну перевірку; за цими даними коригувати маршрутизацію.
