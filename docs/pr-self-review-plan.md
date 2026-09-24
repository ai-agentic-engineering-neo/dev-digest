# План: скіл `pr-self-review`

Статус: план, скіл ще не реалізовано.

## 1. Мета і межі

- Локальне рев'ю всіх змін гілки перед відкриттям PR: коміти `origin/main...HEAD`,
  staged і unstaged зміни, нові (untracked) файли.
- Запускається вручну (`/pr-self-review`) або автоматично, коли PR відкривають через Claude.
- Скіл нічого не виправляє сам. Він видає звіт і вердикт `PASS` або `BLOCK`.
  Хоча б один CRITICAL означає `BLOCK`, і змерджити зміни не вийде.

## 2. Структура файлів

```
.claude/skills/pr-self-review/
  SKILL.md               — порядок роботи, шкала severity, формат звіту
  routing.json           — яка папка/файл → які скіли (детерміновано)
  accepted.json          — погоджені хибні спрацювання (див. §7)
  reference/severity.md  — як шкала кожного скіла перекладається в спільну
  scripts/collect.py     — збирає змінені файли, розкладає їх по скілах, рахує fingerprint
  scripts/cache.py       — кеш результатів рев'ю по (скіл, файл) (див. §5)
  scripts/verdict.py     — write / check / publish вердикту
.claude/hooks/pr-self-review-gate.py   — PreToolUse-гейт
scripts/githooks/pre-push              — гейт для людей, які пушать без Claude
```

## 3. Який скіл на які файли (`routing.json`)

Відповідність задається фіксованою таблицею, а не вгадується LLM, щоб результат рев'ю можна було відтворити.

| Змінені файли | Скіли |
|---|---|
| `client/src/**/*.{ts,tsx}` | `frontend-ui-architecture`, `react-best-practices`, `typescript-expert`, `security` |
| `client/src/app/**`, `next.config.*`, `middleware.ts` | + `next-best-practices` |
| `client/**/*.test.tsx` | `react-testing-library` |
| `server/src/{domain,application,adapters,http,modules,platform}/**`, `composition.ts` | `onion-architecture`, `fastify-best-practices` (тільки для `http/**` і routes у `modules/**`), `typescript-expert`, `security` |
| `server/src/db/**` (схема, репозиторії, міграції) | `drizzle-orm-patterns`, `postgresql-table-design` |
| `reviewer-core/src/**` | `onion-architecture` (чисте ядро), `typescript-expert` |
| Будь-який файл, що імпортує `zod` | + `zod` (визначається через grep по вмісту, а не за шляхом) |
| `*/src/vendor/shared/**` | детермінована перевірка дрейфу (§4, крок 2) |
| `e2e/**` | `typescript-expert` |

- **Не рев'юються:** `design/`, `server/clones/`, lockfiles, `INSIGHTS.md`, `*.mp4`,
  `server/src/db/migrations/meta/**`.
- **Службові скіли** (`mermaid-diagram`, `engineering-insights`, сам `pr-self-review`)
  в `routing.json` явно позначені як `"review": false`.
- **Захист від застарілої таблиці:** `collect.py` читає frontmatter усіх `.claude/skills/*/SKILL.md`.
  Якщо з'являється скіл, якого немає в `routing.json`, скрипт видає попередження `unrouted skill`,
  щоб новий скіл не випадав з рев'ю непомітно.

## 4. Процес виконання

1. **Збір змін (`collect.py`).** База: `git merge-base origin/main HEAD` (можна перевизначити через `--base`).
   Результат — JSON `{fingerprint, files[], skill → files[], packages[]}`.
   - Fingerprint = hash(merge-base + tree робочої копії). Tree отримуємо через тимчасовий
     `GIT_INDEX_FILE` + `git add -A` + `git write-tree`. Будь-яка правка змінює fingerprint,
     і старий вердикт перестає діяти.
2. **Детерміновані гейти.** Запускаються тільки для зачеплених пакетів. Вони дешеві,
   не дають хибних спрацювань і не залежать від LLM.

   | Перевірка | Коли | Рівень |
   |---|---|---|
   | `typecheck`, `lint` пакета | пакет зачеплено | CRITICAL |
   | `pnpm arch:check` (нове порушення dependency-cruiser) | зачеплено `server/` або `reviewer-core/` | CRITICAL |
   | `./scripts/check-shared-drift.sh` | змінено `vendor/shared` | CRITICAL |
   | Змінено `server/src/db/schema.ts`, але немає нового файлу в `server/src/db/migrations/`: `drizzle-kit generate` у тимчасовій теці `out` генерує непорожню міграцію | змінено схему | CRITICAL |
   | Скан секретів по доданих рядках диффа (gitleaks, якщо встановлено, інакше regex на ключі, токени, `.env`-значення) | завжди | CRITICAL |
   | Змінено тип у `vendor/shared`: знайти його споживачів у `client/src` і додати ці файли до рев'ю клієнтських скілів | змінено `vendor/shared` | — (розширює рев'ю) |
   | Змінено вихідний файл, але поруч не змінено жодного `*.test.*` | зачеплено `src/` пакета | HIGH (лише попередження) |
   | `test:unit` зачеплених пакетів | прапорець `--tests` | CRITICAL |

   Інтеграційні тести не запускаються: їм потрібен Docker.
3. **Рев'ю скілами.** Для кожного скіла, під який потрапили файли, запускається субагент (Agent, паралельно).
   Спершу перевіряється кеш (§5), і субагент отримує лише файли, яких у кеші немає.
   - **Вхід:** шлях до `SKILL.md`, список файлів, лише ті hunks диффа, що до них належать,
     і контекст проєкту (§6).
   - **Вихід:** JSON `{skill, file, line, severity, rule, evidence, fix}`.
   - Великий дифф ділиться на пачки файлів.
4. **Перевірка кожного CRITICAL.** Кожен такий finding окремо перевіряє ще один агент за двома умовами:
   - (а) проблема справді є;
   - (б) рядок змінено в цьому диффі, а не в старому коді.

   Finding, що не пройшов перевірку, знижується до HIGH з позначкою `unverified`.
   Далі застосовується `accepted.json` (§7).
5. **Звіт.** `.devdigest/self-review/<fingerprint>.md` (для людини) і `.json` (для гейтів).
   У чат іде короткий підсумок: вердикт, кількість знахідок за severity,
   CRITICAL з `file:line`, кількість результатів з кешу та погоджених винятків.

## 5. Кеш результатів

Без кешу скіл, який запускають перед кожним PR, буде повільним і дорогим, і його почнуть обходити.

- **Ключ:** `hash(SKILL.md + усі файли теки скіла) + hash(blob файлу) + hash(hunks цього файлу) + hash(контексту §6)`.
  Будь-яка зміна скіла, файлу чи INSIGHTS/spec інвалідує лише потрібні записи.
- **Значення:** список знахідок субагента для цього (скіл, файл), включно з порожнім.
- **Місце:** `.devdigest/self-review/cache/` (gitignored), `cache.py prune` видаляє записи старші за 14 днів.
- **Ефект:** після виправлення одного CRITICAL повторний запуск рев'ює лише змінені файли.
- **Детерміновані гейти не кешуються:** вони залежать від усього пакета, а не від одного файлу.
- `--no-cache` примусово запускає повне рев'ю.

## 6. Контекст проєкту для субагентів

Рев'ю має перевіряти не лише загальні best practices, а й специфіку проєкту.

- **INSIGHTS.md:** кожен субагент отримує `INSIGHTS.md` пакетів, чиї файли він рев'ює.
  Знахідка з правилом `insight-violation` (зміна повторює помилку, описану в INSIGHTS)
  має рівень HIGH. CRITICAL лише тоді, коли insight описує поламку, а не стиль.
- **Специфікація фічі (`<package>/specs/NN-*.md`).** Шукаємо в такому порядку:
  1. прапорець `--spec <path>`;
  2. spec-файл, змінений у цьому диффі;
  3. номер `NN` або назва spec у назві гілки чи повідомленнях комітів.

  Якщо spec знайдено, окремий субагент звіряє дифф з **Acceptance criteria**.
  Невиконаний критерій = HIGH, суперечність критерію = CRITICAL. Якщо spec не знайдено,
  звіт так і пише, без здогадок.

## 7. Погоджені хибні спрацювання (`accepted.json`)

Особистого override немає. Натомість є закомічений файл, тож кожен виняток видно рецензенту в PR.

```json
[
  {
    "skill": "react-best-practices",
    "rule": "key-index",
    "file": "client/src/components/Foo.tsx",
    "match": "items.map((x, i) => <Row key={i}",
    "reason": "Статичний список, не перевпорядковується",
    "author": "Yurii Pidopryhora",
    "date": "2026-09-22"
  }
]
```

- Запис зіставляється за `skill + rule + file + match` (фрагмент коду, а не номер рядка,
  щоб запис не ламався від зсуву рядків). Відповідний finding знижується до `accepted` і не блокує.
- Запис, що більше нічому не відповідає, у звіті позначається як `stale`, щоб файл не розростався.
- Детерміновані гейти (§4, крок 2) через `accepted.json` **не** обходяться.
- Зміна самого `accepted.json` у диффі завжди виводиться окремим блоком на початку звіту та в описі PR.

## 8. Спільна шкала severity (`reference/severity.md`)

- **CRITICAL** — блокує мердж:
  - провал детермінованого гейта з §4;
  - правила, які сам скіл позначає як CRITICAL (react, zod);
  - `security` рівня CRITICAL або HIGH, якщо в скіла висока впевненість;
  - порушення напрямку залежностей в onion-архітектурі;
  - суперечність acceptance criteria.
- **HIGH, MEDIUM, LOW** — попередження у звіті.

## 9. Як саме блокується мердж

1. **Гейт у Claude Code** (`PreToolUse` на `Bash`, у `.claude/settings.json`).
   - `gh pr create`, `gh pr merge` і `git push` гілки з відкритим PR проходять лише за наявності
     свіжого `PASS` для поточного fingerprint.
   - Якщо його немає, гейт відмовляє з повідомленням «запусти /pr-self-review».
   - Якщо хук упав з внутрішньої помилки, він повідомляє про це, але сесію не блокує
     (як хук `engineering-insights`).
2. **git `pre-push`** (`scripts/githooks/`, вмикається через `git config core.hooksPath scripts/githooks` у `dev.sh`).
   - Перевіряє тільки наявність вердикту (`verdict.py check`), LLM не запускає.
   - Обходиться через `--no-verify`, тож це нагадування, а не захист.
3. **Справжня заборона мерджу на GitHub.**
   - `verdict.py publish` ставить commit status `devdigest/self-review` (`success`/`failure`)
     на HEAD SHA через `gh api repos/podop/dev-digest/statuses/<sha>`.
   - У branch protection для `main` цей контекст — required. Без зеленого статусу Merge неактивний.
   - Новий коміт має новий SHA і не має статусу, тож мердж знову заблоковано.
   - Статус публікується лише для чистого робочого дерева (fingerprint відповідає HEAD).
   - Статус ставиться з локальної машини, тож його можна підробити. Це запобіжник для дисципліни, а не захист.

## 10. Інтерфейс скіла

```
/pr-self-review [--base <ref>] [--staged-only] [--skill <name>] [--spec <path>]
                [--tests] [--no-cache] [--no-publish]
```

## 11. Супутні зміни

- `.gitignore`: `.devdigest/self-review/`.
- `.claude/skills/README.md`: рядок у каталозі.
- `AGENTS.md`: «Перед відкриттям PR → `/pr-self-review`».
- Branch protection на GitHub: вручну, одноразово.

## 12. Як перевірити сам скіл

- **Блок через архітектуру:** `server/src/domain` імпортує `drizzle-orm` → `arch:check` → CRITICAL → `BLOCK`,
  `gh pr create` відхилено, статус `failure`.
- **Блок через міграцію:** змінено `schema.ts` без міграції → CRITICAL.
- **Блок через секрет:** доданий рядок із токеном → CRITICAL.
- **Пропуск:** чиста правка в `client/` → відпрацювали лише фронтенд-скіли, `PASS`, статус `success`.
- **Застарілий вердикт:** після `PASS` змінено рядок → новий fingerprint → гейт блокує.
- **Кеш:** повторний запуск без змін → 0 викликів субагентів. Зміна одного файлу → субагенти лише для нього.
  Зміна `SKILL.md` → повне рев'ю цим скілом.
- **accepted.json:** запис знімає відповідний finding, а на детерміновані гейти не впливає.
  Запис, що нічому не відповідає, позначено `stale`.
- **Unit-тести на `collect.py` і `cache.py`:** розкладання файлів по скілах, виключені шляхи,
  `unrouted skill`, побудова ключа кешу.

## 13. Відкриті питання

1. Незакомічені зміни: рев'ювати їх разом із комітами (пропозиція), чи тільки те, що піде в PR?
2. Unit-тести за замовчуванням (повільніше, але надійніше)?
3. Хто може додавати записи в `accepted.json`: будь-хто, чи потрібен окремий рецензент (CODEOWNERS)?

## Друга ітерація (поза цим планом)

Режим `--fix`, звіт у тілі PR, окрема модель і ліміти для кожного скіла, eval-набір гілок
із закладеними проблемами, статистика хибних спрацювань по скілах.
